"""Founder account creation + welcome email, triggered from submit_tool()
at payment-verification time (Prompt 2 relocates this off of
admin_approve_submission() — see test_founder_accounts.py's regression
check for that side of it).

verify_paypal_order() is faked here (same technique
test_paid_invoice_email_includes_register_link in
test_submissions_and_digest.py already uses) since there's no real PayPal
gateway in the test env. app.email_utils.founder_welcome_email_live is
monkeypatched per-test to exercise both the dry-run default and the live
(credentials-included) path.
"""
import os
import tempfile

import pytest

import app.email_utils as email_utils_mod
import app.payments as payments_mod
from app import create_app, db
from app.models import Submission, User


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


@pytest.fixture(autouse=True)
def _bypass_submit_rate_limit(monkeypatch):
    # /submit-tool's per-IP rate limit (5/hour) shares a process-global
    # in-memory bucket keyed by client IP — every test client request in
    # this file looks like the same IP, so several tests posting twice
    # would otherwise start tripping it well before the module finishes.
    monkeypatch.setattr("app.api_routes.is_rate_limited", lambda *a, **k: False)


def _fake_verified(monkeypatch, amount=None):
    monkeypatch.setattr(
        payments_mod, "verify_paypal_order",
        lambda order_id, expected_amount=None, expected_currency="USD": (True, "paypal_order_verified"),
    )


def _capture_emails(monkeypatch):
    sent = []
    monkeypatch.setattr(
        email_utils_mod, "send_email",
        lambda **kwargs: sent.append(kwargs) or True,
    )
    return sent


def _submit(client, **overrides):
    payload = {
        "name": "Welcome Email Tool",
        "url": "https://welcomeemailtool.example.com",
        "category": "Productivity",
        "reason": "Testing the founder welcome email.",
        "submitter_email": "founder@welcomeemailtool.example.com",
        "pricing_model": "sponsored_paypal",
        "transaction_ref": "WEL-TX-000001",
    }
    payload.update(overrides)
    return client.post("/api/v1/submit-tool", json=payload)


# --- Free tier: unchanged, no account, no attempt --------------------------


def test_free_tier_submission_creates_no_account_and_no_founder_email(client, app, monkeypatch):
    sent = _capture_emails(monkeypatch)

    resp = client.post("/api/v1/submit-tool", json={
        "name": "Free Welcome Tool",
        "url": "https://freewelcometool.example.com",
        "category": "Productivity",
        "reason": "A free-tier tool.",
        "submitter_email": "freefounder@welcomeemailtool.example.com",
    })
    assert resp.status_code == 201, resp.data
    body = resp.get_json()
    assert body["founder_account_created"] is False
    assert body["founder_account_linked"] is False

    with app.app_context():
        assert User.query.filter_by(email="freefounder@welcomeemailtool.example.com").first() is None
        s = Submission.query.filter_by(name="Free Welcome Tool").first()
        assert s.founder_user_id is None
        assert s.welcome_email_sent_at is None

    # The free-tier confirmation email still goes out (pre-existing
    # behavior) but it must never carry founder-account content — there's
    # no account to reference.
    confirmation = next((m for m in sent if m.get("to") == "freefounder@welcomeemailtool.example.com"), None)
    assert confirmation is not None
    assert "Temporary password" not in confirmation["html"]


# --- New account: dry-run default (gate off) --------------------------------


def test_new_account_created_but_email_withholds_credentials_by_default(client, app, monkeypatch):
    """Constraint 2: the account is created for real immediately, but real
    credential content stays out of the actually-sent email until the
    founder flips FOUNDER_WELCOME_EMAIL_LIVE on."""
    _fake_verified(monkeypatch)
    sent = _capture_emails(monkeypatch)
    monkeypatch.delenv("FOUNDER_WELCOME_EMAIL_LIVE", raising=False)

    resp = _submit(client, submitter_email="dryrun-founder@welcomeemailtool.example.com")
    assert resp.status_code == 201, resp.data
    body = resp.get_json()
    assert body["payment_verified"] is True
    assert body["founder_account_created"] is False  # withheld, not "no account exists"
    assert body["dashboard_url"]  # works immediately regardless of the gate

    with app.app_context():
        founder = User.query.filter_by(email="dryrun-founder@welcomeemailtool.example.com").first()
        assert founder is not None
        assert founder.must_change_password is True
        s = Submission.query.filter_by(submitter_email="dryrun-founder@welcomeemailtool.example.com").first()
        assert s.founder_user_id == founder.id
        assert s.welcome_email_sent_at is not None

    invoice = next((m for m in sent if m.get("to") == "dryrun-founder@welcomeemailtool.example.com"), None)
    assert invoice is not None
    assert "Temporary password" not in invoice["html"]
    assert "Create my free account" in invoice["html"]  # old register CTA still shown


# --- New account: live gate on ----------------------------------------------


def test_new_account_email_includes_credentials_when_live(client, app, monkeypatch):
    _fake_verified(monkeypatch)
    sent = _capture_emails(monkeypatch)
    monkeypatch.setattr(email_utils_mod, "founder_welcome_email_live", lambda: True)

    resp = _submit(client, submitter_email="live-founder@welcomeemailtool.example.com")
    assert resp.status_code == 201, resp.data
    body = resp.get_json()
    assert body["founder_account_created"] is True
    assert body["founder_account_linked"] is False

    invoice = next((m for m in sent if m.get("to") == "live-founder@welcomeemailtool.example.com"), None)
    assert invoice is not None
    assert "Temporary password" in invoice["html"]
    assert "live-founder@welcomeemailtool.example.com" in invoice["html"]
    assert "Create my free account" not in invoice["html"]  # replaced, not duplicated

    with app.app_context():
        founder = User.query.filter_by(email="live-founder@welcomeemailtool.example.com").first()
        assert founder is not None
        assert founder.must_change_password is True


# --- Existing account: linked, no credentials, no duplicate ----------------


def test_existing_account_linked_with_no_credentials_in_email(client, app, monkeypatch):
    with app.app_context():
        existing = User(email="repeat-founder@welcomeemailtool.example.com")
        db.session.add(existing)
        db.session.commit()
        existing_id = existing.id

    _fake_verified(monkeypatch)
    sent = _capture_emails(monkeypatch)
    monkeypatch.setattr(email_utils_mod, "founder_welcome_email_live", lambda: True)

    resp = _submit(client, submitter_email="repeat-founder@welcomeemailtool.example.com")
    assert resp.status_code == 201, resp.data
    body = resp.get_json()
    assert body["founder_account_created"] is False
    assert body["founder_account_linked"] is True

    invoice = next((m for m in sent if m.get("to") == "repeat-founder@welcomeemailtool.example.com"), None)
    assert invoice is not None
    assert "Temporary password" not in invoice["html"]
    assert "linked to your existing" in invoice["html"].lower()

    with app.app_context():
        assert User.query.filter_by(email="repeat-founder@welcomeemailtool.example.com").count() == 1
        founder = User.query.get(existing_id)
        assert founder.password_hash is None  # untouched, never set


# --- Idempotency: retried request for the same transaction -----------------


def test_retried_submission_same_transaction_ref_sends_one_email_one_account(client, app, monkeypatch):
    _fake_verified(monkeypatch)
    sent = _capture_emails(monkeypatch)
    monkeypatch.setattr(email_utils_mod, "founder_welcome_email_live", lambda: True)

    resp1 = _submit(
        client,
        submitter_email="retry-founder@welcomeemailtool.example.com",
        transaction_ref="RETRY-TX-777",
    )
    resp2 = _submit(
        client,
        submitter_email="retry-founder@welcomeemailtool.example.com",
        transaction_ref="RETRY-TX-777",
    )
    assert resp1.status_code == 201, resp1.data
    assert resp2.status_code == 201, resp2.data

    with app.app_context():
        assert Submission.query.filter_by(submitter_email="retry-founder@welcomeemailtool.example.com").count() == 1
        assert User.query.filter_by(email="retry-founder@welcomeemailtool.example.com").count() == 1

    matching = [m for m in sent if m.get("to") == "retry-founder@welcomeemailtool.example.com"]
    assert len(matching) == 1


def test_dashboard_url_present_in_success_response_regardless_of_email(client, app, monkeypatch):
    """The response the frontend renders its success panel from must carry
    a working dashboard link on its own — not depend on the email having
    been sent (or even attempted)."""
    _fake_verified(monkeypatch)
    _capture_emails(monkeypatch)

    resp = _submit(client, submitter_email="dashlink-founder@welcomeemailtool.example.com")
    assert resp.status_code == 201, resp.data
    body = resp.get_json()
    assert body["dashboard_url"]
    assert body["tier"] == "sponsored"
    assert body["tier_price"] == 49.99
