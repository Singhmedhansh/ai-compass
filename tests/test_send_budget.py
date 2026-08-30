"""Shared daily send-budget: arithmetic + race-safety.

Simulates outreach and the digest both drawing on the one Resend 100/day
account budget on the same day near the cap, and confirms the guarded-UPDATE
CAS never lets the committed sent_count overshoot the cap.
"""
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import event

from app import create_app, db
import app.send_budget as sb


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
        # Let concurrent writers wait on SQLite's single-writer lock instead of
        # erroring out with "database is locked".
        @event.listens_for(db.engine, "connect")
        def _busy_timeout(dbapi_con, _rec):  # noqa: ANN001
            dbapi_con.execute("PRAGMA busy_timeout=30000")

        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture(autouse=True)
def _small_cap(monkeypatch):
    # A cap of 20 makes "near the cap" cheap to reach in a test.
    monkeypatch.setattr(sb, "DEFAULT_DAILY_CAP", 20)


def test_reserve_grants_then_refuses_past_cap(app):
    with app.app_context():
        assert sb.reserve_send_slots(8, "outreach-initial")["granted"] == 8
        assert sb.reserve_send_slots(8, "digest")["granted"] == 8
        # Only 4 left of 20 — asking for 10 grants the remaining 4.
        assert sb.reserve_send_slots(10, "digest")["granted"] == 4
        # Nothing left.
        assert sb.reserve_send_slots(5, "outreach-followup")["granted"] == 0

        status = sb.budget_status()
        assert status["sent_count"] == 20
        assert status["cap"] == 20
        assert status["remaining"] == 0


def test_release_hands_slots_back(app):
    with app.app_context():
        sb.reserve_send_slots(15, "digest")
        sb.release_send_slots(5, "digest")  # 5 sends failed
        assert sb.budget_status()["sent_count"] == 10

        # Clamps at zero, never negative.
        sb.release_send_slots(999, "digest")
        assert sb.budget_status()["sent_count"] == 0


def test_zero_and_negative_requests_are_noops(app):
    with app.app_context():
        assert sb.reserve_send_slots(0, "digest")["granted"] == 0
        assert sb.reserve_send_slots(-3, "digest")["granted"] == 0
        assert sb.budget_status()["exists"] is False


def test_concurrent_reservations_never_overshoot(app):
    """Outreach and digest firing at the same instant, each asking for more
    than the whole budget: total granted must equal the cap exactly and the
    committed counter must never exceed it."""
    with app.app_context():
        sb.get_or_create_today_budget()  # create the row up front

    def worker(i):
        requester = "outreach-initial" if i % 2 == 0 else "digest"
        with app.app_context():
            return sb.reserve_send_slots(7, requester)["granted"]

    with ThreadPoolExecutor(max_workers=12) as ex:
        grants = list(ex.map(worker, range(12)))

    with app.app_context():
        status = sb.budget_status()

    assert sum(grants) == 20, grants
    assert status["sent_count"] == 20
    assert status["sent_count"] <= status["cap"]
    assert all(g >= 0 for g in grants)
