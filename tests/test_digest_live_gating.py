"""Digest: only announce LIVE tools, and cap the digest at ~50 sends/day.

Two fixes verified here:

  1. A tool still inside its staggered-release delay (visible_at in the future
     — e.g. a just-approved free-tier submission) is NOT emailed, and is NOT
     recorded as "known", so it gets announced on the run AFTER it goes live.

  2. run_digest sends at most DIGEST_DAILY_CAP of these emails per UTC day; the
     rest are deferred and drain on later runs without re-mailing anyone.
"""
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

import app.digest as digest_mod
import app.send_budget as sb
from app import create_app, db
from app.models import CatalogTool, DigestRecipientLog, DigestState, User
from app.tool_cache import refresh_tools_cache


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
    refresh_tools_cache()  # don't leak this test's DB catalog into others
    try:
        os.remove(path)
    except OSError:
        pass


def _catalog_tool(slug, name, visible_at=None):
    data = {"slug": slug, "name": name, "category": "Productivity",
            "tagline": f"{name} tagline", "link": f"https://{slug}.example.com"}
    row = CatalogTool(slug=slug, name=name, category="Productivity",
                      hidden=False, data=json.dumps(data))
    if visible_at is not None:
        row.visible_at = visible_at.replace(tzinfo=None)
    db.session.add(row)


def _seed_known(slugs):
    db.session.add(DigestState(id=1, known_slugs=json.dumps(sorted(slugs))))
    db.session.commit()


@pytest.fixture(autouse=True)
def _capture_sends(monkeypatch):
    sent = []
    monkeypatch.setattr(digest_mod, "send_email",
                        lambda to, *a, **k: (sent.append(to), True)[1])
    return sent


def test_not_yet_live_tool_is_not_announced_until_it_goes_live(app, _capture_sends):
    future = datetime.now(timezone.utc) + timedelta(days=14)
    with app.app_context():
        _catalog_tool("baseline", "Baseline Tool")
        _catalog_tool("live-new", "Live New Tool")
        _catalog_tool("pending-new", "Pending New Tool", visible_at=future)
        db.session.commit()
        _seed_known(["baseline"])
        refresh_tools_cache()
        db.session.add(User(email="u1@t.test", notifications_enabled=True))
        db.session.commit()

        result = digest_mod.run_digest()

        # Only the live tool is announced.
        assert result["new_tools"] == 1
        assert result["status"] == "sent"
        assert _capture_sends == ["u1@t.test"]

        # The not-yet-live tool must NOT have been folded into the snapshot,
        # otherwise it would never be announced later.
        known = json.loads(db.session.get(DigestState, 1).known_slugs)
        assert "live-new" in known
        assert "pending-new" not in known

    # Now it goes live.
    with app.app_context():
        row = CatalogTool.query.filter_by(slug="pending-new").one()
        row.visible_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
        db.session.commit()
        refresh_tools_cache()
        _capture_sends.clear()

        result = digest_mod.run_digest()
        assert result["new_tools"] == 1
        assert result["status"] == "sent"
        assert _capture_sends == ["u1@t.test"]


def test_digest_capped_per_day_and_drains_over_multiple_days(app, _capture_sends, monkeypatch):
    monkeypatch.setattr(sb, "DIGEST_DAILY_CAP", 2)

    day = {"d": datetime(2026, 9, 1).date()}
    monkeypatch.setattr(sb, "_today", lambda: day["d"])

    with app.app_context():
        _catalog_tool("baseline", "Baseline Tool")
        _catalog_tool("shiny", "Shiny New Tool")
        db.session.commit()
        _seed_known(["baseline"])
        refresh_tools_cache()
        for i in range(5):
            db.session.add(User(email=f"user{i}@t.test", notifications_enabled=True))
        db.session.commit()

        # Day 1: cap is 2 -> 2 sent, 3 deferred, snapshot NOT advanced.
        r1 = digest_mod.run_digest()
        assert r1["status"] == "partial"
        assert r1["delivered"] == 2
        assert r1["deferred"] == 3
        assert len(_capture_sends) == 2
        assert "shiny" not in json.loads(db.session.get(DigestState, 1).known_slugs)

        # Same day again: digest budget already spent -> nothing sent.
        r1b = digest_mod.run_digest()
        assert r1b["delivered"] == 0
        assert r1b["status"] == "partial"
        assert len(_capture_sends) == 2

        # Day 2.
        day["d"] = datetime(2026, 9, 2).date()
        r2 = digest_mod.run_digest()
        assert r2["delivered"] == 2
        assert len(_capture_sends) == 4

        # Day 3: last recipient, everyone served -> snapshot advances, log cleared.
        day["d"] = datetime(2026, 9, 3).date()
        r3 = digest_mod.run_digest()
        assert r3["delivered"] == 1
        assert r3["status"] == "sent"
        assert sorted(_capture_sends) == [f"user{i}@t.test" for i in range(5)]
        assert len(_capture_sends) == len(set(_capture_sends))  # nobody mailed twice
        assert "shiny" in json.loads(db.session.get(DigestState, 1).known_slugs)
        assert DigestRecipientLog.query.count() == 0
