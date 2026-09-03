"""What we owe a founder after they pay, and whether it has been delivered.

The campaign sells specific things. $49 buys a Sponsored badge, a 30-day
featured card and "impressions and clicks reported back"; $79 adds a written
hands-on review on its own indexed page. Those promises are made in the
outreach email (see _campaign_copy in app/outreach.py) and on the pricing
page, and until now nothing in the system knew they had been made. Every piece
of the delivery existed - launch_day, editorial, sponsorship, founder_report -
but each ran on its own schedule with no shared answer to the only question
that matters after a sale: is this customer owed anything right now?

That gap is the expensive one. A directory with forty listings survives a late
review; a directory with four paying customers does not. The first sale has to
be delivered visibly enough that the founder renews and refers, which is the
entire argument for reaching out to established companies rather than day-0
launches.

So this module is a ledger, not a sender-of-things. It reads the delivery each
subsystem already records and reports what is outstanding:

    obligations(submission)  -> what this one customer is owed, and its state
    runbook()                -> the same across every paying customer
    send_confirmations()     -> the one thing nothing else did: say thank you,
                                within 24h, listing exactly what was bought
    send_day7_numbers()      -> first numbers back, a week in, rather than
                                waiting up to 30 days for the monthly report

Deliberately NOT a new source of truth for delivery. An obligation is marked
done by reading the thing that actually happened - a published review row, a
live catalog row, a complimentary window that is open - so the runbook cannot
drift from reality by being updated in the wrong order. The two exceptions are
the two emails this module sends itself, which carry send-once stamps for the
same reason listing_live does: these sweepers run on a schedule, and a doubled
run must not mail a paying customer twice.
"""
import logging
from datetime import datetime, timedelta, timezone

from app import db
from app.models import CatalogTool, Submission
from app.pricing_tiers import (
    effective_tier,
    includes_editorial_review,
    includes_sponsored_perks,
)

log = logging.getLogger(__name__)

# How long after the sale each promise comes due.
#
# These are the numbers the confirmation email quotes back to the founder, so
# they are commitments rather than internal targets: change one here and the
# email changes with it, which is the only way the two can be kept honest.
CONFIRM_WITHIN_HOURS = 24
REVIEW_WITHIN_DAYS = 7
NUMBERS_AFTER_DAYS = 7

MAX_PER_RUN = 25

# Obligation keys.
OB_CONFIRMATION = "confirmation"
OB_LISTING_LIVE = "listing_live"
OB_PLACEMENT = "placement"
OB_REVIEW = "editorial_review"
OB_NUMBERS = "numbers"

# States. "waiting" is distinct from "due" on purpose: a review cannot be late
# before the listing it reviews is live, and reporting it as overdue would
# send the operator chasing something that is not yet owed.
STATE_DONE = "done"
STATE_DUE = "due"
STATE_OVERDUE = "overdue"
STATE_WAITING = "waiting"


def _aware(value):
    """UTC-aware, whatever the database handed back.

    SQLite returns naive datetimes and Postgres returns aware ones, so any
    comparison written without this works in the tests and raises TypeError
    in production - and because these run in a loop, one raise silently drops
    every remaining row in the sweep.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _naive(value):
    """Back to naive UTC for writing to a DateTime column."""
    if value is None:
        return None
    return _aware(value).replace(tzinfo=None)


def _sale_at(submission):
    """When the customer paid. The clock for the confirmation."""
    return _aware(submission.submitted_at)


def _live_at(submission, tool, now):
    """When the listing actually became visible, or None if it has not yet.

    Approval is not the same as live: a row inside its release delay exists
    in the catalog and is not yet reachable, and the perks the founder bought
    have not started.

    `now` is required rather than optional. Without it a visible_at in the
    FUTURE returns a future timestamp, and every caller here treats a
    non-None value as "delivered" - so a listing scheduled to appear next
    week would be reported as already live, and the review and reporting
    clocks would start from a date that has not happened. The one thing this
    ledger must never do is report a promise as kept early.
    """
    if tool is None or getattr(tool, "hidden", False):
        return None
    if submission.status != "approved":
        return None
    visible_at = _aware(getattr(tool, "visible_at", None))
    approved_at = _aware(submission.approved_at) or _aware(submission.submitted_at)
    if visible_at is None:
        # No delay recorded: live at approval.
        went_live = approved_at
    elif approved_at is not None:
        went_live = max(visible_at, approved_at)
    else:
        went_live = visible_at
    if went_live is None or went_live > now:
        return None
    return went_live


def _state(done_at, due_at, now, started):
    if done_at is not None:
        return STATE_DONE
    if not started:
        return STATE_WAITING
    if due_at is not None and now > due_at:
        return STATE_OVERDUE
    return STATE_DUE


def _ob(key, label, promise, due_at, done_at, now, started=True, detail=None):
    return {
        "key": key,
        "label": label,
        # What the customer was actually told. Kept next to the state so the
        # admin view shows the promise and its status together - the operator
        # should never have to remember what a tier includes.
        "promise": promise,
        "due_at": due_at,
        "done_at": done_at,
        "state": _state(done_at, due_at, now, started),
        "detail": detail,
    }


def _published_review_at(slug):
    """published_at of a live editorial review for this slug, or None."""
    if not slug:
        return None
    try:
        from app.editorial import published_review_for_slug

        review = published_review_for_slug(slug)
    except Exception:
        log.exception("post_sale: editorial lookup failed for %s", slug)
        return None
    if review is None:
        return None
    return _aware(getattr(review, "published_at", None))


def _placement_open(submission):
    """(started_at, ends_at) of the paid placement window, or None."""
    try:
        from app.sponsorship import complimentary_window

        window = complimentary_window(submission)
    except Exception:
        log.exception("post_sale: placement window failed for %s", submission.id)
        return None
    if not window:
        return None
    starts, ends = window
    return _aware(starts), _aware(ends)


def obligations(submission, tool=None, now=None):
    """Everything this submission's tier promised, and where each stands.

    Free and unverified rows return an empty list rather than a list of
    not-applicable entries: nothing was sold, so nothing is owed, and an
    operator scanning the runbook should not have to read past them.
    """
    now = _aware(now) or datetime.now(timezone.utc)
    tier = effective_tier(submission.pricing_model, submission.payment_status)
    if tier == "free":
        return []

    sale_at = _sale_at(submission)
    live_at = _live_at(submission, tool, now)
    slug = getattr(tool, "slug", None)
    out = []

    # 1. Confirmation. The only obligation whose clock starts at payment
    #    rather than at approval - the founder has just been charged and is
    #    owed an acknowledgement regardless of where the review queue is.
    out.append(_ob(
        OB_CONFIRMATION,
        "Purchase confirmed",
        f"Acknowledged within {CONFIRM_WITHIN_HOURS}h, itemising what was bought",
        due_at=sale_at + timedelta(hours=CONFIRM_WITHIN_HOURS) if sale_at else None,
        done_at=_aware(submission.post_sale_confirmed_at),
        now=now,
        started=sale_at is not None,
    ))

    # 2. Listing live. Every paid tier publishes at approval.
    out.append(_ob(
        OB_LISTING_LIVE,
        "Listing live",
        "Published and indexable",
        due_at=(_aware(submission.approved_at) or sale_at),
        done_at=live_at,
        now=now,
        started=sale_at is not None,
        detail=f"/tools/{slug}" if slug else None,
    ))

    # 3. Placement, for the tiers that bought it. Satisfied by the window
    #    being open rather than by a flag we set: the bug this avoids is the
    #    one sponsorship.complimentary_window already documents, where the
    #    perk was delivered and reported as absent at the same time.
    if includes_sponsored_perks(tier):
        window = _placement_open(submission)
        starts = ends = None
        if window:
            starts, ends = window
        out.append(_ob(
            OB_PLACEMENT,
            "Sponsored placement running",
            "Sponsored badge, ranking above free listings, 30-day featured card",
            due_at=live_at,
            done_at=starts if (starts and starts <= now) else None,
            now=now,
            started=live_at is not None,
            detail=(f"until {ends.date().isoformat()}" if ends else None),
        ))

    # 4. Editorial review, for the tiers whose price includes one. The clock
    #    runs from live rather than from payment: the review is of the listing.
    if includes_editorial_review(tier):
        published_at = _published_review_at(slug)
        out.append(_ob(
            OB_REVIEW,
            "Hands-on review published",
            f"Written review on its own indexed page, within {REVIEW_WITHIN_DAYS} days",
            due_at=live_at + timedelta(days=REVIEW_WITHIN_DAYS) if live_at else None,
            done_at=published_at,
            now=now,
            started=live_at is not None,
            detail=f"/tools/{slug}#review" if slug else None,
        ))

    # 5. Numbers back. Promised explicitly to the $49 tier ("impressions and
    #    clicks reported back") and implicitly to $19, which is sold on the
    #    reporting and nothing else. The monthly report can be up to 30 days
    #    away, which is far too long to leave a first-time customer wondering
    #    whether they bought anything at all.
    out.append(_ob(
        OB_NUMBERS,
        "First numbers reported",
        f"Views and clicks sent back {NUMBERS_AFTER_DAYS} days after going live",
        due_at=live_at + timedelta(days=NUMBERS_AFTER_DAYS) if live_at else None,
        done_at=_aware(submission.numbers_sent_at),
        now=now,
        started=live_at is not None,
    ))

    return out


def _paying_rows(limit=None):
    """(submission, catalog_row_or_None) for every verified paid listing.

    Outer join, not inner: a paid submission with no catalog row yet is
    exactly the case the runbook exists to surface, and an inner join would
    hide it.
    """
    q = (
        db.session.query(Submission, CatalogTool)
        .outerjoin(CatalogTool, CatalogTool.submission_id == Submission.id)
        .filter(
            Submission.payment_status == "verified",
            Submission.is_test.is_(False),
        )
        .order_by(Submission.submitted_at.desc())
    )
    if limit:
        q = q.limit(limit)
    return q.all()


def runbook(limit=None, now=None):
    """Every paying customer and what is outstanding for each.

    Sorted worst-first: anything overdue, then anything due. An operator
    opening this a day before a deadline needs the list of things that are
    late, not a chronological ledger.
    """
    now = _aware(now) or datetime.now(timezone.utc)
    customers = []
    counts = {STATE_DONE: 0, STATE_DUE: 0, STATE_OVERDUE: 0, STATE_WAITING: 0}

    for submission, tool in _paying_rows(limit=limit):
        try:
            items = obligations(submission, tool, now=now)
        except Exception:
            log.exception("post_sale: obligations failed for submission %s", submission.id)
            continue
        if not items:
            continue
        for item in items:
            counts[item["state"]] = counts.get(item["state"], 0) + 1
        customers.append({
            "submission_id": submission.id,
            "name": submission.name,
            "email": submission.submitter_email,
            "tier": effective_tier(submission.pricing_model, submission.payment_status),
            "slug": getattr(tool, "slug", None),
            "obligations": items,
            "overdue": sum(1 for i in items if i["state"] == STATE_OVERDUE),
            "outstanding": sum(
                1 for i in items if i["state"] in (STATE_DUE, STATE_OVERDUE)
            ),
        })

    customers.sort(key=lambda c: (-c["overdue"], -c["outstanding"], c["submission_id"]))
    return {
        "customers": customers,
        "counts": counts,
        "paying_customers": len(customers),
        "overdue_customers": sum(1 for c in customers if c["overdue"]),
        "generated_at": now.isoformat(),
    }


# ─── The two things this module sends itself ─────────────────────────────────

def _due_for_confirmation(now, limit):
    out = []
    for submission, tool in _paying_rows():
        if submission.post_sale_confirmed_at is not None:
            continue
        if not submission.submitter_email:
            continue
        if effective_tier(submission.pricing_model, submission.payment_status) == "free":
            continue
        out.append((submission, tool))
        if len(out) >= limit:
            break
    return out


def _due_for_numbers(now, limit):
    out = []
    for submission, tool in _paying_rows():
        if submission.numbers_sent_at is not None:
            continue
        if not submission.submitter_email or tool is None:
            continue
        live_at = _live_at(submission, tool, now)
        if live_at is None or now < live_at + timedelta(days=NUMBERS_AFTER_DAYS):
            continue
        out.append((submission, tool))
        if len(out) >= limit:
            break
    return out


def _send_batch(pairs, requester, build, stamp_attr, dry_run):
    """Shared send loop: reserve budget, mail, stamp, never raise per row."""
    from app.email_utils import email_enabled, send_email
    from app.send_budget import reserve_send_slots

    result = {
        "candidates": len(pairs),
        "sent": 0,
        "failed": 0,
        "deferred": 0,
        "dry_run": bool(dry_run),
        "listings": [s.name for s, _ in pairs],
    }
    if not pairs or dry_run:
        return result

    if not email_enabled():
        # Defer rather than stamp: the moment a transport is configured the
        # whole backlog goes out. Stamping here would lose these permanently.
        result["deferred"] = len(pairs)
        log.info("%s: no email transport, deferring %s", requester, len(pairs))
        return result

    granted = reserve_send_slots(len(pairs), requester=requester).get("granted", 0)
    if granted < len(pairs):
        result["deferred"] = len(pairs) - granted
    pairs = pairs[:granted]

    for submission, tool in pairs:
        try:
            subject, html, text = build(submission, tool)
            ok = send_email(
                to=submission.submitter_email,
                subject=subject,
                html_body=html,
                text_body=text,
            )
            if not ok:
                result["failed"] += 1
                continue
            setattr(submission, stamp_attr, _naive(datetime.now(timezone.utc)))
            db.session.commit()
            result["sent"] += 1
        except Exception:
            db.session.rollback()
            result["failed"] += 1
            log.exception("%s: failed for submission %s", requester, submission.id)
    return result


def _confirmation_content(submission, tool):
    """Plain, itemised, and identical in structure for every tier.

    One shell with factual slots, the same rule the outreach templates follow:
    what varies between a $19 and a $79 customer is which lines are true, not
    the voice they are written in.
    """
    from flask import render_template

    from app.email_utils import html_to_plain_text

    now = datetime.now(timezone.utc)
    items = obligations(submission, tool, now=now)
    tier = effective_tier(submission.pricing_model, submission.payment_status)
    lines = [
        {"label": i["label"], "promise": i["promise"]}
        for i in items
        if i["key"] != OB_CONFIRMATION
    ]

    subject = f"Your {submission.name} listing on AI Compass"
    html = render_template(
        "emails/post_sale_confirmation.html",
        tool_name=submission.name,
        tier=tier,
        lines=lines,
        tool_url=(f"https://ai-compass.in/tools/{tool.slug}" if tool is not None else None),
    )
    return subject, html, html_to_plain_text(html)


def _numbers_content(submission, tool):
    from flask import render_template

    from app.email_utils import html_to_plain_text
    from app.founder_report import build_report

    report = build_report(submission, tool)
    subject = f"{submission.name}: your first week on AI Compass"
    html = render_template(
        "emails/post_sale_numbers.html",
        report=report,
        days=NUMBERS_AFTER_DAYS,
    )
    return subject, html, html_to_plain_text(html)


def send_confirmations(dry_run=False, limit=MAX_PER_RUN):
    """Acknowledge every paid listing that has not been acknowledged yet."""
    now = datetime.now(timezone.utc)
    pairs = _due_for_confirmation(now, limit)
    return _send_batch(
        pairs, "post_sale_confirmation", _confirmation_content,
        "post_sale_confirmed_at", dry_run,
    )


def send_day7_numbers(dry_run=False, limit=MAX_PER_RUN):
    """First numbers back, a week after the listing went live."""
    now = datetime.now(timezone.utc)
    pairs = _due_for_numbers(now, limit)
    return _send_batch(
        pairs, "post_sale_numbers", _numbers_content,
        "numbers_sent_at", dry_run,
    )
