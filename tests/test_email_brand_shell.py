"""Every outbound email carries the AI Compass shell.

The rule this locks down: nothing dispatched through send_email() reaches
Resend or SMTP without the wordmark, the card and the footer around it. It
used to hold only for messages whose author remembered to render a template —
outreach follow-ups (app/outreach.py) and several hand-built HTML bodies in
routes went out as bare <p> tags, which is what prompted the change.
"""

from unittest.mock import patch

from app.email_utils import _SHELL_MARKER, ensure_branded_html


def test_bare_body_is_wrapped(app):
    with app.app_context():
        out = ensure_branded_html("<p>Hey there,</p>", subject="Re: About Candor")

    assert _SHELL_MARKER in out
    assert "AI <span" in out  # the wordmark
    assert "help@ai-compass.in" in out  # the footer
    assert "Hey there," in out  # the body survives verbatim


def test_already_branded_body_is_not_double_wrapped(app):
    with app.app_context():
        once = ensure_branded_html("<p>Hi</p>")
        twice = ensure_branded_html(once)

    assert twice == once
    assert once.count(_SHELL_MARKER) == 1


def test_shell_applies_without_an_app_context():
    """Scheduler jobs and CLI scripts send outside a Flask context.

    render_template() raises there, and the fallback is what keeps those
    sends branded instead of silently dropping back to the raw body.
    """
    out = ensure_branded_html("<p>Nightly notice</p>", subject="Digest")

    assert _SHELL_MARKER in out
    assert "Nightly notice" in out


def test_empty_body_is_left_alone():
    assert ensure_branded_html("") == ""


def test_outreach_followup_reaches_the_transport_branded(app):
    """The regression itself: a follow-up is composed as bare paragraphs."""
    from app.outreach import _outreach_wrap

    body = _outreach_wrap('<p style="margin:0 0 14px 0;">Following up once.</p>')
    assert _SHELL_MARKER not in body  # composed unstyled, by design

    captured = {}

    def fake_resend(to, subject, html, text, reply_to, headers, sender=None):
        captured["html"] = html
        captured["text"] = text
        return True, None

    with app.app_context(), \
            patch.dict("os.environ", {"RESEND_API_KEY": "test-key"}), \
            patch("app.email_utils.sending_suppressed", return_value=(False, "")), \
            patch("app.email_utils._send_via_resend", side_effect=fake_resend):
        from app.email_utils import send_email

        assert send_email("founder@example.com", "Re: About Candor", body)

    assert _SHELL_MARKER in captured["html"]
    assert "Following up once." in captured["html"]
    # The plain-text alternative is derived from the body, not the shell, so
    # the footer addresses don't end up in the text part of every message.
    assert "Following up once." in captured["text"]
    assert "help@ai-compass.in" not in captured["text"]
