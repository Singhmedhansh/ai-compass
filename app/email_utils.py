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
from html import unescape
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


_PREFILL_SALT = "ai-compass-outreach-prefill-v1"


def _prefill_serializer() -> URLSafeTimedSerializer:
    """Separate salt from the unsubscribe signer on purpose.

    Both tokens ride in outreach URLs, and both are handed to strangers. With
    a shared salt an unsubscribe token would also be a valid prefill token and
    vice versa — one leaked link would do double duty. The salt is what keeps
    a token only good for the one thing it was minted for.
    """
    try:
        secret = current_app.config.get("SECRET_KEY")
    except Exception:
        secret = None
    if not secret:
        secret = os.environ.get("SECRET_KEY", "ai-compass-fixed-key-2024")
    return URLSafeTimedSerializer(secret, salt=_PREFILL_SALT)


def make_prefill_token(candidate_id: int) -> str:
    """Signs an outreach candidate id into the /submit?c=... prefill link.

    Signed rather than raw so the id can't be incremented by hand to page
    through the candidate table — the prefill endpoint returns a product name,
    URL and the address we found for its founder, which is not something a
    stranger should be able to enumerate.
    """
    return _prefill_serializer().dumps(int(candidate_id))


def read_prefill_token(token: str, max_age_days: int = 120) -> int | None:
    """Returns the candidate id, or None if the token is forged or stale.

    120 days: long enough that a founder who sat on the email for a season
    still gets their form filled in, short enough that a link scraped out of a
    forwarded thread doesn't stay live indefinitely.
    """
    try:
        return int(_prefill_serializer().loads(token, max_age=max_age_days * 86400))
    except (BadSignature, SignatureExpired, TypeError, ValueError):
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
    """Converts an HTML email body into clean, natural plain text.

    The plain-text alternative is not a formality. Gmail and Outlook both read
    it, some clients show only it, and a message whose text half is a single
    unbroken wall while its HTML half is neatly spaced looks machine-generated
    — which is exactly the judgement we are trying to avoid.

    That is what the old version produced: it turned </p> into a blank line and
    then dropped every blank line while trimming, so all paragraph structure
    was discarded. Blank lines between paragraphs are now preserved (collapsed
    to at most one), and HTML entities are decoded so a signature written with
    &mdash; does not arrive reading "&mdash;".
    """
    if not html:
        return ""
    text = re.sub(r'<br\s*/?>', '\n', html, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n' * 2, text, flags=re.IGNORECASE)
    text = re.sub(r'</li>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', '', text)
    text = unescape(text)
    lines = [line.strip() for line in text.splitlines()]
    # Keep single blank lines as paragraph separators; collapse runs of them.
    out = []
    for line in lines:
        if line or (out and out[-1]):
            out.append(line)
    return '\n'.join(out).strip()


def _send_via_resend(
    to: str, subject: str, html: str, text: str | None,
    reply_to: str | None, headers: dict[str, str] | None,
    sender: str | None = None,
) -> tuple[bool, str | None]:
    """HTTPS send via Resend (port 443 — works where SMTP is blocked)."""
    try:
        import requests

        api_key = os.environ.get("RESEND_API_KEY", "").strip()
        if not api_key:
            err = "RESEND_API_KEY is empty/missing"
            log.warning(err)
            return False, err

        # A real, monitored mailbox — never no-reply@.
        #
        # Gmail files mail by the From line before a human reads a word of the
        # body, and no-reply@ is one of the clearest bulk-sender tells there
        # is. It was costing deliverability on exactly the mail that must
        # arrive: the invoice for a $49 charge, and the note telling a founder
        # their listing is live. It also meant a buyer who hit Reply on their
        # own receipt was writing into a mailbox nobody reads, which from
        # their side is identical to being ignored.
        #
        # RESEND_FROM still overrides, and the resend.dev fallback still
        # applies locally, where the ai-compass.in domain is not verified for
        # the dev's own Resend key.
        from app.brand import DEFAULT_SENDER

        canonical = os.environ.get("CANONICAL_HOST", "ai-compass.in").strip().lower()
        if not canonical or canonical in {"localhost", "127.0.0.1"}:
            default_sender = "AI Compass <onboarding@resend.dev>"
        else:
            default_sender = DEFAULT_SENDER

        from_addr = (sender or os.environ.get("RESEND_FROM") or default_sender).strip()
        plain_text = text or html_to_plain_text(html)

        payload = {
            "from": from_addr,
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
    sender: str | None = None,
) -> tuple[bool, str | None]:
    """Send one email and return (success: bool, error_message: str | None).

    The default From is now a real monitored mailbox (app/brand.DEFAULT_SENDER,
    medhansh.singh@ai-compass.in) rather than `no-reply@`, so a recipient who
    hits Reply on any message reaches a human. `reply_to` therefore only
    matters when the reply should land somewhere OTHER than the From address.
    `headers` carries things like List-Unsubscribe that aren't part of the
    message body.

    `sender` overrides the From address for this one send — outreach uses it
    to sign cold mail personally (app/outreach.py); everything transactional
    keeps the default.
    """
    # Checked before any transport, so neither Resend nor SMTP can fire.
    suppressed, reason = sending_suppressed()
    if suppressed:
        log.info("Email suppressed (%s) — would have sent to %s (%s)", reason, to, subject)
        return False, reason

    if os.environ.get("RESEND_API_KEY"):
        return _send_via_resend(to, subject, html, text, reply_to, headers, sender)

    host = os.environ.get("SMTP_HOST")
    if not host:
        err = "Email not configured (no RESEND_API_KEY / SMTP_HOST)"
        log.info("%s — skipping to %s (%s)", err, to, subject)
        return False, err

    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASS")
    from app.brand import SENDER_EMAIL

    from_addr = sender or os.environ.get("SMTP_FROM") or user or SENDER_EMAIL

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
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
    sender: str | None = None,
) -> bool:
    success, _ = send_email_with_details(to, subject, html, text, reply_to, headers, sender)
    return success
