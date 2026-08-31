"""The monthly listing report, pushed to the founder (app/founder_report.py).

Nobody visits a dashboard for a directory listing, so the numbers go to
them. What these tests pin is who gets it and what it is allowed to say:

  * verified paid listings only — the report IS the paid deliverable, and
    mailing the same numbers to free listings gives away what the tier sells;
  * never before the listing is actually live, because "0 views" about a
    page nobody could visit reads as a broken product, not an honest number;
  * the real figures, including the small ones, with the previous window
    beside them;
  * through the shared Resend budget, giving back what it does not use.
"""
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

import app.founder_report as fr
from app import create_app, db
from app.models import CatalogTool, OutboundClick, Submission, ToolPageView
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


@pytest.fixture(autouse=True)
def _capture_sends(monkeypatch):
    sent = []
    monkeypatch.setattr(
        fr, "send_email",
        lambda to, subject, html, text=None, **kw: (sent.append({
            "to": to, "subject": subject, "html": html, "text": text,
        }), True)[1],
    )
    return sent


def _listing(slug="paid-tool", name="Paid Tool", *, pricing_model="sponsored_paypal:OK1",
             payment_status="verified", status="approved", visible_at=None,
             email="founder@example.com", is_test=False):
    sub = Submission(
        name=name, website=f"https://{slug}.example.com", category="Productivity",
        description="A listing.", pricing_model=pricing_model, status=status,
        payment_status=payment_status, submitter_email=email, is_test=is_test,
    )
    db.session.add(sub)
    db.session.commit()

    row = CatalogTool(
        slug=slug, name=name, category="Productivity", hidden=False,
        submission_id=sub.id,
        data=json.dumps({"slug": slug, "name": name, "category": "Productivity",
                         "link": f"https://{slug}.example.com", "sponsored": True}),
    )
    if visible_at is not None:
        row.visible_at = visible_at.replace(tzinfo=None)
    db.session.add(row)
    db.session.commit()
    refresh_tools_cache()
    return sub, row


def _activity(slug, views=0, clicks=0, days_ago=3):
    when = (datetime.now(timezone.utc) - timedelta(days=days_ago)).replace(tzinfo=None)
    for _ in range(views):
        db.session.add(ToolPageView(slug=slug, created_at=when))
    for _ in range(clicks):
        db.session.add(OutboundClick(slug=slug, created_at=when))
    db.session.commit()


# --- who gets one -----------------------------------------------------------


def test_a_verified_paid_live_listing_gets_a_report(app, _capture_sends):
    with app.app_context():
        _listing()
        _activity("paid-tool", views=12, clicks=4)

        result = fr.run_reports()
        assert result["status"] == "sent"
        assert result["delivered"] == 1
        assert _capture_sends[0]["to"] == "founder@example.com"
        assert "4 clicks" in _capture_sends[0]["subject"]


def test_a_free_listing_gets_nothing(app, _capture_sends):
    """The report is what the paid tier sells. Mailing the same numbers to a
    free listing gives it away."""
    with app.app_context():
        _listing(slug="free-tool", pricing_model="free", payment_status="unpaid")
        _activity("free-tool", views=30, clicks=9)

        assert fr.run_reports()["status"] == "noop"
        assert _capture_sends == []


def test_an_unverified_paid_claim_gets_nothing(app, _capture_sends):
    with app.app_context():
        _listing(slug="claimed-tool", pricing_model="sponsored_paypal:X",
                 payment_status="unverified_review")
        _activity("claimed-tool", views=30, clicks=9)

        assert fr.run_reports()["status"] == "noop"
        assert _capture_sends == []


def test_a_listing_still_inside_its_release_delay_gets_nothing(app, _capture_sends):
    """"0 views" about a page nobody could have visited reads as a broken
    product rather than an honest number."""
    with app.app_context():
        _listing(slug="pending-tool",
                 visible_at=datetime.now(timezone.utc) + timedelta(days=5))
        assert fr.run_reports()["status"] == "noop"
        assert _capture_sends == []


def test_owner_test_rows_are_excluded(app, _capture_sends):
    with app.app_context():
        _listing(slug="qa-tool", is_test=True)
        _activity("qa-tool", views=5, clicks=2)
        assert fr.run_reports()["status"] == "noop"


def test_a_month_with_nothing_at_all_to_say_is_not_mailed(app, _capture_sends):
    with app.app_context():
        _listing(slug="silent-tool")
        assert fr.run_reports()["status"] == "noop"
        assert _capture_sends == []


def test_force_sends_even_an_empty_month(app, _capture_sends):
    with app.app_context():
        _listing(slug="silent-tool")
        result = fr.run_reports(force=True)
        assert result["status"] == "sent"
        assert result["delivered"] == 1


# --- what it says -----------------------------------------------------------


def test_the_report_quotes_the_previous_window_beside_the_current_one(app):
    with app.app_context():
        sub, row = _listing()
        _activity("paid-tool", views=10, clicks=3, days_ago=5)     # this window
        _activity("paid-tool", views=4, clicks=1, days_ago=40)     # the one before

        report = fr.build_report(sub, row)
        assert report["views"] == 10
        assert report["clicks"] == 3
        assert report["prev_views"] == 4
        assert report["prev_clicks"] == 1
        assert report["views_delta"] == 6
        assert report["ctr"] == 30.0


def test_no_views_reports_no_ctr_rather_than_zero_percent(app):
    """"0% click-through" and "nobody has looked yet" are different facts."""
    with app.app_context():
        sub, row = _listing()
        report = fr.build_report(sub, row)
        assert report["views"] == 0
        assert report["ctr"] is None


def test_a_small_month_still_sends_with_the_real_number(app, _capture_sends):
    """Not a highlight reel: a report that only arrives in good months is one
    nobody can plan against."""
    with app.app_context():
        _listing()
        _activity("paid-tool", views=2, clicks=0)

        assert fr.run_reports()["status"] == "sent"
        html = _capture_sends[0]["html"]
        assert ">2<" in html          # the honest view count
        assert "2 views" in _capture_sends[0]["subject"]


def test_the_email_links_the_dashboard_and_the_listing(app, _capture_sends):
    with app.app_context():
        sub, _row = _listing()
        _activity("paid-tool", views=3, clicks=1)
        fr.run_reports()

    text = _capture_sends[0]["text"]
    assert f"/dashboard/submission?submission_id={sub.id}" in text
    assert "/tools/paid-tool" in text
    assert "Unsubscribe" in text


# --- the shared send budget -------------------------------------------------


def test_reports_respect_the_shared_send_budget(app, _capture_sends, monkeypatch):
    """One mail path ignoring the budget is one that can silently starve the
    paths that respect it."""
    import app.send_budget as sb

    with app.app_context():
        for i in range(3):
            _listing(slug=f"paid-{i}", name=f"Paid {i}", pricing_model=f"sponsored_paypal:OK{i}",
                     email=f"founder{i}@example.com")
            _activity(f"paid-{i}", views=5, clicks=1)

        monkeypatch.setattr(sb, "reserve_send_slots",
                            lambda n, requester="unknown", day=None: {"granted": 1})
        released = []
        monkeypatch.setattr(sb, "release_send_slots",
                            lambda n, requester="unknown", day=None: released.append(n))

        result = fr.run_reports()
        assert result["delivered"] == 1
        assert result["deferred"] == 2
        assert released == []  # the one slot granted was used


def test_an_exhausted_budget_defers_instead_of_dropping(app, _capture_sends, monkeypatch):
    import app.send_budget as sb

    with app.app_context():
        _listing()
        _activity("paid-tool", views=5, clicks=1)
        monkeypatch.setattr(sb, "reserve_send_slots",
                            lambda n, requester="unknown", day=None: {"granted": 0})

        result = fr.run_reports()
        assert result["status"] == "deferred"
        assert _capture_sends == []


# --- the trigger ------------------------------------------------------------


def test_the_admin_trigger_needs_the_shared_secret(app, monkeypatch):
    client = app.test_client()
    monkeypatch.setenv("DIGEST_SECRET", "s3cret")

    assert client.post("/api/v1/admin/send-founder-reports").status_code == 401
    resp = client.post("/api/v1/admin/send-founder-reports?dry_run=1",
                       headers={"X-Digest-Secret": "s3cret"})
    assert resp.status_code == 200
    assert resp.get_json()["status"] in ("noop", "dry_run")
