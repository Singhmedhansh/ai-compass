"""An address on the denylist gets no mail and cannot hold an account.

Deleting a users row is not enough on its own and that is the whole reason
this exists: OAuth sign-in rebuilds an account from the provider profile, so a
deleted user is one "Sign in with Google" away from being back — and back on
the digest recipient list with it, because that query is just "every user with
notifications enabled".

The block is enforced at choke points rather than at call sites: one function
for all outbound mail, one for all three OAuth providers. These tests pin the
choke points, not the callers, because a caller added next year is exactly
what a per-caller check fails to cover.
"""
import os
import tempfile

import pytest

from app import create_app, db
from app.blocklist import is_email_blocked
from app.models import BlockedEmail, User

BLOCKED = "blocked.person@example.com"


@pytest.fixture()
def app(monkeypatch):
    monkeypatch.delenv("BLOCKED_EMAILS", raising=False)
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
        db.session.add(BlockedEmail(email=BLOCKED, reason="test"))
        db.session.commit()
        yield application
        db.session.remove()
        db.drop_all()
    try:
        os.remove(path)
    except OSError:
        pass


# ─── the lookup itself ────────────────────────────────────────────────────────

def test_a_listed_address_is_blocked_case_and_space_insensitively(app):
    assert is_email_blocked(BLOCKED) is True
    assert is_email_blocked(BLOCKED.upper()) is True
    assert is_email_blocked(f"  {BLOCKED}  ") is True


def test_an_unlisted_address_is_not_blocked(app):
    assert is_email_blocked("someone.else@example.com") is False
    assert is_email_blocked(None) is False
    assert is_email_blocked("") is False


def test_the_env_var_blocks_without_a_database_row(app, monkeypatch):
    """The env list is the half of the guarantee that cannot fail.

    It is checked before the table precisely so that a denylist entry does
    not depend on a database read succeeding.
    """
    monkeypatch.setenv("BLOCKED_EMAILS", "env.only@example.com, other@example.com")
    assert is_email_blocked("env.only@example.com") is True
    assert is_email_blocked("ENV.ONLY@example.com") is True
    assert is_email_blocked("not.listed@example.com") is False


def test_a_broken_table_does_not_break_sending_for_everyone(app, monkeypatch):
    """A DB error must not be read as "block everything".

    Treating an unreadable denylist as a universal block would turn a
    transient database blip into a total outage of password resets and
    payment receipts. The trade is documented in app/blocklist.py: an address
    blocked ONLY in the table can slip through during such an outage, which
    is why a must-never-mail address belongs in BLOCKED_EMAILS as well.
    """
    import app.blocklist as blocklist_mod

    class Boom:
        def __getattr__(self, name):
            raise RuntimeError("database is down")

    monkeypatch.setattr(blocklist_mod, "_env_blocked", lambda: set())
    monkeypatch.setitem(__import__("sys").modules, "app.models", Boom())

    assert is_email_blocked(BLOCKED) is False


# ─── no mail, enforced at the transport ───────────────────────────────────────

def test_send_email_refuses_a_blocked_recipient(app, monkeypatch):
    import app.email_utils as email_mod

    sent = []
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    monkeypatch.setattr(email_mod, "_send_via_resend",
                        lambda *a, **k: sent.append(a) or (True, None))

    ok, reason = email_mod.send_email_with_details(
        to=BLOCKED, subject="Digest", html="<p>hi</p>")

    assert ok is False
    assert reason == "recipient_blocked"
    assert sent == [], "No transport may fire for a blocked recipient."


def test_send_email_still_delivers_to_everyone_else(app, monkeypatch):
    """The block must be narrow: everyone not on the list still gets mail."""
    import app.email_utils as email_mod

    sent = []
    monkeypatch.setenv("RESEND_API_KEY", "test-key")
    # The suite suppresses all sending by default (see sending_suppressed).
    # Lifted here only, so this test can observe a real dispatch decision.
    monkeypatch.setattr(email_mod, "sending_suppressed", lambda: (False, ""))
    monkeypatch.setattr(email_mod, "_send_via_resend",
                        lambda *a, **k: sent.append(a) or (True, None))

    ok, _ = email_mod.send_email_with_details(
        to="someone.else@example.com", subject="Digest", html="<p>hi</p>")

    assert ok is True and len(sent) == 1


# ─── no account ───────────────────────────────────────────────────────────────

def test_oauth_refuses_to_recreate_a_blocked_account(app):
    """The failure this whole feature exists to prevent.

    All three providers share _get_or_create_oauth_user, so this one refusal
    covers Google, GitHub and LinkedIn.
    """
    from app.oauth import BlockedEmailError, _get_or_create_oauth_user

    with app.test_request_context():
        with pytest.raises(BlockedEmailError):
            _get_or_create_oauth_user(BLOCKED, "Blocked Person", "google")

    assert User.query.filter_by(email=BLOCKED).first() is None, (
        "A blocked address must not leave a users row behind."
    )


def test_oauth_still_creates_an_ordinary_account(app):
    from app.oauth import _get_or_create_oauth_user

    with app.test_request_context():
        user = _get_or_create_oauth_user("fine@example.com", "Fine", "google")

    assert user.id is not None and user.email == "fine@example.com"


def test_password_login_refuses_a_blocked_address_without_saying_why(app):
    res = app.test_client().post("/api/v1/auth/login",
                                 json={"email": BLOCKED, "password": "whatever"})

    assert res.status_code == 401
    body = res.get_json()
    assert "block" not in str(body).lower(), (
        "A distinct 'blocked' reply would make this endpoint an oracle for "
        "who is on the denylist."
    )


def test_registration_refuses_a_blocked_address(app):
    res = app.test_client().post("/api/v1/auth/register",
                                 json={"name": "X", "email": BLOCKED, "password": "longenough1"})

    assert res.status_code == 409
    assert User.query.filter_by(email=BLOCKED).first() is None
    assert "block" not in str(res.get_json()).lower()


# ─── the digest's own accounting ──────────────────────────────────────────────

def test_the_digest_does_not_count_a_blocked_address_as_a_recipient(app):
    """send_email would refuse it anyway; the point is the numbers.

    Left in the list it would reserve a send-budget slot and be written to
    DigestRecipientLog as served — no mail sent, every figure wrong.
    """
    from app.digest import run_digest

    db.session.add(User(email=BLOCKED, display_name="B", notifications_enabled=True))
    db.session.add(User(email="reader@example.com", display_name="R",
                        notifications_enabled=True))
    db.session.commit()

    # The first run only seeds the snapshot of what has already been
    # announced, and it has to be a real one — a dry run reports the seeding
    # but does not persist it, so two dry runs both come back "seeded".
    # Sending is suppressed under TESTING, so no mail leaves.
    run_digest(force=True)
    result = run_digest(dry_run=True, force=True)

    assert result["status"] == "dry_run", result
    assert result["recipients"] == 1, (
        f"Only the unblocked reader counts: {result}"
    )
