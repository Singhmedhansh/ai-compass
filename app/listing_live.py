"""The "your listing is live" email, and the sweeper that sends it.

Why this module exists
----------------------
A free submitter used to hear from AI Compass exactly once, on the day they
submitted. Seven days later their listing quietly appeared and nobody told
them. The entire relationship ended at the confirmation email — which means
the cheapest audience the site has (people who already asked to be on it) was
being spent for nothing, and the paid upgrade was being pitched to strangers
instead of to founders who had already seen us deliver.

So every approved listing, free or paid, gets one message on the day it
actually becomes visible, containing the thing the founder wants: the live
URL of their own page.

Why a sweeper rather than a send at approval
--------------------------------------------
Approval and going live are usually the same day now — every tier's
visibility_delay_days is 0 (see pricing_tiers.TIERS) — but they are still not
the same EVENT, and two things keep them apart: rows approved under the older
7-day policy still carry a future `visible_at`, and Launch Day sets one
deliberately so a founder can pick the date. CatalogTool has no cron behind
it; get_visible_tools() simply re-evaluates the timestamp on every read, so
nothing was watching for the moment a row crossed that line. This is what
watches.

The stamp, not a computed window
--------------------------------
`Submission.live_email_sent_at` is written the moment a send succeeds. The
alternative — "mail everything that went live since the last run" — needs the
run to have happened, exactly once, on time. Ours runs from GitHub Actions
against a free Render instance that sleeps; a missed run followed by a double
run is the normal case, not the exotic one, and a founder mailed twice about
one listing is worse than one mailed a day late.

The send budget
---------------
Resend's free tier is 100 messages a day and outreach and the digest already
share that cap (app/send_budget.py). These sends reserve from the same pool.
An unsent listing keeps its NULL stamp and is picked up on the next run, so a
budget-starved day defers rather than drops.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from flask import render_template

from app import db

log = logging.getLogger(__name__)

# One run should never be able to eat the whole daily budget — outreach is the
# thing that actually finds new buyers, and it runs later in the day. A
# backlog drains over a few days instead, which is fine: these are minutes-old
# facts, not hours-old ones.
MAX_PER_RUN = 25


def _aware(value):
    """Postgres hands back naive datetimes for TIMESTAMP columns. Comparing
    one of those to an aware now() raises TypeError, which inside a sweeper
    means the whole batch dies on the first row."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def find_newly_live(limit=MAX_PER_RUN):
    """Approved submissions whose catalog row is visible now and that have
    never been told. Returns a list of (Submission, CatalogTool) pairs."""
    from app.models import CatalogTool, Submission

    now = datetime.now(timezone.utc)

    rows = (
        db.session.query(Submission, CatalogTool)
        .join(CatalogTool, CatalogTool.submission_id == Submission.id)
        .filter(Submission.status == "approved")
        .filter(Submission.live_email_sent_at.is_(None))
        .filter(Submission.submitter_email.isnot(None))
        .filter(Submission.submitter_email != "")
        # is_test rows are the owner's own QA submissions. They are real
        # catalog listings, so they must not be deleted — but mailing
        # ourselves "your tool is live" burns a send slot for nothing.
        .filter(Submission.is_test.is_(False))
        .filter(CatalogTool.hidden.is_(False))
        .order_by(Submission.approved_at.asc().nullslast(), Submission.id.asc())
        .limit(limit * 3)
        .all()
    )

    # visible_at is filtered in Python rather than SQL because "NULL means no
    # delay, so it is visible" does not survive a naive `visible_at <= now`
    # comparison — NULL fails every comparison, and those rows are precisely
    # the ones that went live immediately.
    ready = []
    for sub, tool in rows:
        visible_at = _aware(tool.visible_at)
        if visible_at is None or visible_at <= now:
            ready.append((sub, tool))
        if len(ready) >= limit:
            break
    return ready


def _tool_url(slug):
    from app.oauth import _frontend_base_url

    return f"{_frontend_base_url()}/tools/{slug}"


def send_live_notifications(dry_run=False, limit=MAX_PER_RUN):
    """Mail every founder whose listing has just gone live.

    Returns a dict the admin UI and the cron workflow both render:
    ``{"candidates", "sent", "failed", "deferred", "dry_run", "listings"}``.
    Never raises for a single bad row — one founder's broken address must not
    stop the other twenty-four being told.
    """
    from app.email_utils import email_enabled, send_email
    from app.pricing_tiers import effective_tier
    from app.send_budget import release_send_slots, reserve_send_slots
    from app.submission_dashboard import dashboard_url

    pairs = find_newly_live(limit=limit)
    result = {
        "candidates": len(pairs),
        "sent": 0,
        "failed": 0,
        "deferred": 0,
        "dry_run": bool(dry_run),
        "listings": [f"{sub.name} -> {tool.slug}" for sub, tool in pairs],
    }

    if not pairs or dry_run:
        return result

    if not email_enabled():
        # No transport (or a suppressed environment). Deferring, rather than
        # stamping the rows, is what keeps this recoverable: the moment mail
        # is configured again the whole backlog goes out.
        result["deferred"] = len(pairs)
        log.info("listing-live: email transport unavailable, deferring %s notices", len(pairs))
        return result

    granted = reserve_send_slots(len(pairs), requester="listing_live").get("granted", 0)
    if granted < len(pairs):
        result["deferred"] = len(pairs) - granted
    pairs = pairs[:granted]

    for sub, tool in pairs:
        try:
            url = _tool_url(tool.slug)
            try:
                dash = dashboard_url(sub.id, sub.submitter_email)
            except Exception:
                log.exception("listing-live: could not mint dashboard link for submission_id=%s", sub.id)
                dash = None

            # The $19 upgrade line is shown only to listings that do not
            # already have analytics. Pitching a paying customer the thing
            # they already bought is the fastest way to make a receipt look
            # automated.
            tier = effective_tier(sub.pricing_model, sub.payment_status)

            html = render_template(
                "emails/tool_live.html",
                tool_name=sub.name,
                tool_url=url,
                category=sub.category,
                dashboard_url=dash,
                founder_name=None,
                show_upgrade=(tier == "free"),
            )
            text = (
                f"{sub.name} is now live on AI Compass.\n\n"
                f"Your page: {url}\n"
                + (f"Your dashboard: {dash}\n" if dash else "")
                + "\nThe listing is permanent and never needs renewing. "
                "Claim it with an email on your own domain and you can edit it "
                "yourself, free.\n\n"
                "Something wrong on the page? Reply to this email and we will fix it."
            )

            ok = send_email(
                to=sub.submitter_email,
                subject=f"{sub.name} is now live on AI Compass",
                html=html,
                text=text,
            )
            if ok:
                # Stamped only on a confirmed send. A failure leaves the row
                # NULL so the next run retries it.
                sub.live_email_sent_at = datetime.now(timezone.utc)
                db.session.commit()
                result["sent"] += 1
            else:
                db.session.rollback()
                release_send_slots(1, requester="listing_live")
                result["failed"] += 1
        except Exception:
            db.session.rollback()
            release_send_slots(1, requester="listing_live")
            result["failed"] += 1
            log.exception("listing-live: failed to notify submission_id=%s", getattr(sub, "id", None))

    log.info(
        "listing-live run: candidates=%s sent=%s failed=%s deferred=%s",
        result["candidates"], result["sent"], result["failed"], result["deferred"],
    )
    return result
