"""Sponsored-tier editorial blurb: admin-authored description override.

See apply_editorial_blurb() in app/tool_cache.py, CatalogTool.editorial_blurb,
and the admin ToolForm gating in frontend/src/pages/AdminPage.jsx.

Uses the same isolated, function-scoped app+DB fixture pattern as
test_submissions_and_digest.py's catalog tests, since these also seed
CatalogTool rows directly and hit catalog-serving routes.
"""
import json
import os
import tempfile

import pytest

from app import create_app, db
from app.models import CatalogTool, User
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
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client(app):
    return app.test_client()


def _seed_tool(slug, name, *, sponsored, sponsored_until=None, description="Submitted by the founder.",
                editorial_blurb=None):
    data = {
        "slug": slug,
        "name": name,
        "category": "Productivity",
        "description": description,
        "tagline": description,
        "link": f"https://{slug}.example.com",
        "sponsored": sponsored,
    }
    if sponsored_until:
        data["sponsored_until"] = sponsored_until
    db.session.add(CatalogTool(
        slug=slug, name=name, category="Productivity", hidden=False,
        data=json.dumps(data), editorial_blurb=editorial_blurb,
    ))


def _login_as_admin(client, app, email):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


# --- Display: sponsored tool with a blurb -----------------------------------


def test_sponsored_tool_with_blurb_shows_blurb_on_detail_page(client, app):
    with app.app_context():
        _seed_tool(
            "blurbed-tool", "Blurbed Tool", sponsored=True,
            description="Founder's own pitch.",
            editorial_blurb="Hand-tested by AI Compass: this is genuinely excellent.",
        )
        db.session.commit()
        refresh_tools_cache()

    resp = client.get("/api/v1/tools/blurbed-tool")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["description"] == "Hand-tested by AI Compass: this is genuinely excellent."
    assert body["tagline"] == "Hand-tested by AI Compass: this is genuinely excellent."


def test_sponsored_tool_with_blurb_shows_blurb_on_card_projection(client, app):
    with app.app_context():
        _seed_tool(
            "blurbed-card-tool", "Blurbed Card Tool", sponsored=True,
            description="Founder's own pitch.",
            editorial_blurb="Curated blurb text.",
        )
        db.session.commit()
        refresh_tools_cache()

    resp = client.get("/api/v1/tools?fields=card")
    assert resp.status_code == 200
    tools = {t["slug"]: t for t in resp.get_json()["results"]}
    assert tools["blurbed-card-tool"]["description"] == "Curated blurb text."


def test_sponsored_tool_with_blurb_shows_blurb_in_search_results(client, app):
    with app.app_context():
        _seed_tool(
            "blurbed-search-tool", "Blurbed Search Tool", sponsored=True,
            description="Founder's own pitch about search.",
            editorial_blurb="Editorial search blurb.",
        )
        db.session.commit()
        refresh_tools_cache()

    resp = client.get("/api/v1/search?q=Blurbed Search Tool")
    assert resp.status_code == 200
    results = resp.get_json()["results"]
    match = next((r for r in results if r.get("slug") == "blurbed-search-tool"), None)
    assert match is not None, results
    assert match["description"] == "Editorial search blurb."


# --- Fallback: sponsored tool WITHOUT a blurb --------------------------------


def test_sponsored_tool_without_blurb_falls_back_to_submitted_description(client, app):
    with app.app_context():
        _seed_tool(
            "unblurbed-tool", "Unblurbed Tool", sponsored=True,
            description="This is the founder's real description.",
            editorial_blurb=None,
        )
        db.session.commit()
        refresh_tools_cache()

    resp = client.get("/api/v1/tools/unblurbed-tool")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["description"] == "This is the founder's real description."


# --- The critical regression guard: never for Free/Quick --------------------


def test_free_tool_never_shows_blurb_even_if_one_is_set_directly_in_db(client, app):
    """A tool that was never sponsored (or was downgraded) must NEVER show
    a blurb, even in the contrived case where editorial_blurb ended up set
    on it (e.g. a stale row from before a downgrade). Display logic must
    check current sponsored status, not merely "does a blurb exist"."""
    with app.app_context():
        _seed_tool(
            "free-tool-with-stray-blurb", "Free Tool", sponsored=False,
            description="The free tool's real description.",
            editorial_blurb="This should never be shown — it's not sponsored.",
        )
        db.session.commit()
        refresh_tools_cache()

    detail = client.get("/api/v1/tools/free-tool-with-stray-blurb").get_json()
    assert detail["description"] == "The free tool's real description."

    card = client.get("/api/v1/tools?fields=card").get_json()
    card_match = next(t for t in card["results"] if t["slug"] == "free-tool-with-stray-blurb")
    assert card_match["description"] == "The free tool's real description."

    search = client.get("/api/v1/search?q=Free Tool").get_json()
    search_match = next(
        (r for r in search["results"] if r.get("slug") == "free-tool-with-stray-blurb"), None
    )
    if search_match is not None:
        assert search_match["description"] == "The free tool's real description."


def test_lapsed_sponsorship_reverts_to_submitted_description(client, app):
    """A tool that WAS sponsored but whose paid placement has lapsed must
    revert to its own description — the blurb column being non-empty is
    not enough on its own (Constraint 2's exact scenario)."""
    from datetime import datetime, timedelta, timezone
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    with app.app_context():
        _seed_tool(
            "lapsed-tool", "Lapsed Tool", sponsored=True, sponsored_until=past,
            description="The real, submitted description.",
            editorial_blurb="A blurb written while this was still sponsored.",
        )
        db.session.commit()
        refresh_tools_cache()

    resp = client.get("/api/v1/tools/lapsed-tool")
    assert resp.status_code == 200
    assert resp.get_json()["description"] == "The real, submitted description."


# --- Admin fetch/save -----------------------------------------------------


def test_admin_get_tool_reports_sponsored_active_for_sponsored_tool(client, app):
    with app.app_context():
        _seed_tool("admin-sponsored-tool", "Admin Sponsored Tool", sponsored=True)
        db.session.commit()
        refresh_tools_cache()

    _login_as_admin(client, app, "admin-blurb-1@t.test")
    resp = client.get("/api/v1/admin/tools/admin-sponsored-tool")
    assert resp.status_code == 200
    assert resp.get_json()["sponsored_active"] is True


def test_admin_get_tool_reports_not_sponsored_active_for_free_tool(client, app):
    with app.app_context():
        _seed_tool("admin-free-tool", "Admin Free Tool", sponsored=False)
        db.session.commit()
        refresh_tools_cache()

    _login_as_admin(client, app, "admin-blurb-2@t.test")
    resp = client.get("/api/v1/admin/tools/admin-free-tool")
    assert resp.status_code == 200
    assert resp.get_json()["sponsored_active"] is False


def test_admin_get_tool_returns_raw_description_not_the_blurb(client, app):
    """The edit form must load the REAL submitted description, not the
    blurb — otherwise saving any unrelated field would silently overwrite
    (and destroy) the founder's actual description."""
    with app.app_context():
        _seed_tool(
            "admin-raw-tool", "Admin Raw Tool", sponsored=True,
            description="The submitter's real description.",
            editorial_blurb="The editorial blurb, for display only.",
        )
        db.session.commit()
        refresh_tools_cache()

    _login_as_admin(client, app, "admin-blurb-3@t.test")
    resp = client.get("/api/v1/admin/tools/admin-raw-tool")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["tool"]["description"] == "The submitter's real description."
    assert body["tool"]["editorial_blurb"] == "The editorial blurb, for display only."


def test_admin_can_save_editorial_blurb(client, app):
    with app.app_context():
        _seed_tool("admin-save-tool", "Admin Save Tool", sponsored=True,
                    description="Real description.")
        db.session.commit()
        refresh_tools_cache()

    _login_as_admin(client, app, "admin-blurb-4@t.test")
    get_resp = client.get("/api/v1/admin/tools/admin-save-tool")
    tool = get_resp.get_json()["tool"]
    tool["editorial_blurb"] = "A brand-new editorial blurb."

    put_resp = client.put(
        "/api/v1/admin/tools/admin-save-tool",
        json=tool,
    )
    assert put_resp.status_code == 200
    assert put_resp.get_json()["tool"]["editorial_blurb"] == "A brand-new editorial blurb."

    with app.app_context():
        row = CatalogTool.query.filter_by(slug="admin-save-tool").first()
        assert row.editorial_blurb == "A brand-new editorial blurb."
        assert row.editorial_blurb  # persisted as a real column, not just in the JSON blob

    # And it's now what a reader sees.
    detail = client.get("/api/v1/tools/admin-save-tool").get_json()
    assert detail["description"] == "A brand-new editorial blurb."


def test_unrelated_admin_save_does_not_touch_real_description(client, app):
    """Saving an unrelated field (e.g. category) must not corrupt the
    stored description with the blurb text — this is the exact failure
    mode apply_editorial_blurb() is written to avoid by never touching
    _normalize_tool_record()."""
    with app.app_context():
        _seed_tool(
            "admin-noncorrupt-tool", "Admin Noncorrupt Tool", sponsored=True,
            description="The one true submitted description.",
            editorial_blurb="Editorial blurb text.",
        )
        db.session.commit()
        refresh_tools_cache()

    _login_as_admin(client, app, "admin-blurb-5@t.test")
    get_resp = client.get("/api/v1/admin/tools/admin-noncorrupt-tool")
    tool = get_resp.get_json()["tool"]
    tool["category"] = "Coding"  # unrelated field change

    put_resp = client.put("/api/v1/admin/tools/admin-noncorrupt-tool", json=tool)
    assert put_resp.status_code == 200

    with app.app_context():
        row = CatalogTool.query.filter_by(slug="admin-noncorrupt-tool").first()
        stored = json.loads(row.data)
        assert stored["description"] == "The one true submitted description."
