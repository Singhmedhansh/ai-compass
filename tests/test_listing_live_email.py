"""The "your listing is live" sweep (app/listing_live.py).

The behaviour worth pinning down here is not that the email renders — it is
that it goes out ONCE, to the right rows, and that a failed send leaves the
row recoverable. A duplicate "your tool is live" to a founder is worse than a
late one, and a row silently stamped after a failed send is a founder who is
never told at all, with nothing in the logs to say so.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app import db
from app.listing_live import find_newly_live, send_live_notifications


def _now():
    return datetime.now(timezone.utc)


@pytest.fixture
def seeded(app):
    """One approved submission whose catalog row is already visible."""
    from app.models import CatalogTool, Submission

    with app.app_context():
        sub = Submission(
            name="Widget AI",
            website="https://widget.example",
            category="Coding",
            description="A widget.",
            pricing_model="free",
            submitter_email="founder@widget.example",
            status="approved",
            payment_status="unpaid",
            approved_at=_now() - timedelta(days=8),
        )
        db.session.add(sub)
        db.session.commit()

        tool = CatalogTool(
            slug="widget-ai",
            name="Widget AI",
            category="Coding",
            hidden=False,
            visible_at=_now() - timedelta(days=1),
            data="{}",
            submission_id=sub.id,
        )
        db.session.add(tool)
        db.session.commit()
        yield sub.id


def test_a_live_listing_that_was_never_announced_is_a_candidate(app, seeded):
    with app.app_context():
        pairs = find_newly_live()
        assert [s.id for s, _t in pairs] == [seeded]


def test_a_listing_still_inside_its_release_delay_is_not_a_candidate(app, seeded):
    """visible_at in the future means the page is not public yet. Mailing
    "your listing is live" with a URL that 404s is the one failure mode that
    makes this feature worse than sending nothing."""
    from app.models import CatalogTool

    with app.app_context():
        tool = CatalogTool.query.filter_by(submission_id=seeded).first()
        tool.visible_at = _now() + timedelta(days=5)
        db.session.commit()
        assert find_newly_live() == []


def test_a_null_visible_at_counts_as_live(app, seeded):
    """NULL means "no release delay", so those rows ARE live. They are the
    ones a naive `visible_at <= now` SQL filter drops on the floor, because
    NULL fails every comparison."""
    from app.models import CatalogTool

    with app.app_context():
        tool = CatalogTool.query.filter_by(submission_id=seeded).first()
        tool.visible_at = None
        db.session.commit()
        assert len(find_newly_live()) == 1


def test_a_hidden_catalog_row_is_not_a_candidate(app, seeded):
    from app.models import CatalogTool

    with app.app_context():
        tool = CatalogTool.query.filter_by(submission_id=seeded).first()
        tool.hidden = True
        db.session.commit()
        assert find_newly_live() == []


def test_an_already_announced_listing_is_not_a_candidate(app, seeded):
    from app.models import Submission

    with app.app_context():
        sub = db.session.get(Submission, seeded)
        sub.live_email_sent_at = _now()
        db.session.commit()
        assert find_newly_live() == []


def test_an_unapproved_submission_is_not_a_candidate(app, seeded):
    from app.models import Submission

    with app.app_context():
        sub = db.session.get(Submission, seeded)
        sub.status = "pending"
        db.session.commit()
        assert find_newly_live() == []


def test_owner_test_rows_are_skipped(app, seeded):
    """is_test rows are real catalog listings submitted by the owner for QA.
    Mailing ourselves burns a slot out of a 100/day shared budget."""
    from app.models import Submission

    with app.app_context():
        sub = db.session.get(Submission, seeded)
        sub.is_test = True
        db.session.commit()
        assert find_newly_live() == []


def test_a_dry_run_reports_without_stamping(app, seeded):
    from app.models import Submission

    with app.app_context():
        result = send_live_notifications(dry_run=True)
        assert result["candidates"] == 1
        assert result["sent"] == 0
        assert db.session.get(Submission, seeded).live_email_sent_at is None


def test_no_transport_defers_instead_of_stamping(app, seeded, monkeypatch):
    """Sending is suppressed under TESTING, so email_enabled() is False. The
    row must come back on the next run rather than being marked done — a stamp
    written for a message that never left is a founder who is never told."""
    from app.models import Submission

    with app.app_context():
        result = send_live_notifications()
        assert result["deferred"] == 1
        assert result["sent"] == 0
        assert db.session.get(Submission, seeded).live_email_sent_at is None
        # Still a candidate, which is the whole point of deferring.
        assert len(find_newly_live()) == 1


def test_a_successful_send_stamps_the_row_exactly_once(app, seeded, monkeypatch):
    from app.models import Submission

    sent = []

    with app.app_context():
        monkeypatch.setattr("app.email_utils.email_enabled", lambda: True)
        monkeypatch.setattr(
            "app.email_utils.send_email",
            lambda **kwargs: sent.append(kwargs) or True,
        )

        first = send_live_notifications()
        assert first["sent"] == 1
        assert len(sent) == 1
        assert db.session.get(Submission, seeded).live_email_sent_at is not None

        # The live URL is the entire payload of this email; an email that
        # announces a page without linking to it is not worth a send slot.
        assert "widget-ai" in sent[0]["text"]

        # A second run in the same window must mail nobody. The sweeper runs
        # from a cron against a free instance that sleeps, so a double run is
        # the normal case, not the exotic one.
        second = send_live_notifications()
        assert second["candidates"] == 0
        assert second["sent"] == 0
        assert len(sent) == 1


def test_a_failed_send_leaves_the_row_retryable(app, seeded, monkeypatch):
    from app.models import Submission

    with app.app_context():
        monkeypatch.setattr("app.email_utils.email_enabled", lambda: True)
        monkeypatch.setattr("app.email_utils.send_email", lambda **kwargs: False)

        result = send_live_notifications()
        assert result["failed"] == 1
        assert result["sent"] == 0
        assert db.session.get(Submission, seeded).live_email_sent_at is None
        assert len(find_newly_live()) == 1
