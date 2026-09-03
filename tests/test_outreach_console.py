"""Phase 3: the campaign console's backend.

The console exists to spend a fixed budget of 45 carefully, which means three
things the old flat candidate list could not do, and which are what these tests
pin:

  * approval is a real gate with real refusals — approving must fail for the
    same reasons the sender would fail, or the queue says ready while the
    sender silently disagrees;
  * the evidence behind a score travels to the UI, so approving is a judgement
    on facts rather than a click on a number;
  * rejections are visible and grouped by the gate that caused them, because
    that is the only way to tell a correctly strict bar from a broken one.

The revenue arithmetic is tested hardest. Two Fast-Track sales are $98 against
a $100 target — a fact that is cheap to encode and expensive to rediscover
after two closes.
"""
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

import app.outreach as outreach_mod
from app import create_app, db
from app.models import OutreachCandidate, OutreachEmailLog, Submission, User
from app.outreach_qualify import qualify_candidate, store_qualification
from app.outreach_routes import _closing_combinations


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "WTF_CSRF_ENABLED": False,
        "LOGIN_DISABLED": False,
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
def admin_client(app):
    user = User(email="admin@ai-compass.in", is_admin=True)
    db.session.add(user)
    db.session.commit()

    client = app.test_client()
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user.id)
        sess["_fresh"] = True
    return client


def _cand(**over):
    base = dict(
        product_name="Rowboat",
        website_url="https://rowboat.example",
        email="founder@rowboat.example",
        status="draft_ready",
        draft_subject="About Rowboat",
        draft_body="<p>draft</p>",
        campaign=outreach_mod.CURRENT_CAMPAIGN,
        lead_pool=outreach_mod.POOL_COLD,
        confidence_score=95,
        verification_result="valid",
        draft_template_version=outreach_mod.CURRENT_DRAFT_TEMPLATE_VERSION,
    )
    base.update(over)
    c = OutreachCandidate(**base)
    db.session.add(c)
    db.session.commit()
    return c


# ─── Approval is a real gate ──────────────────────────────────────────────────

def test_approving_moves_a_draft_into_the_approved_queue(admin_client, app):
    c = _cand()
    res = admin_client.post(f"/api/v1/admin/outreach/candidates/{c.id}/approve", json={})
    assert res.status_code == 200
    assert res.get_json()["status"] == outreach_mod.STATUS_APPROVED


def test_approval_can_be_taken_back(admin_client, app):
    c = _cand(status=outreach_mod.STATUS_APPROVED)
    res = admin_client.post(
        f"/api/v1/admin/outreach/candidates/{c.id}/approve", json={"approved": False})
    assert res.status_code == 200
    assert res.get_json()["status"] == "draft_ready"


def test_approval_refuses_what_the_sender_would_refuse(admin_client, app):
    """Otherwise the queue says ready and the sender silently disagrees."""
    c = _cand(verification_result="invalid")
    res = admin_client.post(f"/api/v1/admin/outreach/candidates/{c.id}/approve", json={})
    assert res.status_code == 400
    assert "undeliverable" in res.get_json()["error"].lower()
    db.session.refresh(c)
    assert c.status == "draft_ready", "A refused approval must not change the status."


def test_a_stale_draft_cannot_be_approved(admin_client, app):
    c = _cand(draft_template_version=1)
    res = admin_client.post(f"/api/v1/admin/outreach/candidates/{c.id}/approve", json={})
    assert res.status_code == 400
    assert "template" in res.get_json()["error"].lower()


def test_approval_refuses_once_the_budget_is_gone(admin_client, app, monkeypatch):
    c = _cand()
    monkeypatch.setattr(outreach_mod, "CAMPAIGN_SEND_BUDGET", 1)
    other = _cand(email="b@x.example", product_name="Other")
    db.session.add(OutreachEmailLog(
        candidate_id=other.id, email=other.email, subject="s", body="b", status="success"))
    db.session.commit()

    res = admin_client.post(f"/api/v1/admin/outreach/candidates/{c.id}/approve", json={})
    assert res.status_code == 400
    assert "budget" in res.get_json()["error"].lower()


def test_a_sent_candidate_cannot_be_re_approved(admin_client, app):
    c = _cand(status="sent")
    res = admin_client.post(f"/api/v1/admin/outreach/candidates/{c.id}/approve", json={})
    assert res.status_code == 400


def test_approval_requires_admin(app):
    c = _cand()
    res = app.test_client().post(
        f"/api/v1/admin/outreach/candidates/{c.id}/approve", json={})
    assert res.status_code in (401, 403)
    db.session.refresh(c)
    assert c.status == "draft_ready"


def test_approving_a_missing_candidate_is_a_404(admin_client, app):
    assert admin_client.post(
        "/api/v1/admin/outreach/candidates/999999/approve", json={}).status_code == 404


# ─── Evidence reaches the console ─────────────────────────────────────────────

def test_the_candidate_list_carries_the_scoring_evidence(admin_client, app):
    c = _cand()
    store_qualification(c, qualify_candidate(c, facts={
        "pricing_text": "Pro $49/mo Business $199/mo",
        "pricing_url": "https://rowboat.example/pricing",
        "domain_age_days": 150,
        "company_signals": {"careers": True, "team": True, "docs": True, "changelog": True},
    }))
    db.session.commit()

    row = admin_client.get("/api/v1/admin/outreach/candidates").get_json()[0]
    assert row["lead_pool"] == outreach_mod.POOL_COLD
    assert row["campaign"] == outreach_mod.CURRENT_CAMPAIGN
    assert row["fit_score"] == c.fit_score
    assert row["qualification"]["prices"]["min_monthly"] == 49.0
    assert any(e["signal"] == "careers" and e["hit"] for e in row["qualification"]["evidence"])


def test_the_list_is_ordered_by_score_not_recency(admin_client, app):
    """An operator picking 45 must read the best-evidenced candidates first."""
    _cand(product_name="Weak", email="w@x.example", fit_score=2)
    _cand(product_name="Strong", email="s@x.example", fit_score=13)

    names = [r["product_name"] for r in
             admin_client.get("/api/v1/admin/outreach/candidates").get_json()]
    assert names.index("Strong") < names.index("Weak")


def test_a_candidate_never_scored_still_serializes(admin_client, app):
    _cand(qualification_json=None)
    row = admin_client.get("/api/v1/admin/outreach/candidates").get_json()[0]
    assert row["qualification"] is None and row["failed_gate"] is None


# ─── The rejected-at-gate view ────────────────────────────────────────────────

def test_gate_breakdown_groups_rejections_by_cause(admin_client, app):
    for name, gate in (("A", "no_qualifying_price"), ("B", "no_qualifying_price"),
                       ("C", "domain_too_new")):
        c = _cand(product_name=name, email=f"{name}@x.example", status="rejected")
        c.qualification_json = f'{{"failed_gate": "{gate}", "score": 0, "evidence": []}}'
    db.session.commit()

    body = admin_client.get("/api/v1/admin/outreach/campaign/gates").get_json()
    assert body["total"] == 3
    assert body["by_gate"]["no_qualifying_price"] == 2
    assert body["by_gate"]["domain_too_new"] == 1


def test_gate_breakdown_requires_admin(app):
    assert app.test_client().get(
        "/api/v1/admin/outreach/campaign/gates").status_code in (401, 403)


# ─── The revenue arithmetic ───────────────────────────────────────────────────

def test_two_fast_track_sales_are_never_offered_as_reaching_one_hundred():
    """$49 x 2 = $98. The obvious answer to the target is the wrong one."""
    for combo in _closing_combinations(100):
        assert combo["total"] >= 100
    assert not any(c["reviewed"] == 0 and c["fast_track"] == 2
                   for c in _closing_combinations(100))


def test_the_cheapest_two_sale_path_is_offered_first():
    best = _closing_combinations(100)[0]
    assert best["sales"] == 2
    assert best == {"reviewed": 1, "fast_track": 1, "total": 128.0, "sales": 2}


def test_a_met_target_offers_nothing():
    assert _closing_combinations(0) == []
    assert _closing_combinations(-20) == []


def test_a_small_gap_is_closed_by_one_sale():
    assert _closing_combinations(2)[0]["sales"] == 1


def test_campaign_status_reports_budget_revenue_and_deadline(admin_client, app):
    c = _cand(status="sent")
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="success",
        sent_at=datetime.now(timezone.utc) - timedelta(hours=1)))
    db.session.add(Submission(
        name="Paid Co", website="https://p.example", category="Productivity",
        description="d", pricing_model="sponsored_paypal", payment_status="verified",
        submitter_email="p@p.example", status="approved"))
    db.session.commit()

    body = admin_client.get("/api/v1/admin/outreach/campaign/status").get_json()
    assert body["emails_sent"] == 1
    assert body["budget_remaining"] == outreach_mod.CAMPAIGN_SEND_BUDGET - 1
    assert body["revenue"] == 49.0
    assert body["revenue_remaining"] == 51.0
    assert body["deadline"] == "2026-09-15"
    assert body["closes_the_gap"][0]["sales"] == 1


def test_only_verified_payments_count_as_revenue(admin_client, app):
    """A claimed payment is not a payment.

    payment_status 'verified' is the one value meaning the server independently
    confirmed it; counting the others would report money we never received.
    """
    c = _cand(status="sent")
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="success",
        sent_at=datetime.now(timezone.utc) - timedelta(hours=1)))
    for status in ("unpaid", "unverified_review", "needs_manual_review"):
        db.session.add(Submission(
            name=f"Claim {status}", website="https://c.example", category="Productivity",
            description="d", pricing_model="sponsored_paypal", payment_status=status,
            submitter_email=f"{status}@c.example", status="pending"))
    db.session.commit()

    assert admin_client.get(
        "/api/v1/admin/outreach/campaign/status").get_json()["revenue"] == 0


def test_revenue_ignores_sales_from_before_the_campaign_started(admin_client, app):
    """Otherwise an older sale makes the campaign look like it already worked."""
    c = _cand(status="sent")
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="success",
        sent_at=datetime.now(timezone.utc) - timedelta(days=1)))
    db.session.add(Submission(
        name="Old Sale", website="https://o.example", category="Productivity",
        description="d", pricing_model="reviewed_paypal", payment_status="verified",
        submitter_email="o@o.example", status="approved",
        submitted_at=datetime.now(timezone.utc) - timedelta(days=40)))
    db.session.commit()

    assert admin_client.get(
        "/api/v1/admin/outreach/campaign/status").get_json()["revenue"] == 0
