import os
from importlib import import_module

import pytest
from app import create_app, db

import_module("app.models")


@pytest.fixture(scope="session")
def app():
    db_path = "test.db"

    # remove old test DB if exists
    if os.path.exists(db_path):
        os.remove(db_path)

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
    if os.path.exists(db_path):
        os.remove(db_path)


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