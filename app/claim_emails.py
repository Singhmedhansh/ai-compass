"""Telling a claimant what happened to their claim.

Why this module exists
----------------------
Filing a claim showed the founder "you'll hear back by email". Approving one
in the admin panel set a status, committed, and sent nothing — there was no
mail call anywhere in the claim path. So the product made a promise on the
way in and quietly broke it on the way out, and the only way to learn you had
been approved was to happen to reopen the tool's page and notice the button
had changed.

That is worse than it sounds, because approval is the moment the relationship
is supposed to start: it is the one point where someone who was a stranger
becomes an owner with a reason to come back and keep their page current.

Rejection is mailed too. A queue nobody hears back from is indistinguishable
from one that ignores them, and the appeal line is the whole reason to say
anything at all — most rejections are a maker writing from a personal address
who simply needs to tell us who they are.

Both sends are best-effort and never raise into the request that triggered
them: an admin's approve click must land even if the mail transport is down,
because the permission is the substantive act and the email is the courtesy.
"""

from __future__ import annotations

import logging

from flask import render_template

log = logging.getLogger(__name__)


def editor_url(slug):
    """Where a maker edits the listing they own."""
    from app.oauth import _frontend_base_url

    return f"{_frontend_base_url()}/dashboard/listing/{slug}"


def tool_url(slug):
    from app.oauth import _frontend_base_url

    return f"{_frontend_base_url()}/tools/{slug}"


def _tool_name(slug):
    from app.models import CatalogTool

    row = CatalogTool.query.filter_by(slug=slug).first()
    return (row.name if row else None) or slug


def send_claim_decision_email(claim):
    """Mail the claimant the outcome of their claim. Returns True if sent.

    Only 'approved' and 'rejected' produce mail. A revoked claim is a
    different conversation — it usually means a dispute between two people
    who both believe they own the tool — and an automated notice in the
    middle of that does more harm than a human reply.
    """
    if claim is None or claim.status not in ("approved", "rejected"):
        return False

    to = getattr(getattr(claim, "user", None), "email", None)
    if not to:
        log.warning("claim %s has no claimant email; skipping notice", getattr(claim, "id", None))
        return False

    try:
        from app.brand import BILLING_EMAIL, SUPPORT_EMAIL
        from app.email_utils import email_enabled, send_email
        from app.send_budget import release_send_slots, reserve_send_slots

        if not email_enabled():
            log.info("claim notice deferred: no mail transport (claim_id=%s)", claim.id)
            return False

        name = _tool_name(claim.tool_slug)

        # Reserve from the same 100/day pool as outreach and the digest. A
        # claim decision is a reply to something a person did minutes ago, so
        # it takes its slot ahead of anything speculative — but if the budget
        # is gone it must not silently overdraw the cap either.
        if reserve_send_slots(1, requester="claim_decision").get("granted", 0) < 1:
            log.info("claim notice deferred: send budget exhausted (claim_id=%s)", claim.id)
            return False

        if claim.status == "approved":
            subject = f"You now own the {name} listing on AI Compass"
            html = render_template(
                "emails/claim_approved.html",
                tool_name=name,
                tool_url=tool_url(claim.tool_slug),
                editor_url=editor_url(claim.tool_slug),
                verified_domain_match=bool(claim.verified_domain_match),
            )
            text = (
                f"Your claim on {name} has been approved.\n\n"
                f"Edit your listing: {editor_url(claim.tool_slug)}\n"
                f"Your page: {tool_url(claim.tool_slug)}\n\n"
                "You can change the logo, name, pitch, description, pricing detail, "
                "features, use cases and tags yourself, and they go live immediately. "
                "The URL, category and pricing label still need a human — ask in the "
                f"editor or email {BILLING_EMAIL}.\n"
            )
        else:
            subject = f"About your claim on {name}"
            note = (claim.admin_note or "").strip()
            paragraphs = [
                f"We could not approve your claim on the {name} listing.",
                note or (
                    "We could not confirm that the account belongs to the team behind "
                    "the tool. That is usually because the claim came from a personal "
                    "address rather than one on the tool's own domain."
                ),
                "If this is your tool, reply to this email and tell us who you are — a "
                "link to your team page, or a message from an address on the tool's own "
                "domain, is enough. We would rather have makers on their own listings.",
            ]
            html = render_template(
                "emails/simple_notice.html",
                subject_title=subject,
                heading="About your claim",
                paragraphs=paragraphs,
                cta_url=tool_url(claim.tool_slug),
                cta_label="View the listing",
                fine_print=f"Questions: {SUPPORT_EMAIL}",
            )
            text = "\n\n".join(paragraphs) + f"\n\nThe listing: {tool_url(claim.tool_slug)}\n"

        ok = send_email(to=to, subject=subject, html=html, text=text)
        if not ok:
            release_send_slots(1, requester="claim_decision")
            log.warning("claim notice failed to send (claim_id=%s)", claim.id)
        return bool(ok)
    except Exception:
        # Never propagate. The status change already committed, and an admin
        # whose approve button 500s because of a mail outage will just click
        # it again — which is how one founder gets told three times.
        log.exception("claim notice raised (claim_id=%s)", getattr(claim, "id", None))
        return False


def notify_admin_of_change_request(slug, requested, user_email=None):
    """Forward a maker's request for a gated field to an admin.

    The URL, category and pricing label are not founder-editable (see
    claims.ADMIN_ONLY_FIELDS). This is what stops that boundary from simply
    losing the request: the maker types what they want in the editor, the
    rest of their edit applies, and this carries the gated part to someone
    who can action it.
    """
    if not requested:
        return False
    try:
        from app.brand import BILLING_EMAIL
        from app.email_utils import email_enabled, send_email

        if not email_enabled():
            log.info("change request not mailed (no transport): %s %s", slug, requested)
            return False

        lines = [f"{field}: {value}" for field, value in requested.items()]
        body = (
            f"The maker of {slug} has asked for a change only an admin can make.\n\n"
            + "\n".join(lines)
            + f"\n\nRequested by: {user_email or 'unknown'}\n"
            f"Listing: {tool_url(slug)}\n"
        )
        return bool(send_email(
            to=BILLING_EMAIL,
            subject=f"Listing change request: {slug}",
            html=render_template(
                "emails/simple_notice.html",
                subject_title=f"Listing change request: {slug}",
                heading="A maker asked for a gated change",
                paragraphs=[
                    f"The maker of {slug} submitted an edit that touches a field only an "
                    "admin can change. The rest of their edit has already gone live.",
                    *lines,
                    f"Requested by {user_email or 'unknown'}.",
                ],
                cta_url=tool_url(slug),
                cta_label="View the listing",
            ),
            text=body,
        ))
    except Exception:
        log.exception("change-request notice raised for %s", slug)
        return False
