"""Admin → Tier Breakdown tab.

Read-only reporting endpoint: counts of live catalog listings and pending
submissions grouped by our submission pricing ladder (Free / Quick Review
/ Fast-Track Sponsored). No schema change — tier is derived from
Submission.pricing_model + payment_status (pricing_tiers.effective_tier)
and, for live rows, the CatalogTool.submission_id back-link.

Runs on its own function-scoped app + DB for the same isolation reason as
test_submissions_and_digest.py (a long-lived read txn on the shared
session fixture bleeds across tests).
"""
import json
import os
import tempfile

import pytest

from app import create_app, db
from app.models import CatalogTool, Submission, User
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
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client(app):
    return app.test_client()


def _login_as_admin(client, app, email="admin-tier@t.test"):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


def _add_submission(app, name, pricing_model, payment_status, status="pending"):
    with app.app_context():
        s = Submission(
            name=name,
            website=f"https://{name.replace(' ', '').lower()}.example.com",
            category="Productivity",
            description="A tool.",
            pricing_model=pricing_model,
            status=status,
            payment_status=payment_status,
        )
        db.session.add(s)
        db.session.commit()
        return s.id


def _seed_catalog_tool(slug, name, *, sponsored=False, submission_id=None, hidden=False):
    data = {
        "slug": slug,
        "name": name,
        "category": "Productivity",
        "tagline": f"{name} tagline",
        "link": f"https://{slug}.example.com",
        "sponsored": sponsored,
    }
    db.session.add(CatalogTool(
        slug=slug, name=name, category="Productivity",
        hidden=hidden, submission_id=submission_id, data=json.dumps(data),
    ))


def test_tier_breakdown_requires_admin(client):
    assert client.get("/api/v1/admin/tier-breakdown").status_code in (401, 403)


def test_pending_submissions_grouped_by_effective_tier(client, app):
    # 3 free, 2 quick (verified), 1 sponsored (verified)
    _add_submission(app, "Free A", "free", "unpaid")
    _add_submission(app, "Free B", "free", "unpaid")
    _add_submission(app, "Free C", "free", "unpaid")
    _add_submission(app, "Quick A", "quick_paypal:Q1", "verified")
    _add_submission(app, "Quick B", "quick_paypal:Q2", "verified")
    _add_submission(app, "Sponsored A", "sponsored_paypal:S1", "verified")
    # An approved one must NOT count as pending queue depth.
    _add_submission(app, "Old Quick", "quick_paypal:Q3", "verified", status="approved")

    with app.app_context():
        refresh_tools_cache()
    _login_as_admin(client, app)

    body = client.get("/api/v1/admin/tier-breakdown").get_json()
    assert body["pending"] == {"free": 3, "quick": 2, "sponsored": 1}
    assert body["pending_total"] == 6


def test_unverified_paid_claim_counts_as_free(client, app):
    _add_submission(app, "Claim Sponsored", "sponsored_paypal:X1", "unverified_review")
    _add_submission(app, "Claim Quick", "quick_paypal:X2", "unverified_review")

    with app.app_context():
        refresh_tools_cache()
    _login_as_admin(client, app)

    body = client.get("/api/v1/admin/tier-breakdown").get_json()
    assert body["pending"] == {"free": 2, "quick": 0, "sponsored": 0}


def test_live_listings_grouped_by_tier(client, app):
    quick_sub = _add_submission(app, "Quick Live", "quick_paypal:LQ", "verified", status="approved")
    free_sub = _add_submission(app, "Free Live", "free", "unpaid", status="approved")

    with app.app_context():
        CatalogTool.query.delete()
        db.session.commit()
        _seed_catalog_tool("spon-tool", "Spon Tool", sponsored=True)
        _seed_catalog_tool("quick-tool", "Quick Tool", submission_id=quick_sub)
        _seed_catalog_tool("free-tool", "Free Tool", submission_id=free_sub)
        _seed_catalog_tool("seed-tool-1", "Seed Tool 1")
        _seed_catalog_tool("seed-tool-2", "Seed Tool 2")
        db.session.commit()
        refresh_tools_cache()

    _login_as_admin(client, app)
    body = client.get("/api/v1/admin/tier-breakdown").get_json()

    assert body["live"] == {"free": 1, "quick": 1, "sponsored": 1, "editorial": 2}
    assert body["live_total"] == 5


def test_hidden_and_unreleased_tools_excluded_from_live(client, app):
    from datetime import datetime, timezone, timedelta

    with app.app_context():
        CatalogTool.query.delete()
        db.session.commit()
        _seed_catalog_tool("visible-seed", "Visible Seed")
        _seed_catalog_tool("hidden-seed", "Hidden Seed", hidden=True)
        future = CatalogTool(
            slug="future-seed", name="Future Seed", category="Productivity",
            hidden=False,
            visible_at=datetime.now(timezone.utc) + timedelta(days=5),
            data=json.dumps({"slug": "future-seed", "name": "Future Seed",
                             "category": "Productivity", "sponsored": False}),
        )
        db.session.add(future)
        db.session.commit()
        refresh_tools_cache()

    _login_as_admin(client, app)
    body = client.get("/api/v1/admin/tier-breakdown").get_json()

    # Only the one genuinely-visible seed row is counted.
    assert body["live"] == {"free": 0, "quick": 0, "sponsored": 0, "editorial": 1}
    assert body["live_total"] == 1
