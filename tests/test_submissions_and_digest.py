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


