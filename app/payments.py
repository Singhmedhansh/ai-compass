"""Server-side payment verification.

The submit-tool endpoint used to trust whatever transaction_ref the browser
sent and mark it "PAYMENT APPROVED" — anyone could type a fake string (or
call the API directly) and get a free sponsored placement. This module makes
the one payment path that's actually real (PayPal Smart Buttons, which
returns a genuine capturable order ID) independently verifiable against
PayPal's own API before anything downstream trusts it.
"""
import os
import re
import logging

import requests

log = logging.getLogger(__name__)

PAYPAL_ORDER_ID_RE = re.compile(r"^[A-Z0-9]{10,20}$")

# A hosted-button ("no-code payments") client ID cannot obtain an OAuth token
# and so can never verify an order. Both kinds start with "BAA" — the REST
# app created for AI Compass is BAAsYL_t53nt… — so the prefix ALONE is not a
# discriminator, and using it as one flags a perfectly good REST app as
# broken. Length is what actually separates them: hosted-button IDs are ~25
# characters, REST client IDs ~80. Treat this as a hint for error messages
# only; the authoritative test is whether _paypal_access_token() succeeds.
_HOSTED_BUTTON_ID_MAX_LEN = 40


def looks_like_hosted_button_id(client_id):
    """Heuristic: does this look like an NCP hosted-button ID rather than a
    REST app client ID? Used to turn an opaque auth failure into an
    actionable message, never to gate behaviour."""
    cid = (client_id or "").strip()
    return bool(cid) and cid.startswith("BAA") and len(cid) < _HOSTED_BUTTON_ID_MAX_LEN


def sponsor_credentials():
    """Credentials for the sponsorship checkout, isolated from /submit.

    The submission flow uses a PayPal *hosted button*, whose client ID
    ("BAA…") cannot obtain an OAuth token and so cannot verify orders. The
    sponsorship flow needs a REST app pair instead. Keeping them on separate
    env vars means switching sponsorship to sandbox for a test does not
    swap the live client ID out from under /submit and break real
    submission payments.

    Falls back to the shared vars so an operator who only ever configures
    one REST app still works with no extra setup.
    """
    return (
        os.environ.get("PAYPAL_SPONSOR_CLIENT_ID") or os.environ.get("PAYPAL_CLIENT_ID"),
        os.environ.get("PAYPAL_SPONSOR_CLIENT_SECRET") or os.environ.get("PAYPAL_CLIENT_SECRET"),
        os.environ.get("PAYPAL_SPONSOR_MODE") or os.environ.get("PAYPAL_MODE", "live"),
    )


def _paypal_base_url(mode=None):
    mode = mode or os.environ.get("PAYPAL_MODE", "live")
    return "https://api-m.sandbox.paypal.com" if mode == "sandbox" else "https://api-m.paypal.com"


def _paypal_access_token(client_id=None, client_secret=None, mode=None):
    client_id = client_id or os.environ.get("PAYPAL_CLIENT_ID")
    client_secret = client_secret or os.environ.get("PAYPAL_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    try:
        r = requests.post(
            f"{_paypal_base_url(mode)}/v1/oauth2/token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
            timeout=8,
        )
        if r.ok:
            return r.json().get("access_token")
        log.warning("PayPal OAuth token request failed: HTTP %s", r.status_code)
    except Exception as exc:
        log.warning("PayPal OAuth token request errored: %s", exc)
    return None


def verify_paypal_order(
    order_id, expected_amount=49.99, expected_currency="USD",
    client_id=None, client_secret=None, mode=None,
):
    """Confirms a PayPal order ID was actually captured for the expected amount.

    Returns (verified: bool, detail: str). `detail` is always a short machine
    -readable reason code, safe to store in Submission.payment_note for an
    admin audit trail — never treat a False result as "maybe paid".

    Credentials default to the shared PAYPAL_* env vars; callers on a
    separate PayPal app (see sponsor_credentials) pass their own.
    """
    order_id = (order_id or "").strip()
    if not order_id or not PAYPAL_ORDER_ID_RE.match(order_id):
        return False, "invalid_order_id_format"

    token = _paypal_access_token(client_id, client_secret, mode)
    if not token:
        return False, "paypal_credentials_not_configured"

    try:
        r = requests.get(
            f"{_paypal_base_url(mode)}/v2/checkout/orders/{order_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=8,
        )
    except Exception as exc:
        log.warning("PayPal order lookup errored for %s: %s", order_id, exc)
        return False, "paypal_api_unreachable"

    if not r.ok:
        return False, f"order_lookup_failed_http_{r.status_code}"

    data = r.json()
    status = data.get("status")
    if status != "COMPLETED":
        return False, f"order_status_{status or 'unknown'}"

    try:
        purchase_unit = (data.get("purchase_units") or [{}])[0]
        amount = purchase_unit.get("amount", {})
        value = float(amount.get("value", 0))
        currency = amount.get("currency_code", "")
    except (ValueError, TypeError, IndexError):
        return False, "amount_parse_failed"

    if currency != expected_currency or value < float(expected_amount) - 0.01:
        return False, f"amount_mismatch_{value}_{currency}"

    return True, "paypal_order_verified"
