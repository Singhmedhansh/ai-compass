"""HTTP surface for commissioned editorial reviews (see app/editorial.py).

Public: the price/availability card, and the published review for a tool.
Paid:   a PayPal-verified checkout that queues one commission.
Admin:  the queue, and the write/publish endpoint.

Mirrors community_routes.sponsor_checkout()'s stance on money throughout —
a payment nobody could independently confirm is never treated as paid, and
"PayPal said no" and "we could not reach PayPal" get different answers,
because telling someone whose card may already have been charged to simply
try again is how a buyer gets billed twice.
"""

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from app import csrf, editorial
from app.models import CatalogTool, EditorialReview
from app.payments import sponsor_credentials, verify_paypal_order
from app.rate_limit import is_rate_limited

editorial_bp = Blueprint("editorial", __name__)


def _require_admin():
    if not (current_user and current_user.is_authenticated and current_user.is_admin):
        return jsonify({"error": "Forbidden"}), 403
    return None


@editorial_bp.get("/pricing")
def review_pricing():
    """Price, turnaround and how much of this month is already spoken for."""
    try:
        return jsonify(editorial.availability())
    except Exception:
        current_app.logger.exception("editorial pricing failed")
        # The price is a constant; only the scarcity numbers need the DB, so
        # a failed query degrades to "no live availability" rather than
        # taking the sales page down with it.
        return jsonify({
            "price": editorial.REVIEW_PRICE,
            "currency": "USD",
            "turnaround_days": editorial.TURNAROUND_DAYS,
            "capacity_per_month": editorial.MONTHLY_CAPACITY,
            "slots_left": None,
            "disclosure": editorial.DISCLOSURE,
        }), 200


@editorial_bp.get("/<slug>")
def review_for_tool(slug):
    """The published review for one tool, or 404. Unpublished commissions are
    invisible here — a draft is not a product."""
    try:
        review = editorial.published_review_for_slug(slug)
    except Exception:
        current_app.logger.exception("editorial review lookup failed")
        return jsonify({"error": "Could not load review"}), 500
    if review is None:
        return jsonify({"error": "No review"}), 404
    return jsonify({"review": editorial.public_payload(review)})


@editorial_bp.post("/checkout")
@csrf.exempt
def review_checkout():
    """Commissions a review against a PayPal order the server verified itself.

    The order id arrives from the browser and is therefore untrusted: it is
    checked against PayPal for COMPLETED status *and* the exact list price
    before any commission is queued.
    """
    payload = request.get_json(silent=True) or {}
    tool_slug = str(payload.get("tool_slug") or "").strip().lower()
    order_id = str(payload.get("order_id") or "").strip()
    contact_email = str(payload.get("contact_email") or "").strip() or None
    brief = str(payload.get("brief") or "").strip()[:2000] or None

    if not tool_slug:
        return jsonify({"error": "A tool is required"}), 400
    if not order_id:
        return jsonify({"error": "Missing payment reference"}), 400
    if not contact_email or "@" not in contact_email:
        return jsonify({"error": "A contact email is required — the review needs a reviewer's questions answered."}), 400

    tool = CatalogTool.query.filter_by(slug=tool_slug).first()
    if not tool:
        return jsonify({
            "error": "That tool isn't in the catalog yet. Submit it first, then commission a review.",
        }), 400

    # Checked before any payment work, so a duplicate order is refused rather
    # than captured and refunded.
    if editorial.has_open_order(tool_slug):
        return jsonify({
            "error": "A review of that tool is already in the queue. Email admin@ai-compass.in "
                     "if you think that's wrong — we won't take money for the same piece twice.",
        }), 409

    ip = request.remote_addr or "unknown"
    if is_rate_limited(f"review_checkout:{ip}", limit=8, window_seconds=3600):
        return jsonify({"error": "Too many checkout attempts. Please try again later."}), 429

    sponsor_client_id, sponsor_secret, sponsor_mode = sponsor_credentials()
    verified, detail = verify_paypal_order(
        order_id,
        expected_amount=editorial.REVIEW_PRICE,
        client_id=sponsor_client_id,
        client_secret=sponsor_secret,
        mode=sponsor_mode,
    )
    if not verified:
        from app.payments import VERIFY_INDETERMINATE, classify_failure

        outcome = classify_failure(detail)
        if outcome == VERIFY_INDETERMINATE:
            current_app.logger.error(
                "UNRESOLVED review commission — payment may be genuine. "
                "slug=%s order=%s reason=%s", tool_slug, order_id, detail,
            )
            return jsonify({
                "error": "We couldn't reach PayPal to confirm this payment, so we haven't queued "
                         "the review yet. Please do NOT pay again — if you were charged, email "
                         "admin@ai-compass.in with your order ID and we'll start the review or "
                         "refund you.",
                "reason": detail,
                "outcome": outcome,
            }), 503

        current_app.logger.warning(
            "review commission rejected: slug=%s order=%s reason=%s", tool_slug, order_id, detail,
        )
        return jsonify({
            "error": "PayPal could not confirm that payment. Nothing has been commissioned and you "
                     "have not been charged by us — email admin@ai-compass.in with your order ID if "
                     "you believe this is wrong.",
            "reason": detail,
            "outcome": outcome,
        }), 402

    review, err = editorial.create_order(
        tool_slug=tool_slug,
        contact_email=contact_email,
        brief=brief,
        amount_paid=editorial.REVIEW_PRICE,
        payment_ref=order_id,
    )
    if err or not review:
        current_app.logger.error("review paid but order write failed: %s", err)
        return jsonify({
            "error": "Your payment went through but we couldn't queue the review automatically. "
                     "Email admin@ai-compass.in with your order ID — we'll start it by hand or "
                     "refund you.",
            "reason": err,
        }), 500

    return jsonify({
        "success": True,
        "review": {
            "tool_slug": review.tool_slug,
            "status": review.status,
            "turnaround_days": editorial.TURNAROUND_DAYS,
            "due_at": editorial.admin_payload(review).get("due_at"),
        },
    }), 201


# --- admin ----------------------------------------------------------------

@editorial_bp.get("/admin/queue")
@login_required
def admin_queue():
    """Every commission, newest first — what is owed, to whom, by when."""
    denied = _require_admin()
    if denied:
        return denied
    rows = EditorialReview.query.order_by(EditorialReview.created_at.desc()).limit(200).all()
    return jsonify({
        "reviews": [editorial.admin_payload(r) for r in rows],
        "availability": editorial.availability(),
    })


@editorial_bp.post("/admin/orders")
@csrf.exempt
@login_required
def admin_create_order():
    """A commission that never went through PayPal — an invoiced deal, a comp
    review, or one we decided to write ourselves."""
    denied = _require_admin()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    review, err = editorial.create_order(
        tool_slug=payload.get("tool_slug"),
        contact_email=payload.get("contact_email"),
        brief=payload.get("brief"),
        amount_paid=payload.get("amount_paid") or 0.0,
    )
    if err or not review:
        return jsonify({"error": err or "Could not create commission"}), 400
    return jsonify({"success": True, "review": editorial.admin_payload(review)}), 201


@editorial_bp.patch("/admin/orders/<int:review_id>")
@csrf.exempt
@login_required
def admin_update_order(review_id):
    """Write, edit, publish or unpublish a review."""
    denied = _require_admin()
    if denied:
        return denied

    review = EditorialReview.query.get(review_id)
    if review is None:
        return jsonify({"error": "Not found"}), 404

    err = editorial.update_review(review, request.get_json(silent=True) or {})
    if err:
        # These are the publish guards (an empty body, a missing verdict) as
        # much as they are validation — the message has to say which.
        status = 500 if err == "review_write_failed" else 400
        return jsonify({"error": err}), status

    # A newly published review changes what /tools/<slug> serves, so drop the
    # cached tool-detail response rather than waiting out its TTL.
    try:
        from app import cache

        cache.clear()
    except Exception:
        current_app.logger.warning("review published but cache clear failed", exc_info=True)

    return jsonify({"success": True, "review": editorial.admin_payload(review)})
