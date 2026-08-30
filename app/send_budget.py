"""Shared daily email send-budget.

AI Compass sends through one Resend account (single API key + domain) from two
independent, unaware-of-each-other senders:

  * cold outreach  — app/outreach.py: run_automated_initial_sends /
    run_automated_followups
  * new-tools digest — app/digest.py: run_digest

Resend enforces 100 emails/day on the account. Before this module each sender
assumed its own private allowance, so on a day both ran near capacity they could
collectively blow past the real 100/day limit.

Every send path now calls reserve_send_slots() first and only sends the number
it was actually granted, deferring the rest. The counter lives in the
SendBudget table (one row per UTC day). The reservation is race-safe against
outreach and digest running concurrently — it reuses the same guarded-UPDATE +
rowcount idiom app/digest.py:maybe_run_digest() already uses for its once-per-
interval claim (a compare-and-swap on the column being changed; the loser of a
race sees rowcount 0 and retries against fresh data).

Priority: whichever sender runs first in the day claims first. Outreach is
meant to win (revenue-generating, time-sensitive); digest takes the remainder
and rolls deferred recipients to the next run. That ordering is NOT enforced
here — it depends on the cron schedule. See the module docstring note in
app/digest.py and the task write-up for the scheduling caveat.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app import db
from app.models import SendBudget

log = logging.getLogger(__name__)

# Under Resend's real 100/day. The gap is deliberate headroom for manual/ad-hoc
# sends that never come through this module (support replies, verification
# emails, tests).
DEFAULT_DAILY_CAP = int(os.environ.get("SEND_BUDGET_DAILY_CAP", "90"))

# The new-tools digest's own daily ceiling, well under the shared cap, so a
# large announcement (currently ~197 recipients) can't drain the whole day's
# Resend allowance in one run and leave nothing for outreach. The overflow is
# deferred and drains ~this many per day on subsequent runs. Tracked per UTC
# day on SendBudget.digest_sent_count (survives DigestRecipientLog being
# cleared when a batch finalises, unlike the per-batch dedupe log).
DIGEST_DAILY_CAP = int(os.environ.get("DIGEST_DAILY_SEND_CAP", "50"))

# Compare-and-swap retries before giving up on a contended row. Contention here
# is just outreach vs digest (at most two writers), so this is generous.
_MAX_CAS_ATTEMPTS = 8


def _today() -> "datetime.date":
    return datetime.now(timezone.utc).date()


def get_or_create_today_budget(day=None) -> SendBudget:
    """Return today's SendBudget row, creating it (sent_count=0, cap=DEFAULT_
    DAILY_CAP) on first call of the day. Safe under a create/create race: the
    loser catches the IntegrityError and re-reads the winner's row."""
    day = day or _today()
    row = db.session.get(SendBudget, day)
    if row is not None:
        return row

    row = SendBudget(date=day, sent_count=0, cap=DEFAULT_DAILY_CAP)
    db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        row = db.session.get(SendBudget, day)
        if row is None:  # pragma: no cover - only if the row vanished mid-race
            raise
    return row


def reserve_send_slots(n: int, requester: str = "unknown", day=None) -> dict:
    """Atomically reserve up to ``n`` slots against today's shared send budget.

    Grants as many as are left (possibly fewer than ``n``, possibly 0) rather
    than failing outright, increments sent_count by exactly what it granted,
    and returns ``{"granted": <int>}``. The caller must send to no more than
    ``granted`` recipients and defer the rest.

    Race-safe: the UPDATE is guarded on the sent_count value it read, so only
    one concurrent caller can win a given increment; the other retries.
    """
    if n <= 0:
        return {"granted": 0}

    day = day or _today()
    granted = 0

    for _attempt in range(_MAX_CAS_ATTEMPTS):
        row = get_or_create_today_budget(day)
        # expire so a retry re-reads the committed value rather than the stale
        # identity-map copy.
        db.session.refresh(row)
        observed = row.sent_count or 0
        cap = row.cap or DEFAULT_DAILY_CAP

        want = min(n, max(0, cap - observed))
        if want <= 0:
            granted = 0
            break

        res = db.session.execute(
            update(SendBudget)
            .where(SendBudget.date == day)
            .where(SendBudget.sent_count == observed)
            .values(sent_count=observed + want, updated_at=datetime.now(timezone.utc))
        )
        db.session.commit()

        if res.rowcount == 1:
            granted = want
            break
        # Lost the CAS race — someone else moved sent_count. Retry with fresh data.
    else:
        log.warning(
            "send-budget reservation gave up after %s contended attempts",
            _MAX_CAS_ATTEMPTS,
            extra={"date": str(day), "requester": requester, "requested": n},
        )

    # Every reservation is logged (date, requester, requested, granted) so a
    # near-cap or collision day is debuggable after the fact from the JSON logs.
    _log_line = log.info if granted == n else log.warning
    _log_line(
        "send-budget reservation: requester=%s requested=%s granted=%s",
        requester,
        n,
        granted,
        extra={
            "event": "send_budget_reservation",
            "date": str(day),
            "requester": requester,
            "requested": n,
            "granted": granted,
        },
    )
    return {"granted": granted}


def release_send_slots(n: int, requester: str = "unknown", day=None) -> None:
    """Hand ``n`` slots back to today's budget — used when a send that a slot
    was reserved for then failed, so a bad key or a provider outage doesn't
    silently burn the day's headroom. Clamped at 0; race-safe via CAS."""
    if n <= 0:
        return

    day = day or _today()
    for _attempt in range(_MAX_CAS_ATTEMPTS):
        row = db.session.get(SendBudget, day)
        if row is None:
            return
        db.session.refresh(row)
        observed = row.sent_count or 0
        new_val = max(0, observed - n)
        res = db.session.execute(
            update(SendBudget)
            .where(SendBudget.date == day)
            .where(SendBudget.sent_count == observed)
            .values(sent_count=new_val, updated_at=datetime.now(timezone.utc))
        )
        db.session.commit()
        if res.rowcount == 1:
            log.info(
                "send-budget release: requester=%s released=%s sent_count=%s",
                requester,
                observed - new_val,
                new_val,
                extra={
                    "event": "send_budget_release",
                    "date": str(day),
                    "requester": requester,
                    "released": observed - new_val,
                },
            )
            return


def digest_slots_remaining_today(day=None) -> int:
    """How many more new-tools digest emails may go out today under the
    digest's own DIGEST_DAILY_CAP (separate from, and stricter than, the shared
    reserve_send_slots cap). The caller still has to reserve_send_slots() for
    each of these against the shared budget."""
    day = day or _today()
    row = db.session.get(SendBudget, day)
    used = ((row.digest_sent_count if row is not None else 0) or 0)
    return max(0, DIGEST_DAILY_CAP - used)


def record_digest_sends(n: int, day=None) -> None:
    """Count ``n`` digest emails that actually went out today against the
    digest's daily sub-cap. Race-safe via the same guarded CAS as the shared
    counter. Call with the number of *successful* sends after a digest run."""
    if n <= 0:
        return

    day = day or _today()
    for _attempt in range(_MAX_CAS_ATTEMPTS):
        row = get_or_create_today_budget(day)
        db.session.refresh(row)
        observed = row.digest_sent_count or 0
        res = db.session.execute(
            update(SendBudget)
            .where(SendBudget.date == day)
            .where(SendBudget.digest_sent_count == observed)
            .values(digest_sent_count=observed + n, updated_at=datetime.now(timezone.utc))
        )
        db.session.commit()
        if res.rowcount == 1:
            log.info(
                "send-budget digest sub-count: +%s (now %s / cap %s)",
                n, observed + n, DIGEST_DAILY_CAP,
                extra={
                    "event": "send_budget_digest_count",
                    "date": str(day),
                    "added": n,
                    "digest_sent_count": observed + n,
                },
            )
            return


def budget_status(day=None) -> dict:
    """Read-only snapshot for diagnostics / tests / an admin panel."""
    day = day or _today()
    row = db.session.get(SendBudget, day)
    if row is None:
        return {
            "date": str(day), "sent_count": 0, "cap": DEFAULT_DAILY_CAP,
            "remaining": DEFAULT_DAILY_CAP, "digest_sent_count": 0,
            "digest_cap": DIGEST_DAILY_CAP, "digest_remaining": DIGEST_DAILY_CAP,
            "exists": False,
        }
    return {
        "date": str(day),
        "sent_count": row.sent_count,
        "cap": row.cap,
        "remaining": max(0, row.cap - row.sent_count),
        "digest_sent_count": row.digest_sent_count or 0,
        "digest_cap": DIGEST_DAILY_CAP,
        "digest_remaining": max(0, DIGEST_DAILY_CAP - (row.digest_sent_count or 0)),
        "exists": True,
    }
