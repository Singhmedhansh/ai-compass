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


# ─── Phase 4: cadence and pacing ──────────────────────────────────────────────

def test_the_campaign_bumps_faster_than_the_legacy_schedule(app):
    """5+5 does not fit a fixed deadline.

    Anything sent after the 5th never receives its second follow-up before the
    15th, and the second touch is where most cold replies come from. 3+4 means
    a candidate emailed on the 6th still completes its sequence on the 13th.
    """
    campaign = _cand()
    legacy = _cand(campaign=None, email="legacy@x.example")

    assert outreach_mod._followup_delay_days(campaign, 1) == 3
    assert outreach_mod._followup_delay_days(campaign, 2) == 4
    assert outreach_mod._followup_delay_days(legacy, 1) == 5
    assert outreach_mod._followup_delay_days(legacy, 2) == 5

    total = (outreach_mod._followup_delay_days(campaign, 1)
             + outreach_mod._followup_delay_days(campaign, 2))
    assert total == 7, "The whole sequence must fit inside the campaign window."


def _sent_days_ago(days, **over):
    c = _cand(status="sent", **over)
    c.last_status_change_at = datetime.now(timezone.utc) - timedelta(days=days)
    db.session.commit()
    return c


def test_a_campaign_candidate_is_bumped_at_three_days(app, monkeypatch):
    sent = []
    monkeypatch.setattr(outreach_mod, "_send_followup",
                        lambda c, stage, nxt: sent.append((c.id, stage)) or True)
    monkeypatch.setattr(outreach_mod, "reserve_send_slots",
                        lambda n, requester=None: {"granted": n})

    _sent_days_ago(3)
    outreach_mod.run_automated_followups()
    assert len(sent) == 1 and sent[0][1] == 1


def test_a_legacy_candidate_is_not_dragged_onto_the_faster_cadence(app, monkeypatch):
    """The v1 cutoff was a single 5-day filter in SQL.

    Querying on the shortest cadence and filtering per candidate is what keeps
    the two schedules separate — without the per-candidate check, a legacy row
    would be bumped two days early.
    """
    sent = []
    monkeypatch.setattr(outreach_mod, "_send_followup",
                        lambda c, stage, nxt: sent.append((c.id, stage)) or True)
    monkeypatch.setattr(outreach_mod, "reserve_send_slots",
                        lambda n, requester=None: {"granted": n})

    _sent_days_ago(3, campaign=None, email="legacy@x.example")
    outreach_mod.run_automated_followups()
    assert sent == [], "A legacy candidate waits its full five days."


def test_nothing_is_bumped_before_it_is_due(app, monkeypatch):
    sent = []
    monkeypatch.setattr(outreach_mod, "_send_followup",
                        lambda c, stage, nxt: sent.append(c.id) or True)
    monkeypatch.setattr(outreach_mod, "reserve_send_slots",
                        lambda n, requester=None: {"granted": n})

    _sent_days_ago(1)
    outreach_mod.run_automated_followups()
    assert sent == []


def test_a_naive_timestamp_does_not_break_the_sweep(app, monkeypatch):
    """SQLite returns naive datetimes, Postgres returns aware ones.

    The v1 code never noticed because its cutoff was applied in SQL. Comparing
    in Python does, and one TypeError mid-sweep would stop every remaining
    follow-up that run.
    """
    sent = []
    monkeypatch.setattr(outreach_mod, "_send_followup",
                        lambda c, stage, nxt: sent.append(c.id) or True)
    monkeypatch.setattr(outreach_mod, "reserve_send_slots",
                        lambda n, requester=None: {"granted": n})

    c = _cand(status="sent")
    c.last_status_change_at = (datetime.now(timezone.utc) - timedelta(days=5)).replace(tzinfo=None)
    db.session.commit()

    outreach_mod.run_automated_followups()  # must not raise
    assert sent == [c.id]


def test_the_campaign_paces_itself_across_days(app, monkeypatch):
    """45 cold emails in one burst from a From address with no sending history
    is the shape of a spam run."""
    monkeypatch.setattr(outreach_mod, "CAMPAIGN_DAILY_SEND_MAX", 2)
    c = _cand(status=outreach_mod.STATUS_APPROVED)

    assert outreach_mod.can_send_candidate(c)[0] is True

    for _ in range(2):
        db.session.add(OutreachEmailLog(
            candidate_id=c.id, email=c.email, subject="s", body="b", status="success",
            sent_at=datetime.now(timezone.utc)))
    db.session.commit()

    ok, reason = outreach_mod.can_send_candidate(c)
    assert ok is False
    assert "today" in reason.lower()


def test_todays_pacing_never_blocks_an_approval(admin_client, app, monkeypatch):
    """Approving twenty and letting them go out over two days is how this runs.

    Blocking the eleventh approval because ten have already sent would make the
    queue unusable after lunch.
    """
    monkeypatch.setattr(outreach_mod, "CAMPAIGN_DAILY_SEND_MAX", 1)
    other = _cand(status="sent", email="other@x.example", product_name="Other")
    db.session.add(OutreachEmailLog(
        candidate_id=other.id, email=other.email, subject="s", body="b",
        status="success", sent_at=datetime.now(timezone.utc)))
    db.session.commit()

    c = _cand()
    res = admin_client.post(f"/api/v1/admin/outreach/candidates/{c.id}/approve", json={})
    assert res.status_code == 200, res.get_json()


def test_the_lifetime_budget_still_blocks_approval(app, monkeypatch):
    """Pacing is about timing; the budget is about the candidate never sending.

    Only the second is a reason to refuse an approval.
    """
    monkeypatch.setattr(outreach_mod, "CAMPAIGN_SEND_BUDGET", 1)
    c = _cand(status="sent")
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="success"))
    db.session.commit()

    other = _cand(email="n@x.example", product_name="Next")
    ok, reason = outreach_mod.can_send_candidate(other, for_approval=True)
    assert ok is False and "budget" in reason.lower()


def test_campaign_status_reports_todays_pacing(admin_client, app):
    body = admin_client.get("/api/v1/admin/outreach/campaign/status").get_json()
    assert body["daily_send_max"] == outreach_mod.CAMPAIGN_DAILY_SEND_MAX
    assert body["sent_today"] == 0
    assert body["daily_remaining"] == outreach_mod.CAMPAIGN_DAILY_SEND_MAX


def _give_live_listing(candidate, slug):
    """Attach an approved submission and a live catalog row to a candidate."""
    import json as _json

    from app.models import CatalogTool

    when = (datetime.now(timezone.utc)
            - timedelta(days=outreach_mod.UPGRADE_MIN_DAYS_LIVE + 5)).replace(tzinfo=None)
    sub = Submission(
        name=candidate.product_name, website=f"https://{slug}.example",
        category="Productivity", description="d", pricing_model="free",
        submitter_email=candidate.email, status="approved",
        submitted_at=when, approved_at=when,
    )
    db.session.add(sub)
    db.session.flush()
    db.session.add(CatalogTool(
        slug=slug, name=candidate.product_name,
        data=_json.dumps({"name": candidate.product_name}),
        hidden=False, visible_at=when, submission_id=sub.id,
    ))
    candidate.ph_launch_id = f"inbound:{sub.id}"
    db.session.commit()
    return sub


def test_the_warm_pools_send_before_the_cold_one(app, monkeypatch):
    """Warm leads are scored but never gated, so their scores run low.

    An inbound company whose pricing page sits behind a login scores near zero
    while a cold lead with a tidy public /pricing scores 13. Ranking on score
    alone would send the cold pool first and leave the warmest leads in the
    campaign until last — inverting the plan by way of a sort order.
    """
    sent = []
    monkeypatch.setattr(outreach_mod, "send_email_with_details",
                        lambda **kw: sent.append(kw["to"]) or (True, None))
    monkeypatch.setattr(outreach_mod, "reserve_send_slots",
                        lambda n, requester=None: {"granted": n})
    monkeypatch.setattr(outreach_mod.time, "sleep", lambda *_: None)

    _cand(product_name="Cold Co", email="cold@x.example", fit_score=13,
          lead_pool=outreach_mod.POOL_COLD, status=outreach_mod.STATUS_APPROVED)
    inbound = _cand(product_name="Inbound Co", email="inbound@x.example", fit_score=0,
                    lead_pool=outreach_mod.POOL_INBOUND, status=outreach_mod.STATUS_APPROVED)
    traffic = _cand(product_name="Traffic Co", email="traffic@x.example", fit_score=5,
                    lead_pool=outreach_mod.POOL_TRAFFIC, status=outreach_mod.STATUS_APPROVED)

    # An already-listed pool must resolve its listing before it may send, and
    # the listing must be past the ripeness window. Without these the two warm
    # candidates are held back and this test passes or fails on the gate
    # rather than on the sort order it exists to check.
    _give_live_listing(inbound, "inbound-co")
    _give_live_listing(traffic, "traffic-co")

    outreach_mod.run_automated_initial_sends()

    assert sent == ["inbound@x.example", "traffic@x.example", "cold@x.example"], (
        f"Expected warm pools first, got {sent}"
    )


def test_score_still_breaks_ties_inside_a_pool(app, monkeypatch):
    sent = []
    monkeypatch.setattr(outreach_mod, "send_email_with_details",
                        lambda **kw: sent.append(kw["to"]) or (True, None))
    monkeypatch.setattr(outreach_mod, "reserve_send_slots",
                        lambda n, requester=None: {"granted": n})
    monkeypatch.setattr(outreach_mod.time, "sleep", lambda *_: None)

    _cand(product_name="Weak Cold", email="weak@x.example", fit_score=7,
          lead_pool=outreach_mod.POOL_COLD, status=outreach_mod.STATUS_APPROVED)
    _cand(product_name="Strong Cold", email="strong@x.example", fit_score=14,
          lead_pool=outreach_mod.POOL_COLD, status=outreach_mod.STATUS_APPROVED)

    outreach_mod.run_automated_initial_sends()
    assert sent == ["strong@x.example", "weak@x.example"]


# ─── The import endpoint's confirm flag ───────────────────────────────────────

def _wait_for_outreach_job(kind, timeout=30.0):
    """Block until the background outreach job of `kind` reports finished.

    The endpoint returns 202 and the work happens on a daemon thread, so
    asserting on the database immediately would race it.
    """
    import time

    from app.outreach_routes import _outreach_job_state

    deadline = time.time() + timeout
    while time.time() < deadline:
        if (_outreach_job_state.get("kind") == kind
                and not _outreach_job_state.get("running")):
            return _outreach_job_state
        time.sleep(0.05)
    raise AssertionError(
        f"background job {kind!r} did not finish within {timeout}s: "
        f"{_outreach_job_state}"
    )



def test_inbound_import_writes_only_when_confirm_is_actually_received(
    app, admin_client, monkeypatch
):
    """The endpoint defaults to a dry run, and that default has to be exact.

    A client that posts a JSON body WITHOUT the application/json content type
    gets request.get_json(silent=True) == None, so the payload reads as {} and
    confirm falls back to False. That is what the admin panel did for every
    POST: "Import into campaign" ran a count and reported 0 imported - correct
    for the request that arrived, and nothing like the one intended.

    Defaulting to the safe branch is right. The failure was that the safe
    branch is indistinguishable from success unless you read the numbers, so
    this pins both directions.
    """
    from app.models import Submission

    monkeypatch.setattr(
        outreach_mod, "generate_draft_via_gemini",
        lambda c: ("About " + (c.product_name or ""), "<p>draft</p>"),
    )

    db.session.add(Submission(
        name="SimplAI", website="https://simplai.example", category="AI",
        description="d", pricing_model="free", submitter_email="ceo@simplai.example",
        status="pending", payment_status="unpaid", is_test=False,
    ))
    db.session.commit()

    url = "/api/v1/admin/outreach/campaign/inbound-import"

    # A JSON body sent without the content type - the browser bug, reproduced.
    resp = admin_client.post(url, data='{"confirm": true}')
    body = resp.get_json()
    assert body["dry_run"] is True, (
        "Unparseable payload must fall back to the DRY RUN, never to a write."
    )
    assert OutreachCandidate.query.count() == 0

    # Properly declared, it accepts the write and hands it to a background
    # worker. Synchronously it would chain a pricing fetch, an RDAP lookup and
    # an LLM draft per candidate - minutes for a real pool, which is exactly
    # how it came back as a 60s browser timeout while the server was still
    # working and holding a gthread worker.
    resp = admin_client.post(url, json={"confirm": True})
    assert resp.status_code == 202
    body = resp.get_json()
    assert body["started"] is True

    _wait_for_outreach_job("inbound-import")

    assert OutreachCandidate.query.count() == 1
    c = OutreachCandidate.query.one()
    assert c.lead_pool == outreach_mod.POOL_INBOUND
    assert c.campaign == outreach_mod.CURRENT_CAMPAIGN


def test_inbound_import_dry_run_reports_the_company_domain_split(app, admin_client):
    """The console renders would_import and on_company_domain from this.

    Renaming either key silently shows the operator a zero on the number the
    whole campaign plan is sized from.
    """
    from app.models import Submission

    for email in ("ceo@simplai.example", "someone@gmail.com"):
        db.session.add(Submission(
            name=f"T{email}", website="https://x.example", category="AI",
            description="d", pricing_model="free", submitter_email=email,
            status="pending", payment_status="unpaid", is_test=False,
        ))
    db.session.commit()

    body = admin_client.post(
        "/api/v1/admin/outreach/campaign/inbound-import", json={}
    ).get_json()
    assert body["would_import"] == 2
    assert body["on_company_domain"] == 1
    assert body["on_free_email"] == 1
    assert isinstance(body["skipped"], dict)
