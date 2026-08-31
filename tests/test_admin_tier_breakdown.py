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


def _add_submission(app, name, pricing_model, payment_status, status="pending",
                    payment_note=None):
    with app.app_context():
        s = Submission(
            name=name,
            website=f"https://{name.replace(' ', '').lower()}.example.com",
            category="Productivity",
            description="A tool.",
            pricing_model=pricing_model,
            status=status,
            payment_status=payment_status,
            payment_note=payment_note,
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


def test_paid_attempts_are_reported_even_though_tiers_show_them_as_free(client, app):
    """The reporting gap that made a broken checkout look like a pricing
    problem. effective_tier() folds every unverified paid claim into "free",
    so the tier counts said "everyone picks free" while what had actually
    happened was that no payment could be verified at all. Attempts must be
    counted separately from entitlement."""
    _add_submission(app, "Genuinely Free", "free", "unpaid")
    _add_submission(app, "Paid OK", "sponsored_paypal:V1", "verified",
                    payment_note="paypal_order_verified")
    _add_submission(app, "Outage Victim", "sponsored_paypal:M1", "needs_manual_review",
                    payment_note="indeterminate:paypal_api_unreachable ref=M1")
    _add_submission(app, "Also Outage", "quick_paypal:M2", "needs_manual_review",
                    payment_note="indeterminate:paypal_api_unreachable ref=M2")
    _add_submission(app, "Bogus Claim", "quick_paypal:R1", "unverified_review",
                    payment_note="refused:order_status_VOIDED ref=R1")
    _add_submission(app, "Never Paid", "sponsored_paypal", "unverified_review",
                    payment_note="refused:missing_reference")

    with app.app_context():
        refresh_tools_cache()
    _login_as_admin(client, app)

    body = client.get("/api/v1/admin/tier-breakdown").get_json()

    # Entitlement view is unchanged: only the verified one is a paid tier.
    assert body["pending"]["sponsored"] == 1
    assert body["pending"]["free"] == 5

    a = body["attempts"]
    assert a["total"] == 5, "the free submission is not a paid attempt"
    assert a["verified"] == 1
    assert a["needs_manual_review"] == 2
    assert a["refused"] == 1
    # An abandoned checkout is not a refusal and must not inflate it.
    assert a["no_reference"] == 1
    assert a["revenue_usd"] == 49.99

    reasons = {r["reason"]: r["count"] for r in body["failure_reasons"]}
    assert reasons["paypal_api_unreachable"] == 2
    assert reasons["order_status_VOIDED"] == 1
    assert reasons["missing_reference"] == 1
    # A verified payment is not a failure.
    assert "paypal_order_verified" not in reasons
    # Most common first, so the top row is what to fix next.
    assert body["failure_reasons"][0]["reason"] == "paypal_api_unreachable"


def test_paid_attempts_tolerate_legacy_payment_notes(client, app):
    """Rows predating the refused/indeterminate split hold a bare reason or
    nothing at all. Parsing must not assume the newer "outcome:reason ref=x"
    shape — the historical rows are exactly the ones worth counting."""
    _add_submission(app, "Legacy Bare", "sponsored_paypal:L1", "unverified_review",
                    payment_note="paypal_credentials_not_configured")
    _add_submission(app, "Legacy Empty", "sponsored_paypal:L2", "unverified_review",
                    payment_note=None)

    with app.app_context():
        refresh_tools_cache()
    _login_as_admin(client, app)

    body = client.get("/api/v1/admin/tier-breakdown").get_json()
    assert body["attempts"]["total"] == 2
    assert body["attempts"]["refused"] == 2
    reasons = {r["reason"]: r["count"] for r in body["failure_reasons"]}
    assert reasons["paypal_credentials_not_configured"] == 1
    assert reasons["unknown"] == 1


def test_paid_attempts_are_zero_when_nobody_has_tried(client, app):
    _add_submission(app, "Only Free", "free", "unpaid")

    with app.app_context():
        refresh_tools_cache()
    _login_as_admin(client, app)

    body = client.get("/api/v1/admin/tier-breakdown").get_json()
    assert body["attempts"]["total"] == 0
    assert body["attempts"]["revenue_usd"] == 0.0
    assert body["failure_reasons"] == []


def test_test_rows_are_excluded_from_every_count(client, app):
    """The Manila row is a real catalog listing whose payment_status was set
    to 'verified' by hand during paid-tier UX testing. Once the breakdown
    started reporting revenue, that row made it claim $49.99 nobody paid — a
    reporting fix that immediately lies is worse than no reporting."""
    _add_submission(app, "Real Founder", "sponsored_paypal:V9", "verified",
                    payment_note="paypal_order_verified")
    qa_id = _add_submission(app, "Owner QA Tool", "sponsored_paypal:INTERNAL-QA", "verified",
                            payment_note="INTERNAL QA - not a real payment")
    junk_id = _add_submission(app, "teat", "free", "unpaid")

    with app.app_context():
        for sid in (qa_id, junk_id):
            db.session.get(Submission, sid).is_test = True
        db.session.commit()
        refresh_tools_cache()
    _login_as_admin(client, app)

    body = client.get("/api/v1/admin/tier-breakdown").get_json()

    # Revenue and attempts count the real founder only.
    assert body["attempts"]["total"] == 1
    assert body["attempts"]["verified"] == 1
    assert body["attempts"]["revenue_usd"] == 49.99
    # The flagged free junk row must not inflate queue depth either.
    assert body["pending"]["free"] == 0
    assert body["pending"]["sponsored"] == 1
    # The exclusion is reported, not silent.
    assert body["test_rows_excluded"] == 2


def test_untagged_rows_still_count(client, app):
    """is_test defaults False — flagging must be opt-in, so a real founder is
    never quietly dropped from reporting."""
    _add_submission(app, "Ordinary Paid", "sponsored_paypal:V10", "verified",
                    payment_note="paypal_order_verified")
    with app.app_context():
        refresh_tools_cache()
    _login_as_admin(client, app)

    body = client.get("/api/v1/admin/tier-breakdown").get_json()
    assert body["attempts"]["verified"] == 1
    assert body["test_rows_excluded"] == 0
