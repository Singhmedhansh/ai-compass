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


def sending_suppressed() -> tuple[bool, str]:
    """Should this process refuse to actually dispatch mail?

    Returns (suppressed, reason).

    This exists because the test suite was sending REAL email. app/__init__
    calls load_dotenv() at import time, so pytest inherits the live
    RESEND_API_KEY from .env, and send_email_with_details() gated only on
    that key being present — nothing consulted app.config["TESTING"], which
    conftest sets. Every run of the suite mailed the admin address a
    "[AI Compass] New tool submission: Test Widget AI" notice, which is
    indistinguishable at a glance from a genuine submission.

    Guarding here rather than by monkeypatching each test is deliberate: a
    per-test mock only protects the tests someone remembered to write it
    into, and the test that caused this had simply never needed one.

    EMAIL_SUPPRESS_SEND is the same switch for local development, which
    matters here because .env holds production credentials — running the app
    locally otherwise sends real mail from a dev machine.
    """
    if str(os.environ.get("EMAIL_SUPPRESS_SEND", "")).strip().lower() in ("1", "true", "yes", "on"):
        return True, "email_suppressed_by_env"
    try:
        # Outside an app context (scripts, workers) current_app raises —
        # that is not a test, so fall through to sending.
        if current_app.config.get("TESTING"):
            return True, "email_suppressed_in_testing"
    except Exception:
        pass
    return False, ""


def email_enabled() -> bool:
    if sending_suppressed()[0]:
        return False
    return bool(os.environ.get("RESEND_API_KEY") or os.environ.get("SMTP_HOST"))


def founder_welcome_email_live() -> bool:
    """Gate for actually dispatching the founder welcome/credentials email.

    Defaults OFF even when email transport (RESEND_API_KEY/SMTP_HOST) is
    otherwise configured — sending real temporary-password credentials to a
    founder before the first-login password-change UI (a later prompt) ships
    would strand them. Callers should build the full email regardless and
    fall back to a log-only dry run when this is False. Flip
    FOUNDER_WELCOME_EMAIL_LIVE=1 once that UI is confirmed ready.
    """
    return str(os.environ.get("FOUNDER_WELCOME_EMAIL_LIVE", "")).strip().lower() in ("1", "true", "yes")


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


def _send_via_resend(
    to: str, subject: str, html: str, text: str | None,
    reply_to: str | None, headers: dict[str, str] | None,
) -> tuple[bool, str | None]:
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

        payload = {
            "from": sender,
            "to": [to],
            "subject": subject,
            "html": html,
            "text": plain_text,
        }
        if reply_to:
            payload["reply_to"] = [reply_to]
        if headers:
            payload["headers"] = headers

        r = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
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


def send_email_with_details(
    to: str, subject: str, html: str, text: str | None = None,
    reply_to: str | None = None, headers: dict[str, str] | None = None,
) -> tuple[bool, str | None]:
    """Send one email and return (success: bool, error_message: str | None).

    `reply_to` matters most for outreach-style mail that's written as a 1:1
    note but sent through a `no-reply@` transport address by default — without
    it, a recipient hitting Reply sends into a mailbox nobody reads, which
    looks identical to "no one responded." `headers` carries things like
    List-Unsubscribe that aren't part of the message body.
    """
    # Checked before any transport, so neither Resend nor SMTP can fire.
    suppressed, reason = sending_suppressed()
    if suppressed:
        log.info("Email suppressed (%s) — would have sent to %s (%s)", reason, to, subject)
        return False, reason

    if os.environ.get("RESEND_API_KEY"):
        return _send_via_resend(to, subject, html, text, reply_to, headers)

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
    if reply_to:
        msg["Reply-To"] = reply_to
    for k, v in (headers or {}).items():
        msg[k] = v
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


def send_email(
    to: str, subject: str, html: str, text: str | None = None,
    reply_to: str | None = None, headers: dict[str, str] | None = None,
) -> bool:
    success, _ = send_email_with_details(to, subject, html, text, reply_to, headers)
    return success
