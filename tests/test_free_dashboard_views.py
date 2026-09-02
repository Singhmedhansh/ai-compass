"""The free-tier dashboard view allowance (see api_routes._consume_free_dashboard_view).

A free listing gets a couple of real looks at its own dashboard and is then
asked to upgrade. Reporting is precisely what the $19 tier sells, so this is
the one gate on the ladder that withholds the thing the price is for.

What each test is protecting, and why it could plausibly go wrong:

  * The count is spent per SITTING, not per request. A refresh, a back button
    or a double render must not burn one of two — that is the realistic way a
    founder loses their whole allowance in one glance at the email.
  * The count lives on the submission, not on the token. A fresh magic link is
    one "resend my link" click away, so anything keyed to the token would
    reset itself and the gate would be decorative.
  * Paid tiers are never metered. Someone who bought the reporting must not be
    rationed on it.
  * A locked founder still sees their listing's status and live URL. Those are
    facts about their own tool; withholding them would make the upsell read as
    a lock on something we gave them.
  * An admin preview does not spend a founder's views. Otherwise checking that
    the gate works is itself how a real founder gets locked out.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app import create_app, db
from app.models import CatalogTool, Submission, User


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


_IP_SEQ = iter(range(1, 250))


def _login_as_admin(client, app, email="views-admin@example.com"):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess.clear()
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


def _logout(client):
    with client.session_transaction() as sess:
        sess.clear()


def _submit(client, name, pricing_model="free", ref="8AB123456789"):
    return client.post(
        "/api/v1/submit-tool",
        environ_base={"REMOTE_ADDR": f"10.4.0.{next(_IP_SEQ)}"},
        json={
            "name": name,
            "url": f"https://{name.lower().replace(' ', '')}.example.com",
            "category": "Productivity",
            "reason": "A genuinely useful tool for students.",
            "pricing_model": pricing_model,
            "transaction_ref": ref,
            "submitter_email": "founder@example.com",
        },
    )


def _approved(client, app, name, pricing_model="free"):
    """Submit, approve, and hand back (submission_id, dashboard token)."""
    if pricing_model == "free":
        _submit(client, name, pricing_model)
    else:
        with patch("app.payments.verify_paypal_order", return_value=(True, "ok")):
            _submit(client, name, pricing_model)

    with app.app_context():
        sub_id = Submission.query.filter_by(name=name).one().id

    _login_as_admin(client, app, email=f"admin-{name.replace(' ', '-').lower()}@example.com")
    client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    _logout(client)

    with app.app_context():
        from app.submission_dashboard import mint_dashboard_token
        return sub_id, mint_dashboard_token(sub_id, "founder@example.com")


def _open(client, token):
    return client.get(f"/api/v1/submissions/dashboard?token={token}").get_json()


def _age_the_sitting(app, sub_id, minutes=60):
    """Push the last view back so the next request counts as a new sitting."""
    with app.app_context():
        sub = Submission.query.get(sub_id)
        sub.dashboard_last_view_at = datetime.now(timezone.utc).replace(
            tzinfo=None
        ) - timedelta(minutes=minutes)
        db.session.commit()


# --- the allowance ----------------------------------------------------------


def test_a_free_listing_gets_two_views_then_the_upgrade(client, app):
    sub_id, token = _approved(client, app, "Metered Tool")

    first = _open(client, token)
    assert first.get("locked") is not True
    assert first["views"] == {"used": 1, "limit": 2, "remaining": 1, "locked": False}

    _age_the_sitting(app, sub_id)
    second = _open(client, token)
    assert second.get("locked") is not True
    assert second["views"]["used"] == 2
    assert second["views"]["remaining"] == 0

    _age_the_sitting(app, sub_id)
    third = _open(client, token)
    assert third["locked"] is True
    assert third["views"]["locked"] is True
    # Pointed at the tier that actually sells the thing being withheld.
    assert third["upgrade"]["tier"] == "analytics"
    assert third["upgrade"]["price"] == 19.0
    assert third["upgrade"]["unlocks"]


def test_a_refresh_does_not_burn_a_view(client, app):
    """A view is a sitting, not an HTTP request. Without this, opening the
    email and reloading once spends the entire allowance — and React renders
    the page more than once on its own."""
    _sub_id, token = _approved(client, app, "Refreshed Tool")

    for _ in range(5):
        body = _open(client, token)
        assert body.get("locked") is not True
        assert body["views"]["used"] == 1


def test_a_sitting_cannot_be_held_open_forever(client, app):
    """The dedupe window is anchored to when the sitting STARTED, not to the
    most recent request. Anchoring it to the latest request would let a tab
    reloading every few minutes keep one view alive indefinitely."""
    sub_id, token = _approved(client, app, "Long Sitting Tool")

    _open(client, token)
    # A second request inside the window does not count...
    assert _open(client, token)["views"]["used"] == 1
    # ...and does not push the window out either.
    _age_the_sitting(app, sub_id, minutes=31)
    assert _open(client, token)["views"]["used"] == 2


def test_a_fresh_magic_link_does_not_reset_the_count(client, app):
    """The count is on the submission, not the token. "Resend my link" is a
    button on this very page — a per-token counter would reset itself and the
    gate would be decorative."""
    sub_id, _token = _approved(client, app, "Relinked Tool")

    with app.app_context():
        from app.submission_dashboard import mint_dashboard_token
        for _ in range(3):
            fresh = mint_dashboard_token(sub_id, "founder@example.com")
            _open(client, fresh)
            sub = Submission.query.get(sub_id)
            sub.dashboard_last_view_at = datetime.now(timezone.utc).replace(
                tzinfo=None
            ) - timedelta(minutes=60)
            db.session.commit()

    with app.app_context():
        newest = mint_dashboard_token(sub_id, "founder@example.com")
    assert _open(client, newest)["locked"] is True


# --- who is never metered ---------------------------------------------------


def test_a_paid_listing_is_never_metered(client, app):
    """Rationing the reporting for someone who bought the reporting would be
    the worst possible place to put a counter."""
    sub_id, token = _approved(client, app, "Paid Tool", pricing_model="analytics_paypal")

    for _ in range(6):
        body = _open(client, token)
        assert body["tier"] == "analytics"
        assert body.get("locked") is not True
        # No meter at all, rather than a meter that never trips: a paid
        # dashboard should not carry the vocabulary of an allowance.
        assert "views" not in body

    with app.app_context():
        assert (Submission.query.get(sub_id).dashboard_views or 0) == 0


def test_an_admin_preview_does_not_spend_a_founders_views(client, app):
    sub_id, token = _approved(client, app, "Previewed Tool")

    _login_as_admin(client, app, email="previewer@example.com")
    for _ in range(4):
        assert _open(client, token).get("locked") is not True
    _logout(client)

    with app.app_context():
        assert (Submission.query.get(sub_id).dashboard_views or 0) == 0

    # And the founder still has both of theirs.
    assert _open(client, token)["views"]["used"] == 1


# --- what a locked founder can still see ------------------------------------


def test_a_locked_founder_still_sees_their_own_listing_status(client, app):
    """The gate withholds the reporting, not the founder's own facts. Taking
    the live URL hostage would make the upsell read as a lock on something we
    handed them for free — and that URL is the entire promise of the free
    tier."""
    sub_id, token = _approved(client, app, "Locked Status Tool")

    with app.app_context():
        assert CatalogTool.query.filter_by(submission_id=sub_id).one().slug

    for _ in range(2):
        _open(client, token)
        _age_the_sitting(app, sub_id)

    locked = _open(client, token)
    assert locked["locked"] is True
    assert locked["submission"]["name"] == "Locked Status Tool"
    assert locked["submission"]["status"] == "approved"
    assert locked["submission"]["slug"]
    assert locked["submission"]["is_live"] is True
    # But no numbers, which is the thing being sold.
    assert "analytics" not in locked


def test_the_meter_never_reports_a_negative_remainder(client, app):
    """`remaining` is rendered straight into a sentence a founder reads. A
    negative there is not a crash, which is what would make it survive."""
    sub_id, token = _approved(client, app, "Clamped Tool")

    with app.app_context():
        sub = Submission.query.get(sub_id)
        sub.dashboard_views = 99
        db.session.commit()

    body = _open(client, token)
    assert body["views"]["remaining"] == 0
    assert body["locked"] is True
