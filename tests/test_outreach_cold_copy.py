"""The cold email asks for a free listing and nothing else.

Two tracks, two conversations (see UPGRADE_MIN_DAYS_LIVE):

  ACQUISITION (cold)  - "let me list this, it is free". No price.
  UPGRADE (listed)    - "here is what your listing earned, want placement?"
                        Sent 15 days after the listing goes live.

Pricing in the acquisition email collapses the two. It asks a stranger to
consider paying before the free listing has earned them a single click, and it
turns the free offer into the opening move of a sale.

Also guarded here: an email must never claim a form is pre-filled when the
link does not fill it. /submit fails silently on a bad token by design, so a
broken prefill link does not look broken - the founder gets an empty form and
an email that told them it would be full.
"""
import json
import os
import re
import tempfile

import pytest

import app.outreach as outreach_mod
from app import create_app, db
from app.models import OutreachCandidate
from app.outreach import _prefill_url, get_generic_draft


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


def _cold(**over):
    base = dict(
        product_name="ConvoData",
        website_url="https://convodata.example.com",
        email="hello@convodata.example.com",
        tagline="Ask your marketing data anything.",
        status="draft_ready",
        campaign="q3_qualified_b2b",
        lead_pool="cold",
    )
    base.update(over)
    c = OutreachCandidate(**base)
    db.session.add(c)
    db.session.commit()
    return c


def _text(body):
    return re.sub(r"<[^>]+>", " ", body)


# ── The cold pitch names no price ───────────────────────────────────────────

def test_cold_draft_contains_no_price(app):
    _, body = get_generic_draft(_cold())
    text = _text(body)

    assert "$" not in text, "the acquisition email must not name a price"
    for banned in ("49", "79", "Sponsored badge", "featured card",
                   "paid option", "upgrade"):
        assert banned.lower() not in text.lower(), banned


def test_cold_draft_says_there_is_nothing_to_pay(app):
    """Removing the price is not enough — say so, so it is not left open."""
    _, body = get_generic_draft(_cold())
    assert "nothing to pay" in _text(body).lower()


def test_the_llm_prompt_bans_pricing_too(app):
    """The template and the Gemini prompt must not drift apart.

    get_generic_draft is only the fallback. If the prompt still asks for a
    paid paragraph, every draft written while Gemini is reachable keeps the
    pricing the template just dropped.
    """
    import inspect

    src = inspect.getsource(outreach_mod)
    prompt_start = src.index("STRUCTURE - follow this order exactly:")
    prompt = src[prompt_start:prompt_start + 4000]

    assert "$49" not in prompt and "$79" not in prompt
    assert "never" in prompt.lower() and "price" in prompt.lower()


# ── The upgrade pitch still does name one ───────────────────────────────────

def test_listed_pools_still_quote_the_price(app):
    """The other half of the invariant.

    Dropping pricing from the cold email is only correct because the upgrade
    email carries it. If this also went silent there would be no ask at all
    and the campaign could not earn anything.
    """
    _, body = get_generic_draft(_cold(lead_pool="traffic"))
    text = _text(body)
    assert "$49" in text and "$79" in text


# ── Never promise a fill the link cannot deliver ────────────────────────────

def test_prefill_url_reports_success_for_a_saved_candidate(app):
    url, prefilled = _prefill_url(_cold())
    assert prefilled is True
    assert url.startswith("https://ai-compass.in/submit?c=")


def test_prefill_url_reports_failure_for_an_unsaved_candidate(app):
    url, prefilled = _prefill_url(OutreachCandidate(product_name="Nope"))
    assert prefilled is False
    assert url == "https://ai-compass.in/submit"


def test_copy_drops_the_prefill_claim_when_the_link_cannot_fill(app, monkeypatch):
    """A token that will not round-trip must not be described as pre-filled."""
    monkeypatch.setattr(outreach_mod, "read_prefill_token", lambda *a, **k: None)

    url, prefilled = _prefill_url(_cold())
    assert prefilled is False
    assert url == "https://ai-compass.in/submit"

    _, body = get_generic_draft(_cold())
    text = _text(body).lower()
    assert "pre-filled" not in text, (
        "the email claimed a filled form while linking to an empty one"
    )
    assert "?c=" not in text


def test_claim_and_link_never_disagree(app, monkeypatch):
    """The property, asserted in both directions.

    This is the actual invariant: the sentence and the URL are two halves of
    one promise, and every bug here was them disagreeing.
    """
    for works in (True, False):
        if works:
            monkeypatch.undo()
        else:
            monkeypatch.setattr(outreach_mod, "read_prefill_token", lambda *a, **k: None)

        _, body = get_generic_draft(_cold())
        text = _text(body).lower()
        claims = "pre-filled" in text
        has_token = "?c=" in text
        assert claims == has_token, (
            f"claim={claims} but token_in_link={has_token} (round_trip={works})"
        )
