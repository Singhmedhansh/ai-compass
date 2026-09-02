"""The cron endpoint runs sends and discovery as separately callable phases.

Regression, 2026-09-01: the workflow made one POST that ran follow-ups, initial
sends and discovery in a single request, with curl --max-time 300. That run
took 306s. curl aborted, `set -euo pipefail` killed the step, and because every
later step defaulted to `if: success()`, the SMTP verification steps were
skipped too. One slow scrape of Product Hunt took down the whole night, and the
pipeline looked switched off.

Discovery is slow, unbounded and best-effort; sending is fast, capped and the
half that actually earns something. They must not be able to take each other
down, which means the caller has to be able to ask for one without the other.
"""
import os
import tempfile

import pytest

import app.outreach_routes as routes_mod
from app import create_app, db


@pytest.fixture()
def app(monkeypatch):
    monkeypatch.setenv("OUTREACH_SECRET", "test-outreach-secret")
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


@pytest.fixture()
def calls(monkeypatch):
    """Records which phases ran, without doing any real work."""
    seen = {"followups": 0, "initial": 0, "discovery": 0}

    monkeypatch.setattr(routes_mod, "run_automated_followups", lambda: seen.__setitem__("followups", seen["followups"] + 1) or 2)
    monkeypatch.setattr(routes_mod, "run_automated_initial_sends", lambda: seen.__setitem__("initial", seen["initial"] + 1) or 3)
    monkeypatch.setattr(routes_mod, "run_discovery_pipeline", lambda: seen.__setitem__("discovery", seen["discovery"] + 1) or 7)
    return seen


HEADERS = {"X-Outreach-Secret": "test-outreach-secret"}


def test_send_phase_never_triggers_discovery(app, calls):
    res = app.test_client().post("/api/v1/admin/outreach/cron?phase=send", headers=HEADERS)

    assert res.status_code == 200
    body = res.get_json()
    assert body["phase"] == "send"
    assert body["followup_emails_sent"] == 2
    assert body["initial_emails_sent"] == 3
    assert calls["discovery"] == 0, (
        "The point of the split is that a slow scrape cannot delay or fail "
        "the sends. If discovery runs here, the 300s timeout is back."
    )


def test_discover_phase_sends_no_email(app, calls):
    res = app.test_client().post("/api/v1/admin/outreach/cron?phase=discover", headers=HEADERS)

    assert res.status_code == 200
    assert res.get_json()["new_candidates_discovered"] == 7
    assert calls["followups"] == 0 and calls["initial"] == 0


def test_full_is_still_the_default_for_existing_callers(app, calls):
    res = app.test_client().post("/api/v1/admin/outreach/cron", headers=HEADERS)

    assert res.status_code == 200
    assert res.get_json()["phase"] == "full"
    assert calls["followups"] == 1 and calls["initial"] == 1 and calls["discovery"] == 1


def test_an_unknown_phase_is_refused_rather_than_silently_doing_everything(app, calls):
    res = app.test_client().post("/api/v1/admin/outreach/cron?phase=sned", headers=HEADERS)

    assert res.status_code == 400
    assert calls == {"followups": 0, "initial": 0, "discovery": 0}, (
        "A typo in the phase name must not fall through to running the whole "
        "pipeline — that would send email the caller did not ask to send."
    )


def test_a_failing_discovery_does_not_lose_the_sends(app, calls, monkeypatch):
    def boom():
        raise RuntimeError("Product Hunt timed out")

    monkeypatch.setattr(routes_mod, "run_discovery_pipeline", boom)
    res = app.test_client().post("/api/v1/admin/outreach/cron", headers=HEADERS)

    assert res.status_code == 200
    body = res.get_json()
    assert body["discovery_error"] is True
    assert body["initial_emails_sent"] == 3, (
        "Sends run first and each phase is isolated, so a discovery blow-up "
        "must still report the email that went out."
    )


def test_the_endpoint_still_requires_the_shared_secret(app, calls):
    res = app.test_client().post("/api/v1/admin/outreach/cron?phase=send")

    assert res.status_code in (401, 403)
    assert calls["initial"] == 0
