"""Phase 5: the post-sale ledger.

The weight of this file sits on two things.

First, that an obligation is only "done" when the thing was actually
delivered. The failure this guards is the one sponsorship.complimentary_window
already documents from a previous bug: a perk being delivered and reported as
absent at the same time, or worse, reported as delivered when it was not. A
runbook that is wrong in the reassuring direction is more dangerous than no
runbook, because it is the thing the operator checks instead of looking.

Second, that "waiting" and "overdue" stay distinct. A review cannot be late
before the listing it reviews is live. Collapsing those two states sends the
operator chasing work that is not yet owed, which is exactly how a real
overdue item gets lost in the noise.
"""
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

from app import create_app, db
from app.models import CatalogTool, Submission
from app.post_sale import (
    OB_CONFIRMATION,
    OB_LISTING_LIVE,
    OB_NUMBERS,
    OB_PLACEMENT,
    OB_REVIEW,
    STATE_DONE,
    STATE_DUE,
    STATE_OVERDUE,
    STATE_WAITING,
    obligations,
    runbook,
    send_confirmations,
    send_day7_numbers,
)

NOW = datetime(2026, 9, 3, 12, 0, tzinfo=timezone.utc)


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


def _naive(dt):
    return dt.replace(tzinfo=None) if dt is not None else None


def _sub(tier="sponsored", days_ago=10, approved=True, paid="verified", **over):
    """A paying submission, sold `days_ago` days back."""
    sold = NOW - timedelta(days=days_ago)
    s = Submission(
        name="Rowboat",
        website="https://rowboat.example",
        category="Productivity",
        description="d",
        pricing_model=f"{tier}_paypal",
        submitter_email="founder@rowboat.example",
        status="approved" if approved else "pending",
        payment_status=paid,
        submitted_at=_naive(sold),
        approved_at=_naive(sold) if approved else None,
        is_test=False,
    )
    for k, v in over.items():
        setattr(s, k, v)
    db.session.add(s)
    db.session.flush()
    return s


def _tool(submission, visible_days_ago=10, hidden=False, slug="rowboat"):
    t = CatalogTool(
        slug=slug,
        name=submission.name,
        # NOT NULL: the full normalized tool dict the catalog renders from.
        data=json.dumps({"slug": slug, "name": submission.name}),
        submission_id=submission.id,
        hidden=hidden,
        visible_at=_naive(NOW - timedelta(days=visible_days_ago)),
    )
    db.session.add(t)
    db.session.flush()
    return t


def _by_key(items):
    return {i["key"]: i for i in items}


# ─── What each tier is owed ───────────────────────────────────────────────────

def test_a_free_listing_is_owed_nothing(app):
    s = _sub(tier="free", paid="unpaid")
    assert obligations(s, _tool(s), now=NOW) == [], (
        "Nothing was sold, so nothing is owed. Returning not-applicable rows "
        "would make the operator read past them on every scan."
    )


def test_an_unverified_payment_is_owed_nothing(app):
    """Only a verified payment unlocks perks, so only it creates obligations."""
    s = _sub(tier="sponsored", paid="needs_manual_review")
    assert obligations(s, _tool(s), now=NOW) == []


def test_the_entry_tier_buys_reporting_not_placement(app):
    s = _sub(tier="analytics")
    keys = _by_key(obligations(s, _tool(s), now=NOW))
    assert OB_NUMBERS in keys
    assert OB_PLACEMENT not in keys, "$19 buys no placement"
    assert OB_REVIEW not in keys, "$19 buys no review"


def test_the_placement_tier_owes_a_badge_but_not_a_review(app):
    s = _sub(tier="sponsored")
    keys = _by_key(obligations(s, _tool(s), now=NOW))
    assert OB_PLACEMENT in keys
    assert OB_REVIEW not in keys, "the review is the $79 tier's differentiator"


def test_the_reviewed_tier_owes_everything(app):
    s = _sub(tier="reviewed")
    keys = _by_key(obligations(s, _tool(s), now=NOW))
    for k in (OB_CONFIRMATION, OB_LISTING_LIVE, OB_PLACEMENT, OB_REVIEW, OB_NUMBERS):
        assert k in keys


# ─── Done means delivered, not merely scheduled ──────────────────────────────

def test_an_unpublished_review_is_not_done(app):
    """The failure that matters most: reporting a promise as kept."""
    s = _sub(tier="reviewed", days_ago=20)
    item = _by_key(obligations(s, _tool(s, visible_days_ago=20), now=NOW))[OB_REVIEW]
    assert item["done_at"] is None
    assert item["state"] == STATE_OVERDUE, (
        "Live 20 days with a 7-day promise and no published review is late."
    )


def test_a_published_review_is_done(app):
    from app.models import EditorialReview

    s = _sub(tier="reviewed", days_ago=20)
    t = _tool(s, visible_days_ago=20)
    db.session.add(EditorialReview(
        tool_slug=t.slug, status="published", headline="h",
        published_at=_naive(NOW - timedelta(days=2)),
    ))
    db.session.flush()
    item = _by_key(obligations(s, t, now=NOW))[OB_REVIEW]
    assert item["state"] == STATE_DONE
    assert item["done_at"] is not None


def test_a_hidden_catalog_row_is_not_live(app):
    s = _sub(tier="sponsored")
    item = _by_key(obligations(s, _tool(s, hidden=True), now=NOW))[OB_LISTING_LIVE]
    assert item["done_at"] is None


def test_a_listing_still_inside_its_release_delay_is_not_live(app):
    s = _sub(tier="sponsored", days_ago=1)
    t = _tool(s, visible_days_ago=-3)  # visible_at three days in the future
    assert _by_key(obligations(s, t, now=NOW))[OB_LISTING_LIVE]["done_at"] is None


def test_a_paid_row_with_no_catalog_row_at_all_is_surfaced(app):
    """The case an inner join would hide, and the worst one to lose."""
    s = _sub(tier="sponsored", days_ago=5)
    items = _by_key(obligations(s, None, now=NOW))
    assert items[OB_LISTING_LIVE]["state"] == STATE_OVERDUE


# ─── waiting vs overdue ───────────────────────────────────────────────────────

def test_a_review_is_not_late_before_the_listing_is_live(app):
    s = _sub(tier="reviewed", days_ago=30, approved=False)
    item = _by_key(obligations(s, None, now=NOW))[OB_REVIEW]
    assert item["state"] == STATE_WAITING, (
        "Sold 30 days ago, but the review clock runs from live. Reporting "
        "this as overdue sends the operator chasing work not yet owed."
    )


def test_a_review_inside_its_window_is_merely_due(app):
    s = _sub(tier="reviewed", days_ago=3)
    item = _by_key(obligations(s, _tool(s, visible_days_ago=3), now=NOW))[OB_REVIEW]
    assert item["state"] == STATE_DUE


def test_the_confirmation_clock_runs_from_payment_not_approval(app):
    """A founder who has just been charged is owed a reply whatever the queue."""
    s = _sub(tier="sponsored", days_ago=2, approved=False)
    item = _by_key(obligations(s, None, now=NOW))[OB_CONFIRMATION]
    assert item["state"] == STATE_OVERDUE, (
        "Paid two days ago and never acknowledged, regardless of approval."
    )


def test_a_confirmed_purchase_is_done(app):
    s = _sub(tier="sponsored", days_ago=2,
             post_sale_confirmed_at=_naive(NOW - timedelta(days=2)))
    assert _by_key(obligations(s, None, now=NOW))[OB_CONFIRMATION]["state"] == STATE_DONE


def test_numbers_are_not_owed_in_the_first_week(app):
    s = _sub(tier="analytics", days_ago=3)
    item = _by_key(obligations(s, _tool(s, visible_days_ago=3), now=NOW))[OB_NUMBERS]
    assert item["state"] == STATE_DUE
    assert item["due_at"] > NOW


def test_numbers_go_overdue_after_the_seventh_day(app):
    s = _sub(tier="analytics", days_ago=12)
    item = _by_key(obligations(s, _tool(s, visible_days_ago=12), now=NOW))[OB_NUMBERS]
    assert item["state"] == STATE_OVERDUE


# ─── Naive/aware, the bug that only shows up in production ───────────────────

def test_an_aware_stamp_does_not_raise(app):
    """SQLite hands back naive datetimes, Postgres aware ones.

    A comparison written without normalising works in every test and raises
    TypeError on production only - and since the runbook loops, one raise
    drops every remaining customer from the report.
    """
    s = _sub(tier="sponsored", days_ago=5)
    s.post_sale_confirmed_at = NOW - timedelta(days=4)  # aware, as PG returns
    items = _by_key(obligations(s, _tool(s), now=NOW))
    assert items[OB_CONFIRMATION]["state"] == STATE_DONE


def test_a_naive_now_is_accepted(app):
    s = _sub(tier="sponsored", days_ago=5)
    assert obligations(s, _tool(s), now=NOW.replace(tzinfo=None))


# ─── The runbook ──────────────────────────────────────────────────────────────

def test_the_runbook_puts_overdue_customers_first(app):
    ok = _sub(tier="analytics", days_ago=1,
              post_sale_confirmed_at=_naive(NOW - timedelta(hours=1)))
    _tool(ok, visible_days_ago=1)
    late = _sub(tier="reviewed", days_ago=40, name="Late")
    _tool(late, visible_days_ago=40, slug="late")
    db.session.commit()

    out = runbook(now=NOW)
    assert out["paying_customers"] == 2
    assert out["customers"][0]["submission_id"] == late.id, (
        "The view is opened when time is short; late work has to lead."
    )
    assert out["overdue_customers"] == 1


def test_the_runbook_ignores_free_and_test_rows(app):
    _sub(tier="free", paid="unpaid")
    t = _sub(tier="sponsored")
    t.is_test = True
    db.session.commit()
    assert runbook(now=NOW)["paying_customers"] == 0


def test_one_broken_customer_does_not_empty_the_runbook(app, monkeypatch):
    """A single bad row must not cost the operator the whole report."""
    good = _sub(tier="analytics", days_ago=2)
    _tool(good, visible_days_ago=2)
    db.session.commit()

    import app.post_sale as ps

    real = ps.obligations
    calls = {"n": 0}

    def boom(submission, tool=None, now=None):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("bad row")
        return real(submission, tool, now=now)

    monkeypatch.setattr(ps, "obligations", boom)
    assert ps.runbook(now=NOW)["paying_customers"] == 0  # only row was the bad one
    assert calls["n"] == 1


# ─── Sending: idempotency and deferral ───────────────────────────────────────

def test_a_dry_run_sends_and_stamps_nothing(app):
    s = _sub(tier="sponsored", days_ago=2)
    db.session.commit()
    out = send_confirmations(dry_run=True)
    assert out["candidates"] == 1 and out["sent"] == 0
    assert s.post_sale_confirmed_at is None


def test_no_transport_defers_rather_than_stamping(app, monkeypatch):
    """Stamping without a transport would lose the message permanently."""
    s = _sub(tier="sponsored", days_ago=2)
    db.session.commit()
    monkeypatch.setattr("app.email_utils.email_enabled", lambda: False)
    out = send_confirmations()
    assert out["deferred"] == 1 and out["sent"] == 0
    assert s.post_sale_confirmed_at is None, (
        "The backlog has to survive a misconfigured transport."
    )


def test_a_confirmed_customer_is_not_mailed_twice(app):
    _sub(tier="sponsored", days_ago=2,
         post_sale_confirmed_at=_naive(NOW - timedelta(days=1)))
    db.session.commit()
    assert send_confirmations(dry_run=True)["candidates"] == 0


def test_day7_numbers_wait_for_the_seventh_day(app):
    s = _sub(tier="analytics", days_ago=3)
    _tool(s, visible_days_ago=3)
    db.session.commit()
    assert send_day7_numbers(dry_run=True)["candidates"] == 0


def test_day7_numbers_go_out_once_the_week_is_up(app):
    s = _sub(tier="analytics", days_ago=12)
    _tool(s, visible_days_ago=12)
    db.session.commit()
    assert send_day7_numbers(dry_run=True)["candidates"] == 1


def test_a_listing_that_never_went_live_gets_no_numbers_email(app):
    """"0 views" about a page nobody could reach reads as a broken product."""
    s = _sub(tier="analytics", days_ago=20)
    _tool(s, visible_days_ago=20, hidden=True)
    db.session.commit()
    assert send_day7_numbers(dry_run=True)["candidates"] == 0


def test_a_row_with_no_email_is_skipped(app):
    s = _sub(tier="sponsored", days_ago=2)
    s.submitter_email = None
    db.session.commit()
    assert send_confirmations(dry_run=True)["candidates"] == 0


# ─── The admin endpoints ──────────────────────────────────────────────────────

def test_the_send_endpoints_need_the_shared_secret(app, monkeypatch):
    """These spend the shared Resend budget and mail paying customers.

    An unauthenticated POST that sends real email to real customers is the
    kind of thing that is obvious once written down and easy to leave off,
    so it is asserted rather than assumed.
    """
    client = app.test_client()
    monkeypatch.setenv("DIGEST_SECRET", "s3cret")

    for path in ("confirmations", "numbers"):
        assert client.post(f"/api/v1/admin/post-sale/{path}").status_code == 401
        ok = client.post(
            f"/api/v1/admin/post-sale/{path}?dry_run=1",
            headers={"X-Digest-Secret": "s3cret"},
        )
        assert ok.status_code == 200
        assert ok.get_json()["dry_run"] is True


def test_the_runbook_endpoint_is_admin_only(app):
    assert app.test_client().get("/api/v1/admin/post-sale/runbook").status_code in (301, 302, 401, 403)


def test_schema_status_reports_the_columns_the_fallback_owns(app, monkeypatch):
    """The endpoint that makes a failed schema repair visible.

    Its whole value is being trustworthy when the news is bad, so the check
    is that it reports honestly against a real database rather than that it
    returns 200.
    """
    client = app.test_client()
    monkeypatch.setenv("DIGEST_SECRET", "s3cret")

    assert client.get("/api/v1/admin/schema-status").status_code == 401

    resp = client.get("/api/v1/admin/schema-status",
                      headers={"X-Digest-Secret": "s3cret"})
    assert resp.status_code == 200
    body = resp.get_json()
    # create_all() built these tables complete from the models, so a fresh
    # database is the "everything present" case.
    assert body["schema_ok"] is True, body["missing_columns"]
    assert body["missing_columns"] == {}
    assert body["remedy"] is None
    assert body["checked"]["outreach_candidates"] >= 3


def test_schema_status_names_a_column_that_is_actually_missing(app, monkeypatch):
    """A reporter that cannot report a problem is worse than none."""
    client = app.test_client()
    monkeypatch.setenv("DIGEST_SECRET", "s3cret")

    # The index has to go first: SQLite refuses to drop a column one depends
    # on, and Postgres would silently drop the index with it.
    db.session.execute(db.text("DROP INDEX IF EXISTS ix_sponsor_slots_payment_ref"))
    db.session.execute(db.text("ALTER TABLE sponsor_slots DROP COLUMN payment_ref"))
    db.session.commit()

    body = client.get("/api/v1/admin/schema-status",
                      headers={"X-Digest-Secret": "s3cret"}).get_json()
    assert body["schema_ok"] is False
    assert "payment_ref" in body["missing_columns"]["sponsor_slots"]
    assert body["remedy"]
