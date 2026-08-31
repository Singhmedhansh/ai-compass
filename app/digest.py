"""New-tools email digest.

Flow:
  1. Diff current catalog slugs against the slugs we've already announced
     (DigestState.known_slugs in the DB).
  2. First ever run seeds the snapshot silently — we never blast the whole
     catalog as "new".
  3. Otherwise email every opted-in user (User.notifications_enabled) the
     genuinely new tools, each with a one-click unsubscribe link.
  4. Persist the new snapshot so the next run only sees what's added next.

Triggering is manual/scheduled (Render free has no built-in cron):
  POST /api/v1/admin/send-digest  with header  X-Digest-Secret: <DIGEST_SECRET>
  add ?dry_run=1 to preview counts without sending.

Shared send budget: the digest and cold outreach both send through the one
Resend account (100/day). Every recipient here is first reserved through
app.send_budget.reserve_send_slots(); on a day the budget runs out mid-run the
un-served recipients are recorded (DigestRecipientLog) and picked up by the
next run (self-scheduled maybe_run_digest is daily). Outreach is meant to get
first claim on the shared budget — that depends purely on it running earlier in
the day than the digest. CAVEAT: outreach's cron is daily 09:00 UTC while this
digest is only weekly (Sun 14:00 UTC) AND self-schedules opportunistically from
request traffic at an unpredictable hour — so on some days the digest can
actually reserve first. See the task write-up.

On top of the shared budget the digest also has its OWN daily sub-cap
(DIGEST_DAILY_SEND_CAP, default 50) so one big new-tool announcement can't eat
the whole day's Resend allowance and starve outreach: a 197-recipient batch
goes out ~50/day over several days, the rest deferred each run.

Fast-Track (sponsored) listings are announced first within a batch and carry a
"Sponsored" badge in the email — the one thing the paid listing tiers buy
here.
Everything else is announced too, in the same email, regardless of tier: the
perk is position and a label, never inclusion.

"New tool" means LIVE, not merely approved: a free-tier submission is gated
behind a ~14-day visible_at delay, so this diffs against tool_cache.
get_visible_tools() (hidden + not-yet-released excluded). A tool that is still
inside its release delay is neither announced nor recorded as "known", so it is
announced on the run *after* it actually goes live.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from app import db
from flask import render_template
from app.email_utils import email_enabled, make_unsubscribe_token, send_email
from app.models import DigestState, NewsletterSubscriber, User
from app.tool_cache import _sponsored_active, get_visible_tools

log = logging.getLogger(__name__)

BASE = "https://ai-compass.in"


def _state() -> DigestState:
    st = db.session.get(DigestState, 1)
    if st is None:
        st = DigestState(id=1, known_slugs=json.dumps([]))
        db.session.add(st)
        db.session.commit()
    return st


def _known(st: DigestState) -> set[str]:
    try:
        return set(json.loads(st.known_slugs or "[]"))
    except (ValueError, TypeError):
        return set()


def compute_new_tools() -> tuple[list[dict], bool]:
    """Return (new_tools, is_first_seed). is_first_seed=True means the
    snapshot was empty/uninitialised — caller should seed, not email.

    Only LIVE tools count: get_visible_tools() drops admin-hidden tools and
    ones still inside their staggered-release (visible_at) delay, so a
    just-approved free-tier submission isn't announced until it actually goes
    live ~2 weeks later."""
    tools = get_visible_tools() or []
    by_slug = {
        str(t.get("slug", "")).strip().lower(): t
        for t in tools
        if t.get("slug") and t.get("name")
    }
    st = _state()
    known = _known(st)
    if not known:
        return [], True
    new_slugs = [s for s in by_slug if s not in known]
    new_tools = [by_slug[s] for s in new_slugs]
    # Fast-Track listings are announced first — this is the "digest spotlight"
    # the paid tiers are sold on (see frontend/src/config/pricingTiers.js), and
    # it was previously promised but never implemented, so every tool went out
    # in arbitrary dict order.
    #
    # Ordering is the whole perk: nothing here can add a tool that would not
    # have been announced anyway (free listings are announced too, and always
    # have been), and _email_html labels the sponsored ones "Sponsored" so the
    # position is disclosed rather than disguised. Same rule as every other
    # paid unit on the site.
    new_tools.sort(key=lambda t: 0 if _sponsored_active(t) else 1)
    return new_tools, False


def _seed_snapshot() -> int:
    # Must use the SAME visibility filter as compute_new_tools(): if a
    # not-yet-live tool were seeded here as "known", it would silently never be
    # announced once it goes live.
    tools = get_visible_tools() or []
    slugs = sorted({
        str(t.get("slug", "")).strip().lower()
        for t in tools
        if t.get("slug")
    })
    st = _state()
    st.known_slugs = json.dumps(slugs)
    st.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return len(slugs)


def _email_html(tools: list[dict], unsubscribe_url: str) -> tuple[str, str]:
    text_rows = []
    news_items = []
    
    for t in tools[:25]:
        name = t.get("name", "")
        slug = str(t.get("slug", "")).strip().lower()
        tagline = t.get("tagline") or t.get("shortDescription") or t.get("description") or ""
        url = f"{BASE}/tools/{slug}"
        
        badge = "New"
        if t.get("student_friendly") or t.get("student_discount"):
            badge = "Student Friendly"
        # Disclosure wins the single badge slot: a paid position that isn't
        # labelled is exactly what makes a directory's recommendations
        # worthless.
        if _sponsored_active(t):
            badge = "Sponsored"
            
        news_items.append({
            "title": name,
            "badge": badge,
            "description": tagline
        })
        text_rows.append(f"- {name}: {tagline} ({url})")

    count = len(tools)
    subject = f"{count} new AI tool{'s' if count != 1 else ''} on AI Compass"
    opening_text = f"We just hand-tested and added {count} new AI tool{'s' if count != 1 else ''} to the catalog. Free to browse, no login required."
    
    html = render_template(
        "emails/newsletter.html",
        subject=subject,
        user_name="Student",
        opening_text=opening_text,
        news_items=news_items,
        cta_text="Browse all tools",
        cta_link=f"{BASE}/tools",
        unsubscribe_url=unsubscribe_url
    )
    
    text = (
        f"{count} new AI tools added to AI Compass\n\n"
        + "\n".join(text_rows)
        + f"\n\nBrowse all: {BASE}/tools\nUnsubscribe: {unsubscribe_url}"
    )
    return html, text


def run_digest(dry_run: bool = False, force: bool = False) -> dict:
    new_tools, first_seed = compute_new_tools()

    if first_seed:
        seeded = 0 if dry_run else _seed_snapshot()
        return {
            "status": "seeded",
            "message": "First run — snapshot seeded, no email sent.",
            "seeded": seeded if not dry_run else len(get_visible_tools() or []),
        }

    from app.models import DigestRecipientLog

    # A non-empty DigestRecipientLog means a previous run couldn't email
    # everyone (shared send budget ran out) and left a batch mid-flight — that
    # has to be drained even on a tick with no genuinely-new tools.
    has_pending_batch = db.session.query(DigestRecipientLog.id).first() is not None

    if not new_tools and not force and not has_pending_batch:
        return {"status": "noop", "new_tools": 0, "message": "No new tools since last digest."}

    # Combined recipient list: registered users with notifications on
    # PLUS public newsletter subscribers. Deduped on email so an account
    # holder who also signed up via the homepage form gets one digest,
    # not two. The same unsubscribe token works for both because
    # /unsubscribe handles both tables in one pass.
    user_emails = [
        u.email for u in User.query.filter(
            User.notifications_enabled.is_(True),
            User.email.isnot(None),
        ).all()
        if u.email
    ]
    newsletter_emails = [
        s.email for s in NewsletterSubscriber.query.with_entities(NewsletterSubscriber.email).all()
        if s.email
    ]
    recipient_emails = sorted({e.strip().lower() for e in (user_emails + newsletter_emails) if e})

    if dry_run:
        return {
            "status": "dry_run",
            "new_tools": len(new_tools),
            "recipients": len(recipient_emails),
            "users": len(user_emails),
            "newsletter_only": len(set(newsletter_emails) - set(user_emails)),
            "sample": [t.get("name") for t in new_tools[:10]],
        }

    from app.send_budget import (
        digest_slots_remaining_today,
        record_digest_sends,
        release_send_slots,
        reserve_send_slots,
    )

    def _finalize_batch() -> int:
        """Advance the known-slugs snapshot and clear the per-recipient log —
        only safe once a run has reached every recipient."""
        size = _seed_snapshot()
        DigestRecipientLog.query.delete()
        st = _state()
        st.last_sent_at = datetime.now(timezone.utc)
        db.session.commit()
        return size

    subject = f"{len(new_tools)} new AI tool{'s' if len(new_tools) != 1 else ''} on AI Compass"

    # Skip recipients already served the current, not-yet-snapshotted batch on
    # a prior partial run. Keyed on row existence (not sent_on) because a
    # deferred batch can straddle a midnight-UTC date boundary.
    already_served = {
        r.email for r in DigestRecipientLog.query.with_entities(DigestRecipientLog.email).all()
    }
    pending = [e for e in recipient_emails if e not in already_served]

    if not pending or not new_tools:
        # Everyone already got the batch (or its tools vanished from the
        # catalog) — just close it out.
        seeded = _finalize_batch()
        return {
            "status": "sent",
            "new_tools": len(new_tools),
            "recipients": len(recipient_emails),
            "delivered": 0,
            "deferred": 0,
            "snapshot_size": seeded,
        }

    # Two ceilings apply, tightest wins:
    #   1. the digest's own DIGEST_DAILY_CAP (default 50/day) — so a big
    #      announcement drains over several days instead of all at once;
    #   2. reserve_send_slots(), the shared Resend budget outreach also draws on.
    # Anything past either ceiling is deferred to the next run.
    digest_room = digest_slots_remaining_today()
    want = min(len(pending), digest_room)
    granted = reserve_send_slots(want, requester="digest")["granted"] if want > 0 else 0
    to_send = pending[:granted]
    deferred = pending[granted:]

    if not to_send:
        db.session.commit()
        log.warning(
            "Digest fully deferred: %s new tools, %s recipient(s) waiting "
            "(digest_room=%s, budget granted=%s)",
            len(new_tools), len(pending), digest_room, granted,
        )
        return {
            "status": "partial",
            "new_tools": len(new_tools),
            "recipients": len(recipient_emails),
            "delivered": 0,
            "deferred": len(deferred),
            "snapshot_advanced": False,
        }

    sent = 0
    for email in to_send:
        unsub = f"{BASE}/unsubscribe?token={make_unsubscribe_token(email)}"
        html, text = _email_html(new_tools, unsub)
        if send_email(email, subject, html, text):
            sent += 1
            db.session.add(DigestRecipientLog(email=email))
        else:
            # The reserved slot wasn't actually spent — hand it back so a
            # provider hiccup doesn't quietly eat the day's headroom.
            release_send_slots(1, requester="digest")

    # Charge only real sends against the digest's daily sub-cap (failures were
    # already handed back to the shared budget above).
    record_digest_sends(sent)

    if deferred:
        # Deliberately do NOT advance the snapshot while recipients still owe
        # this batch — otherwise the slug diff stops flagging these tools as
        # new and the deferred recipients never hear about them.
        db.session.commit()
        log.warning(
            "Digest partial: %s new tools to %s/%s recipients; %s deferred to next run "
            "(shared send budget exhausted)",
            len(new_tools), sent, len(pending), len(deferred),
        )
        return {
            "status": "partial",
            "new_tools": len(new_tools),
            "recipients": len(recipient_emails),
            "delivered": sent,
            "deferred": len(deferred),
            "snapshot_advanced": False,
        }

    seeded = _finalize_batch()
    log.info("Digest sent: %s new tools to %s/%s recipients", len(new_tools), sent, len(recipient_emails))
    return {
        "status": "sent",
        "new_tools": len(new_tools),
        "recipients": len(recipient_emails),
        "delivered": sent,
        "deferred": 0,
        "snapshot_size": seeded,
    }


_DIGEST_CLAIM_KEY = "digest_last_run"
_EPOCH = "1970-01-01T00:00:00+00:00"


def maybe_run_digest(min_interval_hours: int = 24) -> None:
    """Self-scheduled digest. Render's free tier has no cron, so this is
    invoked opportunistically from request traffic (a cheap, throttled
    before_request hook — see app/__init__.py). Safe to call as often as
    you like:

      * Atomic single-statement claim on AppSetting[digest_last_run]
        (UPDATE ... WHERE value < threshold) means exactly ONE worker
        wins per interval — no double-send across Render's workers.
      * No-op unless email is actually configured.
      * Never raises — must not affect the triggering request.
    """
    try:
        if not email_enabled():
            return

        from sqlalchemy import update

        from app.models import AppSetting

        now = datetime.now(timezone.utc)
        threshold = (now - timedelta(hours=min_interval_hours)).isoformat()

        # Ensure the claim row exists (first run on a fresh DB).
        if db.session.query(AppSetting).filter_by(key=_DIGEST_CLAIM_KEY).one_or_none() is None:
            try:
                db.session.add(AppSetting(key=_DIGEST_CLAIM_KEY, value=_EPOCH))
                db.session.commit()
            except Exception:
                db.session.rollback()  # another worker inserted it concurrently

        # Atomic claim: ISO-8601 UTC strings sort lexicographically, so a
        # single conditional UPDATE both checks "is it due?" and claims
        # the slot. rowcount == 1 means this worker won.
        res = db.session.execute(
            update(AppSetting)
            .where(AppSetting.key == _DIGEST_CLAIM_KEY)
            .where(AppSetting.value < threshold)
            .values(value=now.isoformat())
        )
        db.session.commit()
        if res.rowcount != 1:
            return  # not due yet, or another worker already claimed it

        result = run_digest(dry_run=False, force=False)
        log.info("Auto-digest tick result: %s", result)
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass
        log.exception("maybe_run_digest failed (non-fatal)")
