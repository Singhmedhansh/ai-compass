"""Launch Day: a date the founder picks, not a flag we flip (app/launch_day.py).

Nothing new is sold here — it is the scheduling of what Fast-Track and
Reviewed already include. What these tests pin is that the scheduling is
honest:

  * one launch a day, because concentration is the entire product;
  * never earlier than the tier's own release delay, so a date cannot be
    used to buy past it;
  * movable until it fires and fixed afterwards, because a launch that
    happened is a fact rather than a preference;
  * the listing goes live ON the day — announcing a page nobody can open yet
    is announcing a 404;
  * and the rail window starts from the launch date, so the perk is not
    spent days before the founder's own audience is looking.
"""
import json
import os
import tempfile
from datetime import date, datetime, timedelta, timezone

import pytest

from app import create_app, db, launch_day, sponsorship
from app.models import CatalogTool, CommunityPost, Submission, User
from app.tool_cache import refresh_tools_cache


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    refresh_tools_cache()
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client(app):
    return app.test_client()


def _listing(slug="launch-tool", name="Launch Tool", *,
             pricing_model="sponsored_paypal:L1", payment_status="verified",
             approved_days_ago=0, founder_email=None):
    approved = datetime.now(timezone.utc) - timedelta(days=approved_days_ago)
    user_id = None
    if founder_email:
        user = User(email=founder_email)
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    sub = Submission(
        name=name, website=f"https://{slug}.example.com", category="Productivity",
        description="A listing.", pricing_model=pricing_model, status="approved",
        payment_status=payment_status, submitter_email="founder@example.com",
        approved_at=approved.replace(tzinfo=None), founder_user_id=user_id,
    )
    db.session.add(sub)
    db.session.commit()

    db.session.add(CatalogTool(
        slug=slug, name=name, category="Productivity", hidden=False,
        submission_id=sub.id,
        visible_at=(approved + timedelta(days=1)).replace(tzinfo=None),
        data=json.dumps({"slug": slug, "name": name, "category": "Productivity",
                         "link": f"https://{slug}.example.com", "sponsored": True}),
    ))
    db.session.commit()
    refresh_tools_cache()
    return sub


def _in_days(n):
    return (date.today() + timedelta(days=n)).isoformat()


# --- who can book -----------------------------------------------------------


def test_a_paid_placement_tier_can_book_a_launch(app):
    with app.app_context():
        sub = _listing()
        booked, err = launch_day.schedule(sub, _in_days(10))
        assert err is None
        assert booked.isoformat() == _in_days(10)
        assert launch_day.status(sub)["launch_at"] == _in_days(10)


def test_a_free_listing_cannot(app):
    with app.app_context():
        sub = _listing(pricing_model="free", payment_status="unpaid")
        assert launch_day.is_eligible(sub) is False
        assert launch_day.schedule(sub, _in_days(10))[1] == "tier_not_eligible"
        assert launch_day.status(sub) is None


def test_an_unverified_paid_claim_cannot(app):
    with app.app_context():
        sub = _listing(payment_status="unverified_review")
        assert launch_day.schedule(sub, _in_days(10))[1] == "tier_not_eligible"


# --- the rules on the date --------------------------------------------------


def test_only_one_launch_runs_per_day(app):
    """Two launches sharing a day halve the thing being sold."""
    with app.app_context():
        first = _listing(slug="first-tool", name="First Tool")
        second = _listing(slug="second-tool", name="Second Tool",
                          pricing_model="reviewed_paypal:L2")

        assert launch_day.schedule(first, _in_days(14))[1] is None
        assert launch_day.schedule(second, _in_days(14))[1] == "date_taken"
        # …and the next day is still free.
        assert launch_day.schedule(second, _in_days(15))[1] is None


def test_a_launch_can_be_booked_from_today_now_that_nothing_is_held_back(app):
    """earliest_date() is still floored at the tier's release delay — that
    floor is what stops a date being a way to buy past the delay. The delays
    are all 0 now, so the floor is simply today, and a founder can launch the
    day they are approved.

    Yesterday is still refused, which is the part of the rule that was ever
    load-bearing: a launch date is a commitment about the future."""
    with app.app_context():
        sub = _listing()  # approved just now
        assert launch_day.schedule(sub, date.today().isoformat())[1] is None

    with app.app_context():
        other = _listing(slug="past-tool", name="Past Tool",
                         pricing_model="reviewed_paypal:PAST")
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        assert launch_day.schedule(other, yesterday)[1] == "too_early"


def test_a_date_beyond_the_horizon_is_refused(app):
    with app.app_context():
        sub = _listing()
        far = (date.today() + timedelta(days=launch_day.MAX_LEAD_DAYS + 5)).isoformat()
        assert launch_day.schedule(sub, far)[1] == "too_far_out"


def test_availability_only_offers_dates_we_can_honour(app):
    with app.app_context():
        first = _listing(slug="first-tool", name="First Tool")
        second = _listing(slug="second-tool", name="Second Tool",
                          pricing_model="reviewed_paypal:L2")
        launch_day.schedule(first, _in_days(9))

        slots = {row["date"]: row["available"] for row in launch_day.availability(second)}
        assert slots[_in_days(9)] is False
        assert slots[_in_days(10)] is True
        # Today is offered now that no tier is held back after approval. The
        # rule has not changed — availability still starts at earliest_date()
        # — the floor has just moved to today.
        assert slots[date.today().isoformat()] is True


# --- moving and cancelling --------------------------------------------------


def test_a_founder_can_move_a_launch_that_has_not_fired(app):
    with app.app_context():
        sub = _listing()
        launch_day.schedule(sub, _in_days(10))
        assert launch_day.schedule(sub, _in_days(20))[1] is None
        assert launch_day.status(sub)["launch_at"] == _in_days(20)
        # The old date is free again.
        assert _in_days(10) not in launch_day.taken_dates()


def test_a_launch_that_already_fired_cannot_be_moved(app):
    """A launch that happened is a fact, not a preference."""
    with app.app_context():
        sub = _listing()
        launch_day.schedule(sub, _in_days(2))
        sub.launched_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.session.commit()

        assert launch_day.schedule(sub, _in_days(20))[1] == "already_launched"
        assert launch_day.cancel(sub) == "already_launched"
        assert launch_day.status(sub)["can_change"] is False


def test_cancelling_returns_the_listing_to_the_ordinary_schedule(app):
    """A founder who cannot unbook is a founder who will not book."""
    with app.app_context():
        sub = _listing()
        launch_day.schedule(sub, _in_days(30))
        assert launch_day.cancel(sub) is None
        assert sub.launch_at is None

        row = CatalogTool.query.filter_by(submission_id=sub.id).one()
        # Back to approval + the tier's 1-day delay, not the launch date.
        assert row.visible_at.date() <= date.today() + timedelta(days=1)


# --- what booking actually changes ------------------------------------------


def test_the_listing_goes_live_on_the_day_not_before(app):
    """Announcing a page nobody can open yet is announcing a 404."""
    with app.app_context():
        sub = _listing()
        launch_day.schedule(sub, _in_days(12))
        row = CatalogTool.query.filter_by(submission_id=sub.id).one()
        assert row.visible_at.date().isoformat() == _in_days(12)


def test_the_rail_window_starts_from_the_launch_date(app):
    """Otherwise the perk is spent days before the founder's own audience is
    looking for it."""
    with app.app_context():
        sub = _listing(approved_days_ago=0)
        launch_day.schedule(sub, _in_days(5))

        window = sponsorship.complimentary_window(sub)
        assert window is not None
        starts, _ends = window
        assert starts.date().isoformat() == _in_days(5)


# --- firing -----------------------------------------------------------------


def test_firing_stamps_the_launch_and_writes_one_showcase_post(app):
    with app.app_context():
        sub = _listing(founder_email="maker@example.com")
        launch_day.schedule(sub, _in_days(2))
        # Move the clock forward by moving the date back, which is the only
        # part of this the test can control.
        sub.launch_at = (datetime.now(timezone.utc) - timedelta(hours=1)).replace(tzinfo=None)
        db.session.commit()

        fired = launch_day.fire_due_launches()
        assert fired == ["launch-tool"]
        assert Submission.query.get(sub.id).launched_at is not None

        posts = CommunityPost.query.filter_by(tool_slug="launch-tool").all()
        assert len(posts) == 1
        assert posts[0].post_type == "showcase"
        assert posts[0].user_id == sub.founder_user_id

        # Idempotent: a second tick fires nothing and writes nothing.
        assert launch_day.fire_due_launches() == []
        assert CommunityPost.query.filter_by(tool_slug="launch-tool").count() == 1


def test_no_founder_account_means_no_post_in_their_name(app):
    """We do not put words in a stranger's mouth."""
    with app.app_context():
        sub = _listing()  # no founder_user_id
        sub.launch_at = (datetime.now(timezone.utc) - timedelta(hours=1)).replace(tzinfo=None)
        db.session.commit()

        assert launch_day.fire_due_launches() == ["launch-tool"]
        assert CommunityPost.query.count() == 0


def test_a_future_launch_does_not_fire(app):
    with app.app_context():
        sub = _listing()
        launch_day.schedule(sub, _in_days(5))
        assert launch_day.fire_due_launches() == []
        assert Submission.query.get(sub.id).launched_at is None


# --- the endpoint -----------------------------------------------------------


def test_the_endpoint_books_and_cancels_for_the_listing_owner(client, app):
    with app.app_context():
        sub = _listing(founder_email="maker@example.com")
        sub_id, owner_id = sub.id, sub.founder_user_id

    with client.session_transaction() as sess:
        sess.clear()
        sess["_user_id"] = str(owner_id)
        sess["_fresh"] = True

    resp = client.post(f"/api/v1/launch?submission_id={sub_id}", json={"date": _in_days(11)})
    assert resp.status_code == 200, resp.get_json()
    assert resp.get_json()["launch"]["launch_at"] == _in_days(11)

    body = client.get(f"/api/v1/launch?submission_id={sub_id}").get_json()
    assert body["launch"]["launch_at"] == _in_days(11)
    assert any(row["date"] == _in_days(12) for row in body["availability"])

    # No date cancels.
    resp = client.post(f"/api/v1/launch?submission_id={sub_id}", json={})
    assert resp.status_code == 200
    assert resp.get_json()["launch"]["launch_at"] is None


def test_a_stranger_cannot_book_someone_elses_launch(client, app):
    with app.app_context():
        sub = _listing(founder_email="maker@example.com")
        sub_id = sub.id
        stranger = User(email="stranger@example.com")
        db.session.add(stranger)
        db.session.commit()
        stranger_id = stranger.id

    with client.session_transaction() as sess:
        sess.clear()
        sess["_user_id"] = str(stranger_id)
        sess["_fresh"] = True

    resp = client.post(f"/api/v1/launch?submission_id={sub_id}", json={"date": _in_days(11)})
    assert resp.status_code == 403
    with app.app_context():
        assert Submission.query.get(sub_id).launch_at is None


# --- telling the founder it exists ------------------------------------------


def _submit_paid(client, monkeypatch, pricing_model="sponsored_paypal", **overrides):
    import app.email_utils as email_utils_mod
    import app.payments as payments_mod

    monkeypatch.setattr("app.api_routes.is_rate_limited", lambda *a, **k: False)
    monkeypatch.setattr(
        payments_mod, "verify_paypal_order",
        lambda order_id, expected_amount=None, expected_currency="USD": (True, "paypal_order_verified"),
    )
    sent = []
    monkeypatch.setattr(
        email_utils_mod, "send_email",
        lambda **kwargs: sent.append(kwargs) or True,
    )

    payload = {
        "name": "Invoice Tool",
        "url": "https://invoicetool.example.com",
        "category": "Productivity",
        "reason": "Checking what the invoice says.",
        "submitter_email": "buyer@invoicetool.example.com",
        "pricing_model": pricing_model,
        "transaction_ref": "LAUNCH-TX-0001",
    }
    payload.update(overrides)
    resp = client.post("/api/v1/submit-tool", json=payload)
    return resp, sent


def test_the_invoice_tells_a_paid_founder_to_pick_a_date(client, app, monkeypatch):
    """Left to the dashboard alone it goes unbooked — and a perk nobody books
    is one that was paid for and never delivered."""
    resp, sent = _submit_paid(client, monkeypatch)
    assert resp.status_code in (200, 201), resp.get_json()

    invoice = next((m for m in sent if m.get("to") == "buyer@invoicetool.example.com"), None)
    assert invoice is not None
    assert "Launch Day" in invoice["html"]
    assert "one launch a day" in invoice["html"]
    assert "Launch Day" in invoice["text"]


def test_a_free_listing_is_not_told_about_a_launch_it_cannot_book(client, app, monkeypatch):
    _resp, sent = _submit_paid(
        client, monkeypatch, pricing_model="free", transaction_ref="",
        submitter_email="free@invoicetool.example.com",
    )
    for message in sent:
        assert "Launch Day" not in (message.get("html") or "")
