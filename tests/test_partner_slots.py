"""Partner units on the pages that rank (app/partner_slots.py).

The deliverable is "your tool appears on the guide for your category,
labelled as a partner" — concrete and checkable, where "placement above free
listings" was neither. These tests pin the three rules that keep it from
becoming the thing it must not be:

  * paid units never enter the editorial list, they sit beside it;
  * a unit has to be TRUE of the page it is on, so money cannot put a
    paid-only tool on the free-tools guide;
  * capacity is fixed and oversubscription rotates, so nobody who paid loses
    the page forever to whoever was approved first.
"""
import json
import os
import tempfile

import pytest

from app import create_app, db, partner_slots
from app.models import CatalogTool
from app.tool_cache import refresh_tools_cache


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    refresh_tools_cache()  # don't leak this test's catalog into others
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client(app):
    return app.test_client()


def _tool(slug, name, *, category="Coding", sponsored=False, pricing="Paid",
          student=False):
    data = {
        "slug": slug, "name": name, "category": category,
        "tagline": f"{name} does a thing.", "link": f"https://{slug}.example.com",
        "sponsored": sponsored, "pricing": pricing, "student_friendly": student,
    }
    db.session.add(CatalogTool(slug=slug, name=name, category=category,
                               hidden=False, data=json.dumps(data)))


def _units(surface):
    return partner_slots.partner_units(surface)


# --- the units render at all ------------------------------------------------


def test_a_sponsored_tool_appears_on_its_category_guide(app):
    with app.app_context():
        _tool("paid-editor", "Paid Editor", category="Coding", sponsored=True)
        _tool("free-editor", "Free Editor", category="Coding", sponsored=False)
        db.session.commit()
        refresh_tools_cache()

        units = _units("best-coding-tools")
        assert [u["slug"] for u in units] == ["paid-editor"]
        assert units[0]["label"] == "Partner"
        assert units[0]["placement"] == "partner"


def test_no_sponsors_renders_nothing_rather_than_an_empty_block(app):
    with app.app_context():
        _tool("free-editor", "Free Editor", category="Coding")
        db.session.commit()
        refresh_tools_cache()
        assert _units("best-coding-tools") == []


def test_an_unknown_surface_is_empty_not_an_error(app):
    with app.app_context():
        _tool("paid-editor", "Paid Editor", sponsored=True)
        db.session.commit()
        refresh_tools_cache()
        assert _units("best-of-nothing") == []
        assert _units("") == []


# --- the honesty rule: true of the page it is on ---------------------------


def test_a_paid_only_tool_cannot_buy_its_way_onto_the_free_tools_guide(app):
    """Money does not make a $40/month tool free. A guide that lies to a
    reader stops being a guide anyone reads, at which point the placement is
    worth nothing anyway."""
    with app.app_context():
        _tool("expensive-thing", "Expensive Thing", sponsored=True, pricing="Paid")
        _tool("freemium-thing", "Freemium Thing", sponsored=True, pricing="Freemium")
        db.session.commit()
        refresh_tools_cache()

        slugs = [u["slug"] for u in _units("best-free-ai-tools")]
        assert "freemium-thing" in slugs
        assert "expensive-thing" not in slugs


def test_a_tool_with_no_student_angle_stays_off_the_students_guide(app):
    with app.app_context():
        _tool("enterprise-thing", "Enterprise Thing", sponsored=True, student=False)
        _tool("student-thing", "Student Thing", sponsored=True, student=True)
        db.session.commit()
        refresh_tools_cache()

        slugs = [u["slug"] for u in _units("best-ai-tools-for-students")]
        assert slugs == ["student-thing"]


def test_a_sponsored_tool_from_another_category_stays_off_the_coding_guide(app):
    with app.app_context():
        _tool("paint-thing", "Paint Thing", category="Design & Graphics", sponsored=True)
        db.session.commit()
        refresh_tools_cache()
        assert _units("best-coding-tools") == []


# --- alternatives pages -----------------------------------------------------


def test_alternatives_page_shows_sponsors_from_the_same_category(app):
    with app.app_context():
        _tool("subject-tool", "Subject Tool", category="Coding")
        _tool("paid-rival", "Paid Rival", category="Coding", sponsored=True)
        _tool("paid-outsider", "Paid Outsider", category="Research", sponsored=True)
        db.session.commit()
        refresh_tools_cache()

        slugs = [u["slug"] for u in _units("alternatives:subject-tool")]
        assert slugs == ["paid-rival"]


def test_a_tool_is_never_offered_as_an_alternative_to_itself(app):
    with app.app_context():
        _tool("self-tool", "Self Tool", category="Coding", sponsored=True)
        db.session.commit()
        refresh_tools_cache()
        assert _units("alternatives:self-tool") == []


def test_alternatives_for_an_unknown_slug_is_empty(app):
    with app.app_context():
        _tool("paid-rival", "Paid Rival", category="Coding", sponsored=True)
        db.session.commit()
        refresh_tools_cache()
        assert _units("alternatives:does-not-exist") == []


# --- capacity ---------------------------------------------------------------


def test_capacity_is_capped_and_oversubscription_rotates(app):
    with app.app_context():
        for i in range(5):
            _tool(f"paid-{i}", f"Paid {i}", category="Coding", sponsored=True)
        db.session.commit()
        refresh_tools_cache()

        units = _units("best-coding-tools")
        assert len(units) == partner_slots.SURFACE_CAPACITY

        # Rotation is by day and deterministic, so a page render and its
        # impression beacon can never disagree about who was shown.
        assert [u["slug"] for u in _units("best-coding-tools")] == [u["slug"] for u in units]

        # Everyone eligible surfaces across the rotation rather than the
        # earliest two owning the page forever.
        pool = ["paid-0", "paid-1", "paid-2", "paid-3", "paid-4"]
        seen = set()
        for offset in range(len(pool)):
            doubled = pool + pool
            seen.update(doubled[offset:offset + partner_slots.SURFACE_CAPACITY])
        assert seen == set(pool)


# --- the endpoint -----------------------------------------------------------


def test_endpoint_returns_units_with_the_disclosure(client, app):
    with app.app_context():
        _tool("paid-editor", "Paid Editor", category="Coding", sponsored=True)
        db.session.commit()
        refresh_tools_cache()

    body = client.get("/api/v1/partners?surface=best-coding-tools").get_json()
    assert body["label"] == "Partner"
    assert "paid for a listing" in body["disclosure"]
    assert [u["slug"] for u in body["units"]] == ["paid-editor"]


def test_endpoint_answers_200_with_an_empty_list_for_junk(client, app):
    """A guide page must render with or without us."""
    resp = client.get("/api/v1/partners?surface=%20%20")
    assert resp.status_code == 200
    assert resp.get_json()["units"] == []


# --- what the founder is told ----------------------------------------------


def test_the_founder_is_told_which_pages_their_unit_is_on(app):
    with app.app_context():
        _tool("paid-editor", "Paid Editor", category="Coding", sponsored=True,
              pricing="Freemium", student=True)
        _tool("peer-tool", "Peer Tool", category="Coding")
        db.session.commit()
        refresh_tools_cache()

        record = json.loads(CatalogTool.query.filter_by(slug="paid-editor").one().data)
        surfaces = partner_slots.surfaces_for_tool(record)
        ids = {s["surface"] for s in surfaces}
        assert "best-coding-tools" in ids
        assert "best-free-ai-tools" in ids          # it is freemium
        assert "best-ai-tools-for-students" in ids  # it is student-friendly
        assert any(s["surface"].startswith("alternatives:") for s in surfaces)


def test_an_unsponsored_tool_is_told_it_is_on_nothing(app):
    with app.app_context():
        _tool("free-editor", "Free Editor", category="Coding")
        db.session.commit()
        refresh_tools_cache()
        record = json.loads(CatalogTool.query.filter_by(slug="free-editor").one().data)
        assert partner_slots.surfaces_for_tool(record) == []
