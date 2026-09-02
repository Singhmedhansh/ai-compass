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


def test_no_tier_holds_a_listing_back_after_approval():
    """The free wait went 14 days -> 7 -> 0, and the paid tiers followed it
    down to 0 rather than keeping a one-day gap.

    Two separate reasons, and both matter:

    A wait sells nothing. Nobody has ever paid to skip one, which is the same
    verdict that retired Quick Review.

    A wait costs indexing. A listing that is not public is not being crawled,
    and an indexed page that ranks is the entire thing a founder is here for
    — so every day of delay was spent from the only account that cannot be
    topped up later.

    The paid tiers dropping to 0 too is deliberate: against an instant free
    tier, a one-day paid delay would read as "slower", which is the exact
    opposite of what it was there to say. Fast-Track's speed claim is now
    about the REVIEW queue (see is_priority), which is a real difference."""
    for tier in ("free", "analytics", "sponsored", "reviewed"):
        assert visibility_delay_days_for_tier(tier) == 0, tier


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
        # Speed: published at approval, like every tier now. visible_at is
        # still SET (approval computes it from the delay) — it is just not in
        # the future, which is what get_visible_tools actually tests.
        delay = row.visible_at.replace(tzinfo=timezone.utc) - datetime.now(timezone.utc)
        assert delay.total_seconds() <= 1
        # The complimentary rail card, from the same shared predicate the
        # renderer and the founder dashboard both read.
        assert sponsorship.complimentary_window(Submission.query.get(sub_id)) is not None


# --- the $19 entry rung -----------------------------------------------------
#
# The diagnostic proposed a $19 "Claimed Listing": account, edit rights,
# verified badge, monthly report. Three of those four shipped FREE in
# app/claims.py before this tier existed, so selling them now would be
# withdrawing a live free feature. What this rung actually sells is the one
# thing that was ever behind the wall — the numbers — and these tests exist
# to stop it quietly growing back into the perks it is priced under.


def test_the_entry_tier_is_nineteen_dollars_and_for_sale():
    assert price_for_tier("analytics") == 19.0
    assert is_for_sale("analytics") is True
    assert TIERS["analytics"]["paid"] is True


def test_the_entry_tier_verifies_against_nineteen_dollars(client, app):
    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")) as verify:
        resp = _submit(client, "Entry Price Tool", "analytics_paypal")
    assert resp.status_code == 201
    assert verify.call_args.kwargs["expected_amount"] == 19.0


def test_the_entry_tier_buys_no_placement(client, app):
    """It is priced below Fast-Track precisely because it does not place you
    above anyone. If this ever passes, the $49 tier has been given away."""
    assert includes_sponsored_perks("analytics") is False

    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")):
        resp = _submit(client, "Entry Placement Tool", "analytics_paypal")
    assert resp.status_code == 201

    with app.app_context():
        sub = Submission.query.filter_by(name="Entry Placement Tool").one()
        _login_as_admin(client, app)
        client.post(f"/api/v1/admin/submissions/{sub.id}/approve")

        row = CatalogTool.query.filter_by(submission_id=sub.id).one()
        data = json.loads(row.data)
        assert not data.get("sponsored")
        assert not data.get("featured")


def test_the_entry_tier_buys_no_editorial_review(client, app):
    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")):
        resp = _submit(client, "Entry Review Tool", "analytics_paypal")
    assert resp.status_code == 201
    with app.app_context():
        assert EditorialReview.query.count() == 0


def test_the_entry_tier_buys_no_launch_day(client, app):
    """Launch Day schedules the placement perks. A tier with no placement has
    nothing to schedule, and offering a date would be selling an empty box."""
    from app import launch_day

    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")):
        _submit(client, "Entry Launch Tool", "analytics_paypal")
    with app.app_context():
        sub = Submission.query.filter_by(name="Entry Launch Tool").one()
        sub.payment_status = "verified"
        db.session.commit()
        assert launch_day.is_eligible(sub) is False


def test_the_entry_tier_does_not_buy_a_shorter_wait():
    """Time-to-live is the weakest thing a directory can sell, and selling it
    here would make the ladder a toll booth again — which is what retiring
    Quick Review was for.

    Still worth asserting now that every delay is 0: the invariant is that
    $19 buys the NUMBERS and never the queue, so the day someone reintroduces
    a delay for free listings, this fails unless they charge nothing for
    skipping it."""
    assert visibility_delay_days_for_tier("analytics") == visibility_delay_days_for_tier("free")


def test_the_entry_tier_does_get_the_dashboard_numbers(client, app):
    """The one thing it actually sells."""
    from app.models import OutboundClick, ToolPageView

    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")):
        _submit(client, "Entry Numbers Tool", "analytics_paypal")

    with app.app_context():
        sub = Submission.query.filter_by(name="Entry Numbers Tool").one()
        sub_id = sub.id
        _login_as_admin(client, app)
        client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
        slug = CatalogTool.query.filter_by(submission_id=sub_id).one().slug
        db.session.add(ToolPageView(slug=slug))
        db.session.add(OutboundClick(slug=slug))
        db.session.commit()

        from app.submission_dashboard import mint_dashboard_token
        token = mint_dashboard_token(sub_id, "founder@example.com")

    body = client.get(f"/api/v1/submissions/dashboard?token={token}").get_json()
    assert body["tier"] == "analytics"
    assert body["analytics"]["total_views"] == 1
    assert body["analytics"]["total_clicks"] == 1
    # …and no placement confirmation, because there is no placement.
    assert "perks" not in body


def test_the_entry_tier_is_owed_a_monthly_report(client, app):
    """The report IS the deliverable here. A free listing must not get one,
    or the tier has nothing left to sell."""
    import app.founder_report as fr

    with patch("app.payments.verify_paypal_order", return_value=(True, "ok")):
        _submit(client, "Entry Report Tool", "analytics_paypal")

    with app.app_context():
        sub = Submission.query.filter_by(name="Entry Report Tool").one()
        _login_as_admin(client, app)
        client.post(f"/api/v1/admin/submissions/{sub.id}/approve")

        row = CatalogTool.query.filter_by(submission_id=sub.id).one()
        row.visible_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()

        assert any(s.id == sub.id for s, _row in fr.recipients())


def test_claiming_stays_free_at_every_tier():
    """The three things the diagnostic wanted to charge for. Charging for them
    now would be withdrawing something already shipped free."""
    import inspect

    import app.claims as claims

    source = inspect.getsource(claims)
    for paywall_word in ("price", "paypal", "amount_paid", "payment_status"):
        assert paywall_word not in source, (
            f"app/claims.py mentions {paywall_word!r} — claiming, editing and the "
            "maker badge are free for every founder who can prove the domain, and "
            "the $19 tier is priced on the assumption that they stay that way."
        )
