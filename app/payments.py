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


def _paypal_base_url():
    mode = os.environ.get("PAYPAL_MODE", "live")
    return "https://api-m.sandbox.paypal.com" if mode == "sandbox" else "https://api-m.paypal.com"


def _paypal_access_token():
    client_id = os.environ.get("PAYPAL_CLIENT_ID")
    client_secret = os.environ.get("PAYPAL_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    try:
        r = requests.post(
            f"{_paypal_base_url()}/v1/oauth2/token",
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


def verify_paypal_order(order_id, expected_amount=49.99, expected_currency="USD"):
    """Confirms a PayPal order ID was actually captured for the expected amount.

    Returns (verified: bool, detail: str). `detail` is always a short machine
    -readable reason code, safe to store in Submission.payment_note for an
    admin audit trail — never treat a False result as "maybe paid".
    """
    order_id = (order_id or "").strip()
    if not order_id or not PAYPAL_ORDER_ID_RE.match(order_id):
        return False, "invalid_order_id_format"

    token = _paypal_access_token()
    if not token:
        return False, "paypal_credentials_not_configured"

    try:
        r = requests.get(
            f"{_paypal_base_url()}/v2/checkout/orders/{order_id}",
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
