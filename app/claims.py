"""Claimed listings: a maker owning their own page.

The product this makes possible is a relationship rather than a
transaction. A directory listing someone bought once is a receipt; a
listing they can log back into, correct, and keep current is an account.
That is the whole reason this exists — see ToolClaim in app/models.py.

Two decisions worth stating, because both could reasonably have gone the
other way:

  1. A domain match auto-approves. If someone claiming cursor.com writes
     from @cursor.com, we have checked a fact rather than trusted an
     assertion, and making them wait on a human adds delay without adding
     certainty. Everything else queues for review, because the cost of a
     wrong approval is edit rights over someone else's listing.

  2. Approved edits apply immediately, and are logged. A maker fixing their
     own pricing should not sit in a queue, and a listing that is wrong for
     three days serves the reader worse than one edited without review. The
     audit trail (ToolEdit) is what makes that reversible rather than merely
     fast — and the editable field list below is what keeps an edit from
     touching anything that was sold, scored, or curated.
"""

from datetime import datetime, timezone
from urllib.parse import urlparse

from app import db
from app.models import CatalogTool, Submission, ToolClaim, ToolEdit

# Fields a verified maker may change on their own listing.
#
# The exclusions are the point. `sponsored`, `featured` and `hidden` are
# things we sell or curate; `editorial_blurb` and any review are ours;
# `rating` and `last_verified_at` are earned or measured. A founder editing
# their own copy must not be able to reach any of them, or "claim your
# listing" quietly becomes "grant yourself placement".
FOUNDER_EDITABLE_TEXT = ("description", "tagline", "shortDescription", "pricingDetail")
FOUNDER_EDITABLE_LISTS = ("features", "use_cases", "tags")

# Changing where the listing points is not a copy edit — it can redirect
# every reader and every tracked click somewhere else — so it goes to a
# human even for a verified maker.
ADMIN_ONLY_FIELDS = ("link", "url", "website", "category", "pricing", "name")

MAX_TEXT_LEN = 2000
MAX_LIST_ITEMS = 12
MAX_LIST_ITEM_LEN = 160
# The audit trail stores enough to see what happened and undo it by hand,
# not a full copy of every revision.
MAX_AUDIT_VALUE_LEN = 1000


def _domain(value):
    """Registrable-ish domain from a URL or an email, lowercased.

    Deliberately crude: strips one leading "www." and nothing else. A
    stricter public-suffix parse would be more correct and would also start
    silently accepting claims across subdomains, which is the direction this
    check must not fail in.
    """
    raw = str(value or "").strip().lower()
    if not raw:
        return ""
    if "@" in raw:
        return raw.rsplit("@", 1)[1].strip()
    if "//" not in raw:
        raw = f"https://{raw}"
    host = (urlparse(raw).hostname or "").strip()
    return host[4:] if host.startswith("www.") else host


def domain_matches(email, tool_url):
    """Does this claimant's email domain match the tool's own site?"""
    email_domain = _domain(email)
    site_domain = _domain(tool_url)
    if not email_domain or not site_domain:
        return False
    return email_domain == site_domain


def _tool_record(slug):
    import json

    row = CatalogTool.query.filter_by(slug=str(slug or "").strip().lower()).first()
    if row is None:
        return None, None
    try:
        return row, json.loads(row.data or "{}")
    except (TypeError, ValueError):
        return row, {}


def approved_claim_for_slug(slug):
    slug = str(slug or "").strip().lower()
    if not slug:
        return None
    return ToolClaim.query.filter_by(tool_slug=slug, status="approved").first()


def is_claimed(slug):
    return approved_claim_for_slug(slug) is not None


def user_can_edit(user, slug):
    """A user may edit a listing they hold an approved claim on.

    Admins are deliberately NOT included: they have the /admin editor, which
    logs differently and can reach every field. Two ways into the same write
    path is how an audit trail stops being trustworthy.
    """
    if not user or not getattr(user, "is_authenticated", False):
        return False
    claim = approved_claim_for_slug(slug)
    return bool(claim and claim.user_id == user.id)


def create_claim(user, slug, evidence=None):
    """Files a claim. Returns (claim, error_code).

    Auto-approves on a domain match; otherwise leaves it pending for a human.
    """
    slug = str(slug or "").strip().lower()
    if not slug:
        return None, "missing_tool_slug"
    if not user or not getattr(user, "id", None):
        return None, "not_logged_in"

    row, record = _tool_record(slug)
    if row is None:
        return None, "tool_not_found"

    existing_approved = approved_claim_for_slug(slug)
    if existing_approved is not None:
        # Already claimed. Returning the claim rather than an error lets the
        # caller say "you already own this" vs "someone else does" without a
        # second query.
        return existing_approved, (
            None if existing_approved.user_id == user.id else "already_claimed"
        )

    mine_pending = ToolClaim.query.filter_by(
        tool_slug=slug, user_id=user.id, status="pending"
    ).first()
    if mine_pending is not None:
        return mine_pending, None

    tool_url = record.get("link") or record.get("url") or record.get("website")
    matched = domain_matches(getattr(user, "email", ""), tool_url)

    claim = ToolClaim(
        tool_slug=slug,
        user_id=user.id,
        status="approved" if matched else "pending",
        verified_domain_match=matched,
        evidence=str(evidence or "").strip()[:MAX_TEXT_LEN] or None,
        decided_at=datetime.now(timezone.utc) if matched else None,
    )
    try:
        db.session.add(claim)
        db.session.commit()
        return claim, None
    except Exception:
        db.session.rollback()
        return None, "claim_write_failed"


def decide_claim(claim, status, admin_note=None):
    """Admin approval/rejection. Returns an error code, or None."""
    if claim is None:
        return "not_found"
    status = str(status or "").strip().lower()
    if status not in ToolClaim.STATUSES:
        return "invalid_status"

    if status == "approved":
        other = approved_claim_for_slug(claim.tool_slug)
        if other is not None and other.id != claim.id:
            # One listing, one owner. Silently allowing a second would give
            # two strangers edit rights over the same page.
            return "already_claimed_by_another_user"

    claim.status = status
    claim.decided_at = datetime.now(timezone.utc)
    if admin_note is not None:
        claim.admin_note = str(admin_note).strip()[:500] or None
    try:
        db.session.commit()
        return None
    except Exception:
        db.session.rollback()
        return "claim_write_failed"


def _clean_list(value):
    if isinstance(value, str):
        value = [part.strip() for part in value.split(",")]
    if not isinstance(value, list):
        return None
    out = []
    for item in value[:MAX_LIST_ITEMS]:
        text = str(item or "").strip()[:MAX_LIST_ITEM_LEN]
        if text:
            out.append(text)
    return out


def apply_founder_edit(user, slug, payload):
    """Applies a maker's edit to their own listing. Returns (record, error).

    Writes through catalog_store.upsert_tool so the founder path and the
    admin path converge on one writer — a second way to write a catalog row
    is a second place for the cache refresh and the normalizer to be
    forgotten.
    """
    slug = str(slug or "").strip().lower()
    if not user_can_edit(user, slug):
        return None, "not_your_listing"

    row, record = _tool_record(slug)
    if row is None:
        return None, "tool_not_found"

    rejected = [f for f in ADMIN_ONLY_FIELDS if f in (payload or {})]
    if rejected:
        # Named explicitly rather than ignored: a form that silently drops
        # half a submission teaches people the product is broken.
        return None, f"admin_only_fields:{','.join(rejected)}"

    updated = dict(record)
    changes = []

    for field in FOUNDER_EDITABLE_TEXT:
        if field in (payload or {}):
            new = str(payload.get(field) or "").strip()[:MAX_TEXT_LEN]
            old = str(record.get(field) or "")
            if new != old:
                updated[field] = new
                changes.append((field, old, new))

    for field in FOUNDER_EDITABLE_LISTS:
        if field in (payload or {}):
            new_list = _clean_list(payload.get(field))
            if new_list is None:
                continue
            old_list = record.get(field) if isinstance(record.get(field), list) else []
            if new_list != old_list:
                updated[field] = new_list
                changes.append((field, ", ".join(map(str, old_list)), ", ".join(new_list)))

    if not changes:
        return record, None

    from app.catalog_store import upsert_tool

    if not upsert_tool(updated):
        return None, "catalog_write_failed"

    try:
        for field, old, new in changes:
            db.session.add(ToolEdit(
                tool_slug=slug,
                user_id=user.id,
                field=field,
                old_value=(old or "")[:MAX_AUDIT_VALUE_LEN] or None,
                new_value=(new or "")[:MAX_AUDIT_VALUE_LEN] or None,
            ))
        db.session.commit()
    except Exception:
        # The edit itself already landed; losing its audit row must not
        # unwind a correction the maker can see on their page.
        db.session.rollback()

    from app.tool_cache import refresh_tools_cache

    refresh_tools_cache()
    return updated, None


def claim_payload(claim, include_admin=False):
    if claim is None:
        return None
    out = {
        "id": claim.id,
        "tool_slug": claim.tool_slug,
        "status": claim.status,
        "verified_domain_match": bool(claim.verified_domain_match),
        "created_at": claim.created_at.isoformat() if claim.created_at else None,
        "decided_at": claim.decided_at.isoformat() if claim.decided_at else None,
    }
    if include_admin:
        out.update({
            "user_id": claim.user_id,
            "user_email": getattr(claim.user, "email", None),
            "evidence": claim.evidence,
            "admin_note": claim.admin_note,
        })
    return out


def public_claim_badge(slug):
    """What a reader sees: claimed or not, and nothing about who.

    The badge says the maker is present and answerable for the copy. It is
    NOT an endorsement and must never read like one — a claimed listing is
    not a better tool, it is a listing with an owner.
    """
    claim = approved_claim_for_slug(slug)
    if claim is None:
        return None
    return {
        "claimed": True,
        "label": "Claimed by the maker",
        "verified_domain_match": bool(claim.verified_domain_match),
        "since": claim.decided_at.isoformat() if claim.decided_at else None,
    }


def submissions_for_user(user_id):
    """The listings a founder already owns through the paid ladder.

    Used to offer a one-click claim rather than making someone who has
    already paid us prove who they are a second time.
    """
    rows = (
        db.session.query(Submission.id, CatalogTool.slug)
        .join(CatalogTool, CatalogTool.submission_id == Submission.id)
        .filter(Submission.founder_user_id == user_id)
        .all()
    )
    return [slug for _sub_id, slug in rows if slug]
