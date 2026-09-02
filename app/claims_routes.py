"""HTTP surface for claimed listings (see app/claims.py).

Public: whether a listing is claimed (a badge, nothing about who).
Maker:  file a claim, see your claims, edit a listing you own.
Admin:  the pending queue, and approve/reject/revoke.
"""

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from app import claims, csrf
from app.models import ToolClaim
from app.rate_limit import is_rate_limited

claims_bp = Blueprint("claims", __name__)


def _require_admin():
    if not (current_user and current_user.is_authenticated and current_user.is_admin):
        return jsonify({"error": "Forbidden"}), 403
    return None


@claims_bp.get("/<slug>")
def claim_status(slug):
    """Public: is this listing claimed? Used for the badge on the tool page.

    Never names the claimant. Who owns a listing is between them and us; a
    reader only needs to know the copy has an owner answerable for it.
    """
    try:
        badge = claims.public_claim_badge(slug)
    except Exception:
        current_app.logger.exception("claim status failed for %s", slug)
        badge = None
    return jsonify({"claim": badge})


@claims_bp.post("/<slug>")
@csrf.exempt
@login_required
def file_claim(slug):
    """File a claim on a listing.

    Auto-approved when the claimant's email domain matches the tool's own
    site — a fact we can check. Everything else queues for a human, because
    a wrong approval hands a stranger edit rights over someone's listing.
    """
    ip = request.remote_addr or "unknown"
    if is_rate_limited(f"tool_claim:{ip}", limit=10, window_seconds=3600):
        return jsonify({"error": "Too many claim attempts. Please try again later."}), 429

    payload = request.get_json(silent=True) or {}
    claim, err = claims.create_claim(current_user, slug, evidence=payload.get("evidence"))

    if err == "already_claimed":
        return jsonify({
            "error": "That listing has already been claimed. If you believe it was claimed by "
                     "someone outside your team, email admin@ai-compass.in and we will check it.",
        }), 409
    if err or claim is None:
        status = 404 if err == "tool_not_found" else 400
        return jsonify({"error": err or "Could not file that claim"}), status

    approved = claim.status == "approved"
    if approved:
        # A domain match approves instantly, so this is the ONLY notice that
        # claimant ever gets. Sent here rather than inside create_claim so the
        # mail stays out of the model layer and off the test path that just
        # exercises the domain check.
        from app.claim_emails import send_claim_decision_email

        send_claim_decision_email(claim)

    return jsonify({
        "success": True,
        "claim": claims.claim_payload(claim),
        "message": (
            "Verified — your email domain matches the tool's website, so the listing is yours "
            "to edit now."
            if approved else
            "Filed. We check these by hand when the email domain doesn't match the tool's site; "
            "you'll hear back by email."
        ),
    }), 201


@claims_bp.get("/mine/list")
@login_required
def my_claims():
    """Every claim this account has filed, plus the listings it already owns
    through a paid submission — those can be claimed in one click rather than
    proving identity to us twice."""
    rows = (
        ToolClaim.query
        .filter_by(user_id=current_user.id)
        .order_by(ToolClaim.created_at.desc())
        .all()
    )
    claimed_slugs = {c.tool_slug for c in rows}
    try:
        owned = [s for s in claims.submissions_for_user(current_user.id) if s not in claimed_slugs]
    except Exception:
        current_app.logger.exception("owned-submission lookup failed")
        owned = []

    return jsonify({
        "claims": [claims.claim_payload(c) for c in rows],
        "claimable_from_submissions": owned,
        "editable_fields": {
            "text": list(claims.FOUNDER_EDITABLE_TEXT),
            "lists": list(claims.FOUNDER_EDITABLE_LISTS),
            "admin_only": list(claims.ADMIN_ONLY_FIELDS),
        },
    })


@claims_bp.patch("/<slug>/listing")
@csrf.exempt
@login_required
def edit_my_listing(slug):
    """Edit a listing you hold an approved claim on.

    Applies immediately and is logged (ToolEdit). Anything that was sold,
    scored or curated is unreachable from here — see claims.py for the field
    list and why it is drawn where it is.
    """
    record, err = claims.apply_founder_edit(current_user, slug, request.get_json(silent=True) or {})

    if err == "not_your_listing":
        return jsonify({
            "error": "You don't have an approved claim on that listing.",
        }), 403
    if err == "tool_not_found":
        return jsonify({"error": "Tool not found"}), 404
    if err and err.startswith("logo_rejected:"):
        # The decoder writes its own messages for the person who uploaded the
        # file ("Logo must be under 512KB", and so on), so show that rather
        # than a generic failure. SVG is refused on purpose — see
        # tool_logos.ALLOWED_LOGO_MIMES.
        return jsonify({"error": err.split(":", 1)[1].strip()}), 400
    if err:
        return jsonify({"error": err}), 500

    # Anything the maker asked for that only an admin can apply. The edit
    # itself has already gone live; this carries the rest to a human instead
    # of dropping it on the floor, which is what the old 400 did.
    requested = (record or {}).pop("_change_requests", None)
    if requested:
        from app.claim_emails import notify_admin_of_change_request

        notify_admin_of_change_request(
            record.get("slug") or "",
            requested,
            user_email=getattr(current_user, "email", None),
        )

    return jsonify({
        "success": True,
        "requested": requested or {},
        "tool": {
            "slug": record.get("slug"),
            "name": record.get("name"),
            "description": record.get("description"),
            "tagline": record.get("tagline"),
            "shortDescription": record.get("shortDescription"),
            "pricingDetail": record.get("pricingDetail"),
            "logo_url": record.get("logo_url"),
            "features": record.get("features") or [],
            "use_cases": record.get("use_cases") or [],
            "tags": record.get("tags") or [],
        },
    })


@claims_bp.get("/<slug>/listing")
@login_required
def my_listing(slug):
    """The current copy of a listing you own, for the editor page.

    Served from the catalog record rather than the public tool payload so the
    editor shows exactly the fields it is about to write back — a form seeded
    from a differently-shaped read is how an editor silently blanks a field
    nobody meant to touch.
    """
    slug = str(slug or "").strip().lower()
    if not claims.user_can_edit(current_user, slug):
        return jsonify({"error": "You don't have an approved claim on that listing."}), 403

    _row, record = claims._tool_record(slug)
    if _row is None:
        return jsonify({"error": "Tool not found"}), 404

    return jsonify({
        "tool": {
            "slug": slug,
            "name": record.get("name") or _row.name,
            "tagline": record.get("tagline") or "",
            "shortDescription": record.get("shortDescription") or "",
            "description": record.get("description") or "",
            "pricingDetail": record.get("pricingDetail") or "",
            "features": record.get("features") or [],
            "use_cases": record.get("use_cases") or [],
            "tags": record.get("tags") or [],
            "logo_url": record.get("logo_url") or record.get("icon") or "",
            "link": record.get("link") or record.get("url") or record.get("website") or "",
            "category": record.get("category") or "",
            "pricing": record.get("pricing") or "",
        },
        "editable": {
            "text": list(claims.FOUNDER_EDITABLE_TEXT),
            "lists": list(claims.FOUNDER_EDITABLE_LISTS),
            "admin_only": list(claims.ADMIN_ONLY_FIELDS),
        },
    })


# --- admin ------------------------------------------------------------------

@claims_bp.get("/admin/queue")
@login_required
def admin_queue():
    denied = _require_admin()
    if denied:
        return denied
    status = (request.args.get("status") or "pending").strip().lower()
    query = ToolClaim.query
    if status != "all":
        query = query.filter(ToolClaim.status == status)
    rows = query.order_by(ToolClaim.created_at.desc()).limit(200).all()
    return jsonify({"claims": [claims.claim_payload(c, include_admin=True) for c in rows]})


@claims_bp.patch("/admin/<int:claim_id>")
@csrf.exempt
@login_required
def admin_decide(claim_id):
    denied = _require_admin()
    if denied:
        return denied
    claim = ToolClaim.query.get(claim_id)
    if claim is None:
        return jsonify({"error": "Not found"}), 404

    payload = request.get_json(silent=True) or {}
    err = claims.decide_claim(claim, payload.get("status"), payload.get("admin_note"))
    if err:
        status = 500 if err == "claim_write_failed" else 400
        return jsonify({"error": err}), status

    # The claimant is told. Approving used to change what someone was allowed
    # to do and tell them nothing — the form had already promised them an
    # email, so the only way to find out was to revisit the page and notice
    # the button had changed. Best-effort: a mail outage must not fail an
    # approval that has already committed.
    from app.claim_emails import send_claim_decision_email

    notified = send_claim_decision_email(claim)

    return jsonify({
        "success": True,
        "claim": claims.claim_payload(claim, include_admin=True),
        # Surfaced so the admin panel can say "approved, but we could not
        # reach them" instead of implying the founder has been told.
        "notified": notified,
    })


@claims_bp.get("/admin/<slug>/edits")
@login_required
def admin_edit_log(slug):
    """What the maker changed, and when. The record that makes an immediate
    edit reversible rather than merely fast."""
    denied = _require_admin()
    if denied:
        return denied
    from app.models import ToolEdit

    rows = (
        ToolEdit.query
        .filter_by(tool_slug=str(slug or "").strip().lower())
        .order_by(ToolEdit.created_at.desc())
        .limit(100)
        .all()
    )
    return jsonify({"edits": [
        {
            "id": e.id,
            "field": e.field,
            "old_value": e.old_value,
            "new_value": e.new_value,
            "user_id": e.user_id,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in rows
    ]})
