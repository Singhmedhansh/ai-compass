"""Unit coverage for get_or_create_founder_account() itself, plus a
regression check that admin_approve_submission() no longer triggers it
(that moved to submit_tool() at payment-verification time — see
test_founder_welcome_email.py for those tests).

See app/founder_accounts.py. Uses the same isolated, function-scoped
app+DB fixture pattern as test_submissions_and_digest.py's approval tests,
since these tests also hit /admin/submissions/<id>/approve.
"""
import os
import tempfile

import pytest

from app import bcrypt, create_app, db
from app.models import Submission, User
from app.founder_accounts import get_or_create_founder_account
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


def _login_as_admin(client, app, email):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


def _make_submission(**overrides):
    defaults = dict(
        name="Founder Tool",
        website="https://foundertool.example.com",
        category="Productivity",
        description="A tool with a founder.",
        pricing_model="quick_paypal:FND111111",
        submitter_email="founder@foundertool.example.com",
        status="pending",
        payment_status="verified",
        is_priority=True,
    )
    defaults.update(overrides)
    return Submission(**defaults)


# --- get_or_create_founder_account() unit behavior -------------------------


def test_creates_new_account_with_hashed_temp_password(app):
    with app.app_context():
        refresh_tools_cache()
        s = _make_submission()
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

        result = get_or_create_founder_account("founder@foundertool.example.com", sub_id)

        assert result.created is True
        assert result.temp_password  # non-empty plaintext returned to caller
        assert result.user.password_hash != result.temp_password  # never stored raw
        assert bcrypt.check_password_hash(result.user.password_hash, result.temp_password)
        assert result.user.must_change_password is True

        s = Submission.query.get(sub_id)
        assert s.founder_user_id == result.user.id


def test_links_existing_account_without_resetting_password(app):
    """Existing account, whether from a prior paid submission or normal
    site signup/login, must be reused — not duplicated or password-reset."""
    with app.app_context():
        existing_hash = bcrypt.generate_password_hash("original-password-123").decode("utf-8")
        existing = User(email="existing@foundertool.example.com", password_hash=existing_hash)
        db.session.add(existing)
        db.session.commit()
        existing_id = existing.id

        s = _make_submission(submitter_email="existing@foundertool.example.com")
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

        result = get_or_create_founder_account("existing@foundertool.example.com", sub_id)

        assert result.created is False
        assert result.temp_password is None
        assert result.user.id == existing_id
        assert result.user.password_hash == existing_hash  # untouched
        assert User.query.filter_by(email="existing@foundertool.example.com").count() == 1

        s = Submission.query.get(sub_id)
        assert s.founder_user_id == existing_id


def test_case_insensitive_email_match(app):
    with app.app_context():
        existing = User(email="mixedcase@foundertool.example.com")
        db.session.add(existing)
        db.session.commit()
        existing_id = existing.id

        s = _make_submission(submitter_email="MixedCase@FounderTool.example.com")
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

        result = get_or_create_founder_account("MixedCase@FounderTool.example.com", sub_id)

        assert result.created is False
        assert result.user.id == existing_id
        assert User.query.count() == 1


def test_idempotent_on_repeat_call(app):
    with app.app_context():
        s = _make_submission()
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

        first = get_or_create_founder_account("founder@foundertool.example.com", sub_id)
        second = get_or_create_founder_account("founder@foundertool.example.com", sub_id)

        assert first.user.id == second.user.id
        assert second.created is False
        assert second.temp_password is None
        assert User.query.filter_by(email="founder@foundertool.example.com").count() == 1

        s = Submission.query.get(sub_id)
        assert s.founder_user_id == first.user.id


# --- Integration via admin_approve_submission() -----------------------------


def test_admin_approval_no_longer_creates_account(client, app):
    """As of Prompt 2, account creation/linking fires at payment
    verification time (submit_tool()), not at admin curation review —
    approve() must not independently trigger it anymore, even for a
    submission inserted directly (bypassing submit-tool) with a paid,
    verified status."""
    with app.app_context():
        refresh_tools_cache()
        s = _make_submission(
            name="Bypassed Approve Tool",
            website="https://bypassedapprove.example.com",
            submitter_email="bypassed-founder@example.com",
            pricing_model="sponsored_paypal:BYP555555",
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

    _login_as_admin(client, app, "admin-bypassed@t.test")

    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data

    with app.app_context():
        s = Submission.query.get(sub_id)
        assert s.founder_user_id is None
        assert User.query.filter_by(email="bypassed-founder@example.com").first() is None
