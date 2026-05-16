"""New-tools email digest.

Flow:
  1. Diff current catalog slugs against the slugs we've already announced
     (DigestState.known_slugs in the DB).
  2. First ever run seeds the snapshot silently — we never blast the whole
     399-tool catalog as "new".
  3. Otherwise email every opted-in user (User.notifications_enabled) the
     genuinely new tools, each with a one-click unsubscribe link.
  4. Persist the new snapshot so the next run only sees what's added next.

Triggering is manual/scheduled (Render free has no built-in cron):
  POST /api/v1/admin/send-digest  with header  X-Digest-Secret: <DIGEST_SECRET>
  add ?dry_run=1 to preview counts without sending.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

from app import db
from app.email_utils import email_enabled, make_unsubscribe_token, send_email
from app.models import DigestState, User
from app.tool_cache import get_cached_tools

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
    snapshot was empty/uninitialised — caller should seed, not email."""
    tools = get_cached_tools() or []
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
    return [by_slug[s] for s in new_slugs], False


def _seed_snapshot() -> int:
    tools = get_cached_tools() or []
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
    rows, text_rows = [], []
    for t in tools[:25]:
        name = t.get("name", "")
        slug = str(t.get("slug", "")).strip().lower()
        tagline = t.get("tagline") or t.get("shortDescription") or t.get("description") or ""
        url = f"{BASE}/tools/{slug}"
        rows.append(
            f'<tr><td style="padding:10px 0;border-bottom:1px solid #e7e7e3">'
            f'<a href="{url}" style="color:#0f5f47;font-weight:600;'
            f'text-decoration:none;font-size:15px">{name}</a>'
            f'<div style="color:#5b6b64;font-size:13px;margin-top:2px">{tagline}</div>'
            f"</td></tr>"
        )
        text_rows.append(f"- {name}: {tagline} ({url})")

    count = len(tools)
    html = f"""<!doctype html><html><body style="margin:0;background:#fafaf9;
      font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:560px;margin:0 auto;padding:28px 22px">
        <div style="font-size:18px;font-weight:700;color:#0e1311">AI Compass</div>
        <h1 style="font-size:20px;color:#0e1311;margin:22px 0 6px">
          {count} new AI tool{'s' if count != 1 else ''} just added</h1>
        <p style="color:#5b6b64;font-size:14px;margin:0 0 16px">
          Hand-tested and added to the catalog. Free to browse, no login.</p>
        <table style="width:100%;border-collapse:collapse">{''.join(rows)}</table>
        <div style="margin:26px 0">
          <a href="{BASE}/tools" style="background:#2fb389;color:#fff;
            text-decoration:none;padding:11px 20px;border-radius:9px;
            font-weight:600;font-size:14px">Browse all tools →</a>
        </div>
        <p style="color:#9aa39e;font-size:12px;margin-top:30px;
          border-top:1px solid #e7e7e3;padding-top:14px">
          You get this because you have an AI Compass account.
          <a href="{unsubscribe_url}" style="color:#9aa39e">Unsubscribe</a>.
        </p>
      </div></body></html>"""
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
            "seeded": seeded if not dry_run else len(get_cached_tools() or []),
        }

    if not new_tools and not force:
        return {"status": "noop", "new_tools": 0, "message": "No new tools since last digest."}

    recipients = (
        User.query.filter(
            User.notifications_enabled.is_(True),
            User.email.isnot(None),
        ).all()
    )

    if dry_run:
        return {
            "status": "dry_run",
            "new_tools": len(new_tools),
            "recipients": len(recipients),
            "sample": [t.get("name") for t in new_tools[:10]],
        }

    sent = 0
    for u in recipients:
        unsub = f"{BASE}/unsubscribe?token={make_unsubscribe_token(u.email)}"
        html, text = _email_html(new_tools, unsub)
        if send_email(
            u.email,
            f"{len(new_tools)} new AI tool{'s' if len(new_tools) != 1 else ''} on AI Compass",
            html,
            text,
        ):
            sent += 1

    # Advance the snapshot regardless of per-recipient delivery so we don't
    # re-announce the same tools next run.
    seeded = _seed_snapshot()
    st = _state()
    st.last_sent_at = datetime.now(timezone.utc)
    db.session.commit()

    log.info("Digest sent: %s new tools to %s/%s users", len(new_tools), sent, len(recipients))
    return {
        "status": "sent",
        "new_tools": len(new_tools),
        "recipients": len(recipients),
        "delivered": sent,
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
