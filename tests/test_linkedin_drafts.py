"""Admin LinkedIn post-draft generator.

Turns the most recently added/updated catalog tools into copy-paste
LinkedIn posts (no LinkedIn API — human posts manually). Isolated
fixtures so request-driven tests don't pollute the shared conftest
session (see test_submissions_and_digest.py).
"""
import json
import os
import tempfile

import pytest

from app import create_app, db
from app.models import CatalogTool, User


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
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client(app):
    return app.test_client()


def _seed(slug, name, tagline, category):
    data = {"slug": slug, "name": name, "tagline": tagline,
            "category": category, "link": f"https://{slug}.example.com"}
    db.session.add(CatalogTool(slug=slug, name=name, category=category,
                               hidden=False, data=json.dumps(data)))


def test_drafts_built_from_recent_tools(client, app):
    with app.app_context():
        _seed("alpha-ai", "Alpha AI", "Summarises lecture notes fast", "Study")
        _seed("beta-ai", "Beta AI", "Generates flashcards from PDFs", "Study")
        db.session.commit()
        from app.tool_cache import refresh_tools_cache
        refresh_tools_cache()
        admin = User(email="a@t.test", is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id

    with client.session_transaction() as s:
        s["_user_id"] = str(admin_id)
        s["_fresh"] = True

    resp = client.get("/api/v1/admin/linkedin-drafts?n=5")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()

    assert body["count"] == 2
    assert "Alpha AI" in body["roundup"]
    assert "Beta AI" in body["roundup"]
    assert "ai-compass.in" in body["roundup"]
    assert body["roundup"].count("#") >= 3  # hashtags present
    # Spotlight = the single newest tool, deep-links to its page
    assert "Tool spotlight:" in body["spotlight"]
    assert "ai-compass.in/tools/" in body["spotlight"]


def test_drafts_requires_admin(client):
    resp = client.get("/api/v1/admin/linkedin-drafts")
    assert resp.status_code in (401, 403)


def test_drafts_empty_catalog(client, app):
    with app.app_context():
        from app.tool_cache import refresh_tools_cache
        refresh_tools_cache()
        admin = User(email="b@t.test", is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as s:
        s["_user_id"] = str(admin_id)
        s["_fresh"] = True
    body = client.get("/api/v1/admin/linkedin-drafts").get_json()
    assert body["count"] == 0
    assert body["roundup"] == "" and body["spotlight"] == ""
