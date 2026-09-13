"""One PayPal capture buys one listing.

The retry guard in submit_tool() matched on the whole `pricing_model`, which
is `f"{tier}:{ref}"`. The tier is part of that key, so the *same* reference
under a *different* tier built a different key and sailed past the check. The
second half of the hole is in verify_paypal_order(), which asserts the capture
is at least the expected amount rather than equal to it — deliberately, so a
currency-conversion rounding does not refuse a real payment.

Put together, with tiers at 14.99 / 19 / 49 / 79: pay $79 once for 'reviewed',
then submit a different tool as $19 'analytics' quoting the same reference.
Different key, so no dedupe. 79 >= 19, so verification passes. Free listing.

The fix has to close that without breaking the thing the guard was written
for, which is a genuine retry — a network hiccup or a double-click on the
PayPal redirect resubmitting the identical purchase. A retry must still land
on the existing row rather than creating a second one, because creating a
second one also creates a second founder account and sends a second welcome
email.
"""

import pytest

from app import db
from app.models import Submission

TIER_79 = "reviewed_paypal"
TIER_19 = "analytics_paypal"


@pytest.fixture
def paid_ok(monkeypatch):
    """Treat every reference as a genuine, verified capture.

    Verification is server-side, so without this the requests fall through to
    the unverified-claim path and never reach the dedupe logic under test.
    """
    import app.payments as payments_mod

    monkeypatch.setattr(
        payments_mod,
        "verify_paypal_order",
        lambda order_id, expected_amount=49.0, expected_currency="USD": (
            True,
            "paypal_order_verified",
        ),
    )


@pytest.fixture(autouse=True)
def quiet_email(monkeypatch):
    import app.email_utils as email_utils_mod

    monkeypatch.setattr(email_utils_mod, "send_email", lambda **kwargs: True)


def submit(client, *, name, tier, ref, ip):
    return client.post(
        "/api/v1/submit-tool",
        json={
            "name": name,
            "url": f"https://{name.lower().replace(' ', '')}.example.com",
            "category": "Productivity",
            "reason": "Exercising the payment reference guard.",
            "submitter_email": f"founder@{name.lower().replace(' ', '')}.example.com",
            "pricing_model": tier,
            "transaction_ref": ref,
        },
        # /submit-tool is rate limited per IP and every test here shares one
        # client; without distinct addresses these 429 when the file runs in
        # full while passing in isolation.
        headers={"X-Forwarded-For": ip},
    )


def test_one_payment_cannot_be_spent_on_a_second_cheaper_listing(client, app, paid_ok):
    """The actual exploit."""
    ref = "REUSE-ACROSS-TIERS-1"

    first = submit(client, name="Paid Once", tier=TIER_79, ref=ref, ip="10.9.1.1")
    assert first.status_code == 201, first.data

    second = submit(client, name="Free Ride", tier=TIER_19, ref=ref, ip="10.9.1.2")

    assert second.status_code == 409, (
        f"the same capture bought a second listing: {second.status_code} {second.data}"
    )
    assert Submission.query.filter(
        Submission.pricing_model.contains(ref)
    ).count() == 1, "a second row was created for one payment"


def test_the_refusal_does_not_create_a_row_at_all(client, app, paid_ok):
    """A refused reuse must not leave a pending submission behind for an
    admin to approve by hand later."""
    ref = "REUSE-NO-ROW-2"
    submit(client, name="Origin Tool", tier=TIER_79, ref=ref, ip="10.9.2.1")

    submit(client, name="Reused Tool", tier=TIER_19, ref=ref, ip="10.9.2.2")

    assert Submission.query.filter_by(name="Reused Tool").first() is None


def test_a_genuine_retry_of_the_same_purchase_still_works(client, app, paid_ok):
    """The behaviour the guard existed for, which the fix must not break.

    Same tier, same reference, same tool: a double-click on the PayPal
    redirect. It has to reuse the row, not 409 and not duplicate.
    """
    ref = "HONEST-RETRY-3"

    first = submit(client, name="Retry Tool", tier=TIER_79, ref=ref, ip="10.9.3.1")
    assert first.status_code == 201, first.data

    again = submit(client, name="Retry Tool", tier=TIER_79, ref=ref, ip="10.9.3.2")

    assert again.status_code == 201, f"a legitimate retry was refused: {again.data}"
    assert Submission.query.filter(
        Submission.pricing_model.contains(ref)
    ).count() == 1, "the retry created a duplicate row"


def test_two_separate_payments_are_both_honoured(client, app, paid_ok):
    """The guard must key on the reference, not on the tier or the buyer."""
    first = submit(client, name="Tool A", tier=TIER_79, ref="DISTINCT-A", ip="10.9.4.1")
    second = submit(client, name="Tool B", tier=TIER_79, ref="DISTINCT-B", ip="10.9.4.2")

    assert first.status_code == 201, first.data
    assert second.status_code == 201, second.data
    assert Submission.query.filter_by(name="Tool A").first() is not None
    assert Submission.query.filter_by(name="Tool B").first() is not None


def test_an_upgrade_attempt_is_refused_in_the_expensive_direction_too(client, app, paid_ok):
    """Cheap-then-expensive is refused as well.

    verify_paypal_order()'s amount check would catch this one on its own
    (19 < 79), but only while the mock is not in play — and the guard should
    not be relying on a second control to cover a reference it has already
    seen. Asserted so the rule stays "one reference, one listing" rather than
    "one reference, one listing, unless the amounts happen to work out".
    """
    ref = "UPGRADE-ATTEMPT-5"
    first = submit(client, name="Cheap First", tier=TIER_19, ref=ref, ip="10.9.5.1")
    assert first.status_code == 201, first.data

    second = submit(client, name="Expensive Second", tier=TIER_79, ref=ref, ip="10.9.5.2")

    assert second.status_code == 409, second.data
