"""The complimentary rail window runs from approval, not submission.

Fast-Track buys a 30-day complimentary unit in the community rail. That
window used to be measured from submitted_at, which billed the founder for
our own review queue: a row that sat three days in moderation delivered 27
of the 30 days it paid for, and nothing in the UI accounted for the gap.

These tests pin the four rules that keep the window honest:
  * approved_at is what starts the clock;
  * rows predating the column fall back to submitted_at rather than getting
    an invented start date;
  * approval stamps approved_at exactly once, so a re-approval cannot hand
    out a second 30 days;
  * the renderer and the founder dashboard read the same predicate, because
    the two disagreeing is the bug complimentary_window() exists to prevent.
"""
import json
from datetime import datetime, timedelta, timezone

from app import db
from app.models import CatalogTool, Submission
from app.sponsorship import (
    COMPLIMENTARY_WINDOW_DAYS,
    complimentary_placement_for_slug,
    complimentary_window,
)


def _sub(**over):
    base = dict(
        name="Comp Window Tool",
        website="https://compwindow.example.com",
        category="Productivity",
        description="A Fast-Track listing.",
        pricing_model="sponsored_paypal:COMP1",
        status="approved",
        payment_status="verified",
    )
    base.update(over)
    row = Submission(**base)
    db.session.add(row)
    db.session.commit()
    return row


def test_window_starts_at_approval_not_submission(app):
    with app.app_context():
        submitted = datetime.now(timezone.utc) - timedelta(days=10)
        approved = datetime.now(timezone.utc) - timedelta(days=3)
        sub = _sub(submitted_at=submitted, approved_at=approved)

        starts, ends = complimentary_window(sub)

        # The seven days this row spent in the review queue are ours, not the
        # founder's — the full 30 days start when the listing goes live.
        assert abs((starts - approved).total_seconds()) < 1
        assert abs((ends - approved).total_seconds()
                   - COMPLIMENTARY_WINDOW_DAYS * 86400) < 1


def test_legacy_row_without_approved_at_falls_back_to_submission(app):
    with app.app_context():
        submitted = datetime.now(timezone.utc) - timedelta(days=4)
        sub = _sub(submitted_at=submitted, approved_at=None)

        starts, _ends = complimentary_window(sub)

        # Rows approved before the column existed have no honest approval
        # time to recover. The old (slightly short) behaviour beats inventing
        # a start date that would silently extend a window already spent.
        assert abs((starts - submitted).total_seconds()) < 1


def test_window_still_expires_measured_from_approval(app):
    with app.app_context():
        long_ago = datetime.now(timezone.utc) - timedelta(days=90)
        sub = _sub(
            submitted_at=long_ago,
            approved_at=datetime.now(timezone.utc)
            - timedelta(days=COMPLIMENTARY_WINDOW_DAYS + 1),
        )

        # Moving the start later must not make the perk permanent.
        assert complimentary_window(sub) is None


def test_unverified_payment_earns_no_window_even_once_approved(app):
    with app.app_context():
        sub = _sub(
            payment_status="needs_manual_review",
            approved_at=datetime.now(timezone.utc),
        )
        assert complimentary_window(sub) is None


def test_approval_stamps_approved_at_once(client, app):
    from tests.test_submissions_and_digest import _login_as_admin

    with app.app_context():
        sub = _sub(name="Stamp Once Tool",
                   website="https://stamponce.example.com",
                   status="pending")
        sub_id = sub.id

    _login_as_admin(client, app, "approved-at@t.test")
    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data

    with app.app_context():
        first = Submission.query.get(sub_id).approved_at
        assert first is not None, "approval must start the perk clock"

    # The slug is now in the catalog, so a second approve is refused — but the
    # stamp must be write-once regardless, or a re-approval would silently
    # hand out another full 30 days.
    client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    with app.app_context():
        assert Submission.query.get(sub_id).approved_at == first


def test_dashboard_placement_reports_the_approval_based_window(app):
    with app.app_context():
        approved = datetime.now(timezone.utc) - timedelta(days=2)
        sub = _sub(name="Dash Window Tool",
                   website="https://dashwindow.example.com",
                   submitted_at=datetime.now(timezone.utc) - timedelta(days=20),
                   approved_at=approved)
        db.session.add(CatalogTool(
            slug="dash-window-tool",
            name="Dash Window Tool",
            category="Productivity",
            submission_id=sub.id,
            data=json.dumps({
                "slug": "dash-window-tool",
                "name": "Dash Window Tool",
                "category": "Productivity",
                "sponsored": True,
            }),
        ))
        db.session.commit()

        placement = complimentary_placement_for_slug("dash-window-tool")

        assert placement is not None, (
            "a live comp rail unit must show on the founder dashboard — the "
            "perk being delivered and reported absent reads as not delivered"
        )
        assert placement["placement"] == "rail"
        assert placement["source"] == "submission"
        # Same predicate as the renderer, so the two cannot drift.
        _starts, ends = complimentary_window(sub)
        assert placement["ends_at"] == ends.isoformat()


def test_admin_queue_surfaces_perk_window_and_queue_age(client, app):
    """The admin is the only person who can act on a window about to lapse,
    and the queue showed no trace of one — it listed pending rows only, so
    a perk became invisible the moment approval started its clock."""
    from tests.test_submissions_and_digest import _login_as_admin

    with app.app_context():
        _sub(name="Live Comp Tool",
             website="https://livecomp.example.com",
             approved_at=datetime.now(timezone.utc) - timedelta(days=4))
        _sub(name="Waiting Tool",
             website="https://waiting.example.com",
             status="pending",
             is_priority=True,
             submitted_at=datetime.now(timezone.utc) - timedelta(days=3))

    _login_as_admin(client, app, "queue-view@t.test")
    rows = client.get("/api/v1/admin/submissions?status=all").get_json()
    by_name = {r["name"]: r for r in rows}

    live = by_name["Live Comp Tool"]
    assert live["perk_window"]["placement"] == "rail"
    assert live["perk_window"]["days_remaining"] == COMPLIMENTARY_WINDOW_DAYS - 4
    assert live["approved_at"] is not None
    assert live["queue_age_days"] is None, "only pending rows are still waiting"

    waiting = by_name["Waiting Tool"]
    assert waiting["perk_window"] is None, "an unapproved row has no live perk"
    assert waiting["approved_at"] is None
    # Fast-Track promises a 24-hour review; three days in, the queue should
    # say so rather than leaving the admin to work it out from a timestamp.
    assert waiting["queue_age_days"] == 3
