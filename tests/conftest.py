import os
import tempfile
from importlib import import_module

import pytest
from app import create_app, db

import_module("app.models")


@pytest.fixture(scope="session")
def app():
    # A private database file per pytest session, not a fixed "test.db" in the
    # repo root.
    #
    # The shared path made the suite silently un-runnable more than once at a
    # time: this fixture deletes the file on setup and drop_all()s on
    # teardown, so a second session pulls the tables out from under the first.
    # The result is dozens of unrelated OperationalErrors with nothing
    # pointing at concurrency as the cause — which is exactly how it wasted
    # time here. It would behave the same way under a parallel CI job.
    #
    # test_admin_tier_breakdown.py and test_sponsored_ranking.py already use
    # per-test temp files; this brings the shared fixture in line.
    fd, db_path = tempfile.mkstemp(prefix="aicompass-test-", suffix=".db")
    os.close(fd)
    # SQLAlchemy needs to create the schema in a file it owns, and mkstemp
    # has already made an empty one — harmless for SQLite, which treats a
    # zero-byte file as an empty database.

    app = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",  # ✅ FIX: required for Flask sessions
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "WTF_CSRF_ENABLED": False,  # ✅ FIX: disable CSRF for tests
    })

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()

    # cleanup after tests
    try:
        os.remove(db_path)
    except OSError:
        # Windows keeps a handle open occasionally; a stray temp file is not
        # worth failing a green suite over.
        pass


@pytest.fixture
def client(app):
    return app.test_client()


# Some tests seed CatalogTool rows and call refresh_tools_cache() to exercise
# DB-backed catalog paths (test_linkedin_drafts, test_affiliate_tracking). The
# cache is module-level state, so once they run every subsequent test sees
# just those 2 seeded tools and legit lookups like /api/v1/tools/chatgpt
# 404 — the alternatives suite was the canary that caught this. Reset to the
# tools.json baseline after every test.
@pytest.fixture(autouse=True)
def _reset_tool_cache(app):
    yield
    with app.app_context():
        try:
            from app.models import CatalogTool
            CatalogTool.query.delete()
            db.session.commit()
        except Exception:
            db.session.rollback()
        try:
            from app.tool_cache import refresh_tools_cache
            refresh_tools_cache()
        except Exception:
            pass


@pytest.fixture(autouse=True)
def _clear_active_g():
    from flask import g, has_app_context
    if has_app_context():
        for key in list(g.__dict__.keys()):
            g.__dict__.pop(key, None)
    yield
    if has_app_context():
        for key in list(g.__dict__.keys()):
            g.__dict__.pop(key, None)