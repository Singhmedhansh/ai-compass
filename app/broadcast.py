"""One-off announcement / re-engagement broadcast.

Distinct from digest.py (which only announces newly-added tools): this
sends an arbitrary admin-authored message to every opted-in user, each
with an unsubscribe link. Same safety rails as the digest — dry-run
(count only), a send-to-me test, then the real send. Never raises.
"""
from __future__ import annotations

import logging

from app.email_utils import email_enabled, make_unsubscribe_token, send_email
from app.models import User

log = logging.getLogger(__name__)

BASE = "https://ai-compass.in"


def _wrap(subject: str, body_html: str, unsubscribe_url: str) -> tuple[str, str]:
    """Wrap an admin-authored body in the AI Compass branded shell.
    body_html may contain simple HTML (<p>, <b>, <a>, <ul><li>, <br>)."""
    html = f"""<!doctype html><html><body style="margin:0;background:#fafaf9;
      font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
      <div style="max-width:560px;margin:0 auto;padding:28px 22px">
        <div style="font-size:18px;font-weight:700;color:#0e1311">AI Compass</div>
        <h1 style="font-size:20px;color:#0e1311;margin:22px 0 14px">{subject}</h1>
        <div style="color:#39433d;font-size:15px;line-height:1.6">{body_html}</div>
        <div style="margin:26px 0">
          <a href="{BASE}" style="background:#2fb389;color:#fff;
            text-decoration:none;padding:11px 20px;border-radius:9px;
            font-weight:600;font-size:14px">Open AI Compass →</a>
        </div>
        <p style="color:#9aa39e;font-size:12px;margin-top:30px;
          border-top:1px solid #e7e7e3;padding-top:14px">
          You get this because you have an AI Compass account.
          <a href="{unsubscribe_url}" style="color:#9aa39e">Unsubscribe</a>.
        </p>
      </div></body></html>"""
    # Crude HTML->text for the plaintext alternative.
    import re
    text = re.sub(r"<[^>]+>", "", body_html)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    text = f"{subject}\n\n{text}\n\nOpen AI Compass: {BASE}\nUnsubscribe: {unsubscribe_url}"
    return html, text


def run_broadcast(
    subject: str,
    body_html: str,
    *,
    dry_run: bool = False,
    test_to: str | None = None,
) -> dict:
    subject = (subject or "").strip()
    body_html = (body_html or "").strip()
    if not subject or not body_html:
        return {"status": "error", "message": "Subject and body are both required."}

    if not email_enabled():
        return {
            "status": "disabled",
            "message": "No email transport configured — set RESEND_API_KEY.",
        }

    # Test mode: send only to the given address (the admin themselves).
    if test_to:
        unsub = f"{BASE}/unsubscribe?token={make_unsubscribe_token(test_to)}"
        html, text = _wrap(subject, body_html, unsub)
        ok = send_email(test_to, subject, html, text)
        return {
            "status": "sent" if ok else "failed",
            "test": True,
            "to": test_to,
            "message": (
                f"Test sent to {test_to} — check inbox & spam."
                if ok else "Send failed — check RESEND_API_KEY / RESEND_FROM."
            ),
        }

    recipients = (
        User.query.filter(
            User.notifications_enabled.is_(True),
            User.email.isnot(None),
        ).all()
    )

    if dry_run:
        return {
            "status": "dry_run",
            "recipients": len(recipients),
            "sample": [u.email for u in recipients[:10]],
        }

    sent = 0
    for u in recipients:
        unsub = f"{BASE}/unsubscribe?token={make_unsubscribe_token(u.email)}"
        html, text = _wrap(subject, body_html, unsub)
        if send_email(u.email, subject, html, text):
            sent += 1

    log.info("Broadcast '%s' delivered to %s/%s users", subject, sent, len(recipients))
    return {
        "status": "sent",
        "recipients": len(recipients),
        "delivered": sent,
    }
