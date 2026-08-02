"""Email sending + signed-token helpers.

Two transports, tried in this order:

  1. Resend HTTPS API (RESEND_API_KEY) — REQUIRED on Render's free/hobby
     tier, which blocks outbound SMTP at the network level (port 587 etc.
     → "Network is unreachable"). This is the same channel the tool-
     submission notification already uses. Optional RESEND_FROM
     (default "AI Compass <onboarding@resend.dev>").
  2. SMTP (SMTP_HOST, SMTP_PORT=587, SMTP_USER, SMTP_PASS, SMTP_FROM) —
     for hosts that allow outbound SMTP.

If neither is configured, send_email() is a logged no-op and nothing
breaks. email_enabled() is true when either transport is configured.
"""

from __future__ import annotations

import logging
import os
import re
import smtplib
import ssl
from email.message import EmailMessage

from flask import current_app
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

log = logging.getLogger(__name__)

_UNSUB_SALT = "ai-compass-unsubscribe-v1"


def _serializer() -> URLSafeTimedSerializer:
    try:
        secret = current_app.config.get("SECRET_KEY")
    except Exception:
        secret = None
    if not secret:
        secret = os.environ.get("SECRET_KEY", "ai-compass-fixed-key-2024")
    return URLSafeTimedSerializer(secret, salt=_UNSUB_SALT)


def make_unsubscribe_token(email: str) -> str:
    return _serializer().dumps(email)


def read_unsubscribe_token(token: str, max_age_days: int = 365) -> str | None:
    try:
        return _serializer().loads(token, max_age=max_age_days * 86400)
    except (BadSignature, SignatureExpired):
        return None


def email_enabled() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") or os.environ.get("SMTP_HOST"))


def html_to_plain_text(html: str) -> str:
    """Converts HTML email body into clean, natural plain text to prevent Gmail Promotions tab classification."""
    if not html:
        return ""
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</li>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    lines = [line.strip() for line in text.splitlines()]
    return '\n'.join(line for line in lines if line)


def _send_via_resend(to: str, subject: str, html: str, text: str | None) -> tuple[bool, str | None]:
    """HTTPS send via Resend (port 443 — works where SMTP is blocked)."""
    try:
        import requests

        api_key = os.environ.get("RESEND_API_KEY", "").strip()
        if not api_key:
            err = "RESEND_API_KEY is empty/missing"
            log.warning(err)
            return False, err

        canonical = os.environ.get("CANONICAL_HOST", "ai-compass.in").strip().lower()
        if not canonical or canonical in {"localhost", "127.0.0.1"}:
            default_sender = "AI Compass <onboarding@resend.dev>"
        else:
            default_sender = f"AI Compass <no-reply@{canonical}>"

        sender = os.environ.get("RESEND_FROM", default_sender).strip()
        plain_text = text or html_to_plain_text(html)

        r = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": sender,
                "to": [to],
                "subject": subject,
                "html": html,
                "text": plain_text,
            },
            timeout=15,
        )
        if r.ok:
            return True, None
        err = f"Resend HTTP {r.status_code}: {r.text[:300]}"
        log.warning("Resend rejected email to %s: %s", to, err)
        return False, err
    except Exception as exc:  # noqa: BLE001 — email must never crash a request
        err = str(exc)
        log.warning("Resend send failed to %s: %s", to, err)
        return False, err


def send_email_with_details(to: str, subject: str, html: str, text: str | None = None) -> tuple[bool, str | None]:
    """Send one email and return (success: bool, error_message: str | None)."""
    if os.environ.get("RESEND_API_KEY"):
        return _send_via_resend(to, subject, html, text)

    host = os.environ.get("SMTP_HOST")
    if not host:
        err = "Email not configured (no RESEND_API_KEY / SMTP_HOST)"
        log.info("%s — skipping to %s (%s)", err, to, subject)
        return False, err

    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    sender = os.environ.get("SMTP_FROM") or user or "no-reply@ai-compass.in"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.set_content(text or html_to_plain_text(html))
    msg.add_alternative(html, subtype="html")

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.starttls(context=context)
            if user and password:
                server.login(user, password)
            server.send_message(msg)
        return True, None
    except Exception as exc:  # noqa: BLE001 — email must never crash a request
        err = str(exc)
        log.warning("SMTP send failed to %s: %s", to, err)
        return False, err


def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    success, _ = send_email_with_details(to, subject, html, text)
    return success
