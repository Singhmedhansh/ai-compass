"""The one thing the Fast-Track tier buys in the new-tools digest: first
position, and a "Sponsored" label on it.

/pricing has promised a "digest spotlight" since the tier launched, while
compute_new_tools() returned tools in arbitrary dict order and _email_html
never mentioned sponsorship — so the perk was sold and not delivered. These
tests pin both halves of the fix, and the limit on it: inclusion is not for
sale, only order is. Free listings are announced in the same email, exactly
as they always were.

Fixture pattern follows test_digest_live_gating.py, which also seeds
CatalogTool rows and drives run_digest directly.
"""
import json
import os
import tempfile

import pytest

import app.digest as digest_mod
from app import create_app, db
from app.models import CatalogTool, DigestState, User
from app.tool_cache import refresh_tools_cache


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    refresh_tools_cache()  # don't leak this test's DB catalog into others
    try:
        os.remove(path)
    except OSError:
        pass


def _catalog_tool(slug, name, sponsored=False, student=False):
    data = {
        "slug": slug, "name": name, "category": "Productivity",
        "tagline": f"{name} tagline", "link": f"https://{slug}.example.com",
        "sponsored": sponsored, "student_friendly": student,
    }
    db.session.add(CatalogTool(slug=slug, name=name, category="Productivity",
                               hidden=False, data=json.dumps(data)))


def _seed_known(slugs):
    db.session.add(DigestState(id=1, known_slugs=json.dumps(sorted(slugs))))
    db.session.commit()


def test_sponsored_tools_are_announced_first(app):
    with app.app_context():
        _catalog_tool("baseline", "Baseline Tool")
        _catalog_tool("aaa-free", "AAA Free Tool")
        _catalog_tool("zzz-paid", "ZZZ Paid Tool", sponsored=True)
        _catalog_tool("mmm-free", "MMM Free Tool")
        db.session.commit()
        _seed_known(["baseline"])
        refresh_tools_cache()

        new_tools, first_seed = digest_mod.compute_new_tools()
        assert first_seed is False
        assert new_tools[0]["slug"] == "zzz-paid"
        # …and the free listings are still in the same email. The perk is
        # position, never inclusion.
        assert {t["slug"] for t in new_tools} == {"zzz-paid", "aaa-free", "mmm-free"}


def test_the_sponsored_position_is_labelled_in_the_email(app):
    with app.app_context():
        _catalog_tool("baseline", "Baseline Tool")
        _catalog_tool("paid-tool", "Paid Tool", sponsored=True)
        _catalog_tool("free-tool", "Free Tool")
        _catalog_tool("student-tool", "Student Tool", student=True)
        db.session.commit()
        _seed_known(["baseline"])
        refresh_tools_cache()

        new_tools, _ = digest_mod.compute_new_tools()
        html, text = digest_mod._email_html(new_tools, "https://ai-compass.in/unsubscribe")

        assert "Sponsored" in html
        # A paid slot that reads as an ordinary pick is the failure mode this
        # label exists to prevent, so the badge outranks "Student Friendly"
        # rather than being dropped when both apply.
        assert "Paid Tool" in text and "Student Tool" in text


def test_an_unsponsored_digest_says_nothing_about_sponsorship(app):
    with app.app_context():
        _catalog_tool("baseline", "Baseline Tool")
        _catalog_tool("free-tool", "Free Tool")
        db.session.commit()
        _seed_known(["baseline"])
        refresh_tools_cache()

        new_tools, _ = digest_mod.compute_new_tools()
        html, _text = digest_mod._email_html(new_tools, "https://ai-compass.in/unsubscribe")
        assert "Sponsored" not in html


def test_a_lapsed_sponsorship_gets_no_spotlight(app):
    """_sponsored_active(), not a raw flag: a sponsored_until in the past must
    not keep buying first position forever."""
    with app.app_context():
        _catalog_tool("baseline", "Baseline Tool")
        db.session.add(CatalogTool(
            slug="lapsed", name="Lapsed Tool", category="Productivity", hidden=False,
            data=json.dumps({
                "slug": "lapsed", "name": "Lapsed Tool", "category": "Productivity",
                "tagline": "Lapsed tagline", "link": "https://lapsed.example.com",
                "sponsored": True, "sponsored_until": "2020-01-01T00:00:00+00:00",
            }),
        ))
        _catalog_tool("still-free", "Still Free Tool")
        db.session.commit()
        _seed_known(["baseline"])
        refresh_tools_cache()

        new_tools, _ = digest_mod.compute_new_tools()
        html, _text = digest_mod._email_html(new_tools, "https://ai-compass.in/unsubscribe")
        assert "Sponsored" not in html


def test_the_whole_digest_still_sends_with_a_sponsored_tool_in_it(app, monkeypatch):
    sent = []
    monkeypatch.setattr(digest_mod, "send_email",
                        lambda to, *a, **k: (sent.append(to), True)[1])
    with app.app_context():
        _catalog_tool("baseline", "Baseline Tool")
        _catalog_tool("paid-tool", "Paid Tool", sponsored=True)
        db.session.commit()
        _seed_known(["baseline"])
        refresh_tools_cache()
        db.session.add(User(email="reader@t.test", notifications_enabled=True))
        db.session.commit()

        result = digest_mod.run_digest()
        assert result["status"] == "sent"
        assert result["new_tools"] == 1
        assert sent == ["reader@t.test"]
