"""Phase 2: qualification. Gates reject, scores rank, evidence is recorded.

The weight of this file sits on extract_price_points, because the budget gate
rests entirely on it and it is the one piece of the rubric that can be wrong
quietly. Every other signal degrades gracefully — a missing careers page just
scores nothing — but a price extractor that reads "Save $50" as a price admits
companies with no paid product at all, and one that misses a real "$29/mo"
rejects exactly the companies the campaign is for.

The scoring tests deliberately supply `facts` rather than hitting the network,
so the rubric is testable in isolation from the probes.
"""
import os
import tempfile

import pytest

from app import create_app, db
from app.models import OutreachCandidate
from app.outreach_qualify import (
    GATE_DOMAIN_TOO_NEW,
    GATE_DOMAIN_TOO_OLD,
    GATE_NO_PRICING_PAGE,
    GATE_NO_QUALIFYING_PRICE,
    MIN_SCORE,
    extract_price_points,
    qualification_summary,
    qualify_candidate,
    store_qualification,
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


# ─── Price extraction: the gate everything rests on ───────────────────────────

def test_reads_a_normal_three_tier_plan_table():
    r = extract_price_points("Starter $19/mo · Pro $49 per month · Business $199/month")
    assert r["monthly"] == [19.0, 49.0, 199.0]
    assert r["min_monthly"] == 19.0
    assert r["max_monthly"] == 199.0


@pytest.mark.parametrize("text,why", [
    ("We raised $2,000,000 in seed funding", "funding is not a price"),
    ("Save $50 on your first order", "a discount is not a price"),
    ("Customers save $1,200 a year on average", "savings claims read as annual prices"),
    ("Get $20 off", "an amount off is not a price"),
    ("Free forever. $0/mo", "a free tier is not evidence of budget"),
    ("Backed by $5M in funding", "funding again"),
])
def test_non_prices_are_not_read_as_prices(text, why):
    r = extract_price_points(text)
    assert r["min_monthly"] is None, why


@pytest.mark.parametrize("text,expected", [
    ("Save $50 today! Plans from $29/mo", 29.0),
    ("30-day money back guarantee. Pro is $25 a month", 25.0),
    ("Get $20 off your first month. Pro $99/mo", 99.0),
])
def test_a_promo_banner_does_not_hide_the_real_price(text, expected):
    """The false negative that matters most.

    A wide look-behind window rejects the genuine price sitting a few words
    after a savings banner — and "30-day money back" sits above the plan table
    on a great many pricing pages. Losing a qualified company that way costs a
    real lead at the hardest gate.
    """
    assert extract_price_points(text)["min_monthly"] == expected


def test_annual_prices_are_recorded_but_never_converted():
    """An annual plan carries an unknown discount.

    Dividing $290/yr by 12 would invent a monthly number, and this gate decides
    who gets emailed — it must not run on a figure we made up.
    """
    r = extract_price_points("$290 per year, billed annually")
    assert r["annual"] == [290.0]
    assert r["monthly"] == []
    assert r["min_monthly"] is None


@pytest.mark.parametrize("text,expected", [
    ("$12 per user per month", [12.0]),
    ("$1,299/mo", [1299.0]),
    ("$29.99/month", [29.99]),
    ("$ 45 per month", [45.0]),
])
def test_common_price_formats_are_understood(text, expected):
    assert extract_price_points(text)["monthly"] == expected


def test_absurd_amounts_are_ignored():
    # Six-figure numbers on a marketing page are funding, ARR claims or
    # customer-savings figures — never a monthly subscription.
    assert extract_price_points("$250,000/month enterprise")["monthly"] == []


def test_empty_and_priceless_pages_are_safe():
    for text in ("", None, "Enterprise: contact sales for pricing"):
        r = extract_price_points(text)
        assert r["min_monthly"] is None and r["monthly"] == []


def test_duplicate_prices_are_collapsed():
    r = extract_price_points("$49/mo ... $49/mo ... $49 per month")
    assert r["monthly"] == [49.0]


# ─── Gates ────────────────────────────────────────────────────────────────────

def _facts(pricing="Pro $49/mo", age=150, careers=True, docs=True,
           changelog=True, team=True):
    return {
        "pricing_text": pricing,
        "pricing_url": "https://x.example/pricing",
        "domain_age_days": age,
        "company_signals": {
            "careers": careers, "team": team, "docs": docs, "changelog": changelog,
        },
    }


def _cand(**over):
    c = OutreachCandidate(product_name="Rowboat", website_url="https://rowboat.example")
    for k, v in over.items():
        setattr(c, k, v)
    return c


def test_an_unreachable_pricing_page_is_rejected(app):
    v = qualify_candidate(_cand(), facts=_facts(pricing=None))
    assert v["passed"] is False
    assert v["failed_gate"] == GATE_NO_PRICING_PAGE


def test_a_free_only_product_is_rejected(app):
    v = qualify_candidate(_cand(), facts=_facts(pricing="Free forever, no credit card"))
    assert v["passed"] is False
    assert v["failed_gate"] == GATE_NO_QUALIFYING_PRICE


def test_a_price_below_the_floor_is_rejected(app):
    v = qualify_candidate(_cand(), facts=_facts(pricing="Hobby $5/mo"))
    assert v["failed_gate"] == GATE_NO_QUALIFYING_PRICE


def test_a_brand_new_domain_is_rejected(app):
    v = qualify_candidate(_cand(), facts=_facts(age=20))
    assert v["failed_gate"] == GATE_DOMAIN_TOO_NEW


def test_an_established_domain_is_rejected_as_out_of_window(app):
    v = qualify_candidate(_cand(), facts=_facts(age=900))
    assert v["failed_gate"] == GATE_DOMAIN_TOO_OLD


def test_an_unknown_domain_age_does_not_reject(app):
    """RDAP is privacy-shielded across much of .io/.dev/.app.

    Rejecting every one of those would discard a large share of the target
    market over a registrar's disclosure policy, so an unknown age simply
    scores nothing.
    """
    v = qualify_candidate(_cand(), facts=_facts(age=None))
    assert v["failed_gate"] is None
    assert v["passed"] is True
    age_note = [e for e in v["evidence"] if e["signal"] == "domain_age"][0]
    assert age_note["hit"] is False and age_note["weight"] == 0


def test_a_gate_failure_records_which_gate(app):
    v = qualify_candidate(_cand(), facts=_facts(pricing="Free forever"))
    assert v["failed_gate"] == GATE_NO_QUALIFYING_PRICE
    assert any(e["signal"] == "qualifying_price" and not e["hit"] for e in v["evidence"]), (
        "Without the reason there is no way to tell a bar that is correctly "
        "strict from one that is broken."
    )


# ─── Scoring is the inverse of the old fit_score ──────────────────────────────

def test_sales_led_pricing_now_scores_positive(app):
    """compute_fit_score subtracted 3 for this. It is a budget signal."""
    without = qualify_candidate(_cand(), facts=_facts(pricing="Pro $49/mo"))
    with_sales = qualify_candidate(
        _cand(), facts=_facts(pricing="Pro $49/mo. Enterprise: contact sales"))
    assert with_sales["score"] == without["score"] + 2


def test_a_high_ceiling_tier_scores(app):
    low = qualify_candidate(_cand(), facts=_facts(pricing="Pro $49/mo"))
    high = qualify_candidate(_cand(), facts=_facts(pricing="Pro $49/mo Business $149/mo"))
    assert high["score"] == low["score"] + 3


def test_company_shape_signals_add_up(app):
    bare = qualify_candidate(_cand(), facts=_facts(
        careers=False, docs=False, changelog=False, team=False))
    full = qualify_candidate(_cand(), facts=_facts())
    assert full["score"] - bare["score"] == 7  # 2 + 2 + 2 + 1


def test_a_verified_mailbox_scores(app):
    plain = qualify_candidate(_cand(), facts=_facts())
    verified = qualify_candidate(_cand(verification_result="valid"), facts=_facts())
    assert verified["score"] == plain["score"] + 1


def test_a_solo_project_with_a_cheap_plan_does_not_clear_the_bar(app):
    """The whole point: priced, but no evidence of a company behind it."""
    v = qualify_candidate(_cand(), facts=_facts(
        pricing="Pro $19/mo", age=None,
        careers=False, docs=False, changelog=False, team=False))
    assert v["failed_gate"] is None, "It passes the gates..."
    assert v["score"] < MIN_SCORE, "...but must not clear the ranking bar."
    assert v["passed"] is False


def test_a_real_company_clears_the_bar(app):
    v = qualify_candidate(_cand(verification_result="valid"), facts=_facts(
        pricing="Starter $29/mo Business $199/mo Enterprise: contact sales", age=160))
    assert v["passed"] is True
    assert v["score"] >= MIN_SCORE


# ─── Evidence round-trips to the console ──────────────────────────────────────

def test_the_score_and_its_evidence_persist(app):
    c = _cand()
    db.session.add(c)
    v = qualify_candidate(c, facts=_facts())
    store_qualification(c, v)
    db.session.commit()

    assert c.fit_score == v["score"], (
        "fit_score is the column the admin list already sorts on — the new "
        "score feeds it rather than adding a second ranking number."
    )
    read_back = qualification_summary(c)
    assert read_back["score"] == v["score"]
    assert len(read_back["evidence"]) == len(v["evidence"])
    assert read_back["prices"]["min_monthly"] == 49.0


def test_unreadable_stored_evidence_does_not_crash_the_console(app):
    c = _cand(qualification_json="{not json")
    assert qualification_summary(c) is None


def test_a_candidate_never_scored_reads_as_none(app):
    assert qualification_summary(_cand()) is None


def test_qualification_never_raises_on_a_junk_candidate(app):
    # A candidate with no website at all must return a verdict, not blow up a
    # discovery run that is part-way through a batch.
    v = qualify_candidate(_cand(website_url=None), facts=_facts(pricing=None))
    assert v["passed"] is False and v["score"] == 0


# ─── The ceiling clears the gate too ──────────────────────────────────────────

@pytest.mark.parametrize("pricing,why", [
    ("Starter $5/mo · Growth $99/mo · Scale $499/mo",
     "a $499 tier is budget, whatever the entry point costs"),
    ("Free $0 · Pro $9/mo · Business $108/mo",
     "same shape, smaller ceiling, still well past $49"),
])
def test_a_high_ceiling_clears_a_low_entry_tier(app, pricing, why):
    """Reading only the cheapest plan mistakes freemium for poverty.

    This is a real inbound lead: priced $5-$499/mo, it scored zero and ranked
    last in a pool of eleven, because the gate asked "is the cheapest thing
    they sell over $19" rather than "can they spend $49".
    """
    v = qualify_candidate(_cand(), facts=_facts(pricing=pricing))
    assert v["failed_gate"] is None, why
    hit = [e for e in v["evidence"] if e["signal"] == "qualifying_price"][0]
    assert hit["hit"] is True
    assert "sells up to" in hit["detail"], (
        "The operator has to see WHY a $5/mo product cleared a $19 bar."
    )


@pytest.mark.parametrize("pricing", [
    "Pro $9.90/mo",                    # one cheap tier, no ceiling
    "Basic $4.90/mo · Plus $19.90/mo",  # a ladder that never reaches $49
    "Free forever",
])
def test_a_low_ceiling_still_fails(app, pricing):
    """The bar still has to reject something, or it is not a bar."""
    v = qualify_candidate(_cand(), facts=_facts(pricing=pricing))
    assert v["failed_gate"] == GATE_NO_QUALIFYING_PRICE


def test_the_rejection_says_both_ways_it_could_have_passed(app):
    v = qualify_candidate(_cand(), facts=_facts(pricing="Basic $4.90/mo · Plus $19.90/mo"))
    detail = [e for e in v["evidence"] if e["signal"] == "qualifying_price"][0]["detail"]
    assert "19" in detail and "49" in detail and "19.9" in detail, (
        f"A rejection has to name the bar AND the figure that missed it: {detail}"
    )
