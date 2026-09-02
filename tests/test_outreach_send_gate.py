"""Outreach send gate: catchall/unknown-verified addresses must be sendable.

Regression: CONFIDENCE_SEND_THRESHOLD was 80 while the SMTP prober scores its
two most common verdicts at catchall=60 / unknown=50, so nothing except a rare
clean 'valid' ever cleared the gate — "outreach emails are not getting sent".
"""
import os
import tempfile

import pytest

import app.outreach as outreach_mod
from app import create_app, db
from app.models import OutreachCandidate, OutreachEmailLog
from app.outreach import (
    CURRENT_DRAFT_TEMPLATE_VERSION,
    can_send_candidate,
    run_automated_initial_sends,
)


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    try:
        os.remove(path)
    except OSError:
        pass


def _candidate(**over):
    base = dict(
        product_name="Widget AI",
        website_url="https://widget.example.com",
        email="founder@widget.example.com",
        status="draft_ready",
        draft_subject="Quick one about Widget AI",
        draft_body="<p>Hi</p>",
        confidence_score=60,
        verification_result="catchall",
        # Stamped current on purpose. These tests exercise the VERIFICATION
        # gate; can_send_candidate() separately refuses a draft written
        # against an older copy template (see test_outreach_free_first.py),
        # and an unstamped fixture would trip that instead — testing the
        # wrong gate and hiding this one.
        draft_template_version=CURRENT_DRAFT_TEMPLATE_VERSION,
    )
    base.update(over)
    return OutreachCandidate(**base)


@pytest.mark.parametrize("verdict,score,expected", [
    ("valid", 95, True),
    ("catchall", 60, True),     # regression case
    ("unknown", 50, True),      # regression case
    ("manual_override", 100, True),
    ("invalid", 0, False),
    ("disposable", 0, False),
    (None, 40, False),          # no verdict AND below the confidence floor
])
def test_can_send_by_verification_verdict(app, verdict, score, expected):
    with app.app_context():
        c = _candidate(verification_result=verdict, confidence_score=score)
        ok, reason = can_send_candidate(c)
        assert ok is expected, reason


def test_unverified_send_fallback_uses_live_mx_check(app, monkeypatch):
    """With OUTREACH_ALLOW_UNVERIFIED_SEND on (the default), a candidate with
    no SMTP verdict is still sendable if it clears the confidence floor AND
    its domain currently has a mail server — but blocked if the domain is dead
    or if the flag is off."""
    with app.app_context():
        c = _candidate(verification_result=None, confidence_score=55)

        monkeypatch.setattr(outreach_mod, "ALLOW_UNVERIFIED_SEND", True)
        monkeypatch.setattr(outreach_mod, "_domain_has_mail_capability", lambda d: True)
        assert can_send_candidate(c)[0] is True

        monkeypatch.setattr(outreach_mod, "_domain_has_mail_capability", lambda d: False)
        ok, reason = can_send_candidate(c)
        assert ok is False and "mail server" in reason

        monkeypatch.setattr(outreach_mod, "_domain_has_mail_capability", lambda d: True)
        monkeypatch.setattr(outreach_mod, "ALLOW_UNVERIFIED_SEND", False)
        assert can_send_candidate(c)[0] is False


@pytest.mark.parametrize("status", ["unsubscribed", "bounced", "replied", "rejected", "sent"])
def test_opted_out_or_terminal_status_is_blocked(app, status):
    with app.app_context():
        c = _candidate(status=status)
        ok, reason = can_send_candidate(c)
        assert ok is False
        assert status in reason


def test_missing_email_or_draft_blocked(app):
    with app.app_context():
        assert can_send_candidate(_candidate(email=None))[0] is False
        assert can_send_candidate(_candidate(draft_body=None))[0] is False


def test_automated_initial_sends_dispatches_catchall_candidate(app, monkeypatch):
    calls = []
    monkeypatch.setattr(
        outreach_mod, "send_email_with_details",
        lambda **kw: (calls.append(kw["to"]), (True, None))[1],
    )
    monkeypatch.setattr(outreach_mod.time, "sleep", lambda *_: None)

    with app.app_context():
        db.session.add(_candidate(verification_result="catchall", confidence_score=60))
        db.session.add(_candidate(
            email="no-verify@widget2.example.com", website_url="https://widget2.example.com",
            verification_result=None, confidence_score=45,
        ))
        db.session.commit()

        sent = run_automated_initial_sends()

        assert sent == 1
        assert calls == ["founder@widget.example.com"]
        statuses = {c.email: c.status for c in OutreachCandidate.query.all()}
        assert statuses["founder@widget.example.com"] == "sent"
        assert statuses["no-verify@widget2.example.com"] == "draft_ready"
        assert OutreachEmailLog.query.filter_by(status="success").count() == 1
