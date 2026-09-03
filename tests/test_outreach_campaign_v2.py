"""Phase 1 of the outreach v2 rework: campaign scoping, pools, inbound import.

Two things are pinned here.

ONE TEMPLATE, THREE POOLS. Every outreach email shares one skeleton — same
plain shell, same voice, same bullets, same sign-off — and only the facts
inside it change per lead pool. The tests below assert the skeleton is shared
*and* that the facts are true for each pool, because those pull in opposite
directions and it is easy to satisfy one by breaking the other:

  * Send the cold template to an inbound lead and it tells a founder who
    submitted their tool last week "I would like to list it, it is free" and
    "your listing is already pre-filled" — telling our warmest leads we never
    noticed they were already a user.
  * Fork the template per pool to fix that, and the campaign now has three
    templates to keep in sync, which is how the styling and the copy drifted
    apart the first time.

The resolution is _campaign_copy(): one skeleton, four factual slots.

SOURCING. The v1 pipeline could only see products that launched today, and
never emailed the warmest pool it had (people who submitted a tool to us).
Phase 1 adds both, so the tests cover the date-parameterised scraper and the
inbound importer's exclusion rules.
"""
import os
import tempfile
from datetime import date, datetime, timedelta, timezone

import pytest

import app.outreach as outreach_mod
import app.outreach_qualify as outreach_qualify
from app import create_app, db
from app.email_utils import html_to_plain_text
from app.models import OutreachCandidate, OutreachEmailLog, Submission
from app.outreach import (
    CURRENT_CAMPAIGN,
    POOL_COLD,
    POOL_INBOUND,
    POOL_TRAFFIC,
    _campaign_copy,
    _followup_content,
    archive_v1_candidates,
    get_generic_draft,
    import_inbound_submitters,
)


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
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


def _cand(pool, **over):
    base = dict(
        product_name="SimplAI",
        tagline="Agentic workflows for enterprise operations",
        website_url="https://simplai.example",
        founder_name="Arjun Mehta",
        email="arjun@simplai.example",
        status="draft_ready",
        draft_subject="About SimplAI",
        draft_body="<p>x</p>",
        lead_pool=pool,
        campaign=CURRENT_CAMPAIGN,
    )
    base.update(over)
    c = OutreachCandidate(**base)
    db.session.add(c)
    db.session.commit()
    return c


# ─── One shared template ──────────────────────────────────────────────────────

ALL_POOLS = [POOL_COLD, POOL_INBOUND, POOL_TRAFFIC]


@pytest.mark.parametrize("pool", ALL_POOLS)
def test_every_pool_uses_the_same_skeleton(app, pool):
    _, html = get_generic_draft(_cand(pool))
    text = html_to_plain_text(html)

    # The parts that must NOT vary by pool.
    assert "Hey Arjun," in text
    assert "Nice work on SimplAI" in text
    assert "* A permanent listing on ai-compass.in" in text
    assert "1,689 outbound click-throughs" in text
    assert "No pressure either way" in text
    assert "Founder, AI Compass - ai-compass.in" in text
    assert "Unsubscribe" in text


@pytest.mark.parametrize("pool", ALL_POOLS)
def test_every_pool_still_has_exactly_one_content_link(app, pool):
    _, html = get_generic_draft(_cand(pool))
    hrefs = [h.split('"')[0] for h in html.split('href="')[1:]]
    content = [h for h in hrefs if "unsubscribe" not in h]
    assert len(content) == 1, f"{pool} produced {content}"


@pytest.mark.parametrize("pool", ALL_POOLS)
def test_no_pool_leaks_an_unresolved_template_slot(app, pool):
    subject, html = get_generic_draft(_cand(pool))
    for token in ("{copy", "PREFILL_URL", "{link}", "{name}", "None"):
        assert token not in html, f"{pool} leaked {token!r}"
    assert token not in subject


# ─── ...but the facts inside it are true per pool ─────────────────────────────

def test_a_cold_lead_is_offered_the_free_listing(app):
    _, html = get_generic_draft(_cand(POOL_COLD))
    text = html_to_plain_text(html)
    assert "It is free" in text
    assert "already pre-filled" in text
    assert "?c=" in html, "Cold leads get the pre-filled submit link."


def test_an_inbound_lead_is_never_asked_to_do_what_they_already_did(app):
    """The whole reason _campaign_copy exists."""
    _, html = get_generic_draft(_cand(POOL_INBOUND))
    text = html_to_plain_text(html)

    assert "You submitted SimplAI to AI Compass" in text
    assert "I would like to list SimplAI there" not in text, (
        "They already asked to be listed. Offering to list them reads as never "
        "having looked at who we were writing to."
    )
    assert "already pre-filled" not in text
    assert "30 seconds" not in text


def test_a_traffic_lead_is_told_their_listing_is_already_working(app):
    _, html = get_generic_draft(_cand(POOL_TRAFFIC))
    text = html_to_plain_text(html)
    assert "already listed on AI Compass" in text
    assert "I would like to list" not in text


def test_the_paid_tier_is_pitched_once_not_twice(app):
    """For a warm lead the upgrade IS the ask, so the closing aside must change.

    Regression: reusing the cold aside meant the email asked for $49 in the
    call to action and then asked again in the very next paragraph.

    The cold pool is now excluded rather than expected to say $49 once: its
    email names no price at all, because the upgrade ask belongs in a separate
    email sent 15 days after the listing goes live. Asserting "exactly once"
    across every pool would quietly restore pricing to first contact.
    """
    for pool in ALL_POOLS:
        _, html = get_generic_draft(_cand(pool))
        text = html_to_plain_text(html)
        if pool == POOL_COLD:
            assert "$" not in text, (
                "the acquisition email must not name a price — see "
                "test_outreach_cold_copy.py"
            )
            continue
        assert text.count("$49") == 1, f"{pool} pitched $49 {text.count('$49')} times"
        assert text.count("$79") == 1


def test_a_warm_followup_does_not_promise_nothing_to_pay(app):
    """Regression: the follow-up's closing reassurance is pool-specific.

    The cold follow-up correctly ends "Nothing to pay and nothing to sign up
    for" — its link goes to a free listing. Reused for a warm lead, that line
    sat directly beneath a link to a $49 purchase.
    """
    warm = _followup_content(_cand(POOL_INBOUND), 1)[2]
    assert "Nothing to pay" not in warm
    assert "free listing stays exactly as it is" in warm

    cold = _followup_content(_cand(POOL_COLD, email="c@x.example"), 1)[2]
    assert "Nothing to pay and nothing to sign up for." in cold


@pytest.mark.parametrize("pool", ALL_POOLS)
@pytest.mark.parametrize("stage", [1, 2])
def test_followups_carry_the_same_link_as_their_pool(app, pool, stage):
    c = _cand(pool)
    expected = _campaign_copy(c)["link"]
    _, html, text = _followup_content(c, stage)
    assert expected in html and expected in text


def test_an_unpooled_candidate_falls_back_to_cold(app):
    # v1 rows have no lead_pool. They must still produce a valid email rather
    # than a KeyError or an empty slot.
    _, html = get_generic_draft(_cand(None))
    assert "It is free" in html_to_plain_text(html)


# ─── Archiving the v1 pool ────────────────────────────────────────────────────

def test_archive_defaults_to_a_dry_run(app):
    c = _cand(None, campaign=None)
    res = archive_v1_candidates()
    assert res["dry_run"] is True and res["would_archive"] == 1
    assert c.status == "draft_ready", "A dry run must not change anything."


def test_archive_never_touches_a_real_conversation(app):
    """Rows describing an actual exchange keep their status and their history."""
    _cand(None, campaign=None, status="draft_ready", email="a@x.example")
    sent = _cand(None, campaign=None, status="sent", email="b@x.example")
    replied = _cand(None, campaign=None, status="replied", email="c@x.example")

    res = archive_v1_candidates(dry_run=False)
    assert res["archived"] == 1
    assert sent.status == "sent"
    assert replied.status == "replied"


def test_archive_leaves_the_new_campaign_alone(app):
    fresh = _cand(POOL_COLD)  # already stamped with CURRENT_CAMPAIGN
    archive_v1_candidates(dry_run=False)
    assert fresh.status == "draft_ready"


# ─── Inbound submitter import ─────────────────────────────────────────────────

def _submission(**over):
    base = dict(
        name="SimplAI",
        website="https://simplai.example",
        category="Productivity",
        description="Agentic workflows for enterprise operations",
        pricing_model="free",
        submitter_email="arjun@simplai.example",
        status="pending",
        payment_status="unpaid",
    )
    base.update(over)
    s = Submission(**base)
    db.session.add(s)
    db.session.commit()
    return s


@pytest.fixture()
def no_gemini(monkeypatch):
    monkeypatch.setattr(
        outreach_mod, "generate_draft_via_gemini",
        lambda c: outreach_mod.get_generic_draft(c),
    )


def test_inbound_import_defaults_to_a_dry_run(app, no_gemini):
    _submission()
    res = import_inbound_submitters()
    assert res["dry_run"] is True and res["would_import"] == 1
    assert OutreachCandidate.query.count() == 0


def test_inbound_import_creates_a_warm_pooled_candidate(app, no_gemini):
    _submission()
    res = import_inbound_submitters(dry_run=False)
    assert res["imported"] == 1

    c = OutreachCandidate.query.one()
    assert c.lead_pool == POOL_INBOUND
    assert c.campaign == CURRENT_CAMPAIGN
    assert c.email == "arjun@simplai.example"
    assert c.email_source == "inbound_submission"
    # The draft must already be the inbound variant, not the cold one.
    assert "You submitted SimplAI" in html_to_plain_text(c.draft_body)


def test_a_paying_customer_is_never_cold_pitched(app, no_gemini):
    _submission(payment_status="verified")
    assert import_inbound_submitters()["would_import"] == 0


def test_a_rejected_submission_is_not_re_pitched(app, no_gemini):
    _submission(status="rejected")
    assert import_inbound_submitters()["would_import"] == 0


def test_one_founder_with_three_submissions_is_one_lead(app, no_gemini):
    _submission(name="Tool A")
    _submission(name="Tool B")
    _submission(name="Tool C")
    res = import_inbound_submitters()
    assert res["would_import"] == 1
    assert res["skipped"]["duplicate_submitter"] == 2


def test_someone_already_in_the_outreach_table_is_skipped(app, no_gemini):
    _submission()
    _cand(POOL_COLD, email="ARJUN@simplai.example")  # case-insensitive match
    res = import_inbound_submitters()
    assert res["would_import"] == 0
    assert res["skipped"]["already_in_outreach"] == 1


def test_the_dry_run_reports_company_vs_free_email_domains(app, no_gemini):
    _submission(submitter_email="arjun@simplai.example")
    _submission(name="Side Project", submitter_email="someone@gmail.com")
    res = import_inbound_submitters()
    assert res["on_company_domain"] == 1
    assert res["on_free_email"] == 1


# ─── Product Hunt archive sourcing ────────────────────────────────────────────

def test_a_dated_fetch_asks_for_that_days_leaderboard(monkeypatch):
    """The v1 scraper hardcoded the homepage, so nothing older than today was
    reachable — the exact reason the target profile was invisible."""
    seen = {}

    class _Resp:
        ok = True
        text = ""

    def _fake_get(url, **kw):
        seen["url"] = url
        return _Resp()

    monkeypatch.setattr(outreach_mod.requests, "get", _fake_get)
    outreach_mod.scrape_producthunt_ranked_posts(on_date=date(2026, 4, 7))
    assert seen["url"] == "https://www.producthunt.com/leaderboard/daily/2026/4/7", (
        "PH does not zero-pad the month or day in this path."
    )

    outreach_mod.scrape_producthunt_ranked_posts()
    assert seen["url"] == "https://www.producthunt.com/"


def test_a_dated_fetch_skips_the_graphql_branch(monkeypatch):
    """GraphQL's `posts(first: 50)` has no date filter and returns TODAY.

    Left enabled for an archive fetch it silently mixes today's launches into
    the results, which defeats the entire point of asking for a date.
    """
    monkeypatch.setenv("PRODUCTHUNT_API_TOKEN", "test-token")
    called = {"post": False}

    def _fake_post(*a, **kw):
        called["post"] = True
        raise AssertionError("GraphQL must not be queried for a dated fetch")

    monkeypatch.setattr(outreach_mod.requests, "post", _fake_post)
    monkeypatch.setattr(outreach_mod, "scrape_producthunt_ranked_posts", lambda on_date=None: [])

    outreach_mod.fetch_producthunt_launches(on_date=date(2026, 4, 7))
    assert called["post"] is False


def test_the_archive_walk_dedupes_and_stamps_launch_dates(monkeypatch):
    monkeypatch.setattr(outreach_mod.time, "sleep", lambda *_: None)

    def _fake_fetch(on_date=None):
        # Same product ranks on two consecutive days; one is unique to day 2.
        if on_date == date(2026, 4, 1):
            return [{"product_name": "Rowboat"}]
        return [{"product_name": "Rowboat"}, {"product_name": "Fluxnote"}]

    monkeypatch.setattr(outreach_mod, "fetch_producthunt_launches", _fake_fetch)
    out = outreach_mod.fetch_producthunt_archive(date(2026, 4, 1), date(2026, 4, 2))

    assert [x["product_name"] for x in out] == ["Rowboat", "Fluxnote"]
    assert out[0]["launched_on"] == "2026-04-01", (
        "Candidate age is a scored signal and the leaderboard URL is the only "
        "place the launch date exists — it cannot be recovered later."
    )
    assert out[1]["launched_on"] == "2026-04-02"


def test_the_archive_walk_survives_one_bad_day(monkeypatch):
    monkeypatch.setattr(outreach_mod.time, "sleep", lambda *_: None)

    def _flaky(on_date=None):
        if on_date == date(2026, 4, 1):
            raise RuntimeError("PH timed out")
        return [{"product_name": "Fluxnote"}]

    monkeypatch.setattr(outreach_mod, "fetch_producthunt_launches", _flaky)
    out = outreach_mod.fetch_producthunt_archive(date(2026, 4, 1), date(2026, 4, 2))
    assert [x["product_name"] for x in out] == ["Fluxnote"]


def test_max_days_bounds_the_walk(monkeypatch):
    monkeypatch.setattr(outreach_mod.time, "sleep", lambda *_: None)
    days = []

    def _count(on_date=None):
        days.append(on_date)
        return []

    monkeypatch.setattr(outreach_mod, "fetch_producthunt_launches", _count)
    outreach_mod.fetch_producthunt_archive(date(2026, 4, 1), date(2026, 4, 30), max_days=3)
    assert len(days) == 3


# ─── Campaign budget accounting ───────────────────────────────────────────────

def test_campaign_status_counts_sends_not_statuses(app):
    """A candidate emailed and later moved to 'replied' still spent budget."""
    c = _cand(POOL_INBOUND, status="replied")
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="success",
    ))
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="failure",
    ))
    db.session.commit()

    sent = db.session.query(db.func.count(OutreachEmailLog.id)).join(
        OutreachCandidate, OutreachEmailLog.candidate_id == OutreachCandidate.id
    ).filter(
        OutreachCandidate.campaign == CURRENT_CAMPAIGN,
        OutreachEmailLog.status == "success",
    ).scalar()

    assert sent == 1, "A failed send never left the building and costs no budget."


def test_a_followup_restates_the_offer_instead_of_assuming_the_first_email(app):
    """A follow-up is read standalone, so it needs its own recap sentence.

    Regression: the stage-1 follow-up originally reused the opening email's
    call-to-action line. That line assumes the paragraph above it is on screen
    ("Your listing is already pre-filled..."), so reusing it silently dropped
    the words "free listing" from the cold follow-up — the one email in the
    sequence whose entire job is to restate the free offer to someone who did
    not read the first one.
    """
    cold = _followup_content(_cand(POOL_COLD), 1)[2]
    assert "free listing" in cold.lower()
    assert "$49" not in cold, "The cold follow-up stays free-first."

    warm = _followup_content(_cand(POOL_INBOUND, email="w@x.example"), 1)[2]
    assert "already listed" in warm.lower(), (
        "A warm lead's recap must not re-offer a listing they already have."
    )
    assert "$49" in warm, "For a warm lead the placement IS the ask."


# ─── The campaign cannot spend itself ─────────────────────────────────────────

def test_a_campaign_candidate_is_not_auto_sent_without_review(app):
    """The single most important guardrail in the rework.

    A discovery pass over the Product Hunt archive can produce hundreds of
    drafts. Under the v1 rules every one of them reached 'draft_ready' and the
    next cron tick started emailing them. This campaign is 45 emails to
    companies chosen one at a time — an automated run must never be able to
    spend that budget on its own.
    """
    from app.outreach import can_send_candidate

    c = _cand(POOL_COLD, confidence_score=95, verification_result="valid",
              draft_template_version=outreach_mod.CURRENT_DRAFT_TEMPLATE_VERSION)
    ok, reason = can_send_candidate(c)
    assert ok is False
    assert "review" in reason.lower()

    c.status = outreach_mod.STATUS_APPROVED
    ok, reason = can_send_candidate(c)
    assert ok is True, reason


def test_an_uncampaigned_candidate_keeps_the_old_behaviour(app):
    """v1 rows have no campaign and must not be retro-blocked by this gate."""
    from app.outreach import can_send_candidate

    c = _cand(None, campaign=None, confidence_score=95, verification_result="valid",
              draft_template_version=outreach_mod.CURRENT_DRAFT_TEMPLATE_VERSION)
    ok, reason = can_send_candidate(c)
    assert ok is True, reason


def test_the_campaign_stops_dead_at_its_budget(app, monkeypatch):
    from app.outreach import can_send_candidate

    c = _cand(POOL_INBOUND, status=outreach_mod.STATUS_APPROVED, confidence_score=95,
              verification_result="valid",
              draft_template_version=outreach_mod.CURRENT_DRAFT_TEMPLATE_VERSION)
    assert can_send_candidate(c)[0] is True

    monkeypatch.setattr(outreach_mod, "CAMPAIGN_SEND_BUDGET", 2)
    for _ in range(2):
        db.session.add(OutreachEmailLog(
            candidate_id=c.id, email=c.email, subject="s", body="b", status="success",
        ))
    db.session.commit()

    ok, reason = can_send_candidate(c)
    assert ok is False
    assert "budget" in reason.lower()


def test_a_failed_send_does_not_consume_campaign_budget(app):
    from app.outreach import campaign_sends_used

    c = _cand(POOL_COLD)
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="success"))
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="failure"))
    db.session.commit()

    assert campaign_sends_used() == 1, (
        "An email that never left the building costs nothing."
    )


def test_a_reply_does_not_hand_budget_back(app):
    from app.outreach import campaign_sends_used

    c = _cand(POOL_INBOUND, status="replied")
    db.session.add(OutreachEmailLog(
        candidate_id=c.id, email=c.email, subject="s", body="b", status="success"))
    db.session.commit()

    assert campaign_sends_used() == 1, (
        "Counting statuses instead of the log would refund the budget every "
        "time somebody answered."
    )


# ─── Phase 2: qualified archive discovery ─────────────────────────────────────

@pytest.fixture()
def fake_archive(monkeypatch):
    """Two launches: one qualified company, one free-only side project."""
    launches = [
        {"product_name": "Rowboat", "tagline": "Agent workflows",
         "website_url": "https://rowboat.example", "founder_name": "Priya Raman",
         "ph_launch_id": "ph_1", "launched_on": "2026-04-07"},
        {"product_name": "Fluxnote", "tagline": "Notes app",
         "website_url": "https://fluxnote.example", "founder_name": "",
         "ph_launch_id": "ph_2", "launched_on": "2026-04-08"},
    ]
    monkeypatch.setattr(outreach_mod, "fetch_producthunt_archive",
                        lambda *a, **k: launches)
    monkeypatch.setattr(outreach_mod, "is_deployed_app_url", lambda u: True)
    monkeypatch.setattr(outreach_mod, "is_student_relevant", lambda *a, **k: True)

    import app.outreach_qualify as q

    def _facts(url):
        if "rowboat" in (url or ""):
            return {"pricing_text": "Starter $29/mo Business $199/mo. Contact sales.",
                    "pricing_url": url, "domain_age_days": 160,
                    "company_signals": {"careers": True, "team": True,
                                        "docs": True, "changelog": True}}
        return {"pricing_text": "Free forever, no credit card", "pricing_url": url,
                "domain_age_days": 40,
                "company_signals": {"careers": False, "team": False,
                                    "docs": False, "changelog": False}}

    monkeypatch.setattr(q, "gather_facts", _facts)
    return launches


def test_archive_discovery_dry_run_writes_nothing(app, fake_archive):
    from datetime import date

    res = outreach_mod.run_archive_discovery(date(2026, 4, 1), date(2026, 4, 30))
    assert res["dry_run"] is True
    assert res["would_create"] == 1
    assert res["would_reject"] == 1
    assert OutreachCandidate.query.count() == 0


def test_archive_discovery_reports_which_gate_rejected_what(app, fake_archive):
    """Counting rejections by gate is how the bar gets corrected.

    Without it there is no way to tell a bar that is correctly strict from one
    that is simply broken.
    """
    from datetime import date

    res = outreach_mod.run_archive_discovery(date(2026, 4, 1), date(2026, 4, 30))
    assert sum(res["rejected_by_gate"].values()) == 1
    assert "no_qualifying_price" in res["rejected_by_gate"]


def test_archive_discovery_keeps_rejections_but_never_emails_them(app, fake_archive, monkeypatch):
    from datetime import date

    monkeypatch.setattr(outreach_mod, "enrich_candidate_email",
                        lambda url, name: ("f@rowboat.example", "scraper", 90, "valid"))
    monkeypatch.setattr(outreach_mod, "generate_draft_via_gemini",
                        lambda c: ("About Rowboat", "<p>draft</p>"))

    res = outreach_mod.run_archive_discovery(
        date(2026, 4, 1), date(2026, 4, 30), dry_run=False)
    assert res["created"] == 1

    rejected = OutreachCandidate.query.filter_by(status="rejected").one()
    assert rejected.product_name == "Fluxnote"
    assert rejected.status in outreach_mod.NON_SENDABLE_STATUSES, (
        "A rejected candidate is kept for tuning the rubric, never mailed."
    )
    summary = outreach_qualify.qualification_summary(rejected)
    assert summary["failed_gate"] == "no_qualifying_price"


def test_archive_discovery_stamps_pool_and_campaign(app, fake_archive, monkeypatch):
    from datetime import date

    monkeypatch.setattr(outreach_mod, "enrich_candidate_email",
                        lambda url, name: ("f@rowboat.example", "scraper", 90, "valid"))
    monkeypatch.setattr(outreach_mod, "generate_draft_via_gemini",
                        lambda c: ("About Rowboat", "<p>draft</p>"))

    outreach_mod.run_archive_discovery(date(2026, 4, 1), date(2026, 4, 30), dry_run=False)
    c = OutreachCandidate.query.filter_by(product_name="Rowboat").one()
    assert c.lead_pool == POOL_COLD
    assert c.campaign == CURRENT_CAMPAIGN
    assert c.fit_score >= outreach_qualify.MIN_SCORE
    assert c.status == "draft_ready", (
        "Qualified is not approved — it still needs a human before it sends."
    )


def test_a_qualified_candidate_still_cannot_auto_send(app, fake_archive, monkeypatch):
    """Phase 1's guardrail must survive Phase 2's sourcing."""
    from datetime import date
    from app.outreach import can_send_candidate

    monkeypatch.setattr(outreach_mod, "enrich_candidate_email",
                        lambda url, name: ("f@rowboat.example", "scraper", 90, "valid"))
    monkeypatch.setattr(outreach_mod, "generate_draft_via_gemini",
                        lambda c: ("About Rowboat", "<p>draft</p>"))

    outreach_mod.run_archive_discovery(date(2026, 4, 1), date(2026, 4, 30), dry_run=False)
    c = OutreachCandidate.query.filter_by(product_name="Rowboat").one()
    c.draft_template_version = outreach_mod.CURRENT_DRAFT_TEMPLATE_VERSION

    ok, reason = can_send_candidate(c)
    assert ok is False and "review" in reason.lower()


def test_inbound_leads_are_scored_but_never_gated(app, monkeypatch):
    """The warmest pool must not be rejected by a scraping failure.

    An inbound company whose /pricing sits behind a login, or whose registrar
    hides the registration date, has still found us and asked to be listed —
    evidence far stronger than anything the gates measure.
    """
    import app.outreach_qualify as q

    monkeypatch.setattr(q, "gather_facts", lambda url: {
        "pricing_text": None, "pricing_url": None,
        "domain_age_days": None, "company_signals": {},
    })
    monkeypatch.setattr(outreach_mod, "generate_draft_via_gemini",
                        lambda c: outreach_mod.get_generic_draft(c))

    s = Submission(name="SimplAI", website="https://simplai.example",
                   category="Productivity", description="Agentic workflows",
                   pricing_model="free", submitter_email="arjun@simplai.example",
                   status="pending", payment_status="unpaid")
    db.session.add(s)
    db.session.commit()

    res = import_inbound_submitters(dry_run=False)
    assert res["imported"] == 1

    c = OutreachCandidate.query.one()
    assert c.status == "draft_ready", "Scored zero, but still imported."
    assert outreach_qualify.qualification_summary(c)["failed_gate"] is not None, (
        "The gate failure is recorded for ranking, not acted on."
    )


# ─── The inbound copy has to match what is actually published ────────────────

def _listed(candidate, slug="simplai", hidden=False, visible_at=None):
    """Give this inbound candidate a real catalog row, the way the import does."""
    import json as _json

    from app.models import CatalogTool, Submission

    sub = Submission(
        name=candidate.product_name, website="https://simplai.example",
        category="Productivity", description="d", pricing_model="free",
        submitter_email=candidate.email, status="approved",
        payment_status="unpaid", is_test=False,
    )
    db.session.add(sub)
    db.session.flush()
    db.session.add(CatalogTool(
        slug=slug, name=candidate.product_name,
        data=_json.dumps({"slug": slug}), submission_id=sub.id,
        hidden=hidden, visible_at=visible_at,
    ))
    candidate.ph_launch_id = f"inbound:{sub.id}"
    db.session.commit()
    return sub


def test_a_live_inbound_listing_is_never_called_queued(app):
    """The error that cost the most credibility for the least reason.

    Every inbound candidate in the first real import was already live - one
    had claimed their listing the day before - and the copy told all of them
    their tool was "in the queue for a free listing". To a founder whose page
    has been public for weeks that reads as not knowing our own site, and it
    said it to the warmest leads in the campaign.
    """
    c = _cand(POOL_INBOUND)
    _listed(c)

    copy = _campaign_copy(c)
    assert "in the queue" not in copy["offer"].lower()
    assert "has been live" in copy["offer"]
    assert "https://ai-compass.in/tools/simplai" in copy["offer"], (
        "Naming the page is what makes the rest of the email credible - the "
        "founder can check it in one click."
    )


def test_the_live_copy_says_the_listing_is_free_and_unchanged(app):
    """Answers the question the founder actually has: I am already listed,
    so what am I being asked to buy?"""
    c = _cand(POOL_INBOUND)
    _listed(c)
    copy = _campaign_copy(c)
    assert "stays free" in copy["offer"]
    assert "placement" in copy["offer"].lower()


def test_a_genuinely_queued_listing_still_says_queued(app):
    """The old wording is not wrong, it was just applied to everyone."""
    c = _cand(POOL_INBOUND)  # no catalog row at all
    assert "in the queue" in _campaign_copy(c)["offer"]


@pytest.mark.parametrize("kwargs,why", [
    ({"hidden": True}, "a hidden row is not a published page"),
    ({"visible_at": datetime(2099, 1, 1)}, "still inside its release delay"),
])
def test_a_listing_that_is_not_actually_public_is_not_claimed_as_live(app, kwargs, why):
    c = _cand(POOL_INBOUND)
    _listed(c, **kwargs)
    assert "has been live" not in _campaign_copy(c)["offer"], why


def test_the_cold_pool_copy_is_untouched(app):
    """The cold pitch must keep offering the free listing it is actually for."""
    copy = _campaign_copy(_cand(POOL_COLD))
    assert "It is free" in copy["offer"]
    assert "has been live" not in copy["offer"]


# ─── Two tracks: acquisition sends now, upgrade waits for evidence ───────────

def _sendable(pool, **over):
    """A candidate that clears every gate EXCEPT the one under test.

    Without the current template version and a verified mailbox the
    stale-draft and confidence gates fire first, and the test would pass or
    fail for the wrong reason.
    """
    over.setdefault('draft_template_version', outreach_mod.CURRENT_DRAFT_TEMPLATE_VERSION)
    over.setdefault('confidence_score', 95)
    over.setdefault('verification_result', 'valid')
    return _cand(pool, **over)


def _live_days_ago(candidate, days, slug="ripe"):
    """Give the candidate a listing that went live `days` ago."""
    import json as _json

    from app.models import CatalogTool, Submission

    when = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=days)
    sub = Submission(
        name=candidate.product_name, website="https://simplai.example",
        category="Productivity", description="d", pricing_model="free",
        submitter_email=candidate.email, status="approved",
        payment_status="unpaid", is_test=False,
        submitted_at=when, approved_at=when,
    )
    db.session.add(sub)
    db.session.flush()
    db.session.add(CatalogTool(
        slug=slug, name=candidate.product_name,
        data=_json.dumps({"slug": slug}), submission_id=sub.id,
        hidden=False, visible_at=when,
    ))
    candidate.ph_launch_id = f"inbound:{sub.id}"
    db.session.commit()
    return sub


def test_an_upgrade_pitch_waits_until_the_listing_has_numbers(app):
    """The rule the two-track split rests on.

    An upgrade email the day after a listing goes live has no impressions to
    report and no clicks to point at, so it asks the founder to pay for more
    of something they cannot yet judge. That is also the difference between a
    directory following up and a directory upselling on contact.
    """
    c = _sendable(POOL_INBOUND, status="approved")
    _live_days_ago(c, 2)

    ok, reason = outreach_mod.can_send_candidate(c)
    assert ok is False
    assert str(outreach_mod.UPGRADE_MIN_DAYS_LIVE) in reason
    assert "Eligible" in reason, "The operator needs the date, not just a refusal."


def test_a_ripe_listing_is_allowed_through(app):
    c = _sendable(POOL_INBOUND, status="approved")
    _live_days_ago(c, outreach_mod.UPGRADE_MIN_DAYS_LIVE + 1)

    ok, reason = outreach_mod.can_send_candidate(c)
    assert ok is True, reason


def test_the_acquisition_track_never_waits(app):
    """A cold candidate has no listing to ripen - the ask is the listing."""
    c = _sendable(POOL_COLD, status="approved")
    assert outreach_mod.upgrade_ready_at(c) is None
    ok, reason = outreach_mod.can_send_candidate(c)
    assert ok is True, reason


def test_ripeness_never_blocks_an_approval(app):
    """Timing, not eligibility - same treatment as the daily pacing gate.

    Blocking approval instead would leave every inbound candidate
    un-approvable for a fortnight, which makes the review queue useless.
    """
    c = _sendable(POOL_INBOUND, status="draft_ready")
    _live_days_ago(c, 1)
    ok, reason = outreach_mod.can_send_candidate(c, for_approval=True)
    assert ok is True, reason


def test_an_unresolvable_listing_does_not_hold_a_candidate_back(app):
    """A failed lookup must not silently mute a candidate forever."""
    c = _sendable(POOL_INBOUND, status="approved", ph_launch_id="inbound:999999")
    assert outreach_mod.upgrade_ready_at(c) is None
    ok, _ = outreach_mod.can_send_candidate(c)
    assert ok is True


def test_the_clock_runs_from_going_live_not_from_the_last_catalog_sync(app):
    """CatalogTool.updated_at moves on every re-sync from JSON.

    Measuring from it would report a listing published in July as having gone
    live this morning, resetting the upgrade clock on every sweep and making
    the window unreachable.
    """
    c = _sendable(POOL_INBOUND, status="approved")
    sub = _live_days_ago(c, outreach_mod.UPGRADE_MIN_DAYS_LIVE + 5)

    from app.models import CatalogTool
    tool = CatalogTool.query.filter_by(submission_id=sub.id).one()
    tool.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.commit()

    ok, reason = outreach_mod.can_send_candidate(c)
    assert ok is True, reason
