"""The restructured ladder: Free / Fast-Track $49 / Reviewed $79.

What these pin, and why each one is worth a test:

  * Quick Review is RETIRED. The checkout refuses it before touching a
    payment, because taking money for a tier we have stopped delivering
    means holding a charge we owe straight back. Retired is not deleted:
    rows bought under it must still resolve everywhere else, or a paying
    customer's entitlement vanishes with the sale.
  * The free wait is 7 days, not 14.
  * Reviewed grants everything Fast-Track does. The four `== "sponsored"`
    checks that used to gate placement inline are now one predicate, and
    this is the test that would have caught them being missed.
  * Reviewed's price includes the review, so the commission is queued by the
    checkout itself. An owed deliverable that lives only in someone's memory
    is the failure this whole ladder was rebuilt to stop repeating — and it
    is queued only on a VERIFIED payment.
"""
import json
import os
import tempfile
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app import create_app, db, editorial, sponsorship
from app.models import CatalogTool, EditorialReview, Submission, User
from app.pricing_tiers import (
    TIERS,
    effective_tier,
    includes_sponsored_perks,
    is_for_sale,
    price_for_tier,
    tier_for_pricing_model,
    visibility_delay_days_for_tier,
)


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


def _login_as_admin(client, app, email="ladder-admin@example.com"):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


# submit_tool rate-limits to 5/hour per IP, and this module submits more than
# that. Each call gets its own client address so the limiter measures what it
# is meant to (one founder spamming the form) rather than the test file.
_IP_SEQ = iter(range(1, 250))


def _submit(client, name, pricing_model, ref="8AB123456789", email="founder@example.com",
            ip=None):
    ip = ip or f"10.0.0.{next(_IP_SEQ)}"
    return client.post("/api/v1/submit-tool", environ_base={"REMOTE_ADDR": ip}, json={
        "name": name,
        "url": f"https://{name.lower().replace(' ', '')}.example.com",
        "category": "Productivity",
        "reason": "A genuinely useful tool for students.",
        "pricing_model": pricing_model,
        "transaction_ref": ref,
        "submitter_email": email,
    })


# --- the shape of the ladder ------------------------------------------------


def test_prices_are_the_ones_we_advertise():
    assert price_for_tier("free") == 0.0
    assert price_for_tier("sponsored") == 49.0
    assert price_for_tier("reviewed") == 79.0
    assert editorial.REVIEW_PRICE == 39.0
    assert sponsorship.PLACEMENT_PRICING["rail"] == 14.99


def test_free_listings_wait_seven_days_not_fourteen():
    assert visibility_delay_days_for_tier("free") == 7
    assert visibility_delay_days_for_tier("sponsored") == 1
    assert visibility_delay_days_for_tier("reviewed") == 1


def test_both_placement_tiers_grant_placement_and_no_others():
    assert includes_sponsored_perks("sponsored") is True
    assert includes_sponsored_perks("reviewed") is True
    assert includes_sponsored_perks("quick") is False
    assert includes_sponsored_perks("free") is False


# --- retiring Quick Review --------------------------------------------------


def test_quick_review_is_no_longer_for_sale():
    assert is_for_sale("quick") is False
    assert is_for_sale("sponsored") is True
    assert is_for_sale("reviewed") is True
    assert is_for_sale("free") is True


def test_a_quick_review_claim_is_refused_before_any_payment_work(client, app):
    with patch("app.payments.verify_paypal_order") as verify:
        resp = _submit(client, "Retired Tier Tool", "quick_paypal")
    assert resp.status_code == 400
    verify.assert_not_called()
    with app.app_context():
        assert Submission.query.filter_by(name="Retired Tier Tool").first() is None


def test_rows_bought_under_the_retired_tier_still_resolve():
    """Retired means "no longer sold", never "no longer honoured" — live rows
    carry quick_paypal and their owners paid for what it grants."""
    assert tier_for_pricing_model("quick_paypal:OLD123") == "quick"
    assert effective_tier("quick_paypal:OLD123", "verified") == "quick"
    assert TIERS["quick"]["paid"] is True
    assert visibility_delay_days_for_tier("quick") == 2


# --- the Reviewed tier ------------------------------------------------------


def test_reviewed_tier_verifies_against_seventy_nine_dollars(client, app):
    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")) as verify:
        resp = _submit(client, "Reviewed Price Tool", "reviewed_paypal")
    assert resp.status_code == 201
    assert verify.call_args.kwargs["expected_amount"] == 79.0


def test_reviewed_tier_commissions_the_review_on_a_verified_payment(client, app):
    with patch("app.payments.verify_paypal_order", return_value=(True, "paypal_order_verified")):
        resp = _submit(client, "Bundled Review Tool", "reviewed_paypal", ref="8AB999888777")
    assert resp.status_code == 201

    with app.app_context():
        sub = Submission.query.filter_by(name="Bundled Review Tool").one()
        assert sub.payment_status == "verified"

        review = EditorialReview.query.filter_by(tool_slug="bundled-review-tool").one()
        assert review.status == "ordered"
        assert review.contact_email == "founder@example.com"
        assert review.payment_ref == "8AB999888777"
        # Zero on the review row on purpose: the $79 is already counted as
        # submission revenue, and booking it twice would inflate one payment
        # across two reports. The note is where the money actually landed.
        assert review.amount_paid == 0.0
        assert f"#{sub.id}" in (review.admin_note or "")
        assert "79" in (review.admin_note or "")


def test_an_unverified_reviewed_claim_commissions_nothing(client, app):
    """The whole ladder's rule: an unconfirmed payment buys nothing. A queued
    review would be work owed against money we never received."""
    with patch("app.payments.verify_paypal_order", return_value=(False, "order_status_VOIDED")):
        resp = _submit(client, "Unpaid Review Tool", "reviewed_paypal")
    assert resp.status_code == 201  # the free listing still goes through
    with app.app_context():
        assert Submission.query.filter_by(name="Unpaid Review Tool").one().payment_status != "verified"
        assert EditorialReview.query.count() == 0


def test_a_retried_reviewed_checkout_does_not_queue_two_reviews(client, app):
    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")):
        _submit(client, "Retried Review Tool", "reviewed_paypal",
                ref="8ABRETRY1234", ip="10.9.9.9")
        _submit(client, "Retried Review Tool", "reviewed_paypal",
                ref="8ABRETRY1234", ip="10.9.9.9")
    with app.app_context():
        assert Submission.query.filter_by(name="Retried Review Tool").count() == 1
        assert EditorialReview.query.count() == 1


def test_reviewed_tier_gets_the_same_placement_perks_as_fast_track(client, app):
    """The regression this file exists for: placement used to be gated on
    `tier_key == "sponsored"` at four separate call sites, so a new placement
    tier would silently grant none of it."""
    _login_as_admin(client, app)
    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")):
        _submit(client, "Perked Review Tool", "reviewed_paypal", ref="8ABPERK12345")

    with app.app_context():
        sub_id = Submission.query.filter_by(name="Perked Review Tool").one().id

    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.get_json()

    with app.app_context():
        row = CatalogTool.query.filter_by(slug="perked-review-tool").one()
        record = json.loads(row.data or "{}")
        # Placement: the catalog row carries the paid flag.
        assert record.get("sponsored") is True
        # Speed: one day, not the free seven.
        delay = row.visible_at.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)
        assert 0 < delay.total_seconds() <= 1.5 * 24 * 3600
        # The complimentary rail card, from the same shared predicate the
        # renderer and the founder dashboard both read.
        assert sponsorship.complimentary_window(Submission.query.get(sub_id)) is not None
