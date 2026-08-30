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

# References produced by the retired hosted-button / NCP checkout. Kept so a
# reference of this shape can be recognised and routed to a human rather
# than being thrown away as malformed — see verify_paypal_order.
NCP_REFERENCE_RE = re.compile(r"^PAYPAL-NCP-[A-Z0-9]+(-\d+)?$", re.IGNORECASE)

# Two very different failures used to produce the same outcome, and that is
# how a paying customer silently ends up on a free listing:
#
#   REFUSED       PayPal answered, and the answer was "this is not a valid
#                 completed payment for this amount". The claim is bogus (or
#                 the buyer underpaid). Downgrading to free is correct.
#
#   INDETERMINATE We never got an answer. Our credentials are wrong, PayPal
#                 is down, the reference is a shape we cannot look up. The
#                 payment may be perfectly real. Downgrading to free here is
#                 a silent theft, so these must be surfaced to a human with
#                 the reference preserved.
#
# Callers branch on classify_failure(), never on the raw detail string.
VERIFY_REFUSED = "refused"
VERIFY_INDETERMINATE = "indeterminate"

_INDETERMINATE_DETAILS = frozenset({
    "paypal_credentials_not_configured",
    "paypal_api_unreachable",
    "amount_parse_failed",
    "unrecognized_reference_format",
    "ncp_reference_needs_manual_lookup",
})

# HTTP statuses from the order lookup that mean "PayPal could not answer"
# rather than "PayPal says no". 404 is deliberately NOT here: it means the
# order genuinely does not exist. 429 is — a rate-limited lookup tells us
# nothing about the payment.
_INDETERMINATE_HTTP = frozenset({408, 429, 500, 502, 503, 504})


def classify_failure(detail):
    """REFUSED (PayPal said no) vs INDETERMINATE (we could not find out).

    Only meaningful when verify_paypal_order() returned False. An unknown
    detail string classifies as INDETERMINATE on purpose: a reason code we
    do not recognise is, by definition, one we cannot claim to understand,
    and the safe failure here is bothering an admin rather than silently
    downgrading someone who paid.
    """
    detail = (detail or "").strip()
    if detail in _INDETERMINATE_DETAILS:
        return VERIFY_INDETERMINATE
    if detail.startswith("order_lookup_failed_http_"):
        try:
            code = int(detail.rsplit("_", 1)[1])
        except (ValueError, IndexError):
            return VERIFY_INDETERMINATE
        return VERIFY_INDETERMINATE if code in _INDETERMINATE_HTTP else VERIFY_REFUSED
    if detail in ("missing_reference",) or detail.startswith(("order_status_", "amount_mismatch_")):
        return VERIFY_REFUSED
    return VERIFY_INDETERMINATE

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

    # Branch on the shape of the reference instead of rejecting everything
    # that isn't a Smart-Buttons order ID.
    #
    # This used to be one `invalid_order_id_format` for both "you sent
    # nothing" and "you sent a reference we don't know how to look up",
    # which threw away the only evidence a real payment left behind. Now:
    #
    #   nothing at all          -> REFUSED. There is no claim to check.
    #   Smart-Buttons order ID  -> Orders v2 lookup, below.
    #   NCP / anything else     -> INDETERMINATE. We cannot resolve it
    #                              ourselves, so it goes to a human with the
    #                              reference intact rather than being
    #                              silently downgraded to a free listing.
    #
    # Resolving an NCP reference automatically needs PayPal's Transaction
    # Search API (Dashboard -> your app -> Features -> "Transaction search",
    # currently disabled for this account) or a webhook subscription.
    # Neither is wired up, and guessing at an API we cannot exercise would
    # be worse than routing to review — so this is the honest stopping
    # point, and the branch is where that code goes when the capability is
    # switched on.
    if not order_id:
        return False, "missing_reference"
    if NCP_REFERENCE_RE.match(order_id):
        log.warning("NCP-shaped payment reference needs manual lookup: %s", order_id)
        return False, "ncp_reference_needs_manual_lookup"
    if not PAYPAL_ORDER_ID_RE.match(order_id):
        log.warning("Unrecognized payment reference shape, routing to review: %s", order_id)
        return False, "unrecognized_reference_format"

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
