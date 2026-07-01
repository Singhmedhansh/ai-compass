"""Public submission persistence + self-scheduled digest claim.

Before this, /submit-tool wrote an ephemeral JSON file (wiped every
Render deploy) and a second, unauthenticated /admin/submissions route
shadowed the DB-backed one in the URL map — so the review queue was
permanently empty. The digest also only sent via SMTP, which Render
free tier blocks, and only ran if manually POSTed.
"""
import os
import tempfile

import pytest

import app.digest as digest_mod
from app import create_app, db
from app.models import AppSetting, Submission

# conftest's `app` is SESSION-scoped and holds one outer app-context for
# the whole run with function-scoped clients. A request made here (e.g.
# /submit-tool) opens a long-lived read transaction on that shared scoped
# session; a later unrelated test (created/committed a user in between)
# then can't see its own row through that stale snapshot and its login
# 401s. Rather than perturb the shared fixture, this file runs on its own
# fully isolated, function-scoped app + DB so it can't bleed into others.


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


def test_submit_tool_persists_to_db(client, app):
    resp = client.post("/api/v1/submit-tool", json={
        "name": "Test Widget AI",
        "url": "https://testwidget.example.com",
        "category": "Productivity",
        "reason": "Automates a thing students do a lot.",
    })
    assert resp.status_code == 201, resp.data
    with app.app_context():
        s = Submission.query.filter_by(name="Test Widget AI").first()
        assert s is not None
        assert s.website == "https://testwidget.example.com"
        assert s.description == "Automates a thing students do a lot."
        assert s.status == "pending"
        assert s.pricing_model  # NOT NULL satisfied


def test_only_one_admin_submissions_route(app):
    """The legacy unauthenticated JSON route must be gone, so the URL
    maps to the DB-backed, auth-checked handler."""
    rules = [r for r in app.url_map.iter_rules()
             if r.rule == "/api/v1/admin/submissions" and "GET" in r.methods]
    assert len(rules) == 1
    assert rules[0].endpoint.endswith("admin_list_submissions")


def test_maybe_run_digest_claims_once(app, monkeypatch):
    """Atomic claim: first eligible call runs, an immediate second call
    is a no-op (interval not elapsed)."""
    runs = []
    monkeypatch.setattr(digest_mod, "email_enabled", lambda: True)
    monkeypatch.setattr(
        digest_mod, "run_digest",
        lambda *a, **k: runs.append(1) or {"status": "noop"},
    )
    with app.app_context():
        AppSetting.query.filter_by(key="digest_last_run").delete()
        db.session.commit()

        digest_mod.maybe_run_digest(min_interval_hours=24)
        digest_mod.maybe_run_digest(min_interval_hours=24)

        assert len(runs) == 1
        claim = AppSetting.query.filter_by(key="digest_last_run").one()
        assert claim.value and claim.value != digest_mod._EPOCH


def test_maybe_run_digest_noop_without_email(app, monkeypatch):
    runs = []
    monkeypatch.setattr(digest_mod, "email_enabled", lambda: False)
    monkeypatch.setattr(digest_mod, "run_digest", lambda *a, **k: runs.append(1))
    with app.app_context():
        AppSetting.query.filter_by(key="digest_last_run").delete()
        db.session.commit()
        digest_mod.maybe_run_digest()
        assert runs == []


def test_paypal_config_endpoint(client, monkeypatch):
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "TEST_CLIENT_ID")
    monkeypatch.setenv("PAYPAL_MODE", "sandbox")
    resp = client.get("/api/v1/config/paypal")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["client_id"] == "TEST_CLIENT_ID"
    assert data["mode"] == "sandbox"


def test_submit_tool_with_transaction_ref(client, app):
    resp = client.post("/api/v1/submit-tool", json={
        "name": "Sponsored AI Tool",
        "url": "https://sponsored.example.com",
        "category": "Productivity",
        "reason": "Very helpful utility.",
        "pricing_model": "sponsored_paypal",
        "transaction_ref": "PAYPAL-TX-123456",
    })
    assert resp.status_code == 201
    with app.app_context():
        s = Submission.query.filter_by(name="Sponsored AI Tool").first()
        assert s is not None
        assert s.pricing_model == "sponsored_paypal:PAYPAL-TX-123456"


def test_paypal_hosted_config_endpoint(client, monkeypatch):
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "TEST_CLIENT_ID")
    monkeypatch.setenv("PAYPAL_HOSTED_BUTTON_ID", "TEST_BUTTON_ID")
    monkeypatch.setenv("PAYPAL_MODE", "live")
    resp = client.get("/api/v1/config/paypal-hosted")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["client_id"] == "TEST_CLIENT_ID"
    assert data["hosted_button_id"] == "TEST_BUTTON_ID"
    assert data["mode"] == "live"


