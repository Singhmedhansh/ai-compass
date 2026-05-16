"""Email sending + signed-token helpers.

Uses the Python stdlib (smtplib) — no extra dependency. SMTP is configured
purely through environment variables so the app ships safely with email
disabled: if SMTP_HOST isn't set, send_email() is a logged no-op and nothing
breaks. To go live, set on Render:

    SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS,
    SMTP_FROM (e.g. "AI Compass <hello@ai-compass.in>")

Any provider with SMTP works (Brevo, SendGrid, Resend, Gmail app-password).
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage

from flask import current_app
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

log = logging.getLogger(__name__)

_UNSUB_SALT = "ai-compass-unsubscribe-v1"


def _serializer() -> URLSafeTimedSerializer:
    secret = current_app.config.get("SECRET_KEY") or os.environ.get("SECRET_KEY", "dev")
    return URLSafeTimedSerializer(secret, salt=_UNSUB_SALT)


def make_unsubscribe_token(email: str) -> str:
    return _serializer().dumps(email)


def read_unsubscribe_token(token: str, max_age_days: int = 365) -> str | None:
    try:
        return _serializer().loads(token, max_age=max_age_days * 86400)
    except (BadSignature, SignatureExpired):
        return None


def email_enabled() -> bool:
    return bool(os.environ.get("SMTP_HOST"))


def send_email(to: str, subject: str, html: str, text: str | None = None) -> bool:
    """Send one email. Returns True on success, False if disabled/failed.
    Never raises — callers can fire-and-forget safely."""
    host = os.environ.get("SMTP_HOST")
    if not host:
        log.info("SMTP not configured — skipping email to %s (%s)", to, subject)
        return False

    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    sender = os.environ.get("SMTP_FROM") or user or "no-reply@ai-compass.in"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.set_content(text or "Open in an HTML-capable email client.")
    msg.add_alternative(html, subtype="html")

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.starttls(context=context)
            if user and password:
                server.login(user, password)
            server.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001 — email must never crash a request
        log.warning("Email send failed to %s: %s", to, exc)
        return False
