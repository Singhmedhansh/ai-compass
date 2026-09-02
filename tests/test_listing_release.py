"""Releasing listings from their staggered-release delay.

The endpoint publishes things. The tests that matter are therefore not "does
it work" but "what can it NOT publish": a rejected submission, a hidden row,
and anything an admin has not approved. Releasing a queue must never quietly
become approving one.
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import db


def _now():
    return datetime.now(timezone.utc)


def _login_as_admin(client, app, email=None):
    """A fresh admin per test.

    The `app` fixture is session-scoped, so its User table outlives each test
    - a fixed address makes every test after the first fail on the unique
    email constraint rather than on anything it was written to check.
    """
    from app.models import User

    email = email or f"release-admin-{uuid.uuid4().hex[:8]}@t.test"

    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


def _seed(app, name, slug, *, status="approved", hidden=False, days_out=5):
    """A submission plus its catalog row, held back `days_out` days."""
    from app.models import CatalogTool, Submission

    with app.app_context():
        sub = Submission(
            name=name,
            website=f"https://{slug}.example",
            category="Coding",
            description="A tool.",
            pricing_model="free",
            submitter_email=f"{slug}@example.com",
            status=status,
            payment_status="unpaid",
        )
        db.session.add(sub)
        db.session.commit()

        tool = CatalogTool(
            slug=slug,
            name=name,
            category="Coding",
            hidden=hidden,
            visible_at=(_now() + timedelta(days=days_out)) if days_out is not None else None,
            data="{}",
            submission_id=sub.id,
        )
        db.session.add(tool)
        db.session.commit()
        return sub.id


def _visible_at(app, slug):
    from app.models import CatalogTool

    with app.app_context():
        return CatalogTool.query.filter_by(slug=slug).first().visible_at


@pytest.fixture(autouse=True)
def _admin(client, app):
    _login_as_admin(client, app)


def test_a_waiting_listing_is_published(client, app):
    _seed(app, "Waiting Tool", "waiting-tool")
    res = client.post("/api/v1/admin/listings/release")
    assert res.status_code == 200
    assert res.get_json()["released"] == ["waiting-tool"]
    # NULL, not now(): "no release delay" is a state every reader already
    # understands, whereas a timestamp is a comparison that can go wrong later.
    assert _visible_at(app, "waiting-tool") is None


def test_a_rejected_submission_is_never_published(client, app):
    """A catalog row can outlive a rejected submission. "Release the queue"
    must not become "publish the rejects"."""
    _seed(app, "Rejected Tool", "rejected-tool", status="rejected")
    res = client.post("/api/v1/admin/listings/release")
    assert res.get_json()["released"] == []
    assert _visible_at(app, "rejected-tool") is not None


def test_an_unreviewed_submission_is_never_published(client, app):
    _seed(app, "Pending Tool", "pending-tool", status="pending")
    res = client.post("/api/v1/admin/listings/release")
    assert res.get_json()["released"] == []
    assert _visible_at(app, "pending-tool") is not None


def test_a_hidden_row_stays_hidden(client, app):
    """Hidden is a deliberate admin decision. Publishing over it would undo a
    choice a person made, which is the opposite of unblocking a queue."""
    _seed(app, "Hidden Tool", "hidden-tool", hidden=True)
    res = client.post("/api/v1/admin/listings/release")
    assert res.get_json()["released"] == []
    assert _visible_at(app, "hidden-tool") is not None


def test_an_already_live_listing_is_left_alone(client, app):
    """Not an error, but it must not be reported as released - the count is
    what the admin reads to know what just happened."""
    _seed(app, "Live Tool", "live-tool", days_out=None)
    res = client.post("/api/v1/admin/listings/release")
    assert res.get_json()["count"] == 0


def test_one_slug_can_be_released_on_its_own(client, app):
    _seed(app, "Alpha Tool", "alpha-tool")
    _seed(app, "Beta Tool", "beta-tool")
    res = client.post("/api/v1/admin/listings/release?slug=alpha-tool")
    assert res.get_json()["released"] == ["alpha-tool"]
    assert _visible_at(app, "alpha-tool") is None
    assert _visible_at(app, "beta-tool") is not None


def test_a_non_admin_is_refused(client, app):
    _seed(app, "Guarded Tool", "guarded-tool")
    with client.session_transaction() as sess:
        sess.clear()
    res = client.post("/api/v1/admin/listings/release")
    assert res.status_code in (401, 403, 302)
    assert _visible_at(app, "guarded-tool") is not None


def test_released_listings_become_go_live_email_candidates(client, app):
    """The two features are one workflow: publishing a backlog is only useful
    if the founders then hear about it."""
    from app.listing_live import find_newly_live

    _seed(app, "Chained Tool", "chained-tool")
    with app.app_context():
        assert find_newly_live() == []

    client.post("/api/v1/admin/listings/release")

    with app.app_context():
        assert [t.slug for _s, t in find_newly_live()] == ["chained-tool"]


# --- catalog rows whose submission_id was never set -------------------------
#
# CatalogTool.submission_id is a soft back-reference added after the table
# existed, so every approval before it produced a live catalog row with a NULL
# submission_id. The admin Listings join could not see those and reported them
# as "approved but never published" - the most alarming label in the table, and
# false: the tools were live and serving the whole time.


def _orphan(app, name, slug):
    """An approved submission plus a LIVE catalog row that is not linked to it."""
    from app.models import CatalogTool, Submission

    with app.app_context():
        sub = Submission(
            name=name,
            website=f"https://{slug}.example",
            category="Other",
            description="A tool.",
            pricing_model="free",
            submitter_email=f"{slug}@example.com",
            status="approved",
            payment_status="unpaid",
        )
        db.session.add(sub)
        db.session.commit()

        db.session.add(CatalogTool(
            slug=slug,
            name=name,
            category="Other",
            hidden=False,
            visible_at=None,
            data="{}",
            submission_id=None,   # the whole point
        ))
        db.session.commit()
        return sub.id


def _row_for(client, submission_id):
    body = client.get("/api/v1/admin/listings").get_json()
    return next(r for r in body["listings"] if r["submission_id"] == submission_id)


def test_an_unlinked_catalog_row_is_reported_as_live_not_as_unpublished(client, app):
    sub_id = _orphan(app, "Ask My Wardrobe", "ask-my-wardrobe")
    row = _row_for(client, sub_id)
    assert row["is_live"] is True
    assert row["live_blocker"] is None
    assert row["slug"] == "ask-my-wardrobe"


def test_a_submission_with_genuinely_no_catalog_row_still_reports_unpublished(client, app):
    """The fallback must not paper over the real failure it was masking."""
    from app.models import Submission

    with app.app_context():
        sub = Submission(
            name="Never Published Tool",
            website="https://nope.example",
            category="Other",
            description="A tool.",
            pricing_model="free",
            submitter_email="nope@example.com",
            status="approved",
            payment_status="unpaid",
        )
        db.session.add(sub)
        db.session.commit()
        sub_id = sub.id

    row = _row_for(client, sub_id)
    assert row["is_live"] is False
    assert row["live_blocker"] == "approved_but_no_catalog_row"


def test_releasing_repairs_the_missing_submission_link(client, app):
    """Recomputing the slug fallback on every page load works but leaves the
    data wrong forever - and every other consumer (the founder dashboard,
    listing_live's join, the complimentary window) reads submission_id."""
    from app.models import CatalogTool

    sub_id = _orphan(app, "Reclip", "reclip")

    res = client.post("/api/v1/admin/listings/release")
    assert "reclip" in res.get_json()["relinked"]

    with app.app_context():
        assert CatalogTool.query.filter_by(slug="reclip").one().submission_id == sub_id


def test_a_repaired_listing_becomes_a_go_live_email_candidate(client, app):
    """This is what the broken link actually cost: listing_live joins on
    submission_id, so an unlinked listing could never be announced to its
    founder no matter how long it had been live."""
    from app.listing_live import find_newly_live

    _orphan(app, "Unlinked Tool", "unlinked-tool")
    with app.app_context():
        assert find_newly_live() == []

    client.post("/api/v1/admin/listings/release")

    with app.app_context():
        assert [t.slug for _s, t in find_newly_live()] == ["unlinked-tool"]
