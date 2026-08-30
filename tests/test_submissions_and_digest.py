"""Public submission persistence + self-scheduled digest claim.

Before this, /submit-tool wrote an ephemeral JSON file (wiped every
Render deploy) and a second, unauthenticated /admin/submissions route
shadowed the DB-backed one in the URL map — so the review queue was
permanently empty. The digest also only sent via SMTP, which Render
free tier blocks, and only ran if manually POSTed.
"""
import os
import tempfile

import pytest

import json

import app.digest as digest_mod
from app import create_app, db
from app.models import AppSetting, CatalogTool, Submission, User
from app.tool_cache import refresh_tools_cache

# conftest's `app` is SESSION-scoped and holds one outer app-context for
# the whole run with function-scoped clients. A request made here (e.g.
# /submit-tool) opens a long-lived read transaction on that shared scoped
# session; a later unrelated test (created/committed a user in between)
# then can't see its own row through that stale snapshot and its login
# 401s. Rather than perturb the shared fixture, this file runs on its own
# fully isolated, function-scoped app + DB so it can't bleed into others.


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


def test_submit_tool_persists_to_db(client, app):
    resp = client.post("/api/v1/submit-tool", json={
        "name": "Test Widget AI",
        "url": "https://testwidget.example.com",
        "category": "Productivity",
        "reason": "Automates a thing students do a lot.",
    })
    assert resp.status_code == 201, resp.data
    with app.app_context():
        s = Submission.query.filter_by(name="Test Widget AI").first()
        assert s is not None
        assert s.website == "https://testwidget.example.com"
        assert s.description == "Automates a thing students do a lot."
        assert s.status == "pending"
        assert s.pricing_model  # NOT NULL satisfied


def test_only_one_admin_submissions_route(app):
    """The legacy unauthenticated JSON route must be gone, so the URL
    maps to the DB-backed, auth-checked handler."""
    rules = [r for r in app.url_map.iter_rules()
             if r.rule == "/api/v1/admin/submissions" and "GET" in r.methods]
    assert len(rules) == 1
    assert rules[0].endpoint.endswith("admin_list_submissions")


def test_maybe_run_digest_claims_once(app, monkeypatch):
    """Atomic claim: first eligible call runs, an immediate second call
    is a no-op (interval not elapsed)."""
    runs = []
    monkeypatch.setattr(digest_mod, "email_enabled", lambda: True)
    monkeypatch.setattr(
        digest_mod, "run_digest",
        lambda *a, **k: runs.append(1) or {"status": "noop"},
    )
    with app.app_context():
        AppSetting.query.filter_by(key="digest_last_run").delete()
        db.session.commit()

        digest_mod.maybe_run_digest(min_interval_hours=24)
        digest_mod.maybe_run_digest(min_interval_hours=24)

        assert len(runs) == 1
        claim = AppSetting.query.filter_by(key="digest_last_run").one()
        assert claim.value and claim.value != digest_mod._EPOCH


def test_maybe_run_digest_noop_without_email(app, monkeypatch):
    runs = []
    monkeypatch.setattr(digest_mod, "email_enabled", lambda: False)
    monkeypatch.setattr(digest_mod, "run_digest", lambda *a, **k: runs.append(1))
    with app.app_context():
        AppSetting.query.filter_by(key="digest_last_run").delete()
        db.session.commit()
        digest_mod.maybe_run_digest()
        assert runs == []


def test_paypal_config_endpoint(client, monkeypatch):
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "TEST_CLIENT_ID")
    monkeypatch.setenv("PAYPAL_MODE", "sandbox")
    resp = client.get("/api/v1/config/paypal")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["client_id"] == "TEST_CLIENT_ID"
    assert data["mode"] == "sandbox"


def test_submit_tool_with_transaction_ref(client, app):
    resp = client.post("/api/v1/submit-tool", json={
        "name": "Sponsored AI Tool",
        "url": "https://sponsored.example.com",
        "category": "Productivity",
        "reason": "Very helpful utility.",
        "pricing_model": "sponsored_paypal",
        "transaction_ref": "PAYPAL-TX-123456",
    })
    assert resp.status_code == 201
    with app.app_context():
        s = Submission.query.filter_by(name="Sponsored AI Tool").first()
        assert s is not None
        assert s.pricing_model == "sponsored_paypal:PAYPAL-TX-123456"


def test_paypal_hosted_config_endpoint(client, monkeypatch):
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "TEST_CLIENT_ID")
    monkeypatch.setenv("PAYPAL_HOSTED_BUTTON_ID", "TEST_BUTTON_ID")
    monkeypatch.setenv("PAYPAL_MODE", "live")
    resp = client.get("/api/v1/config/paypal-hosted")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["client_id"] == "TEST_CLIENT_ID"
    assert data["hosted_button_id"] == "TEST_BUTTON_ID"
    assert data["mode"] == "live"


def test_submit_tool_with_quick_review_transaction_ref(client, app):
    """Quick Review ($14.99) is also a real paid claim, distinct from the
    Fast-Track 'sponsored' prefix — it must still trigger verification and
    get its own composite pricing_model, not silently fall through as
    unpaid."""
    resp = client.post("/api/v1/submit-tool", json={
        "name": "Quick Reviewed AI Tool",
        "url": "https://quickreviewed.example.com",
        "category": "Productivity",
        "reason": "Very helpful utility.",
        "pricing_model": "quick_paypal",
        "transaction_ref": "PAYPAL-TX-654321",
    })
    assert resp.status_code == 201
    with app.app_context():
        s = Submission.query.filter_by(name="Quick Reviewed AI Tool").first()
        assert s is not None
        assert s.pricing_model == "quick_paypal:PAYPAL-TX-654321"
        # No real PayPal creds in the test env, so verification can't
        # succeed — same behavior the existing sponsored-tier test relies
        # on implicitly. What matters here is that a "quick" claim is
        # treated as paid at all (routed into the same unverified_review
        # path), not silently dropped to 'unpaid' like a free listing.
        assert s.payment_status == "unverified_review"


def test_paypal_hosted_config_quick_tier_defaults_empty(client, monkeypatch):
    """Until a second PayPal hosted-button product exists for Quick Review,
    this must NEVER fall back to the sponsor tier's $49.99 payment URL —
    that would let a $14.99 buyer land on the wrong-priced checkout page."""
    monkeypatch.delenv("PAYPAL_HOSTED_BUTTON_ID_QUICK", raising=False)
    monkeypatch.delenv("PAYPAL_PAYMENT_URL_QUICK", raising=False)
    resp = client.get("/api/v1/config/paypal-hosted?tier=quick")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["hosted_button_id"] == ""
    assert data["payment_url"] == ""
    assert data["tier"] == "quick"


def test_paypal_hosted_config_quick_tier_once_configured(client, monkeypatch):
    monkeypatch.setenv("PAYPAL_CLIENT_ID", "TEST_CLIENT_ID")
    monkeypatch.setenv("PAYPAL_HOSTED_BUTTON_ID_QUICK", "QUICK_BUTTON_ID")
    monkeypatch.setenv("PAYPAL_PAYMENT_URL_QUICK", "https://www.paypal.com/ncp/payment/QUICKID")
    resp = client.get("/api/v1/config/paypal-hosted?tier=quick")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["hosted_button_id"] == "QUICK_BUTTON_ID"
    assert data["payment_url"] == "https://www.paypal.com/ncp/payment/QUICKID"


def test_paypal_hosted_config_unknown_tier_falls_back_to_sponsor(client, monkeypatch):
    monkeypatch.setenv("PAYPAL_HOSTED_BUTTON_ID", "SPONSOR_BUTTON_ID")
    resp = client.get("/api/v1/config/paypal-hosted?tier=bogus")
    assert resp.status_code == 200
    assert resp.get_json()["tier"] == "sponsor"


def _login_as_admin(client, app, email):
    with app.app_context():
        admin = User(email=email, is_admin=True)
        db.session.add(admin)
        db.session.commit()
        admin_id = admin.id
    with client.session_transaction() as sess:
        sess["_user_id"] = str(admin_id)
        sess["_fresh"] = True


def test_admin_approve_quick_review_does_not_grant_sponsored_placement(client, app):
    """The one line that actually enforces 'Quick Review doesn't buy the
    badge/placement boost' — approving a quick_paypal submission must NOT
    set the catalog 'sponsored' flag, even though it was a verified paid
    submission that jumped the review queue (is_priority=True)."""
    with app.app_context():
        refresh_tools_cache()
        s = Submission(
            name="Quick Tier Tool",
            website="https://quicktiertool.example.com",
            category="Productivity",
            description="A quick-reviewed tool.",
            pricing_model="quick_paypal:QTX111111",
            status="pending",
            payment_status="verified",
            is_priority=True,
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

    _login_as_admin(client, app, "admin-quick@t.test")

    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    assert body["success"] is True
    assert body["tool"]["sponsored"] is False


def test_admin_approve_fast_track_grants_sponsored_placement(client, app):
    """The regression check for the above: Fast-Track must keep working
    exactly as before — a verified sponsored_paypal submission still buys
    the permanent catalog 'sponsored' placement."""
    with app.app_context():
        refresh_tools_cache()
        s = Submission(
            name="Fast Track Tool",
            website="https://fasttracktool.example.com",
            category="Productivity",
            description="A fast-tracked tool.",
            pricing_model="sponsored_paypal:STX222222",
            status="pending",
            payment_status="verified",
            is_priority=True,
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

    _login_as_admin(client, app, "admin-sponsor@t.test")

    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    assert body["success"] is True
    assert body["tool"]["sponsored"] is True


def test_admin_approve_free_tier_delays_visibility_two_weeks(client, app):
    """Free-tier approvals must not appear in the public catalog immediately
    — they're gated behind a 14-day visible_at, same idea as the review
    queue's priority ordering but for the catalog listing itself."""
    from datetime import datetime, timezone, timedelta
    with app.app_context():
        refresh_tools_cache()
        s = Submission(
            name="Free Tier Tool",
            website="https://freetiertool.example.com",
            category="Productivity",
            description="A free-tier tool.",
            pricing_model="free",
            status="pending",
            payment_status="unpaid",
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

    _login_as_admin(client, app, "admin-free@t.test")

    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    visible_at = datetime.fromisoformat(body["tool"]["visible_at"])
    expected = datetime.now(timezone.utc) + timedelta(days=14)
    assert abs((visible_at - expected).total_seconds()) < 60

    from app.tool_cache import get_visible_tools
    with app.app_context():
        refresh_tools_cache()
        slugs = {t["slug"] for t in get_visible_tools()}
    assert "free-tier-tool" not in slugs


def test_admin_approve_sponsored_tier_short_visibility_delay(client, app):
    """Fast-Track ($49.99) buys a 1-day delay instead of the free tier's 14,
    matching the paid-priority-review promise."""
    from datetime import datetime, timezone, timedelta
    with app.app_context():
        refresh_tools_cache()
        s = Submission(
            name="Paid Delay Tool",
            website="https://paiddelaytool.example.com",
            category="Productivity",
            description="A fast-tracked tool.",
            pricing_model="sponsored_paypal:STX333333",
            status="pending",
            payment_status="verified",
            is_priority=True,
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

    _login_as_admin(client, app, "admin-paiddelay@t.test")

    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    visible_at = datetime.fromisoformat(body["tool"]["visible_at"])
    expected = datetime.now(timezone.utc) + timedelta(days=1)
    assert abs((visible_at - expected).total_seconds()) < 60


def test_hide_tool_delay_days_schedules_future_visibility(client, app):
    """The manual admin override: hide a specific already-visible tool for
    N more days rather than an indefinite hidden=True."""
    with app.app_context():
        CatalogTool.query.delete()
        db.session.commit()
        _seed_catalog_tool("delay-me-tool", "Delay Me Tool", False)
        db.session.commit()
        refresh_tools_cache()

    _login_as_admin(client, app, "admin-hidedelay@t.test")

    resp = client.post("/api/v1/admin/tools/delay-me-tool/hide", json={"delay_days": 13})
    assert resp.status_code == 200, resp.data
    assert resp.get_json()["hidden"] is False

    from app.tool_cache import get_visible_tools
    with app.app_context():
        refresh_tools_cache()
        slugs = {t["slug"] for t in get_visible_tools()}
    assert "delay-me-tool" not in slugs


def _seed_catalog_tool(slug, name, sponsored):
    data = {
        "slug": slug,
        "name": name,
        "category": "Productivity",
        "tagline": f"{name} tagline",
        "link": f"https://{slug}.example.com",
        "sponsored": sponsored,
    }
    db.session.add(CatalogTool(slug=slug, name=name, category="Productivity",
                                hidden=False, data=json.dumps(data)))


def test_tools_sponsored_endpoint_only_returns_active_sponsors(client, app):
    with app.app_context():
        CatalogTool.query.delete()
        db.session.commit()
        _seed_catalog_tool("sponsored-tool", "Sponsored Tool", True)
        _seed_catalog_tool("free-tool", "Free Tool", False)
        db.session.commit()
        refresh_tools_cache()

    resp = client.get("/api/v1/tools/sponsored")
    assert resp.status_code == 200
    body = resp.get_json()
    slugs = [t["slug"] for t in body["results"]]
    assert "sponsored-tool" in slugs
    assert "free-tool" not in slugs


# --- Submitter dashboard (analytics behind the paid tiers) ----------------

def _record_click_and_view(app, slug, n=1):
    from app.models import OutboundClick, ToolPageView
    with app.app_context():
        for _ in range(n):
            db.session.add(OutboundClick(slug=slug))
            db.session.add(ToolPageView(slug=slug))
        db.session.commit()


def test_submission_dashboard_sponsored_tier_returns_analytics_and_benchmark(client, app):
    """End-to-end: submit -> approve -> real clicks/views -> minted token ->
    dashboard endpoint returns totals plus a category benchmark, and
    admin_approve_submission actually linked catalog_tools.submission_id."""
    with app.app_context():
        refresh_tools_cache()
        CatalogTool.query.delete()
        db.session.commit()
        # A peer in the same category so the benchmark has something to
        # compare against.
        _seed_catalog_tool("peer-tool", "Peer Tool", False)
        db.session.commit()

        s = Submission(
            name="Dash Sponsored Tool",
            website="https://dashsponsored.example.com",
            category="Productivity",
            description="A fast-tracked tool for dashboard testing.",
            pricing_model="sponsored_paypal:DSH333333",
            submitter_email="founder@dashsponsored.example.com",
            status="pending",
            payment_status="verified",
            is_priority=True,
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

    _login_as_admin(client, app, "admin-dash@t.test")
    resp = client.post(f"/api/v1/admin/submissions/{sub_id}/approve")
    assert resp.status_code == 200, resp.data
    slug = resp.get_json()["tool"]["slug"]

    with app.app_context():
        catalog_row = CatalogTool.query.filter_by(slug=slug).first()
        assert catalog_row.submission_id == sub_id

    _record_click_and_view(app, slug, n=3)
    # Give the peer tool some clicks too, otherwise the benchmark denominator
    # (avg_peer_clicks) is 0 and pct_vs_average comes back as None.
    _record_click_and_view(app, "peer-tool", n=1)

    with app.app_context():
        from app.models import Favorite, Rating
        voter = User(email="voter-dashsponsored@t.test")
        db.session.add(voter)
        db.session.commit()
        db.session.add(Favorite(user_id=voter.id, tool_id=slug))
        db.session.add(Rating(user_id=voter.id, tool_slug=slug, value=5))
        db.session.commit()

        from app.submission_dashboard import mint_dashboard_token
        token = mint_dashboard_token(sub_id, "founder@dashsponsored.example.com")

    resp = client.get(f"/api/v1/submissions/dashboard?token={token}")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()

    assert body["tier"] == "sponsored"
    assert body["submission"]["status"] == "approved"
    assert body["submission"]["slug"] == slug
    assert body["analytics"]["total_clicks"] == 3
    assert body["analytics"]["total_views"] == 3
    assert body["analytics"]["clicks_30d"] == 3
    assert len(body["analytics"]["daily_trend"]) == 15  # 14 days inclusive of today

    # CTR = clicks / views = 3/3 = 100%
    assert body["analytics"]["ctr"] == 100.0
    assert body["analytics"]["favorites"] == 1
    assert body["analytics"]["rating"]["count"] == 1
    assert body["analytics"]["rating"]["average"] == 5.0

    assert body["benchmark"]["available"] is True
    assert body["benchmark"]["your_clicks_30d"] == 3
    assert body["benchmark"]["category_avg_clicks_30d"] == 1.0
    assert body["benchmark"]["pct_vs_average"] == 200.0  # 3 vs 1 avg = +200%
    # 2 tools total in category (this one + peer-tool), this one has more
    # clicks (3 vs 1), so it ranks #1.
    assert body["benchmark"]["your_rank"] == 1
    assert body["benchmark"]["total_tools_in_category"] == 2

    assert body["featured"]["badge"] is True
    assert body["featured"]["homepage_strip"] is True


def test_submission_dashboard_ctr_is_none_without_views(client, app):
    """CTR must be None (not a misleading 0%) when there's no view data —
    clicks with zero views is a data gap, not a 0% conversion rate."""
    with app.app_context():
        refresh_tools_cache()
        CatalogTool.query.delete()
        db.session.commit()
        _seed_catalog_tool("dash-quick-ctr-tool", "Dash Quick CTR Tool", False)
        db.session.commit()

        s = Submission(
            name="Dash Quick CTR Tool",
            website="https://dashquickctr.example.com",
            category="Productivity",
            description="A quick-tier tool for CTR edge-case testing.",
            pricing_model="quick_paypal:QCT666666",
            submitter_email="founder@dashquickctr.example.com",
            status="approved",
            payment_status="verified",
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

        from app.models import OutboundClick
        catalog_row = CatalogTool.query.filter_by(slug="dash-quick-ctr-tool").first()
        catalog_row.submission_id = sub_id
        db.session.add(OutboundClick(slug="dash-quick-ctr-tool"))
        db.session.commit()

        from app.submission_dashboard import mint_dashboard_token
        token = mint_dashboard_token(sub_id, "founder@dashquickctr.example.com")

    resp = client.get(f"/api/v1/submissions/dashboard?token={token}")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    assert body["tier"] == "quick"
    assert body["analytics"]["total_clicks"] == 1
    assert body["analytics"]["total_views"] == 0
    assert body["analytics"]["ctr"] is None
    assert body["analytics"]["favorites"] == 0
    assert body["analytics"]["rating"] == {"average": 0.0, "count": 0}
    # Quick tier doesn't get the benchmark/featured perks — those are
    # Fast-Track only.
    assert "benchmark" not in body
    assert "featured" not in body


def test_submission_dashboard_free_tier_is_status_only(client, app):
    """Free-tier dashboards must never leak analytics — that gap is what's
    supposed to make the paid tiers worth buying."""
    with app.app_context():
        refresh_tools_cache()
        s = Submission(
            name="Dash Free Tool",
            website="https://dashfree.example.com",
            category="Productivity",
            description="A free-tier tool for dashboard testing.",
            pricing_model="free",
            submitter_email="founder@dashfree.example.com",
            status="pending",
            payment_status="unpaid",
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

        from app.submission_dashboard import mint_dashboard_token
        token = mint_dashboard_token(sub_id, "founder@dashfree.example.com")

    resp = client.get(f"/api/v1/submissions/dashboard?token={token}")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()

    assert body["tier"] == "free"
    assert body["submission"]["status"] == "pending"
    assert "analytics" not in body
    assert "benchmark" not in body


def test_submission_dashboard_unverified_paid_claim_falls_back_to_free(client, app):
    """An unverified 'sponsored_paypal' claim must not unlock paid-tier
    analytics just because the pricing_model string says sponsored —
    gating is on payment_status == 'verified', not the claimed tier."""
    with app.app_context():
        refresh_tools_cache()
        s = Submission(
            name="Dash Unverified Tool",
            website="https://dashunverified.example.com",
            category="Productivity",
            description="An unverified paid claim.",
            pricing_model="sponsored_paypal:UNV444444",
            submitter_email="founder@dashunverified.example.com",
            status="pending",
            payment_status="unverified_review",
        )
        db.session.add(s)
        db.session.commit()
        sub_id = s.id

        from app.submission_dashboard import mint_dashboard_token
        token = mint_dashboard_token(sub_id, "founder@dashunverified.example.com")

    resp = client.get(f"/api/v1/submissions/dashboard?token={token}")
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    assert body["tier"] == "free"
    assert "analytics" not in body


def test_submission_dashboard_rejects_bad_token(client, app):
    resp = client.get("/api/v1/submissions/dashboard?token=not-a-real-token")
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "invalid"


def test_resend_dashboard_link_always_returns_generic_success(client, app):
    """Must not leak whether an email/tool-name pair matches a real
    submission — same response either way."""
    with app.app_context():
        s = Submission(
            name="Dash Resend Tool",
            website="https://dashresend.example.com",
            category="Productivity",
            description="A tool for resend-link testing.",
            pricing_model="quick_paypal:RSD555555",
            submitter_email="founder@dashresend.example.com",
            status="pending",
            payment_status="verified",
        )
        db.session.add(s)
        db.session.commit()

    resp_match = client.post(
        "/api/v1/submissions/dashboard/resend",
        json={"email": "founder@dashresend.example.com", "tool_name": "Dash Resend Tool"},
    )
    resp_no_match = client.post(
        "/api/v1/submissions/dashboard/resend",
        json={"email": "nobody@nowhere.example.com", "tool_name": "Does Not Exist"},
    )

    assert resp_match.status_code == 200
    assert resp_no_match.status_code == 200
    assert resp_match.get_json()["success"] is True
    assert resp_no_match.get_json()["success"] is True




# --- "Create an account" CTA in submission confirmation emails ------------

def test_free_tier_confirmation_email_includes_register_link(client, app, monkeypatch):
    """Free submitters should get a confirmation email nudging them to
    create an account for one-click dashboard access, alongside the
    magic-link 'track your submission' CTA."""
    import app.email_utils as email_utils_mod

    sent = []
    monkeypatch.setattr(
        email_utils_mod, "send_email",
        lambda **kwargs: sent.append(kwargs) or True,
    )

    resp = client.post("/api/v1/submit-tool", json={
        "name": "Register CTA Free Tool",
        "url": "https://registerctafree.example.com",
        "category": "Productivity",
        "reason": "Testing the register CTA.",
        "submitter_email": "founder@registerctafree.example.com",
    })
    assert resp.status_code == 201, resp.data

    confirmation = next(
        (m for m in sent if m.get("to") == "founder@registerctafree.example.com"), None
    )
    assert confirmation is not None, sent
    assert "Create my free account" in confirmation["html"]
    assert "/register?email=" in confirmation["html"]


def test_paid_invoice_email_includes_register_link(client, app, monkeypatch):
    """Payment verification is server-side (verify_paypal_order), so it has
    to be faked here to actually exercise the invoice-email branch rather
    than falling through to the unverified-claim path."""
    import app.payments as payments_mod
    import app.email_utils as email_utils_mod

    monkeypatch.setattr(
        payments_mod, "verify_paypal_order",
        lambda order_id, expected_amount=49.99, expected_currency="USD": (True, "paypal_order_verified"),
    )

    sent = []
    monkeypatch.setattr(
        email_utils_mod, "send_email",
        lambda **kwargs: sent.append(kwargs) or True,
    )

    resp = client.post("/api/v1/submit-tool", json={
        "name": "Register CTA Paid Tool",
        "url": "https://registerctapaid.example.com",
        "category": "Productivity",
        "reason": "Testing the register CTA on a paid tier.",
        "submitter_email": "founder@registerctapaid.example.com",
        "pricing_model": "quick_paypal",
        "transaction_ref": "REGCTA123",
    })
    assert resp.status_code == 201, resp.data

    invoice = next(
        (m for m in sent if m.get("to") == "founder@registerctapaid.example.com"), None
    )
    assert invoice is not None, sent
    assert "Create my free account" in invoice["html"]
    assert "/register?email=" in invoice["html"]


# --- Unverified paid claims: no automated emails ------------------------------

def test_unverified_paid_claim_sends_no_emails(client, app, monkeypatch):
    """A paid-tier submission whose PayPal order can't be verified is almost
    always bogus/automated. It still lands in the /admin/submissions queue as
    a durable row, but must NOT generate the noisy '[UNVERIFIED PAYMENT CLAIM]'
    admin email or a confirmation to a possibly-forged submitter address."""
    import app.email_utils as email_utils_mod

    sent = []
    monkeypatch.setattr(email_utils_mod, "send_email", lambda **kw: sent.append(kw) or True)

    resp = client.post("/api/v1/submit-tool", json={
        "name": "Bogus Paid Claim Tool",
        "url": "https://boguspaid.example.com",
        "category": "Productivity",
        "reason": "Definitely a real payment, trust me.",
        "submitter_email": "someone@boguspaid.example.com",
        "pricing_model": "quick_paypal",
        "transaction_ref": "TOTALLY-FAKE-REF",
    }, headers={"X-Forwarded-For": "203.0.113.11"})  # own rate-limit bucket
    assert resp.status_code == 201, resp.data
    assert resp.get_json()["payment_status"] == "unverified_review"

    assert sent == [], f"no emails should go out for an unverified paid claim, got: {sent}"

    # …but the submission is still persisted for manual review.
    with app.app_context():
        s = Submission.query.filter_by(name="Bogus Paid Claim Tool").first()
        assert s is not None and s.payment_status == "unverified_review"


def test_genuine_free_submission_still_notifies_admin(client, app, monkeypatch):
    import app.email_utils as email_utils_mod

    sent = []
    monkeypatch.setattr(email_utils_mod, "send_email", lambda **kw: sent.append(kw) or True)

    resp = client.post("/api/v1/submit-tool", json={
        "name": "Honest Free Tool",
        "url": "https://honestfree.example.com",
        "category": "Productivity",
        "reason": "A normal free submission.",
    }, headers={"X-Forwarded-For": "203.0.113.12"})  # own rate-limit bucket
    assert resp.status_code == 201, resp.data

    subjects = [m.get("subject", "") for m in sent]
    assert any("New tool submission" in s for s in subjects), subjects
    assert not any("UNVERIFIED PAYMENT CLAIM" in s for s in subjects), subjects
