"""The outreach email is a free-listing offer that reads like a person wrote it.

Two separate regressions are pinned here, because they had one shared cause —
the email was built to sell rather than to be read:

1. It opened by asking a stranger for $49. Free listings are the top of the
   funnel; upgrades are sold later to founders who are already listed and can
   see what the placement does for them (that path is the traffic-report
   email, not this one).
2. It was a styled newsletter — branded container, coloured button CTA, emoji
   wordmark, multiple links — sent from no-reply@. That combination is what
   Gmail's classifier reads as bulk mail, and it is why these landed in
   Promotions rather than the inbox.

The assertions below are deliberately about *shape*, not exact wording: the
copy should stay editable, but a future rewrite that reintroduces a button, a
second link, a paid-first pitch or the no-reply sender should fail here.
"""
import os
import re
import tempfile

import pytest

from app import create_app, db
from app.email_utils import html_to_plain_text, make_prefill_token, read_prefill_token
from app.models import OutreachCandidate
from app.outreach import (
    OUTREACH_FROM,
    _followup_content,
    _prefill_url,
    get_generic_draft,
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


def _candidate(app, **over):
    base = dict(
        product_name="Widget AI",
        tagline="Turn meeting notes into tickets",
        website_url="https://widget.example.com",
        founder_name="Priya Raman",
        email="founder@widget.example.com",
        status="draft_ready",
        draft_subject="About Widget AI",
        draft_body="<p>x</p>",
    )
    base.update(over)
    c = OutreachCandidate(**base)
    db.session.add(c)
    db.session.commit()
    return c


# ─── The offer ────────────────────────────────────────────────────────────────

def _price_scannable(text):
    """The email's prose, with URLs removed.

    The prefill link carries a random signed token, and a random base64
    string eventually contains any two digits you care to look for — so
    scanning the raw text for "49" is a test that fails on a dice roll rather
    than on a regression. Strip the URLs and check what a reader actually
    reads.
    """
    return re.sub(r"https?://\S+", " ", text)


def test_the_cold_email_names_no_price_at_all(app):
    """Superseded the old "free is mentioned before $49" rule.

    That rule was the right fix for the version that OPENED with a price, but
    it still left a $49 ask in a first email to a stranger. The campaign runs
    two tracks and they are different conversations: acquisition asks for a
    free listing, and the upgrade ask goes out 15 days after that listing is
    live and has impressions behind it (UPGRADE_MIN_DAYS_LIVE). Pricing here
    collapses the two and makes the free offer read as the opening move of a
    sale.
    """
    c = _candidate(app)
    _, html = get_generic_draft(c)
    text = html_to_plain_text(html)

    prose = _price_scannable(text)
    assert "it is free" in prose.lower()
    assert "$" not in prose, "the acquisition email must not name a price"
    for banned in ("49", "79", "Sponsored badge", "featured card",
                   "paid option", "upgrade"):
        assert banned.lower() not in prose.lower(), banned


def test_the_cold_email_says_plainly_there_is_nothing_to_pay(app):
    """Silence about money is not the same as saying there is none.

    Removing the price without replacing it leaves the question open, which
    is worse than the old paragraph: the founder assumes a bill is coming and
    the "free" claim reads as a hook.
    """
    c = _candidate(app)
    _, html = get_generic_draft(c)
    text = html_to_plain_text(html).lower()

    assert "nothing to pay" in text
    assert "no pressure either way" in text, (
        "The explicit permission to ignore the email is what keeps this a "
        "genuine offer rather than a solicitation."
    )


def test_an_already_listed_pool_still_quotes_the_price(app):
    """The other half of the invariant, and the half that earns.

    Dropping pricing from the cold email is only correct because the upgrade
    email carries it. If both went silent there would be no ask anywhere and
    the campaign could not make a sale.
    """
    c = _candidate(app)
    c.lead_pool = "traffic"
    db.session.commit()

    _, html = get_generic_draft(c)
    text = html_to_plain_text(html)

    assert text.count("$49") == 1
    assert text.count("$79") == 1
    # Invented urgency was banned from the prompt; it must not creep into the
    # fallback template either.
    for banned in ("limited time", "act now", "expires", "founding rate", "discount"):
        assert banned not in text.lower()


def test_follow_ups_stay_free_first_and_stop_after_the_second(app):
    c = _candidate(app)

    _, _, stage1 = _followup_content(c, 1)
    assert "free listing" in stage1.lower()
    assert "$49" not in stage1, (
        "Re-pitching a paid upgrade to someone who has not replied once is "
        "how a follow-up becomes spam."
    )

    _, _, stage2 = _followup_content(c, 2)
    assert "last email" in stage2.lower(), (
        "Stage 2 must say plainly that it is the final message."
    )
    assert "$49" not in stage2


# ─── The pre-filled link ──────────────────────────────────────────────────────

def test_the_email_carries_a_prefilled_link_for_this_candidate(app):
    c = _candidate(app)
    _, html = get_generic_draft(c)

    link, prefilled = _prefill_url(c)
    assert prefilled is True
    assert "?c=" in link
    assert link in html
    assert read_prefill_token(link.split("?c=")[1]) == c.id


def test_prefill_endpoint_fills_the_form_but_reveals_no_contact_data(app):
    c = _candidate(app)
    client = app.test_client()

    res = client.get(f"/api/v1/outreach/prefill/{make_prefill_token(c.id)}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["name"] == "Widget AI"
    assert body["url"] == "https://widget.example.com"
    assert body["reason"] == "Turn meeting notes into tickets"

    # The address discovery found for this founder, the confidence score and
    # the fit score are operational data about a person. Handing them back to
    # whoever holds the link would be a very different product.
    for leaked in ("email", "confidence_score", "fit_score", "founder_name", "status"):
        assert leaked not in body


def test_a_forged_or_unsigned_prefill_token_is_refused(app):
    client = app.test_client()
    for bad in ("garbage", "1", str(make_prefill_token(1)) + "x"):
        res = client.get(f"/api/v1/outreach/prefill/{bad}")
        assert res.status_code == 404, (
            "A raw or tampered id must not resolve — otherwise the candidate "
            "table can be walked by incrementing a number."
        )


def test_a_candidate_with_no_id_still_gets_a_working_link(app):
    # A draft generated before the row is flushed must not produce a link
    # containing the word "None".
    unsaved = OutreachCandidate(product_name="Unsaved", email="a@b.com")
    link, prefilled = _prefill_url(unsaved)
    assert link == "https://ai-compass.in/submit"
    # And the copy must not then claim the form is filled in — an email that
    # promises a pre-filled form and links to an empty one is a broken promise
    # in the first thing the founder checks.
    assert prefilled is False


# ─── Deliverability: it must not look like a newsletter ───────────────────────

def test_the_stored_draft_carries_no_styling_of_its_own(app):
    """The stored draft is CONTENT; the brand shell is applied at send.

    This used to be a deliverability rule — the sent email carried no styling
    at all, because plain HTML keeps cold mail out of Gmail's Promotions tab.
    That is no longer what happens: outreach_email_html() wraps the draft in
    the AI Compass shell on the way out, a deliberate choice to look like a
    real business even at some cost to placement.

    The rule still earns its place for a different reason. Keeping the stored
    draft free of presentation is what lets the shell change without
    invalidating a single approved draft — style lives in one template, and
    restyling never sends nineteen reviewed emails back for re-approval.
    """
    c = _candidate(app)
    _, html = get_generic_draft(c)

    # Margins on <p> are allowed — they are spacing, not decoration, and
    # without them some clients render one solid block.
    for promo in ("color:#", "font-weight:700", "border-bottom", "font-family",
                  "max-width", "<ul", "<table", "<img", "background"):
        assert promo not in html, f"{promo!r} is a Promotions-tab signal; keep the email plain."

    assert "🧭" not in html and "&#" not in html.replace("&#39;", "")


def test_the_email_contains_exactly_one_link_besides_the_opt_out(app):
    c = _candidate(app)
    _, html = get_generic_draft(c)

    links = [h for h in html.split('href="')[1:]]
    hrefs = [h.split('"')[0] for h in links]
    unsubscribe = [h for h in hrefs if "unsubscribe" in h]
    content = [h for h in hrefs if "unsubscribe" not in h]

    assert len(unsubscribe) == 1, "The opt-out link is required and must be present exactly once."
    assert len(content) == 1, (
        f"Expected one content link (the pre-filled submit URL), found {content}. "
        "Multiple calls to action split the reader's attention and read as bulk mail."
    )
    assert "?c=" in content[0]


def test_the_link_text_is_the_url_itself(app):
    # So it survives into the plain-text half, which is what several clients
    # and every text-only preview actually show.
    c = _candidate(app)
    _, html = get_generic_draft(c)
    link, _ = _prefill_url(c)
    assert f'<a href="{link}">{link}</a>' in html
    assert link in html_to_plain_text(html)


def test_outreach_sends_as_a_person_not_as_no_reply(app):
    assert "no-reply" not in OUTREACH_FROM.lower(), (
        "Gmail files mail by what it can see in the From line. A one-to-one "
        "note arriving from no-reply@ is classified as bulk before a human "
        "reads a word of it."
    )
    assert "@" in OUTREACH_FROM


def test_the_opt_out_stays_even_though_it_is_a_promotions_signal(app):
    # Deliberately pinned: the List-Unsubscribe header and the footer link are
    # a mild Promotions signal, and removing them would be a tempting way to
    # chase inbox placement. They stay — landing in spam (or breaking the
    # opt-out promise) is far worse than landing in Promotions.
    c = _candidate(app)
    _, html = get_generic_draft(c)
    assert "unsubscribe" in html.lower()

    from app.outreach import _outreach_send_headers
    headers = _outreach_send_headers(c.email)
    assert "List-Unsubscribe" in headers
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


# ─── The plain-text half ──────────────────────────────────────────────────────

def test_plain_text_keeps_paragraph_breaks_and_decodes_entities():
    html = "<p>First line.</p>\n<p>Second line &mdash; with an entity.</p>"
    text = html_to_plain_text(html)

    assert "&mdash;" not in text, "Entities must be decoded, not shipped raw."
    assert "\n\n" in text, (
        "Paragraph breaks must survive. The old converter dropped every blank "
        "line, so the text half arrived as one unbroken wall while the HTML "
        "half was neatly spaced — which reads as machine-generated."
    )
    assert text.startswith("First line.")


def test_the_two_halves_of_the_email_say_the_same_thing(app):
    c = _candidate(app)
    _, html = get_generic_draft(c)
    text = html_to_plain_text(html)

    # A text alternative that omits the offer or the link is worse than none.
    # "$49" is deliberately not in this list any more — the cold email names
    # no price, so requiring one here would be requiring the bug back.
    for essential in ("Widget AI", "nothing to pay", "No pressure either way"):
        assert essential.lower() in text.lower()
    link, _ = _prefill_url(c)
    assert link in text


# ─── Stale drafts must not outlive a copy change ──────────────────────────────

def test_a_draft_from_an_older_template_is_not_sendable(app):
    """Bumping the template version has to actually change what goes out.

    Drafts are generated once and stored, so without this check every
    candidate drafted before the bump would still be sent carrying the old
    paid-first, newsletter-styled copy — the version number would be the only
    thing that changed.
    """
    from app.outreach import CURRENT_DRAFT_TEMPLATE_VERSION, can_send_candidate

    c = _candidate(
        app,
        draft_template_version=CURRENT_DRAFT_TEMPLATE_VERSION - 1,
        confidence_score=95,
        verification_result="valid",
    )
    ok, reason = can_send_candidate(c)
    assert ok is False
    assert "template" in reason.lower()

    c.draft_template_version = CURRENT_DRAFT_TEMPLATE_VERSION
    ok, reason = can_send_candidate(c)
    assert ok is True, reason


def test_a_pre_versioning_draft_counts_as_stale(app):
    from app.outreach import can_send_candidate

    c = _candidate(app, draft_template_version=None, confidence_score=95,
                   verification_result="valid")
    ok, _ = can_send_candidate(c)
    assert ok is False, "NULL is not '< current' in SQL and must be handled explicitly."


def test_the_stale_block_drains_itself(app, monkeypatch):
    """The refusal above must be temporary, or sends go to zero permanently."""
    import app.outreach as outreach_mod
    from app.outreach import (
        CURRENT_DRAFT_TEMPLATE_VERSION,
        can_send_candidate,
        refresh_stale_drafts,
    )

    c = _candidate(app, draft_template_version=1, confidence_score=95,
                   verification_result="valid")
    monkeypatch.setattr(outreach_mod, "generate_draft_via_gemini",
                        lambda cand: ("About Widget AI", "<p>fresh copy</p>"))

    assert refresh_stale_drafts() == 1
    assert c.draft_template_version == CURRENT_DRAFT_TEMPLATE_VERSION
    assert c.draft_body == "<p>fresh copy</p>"
    ok, reason = can_send_candidate(c)
    assert ok is True, reason


def test_the_refresh_is_bounded_per_run(app, monkeypatch):
    import app.outreach as outreach_mod
    from app.outreach import refresh_stale_drafts

    for i in range(5):
        _candidate(app, product_name=f"Tool {i}", email=f"f{i}@example.com",
                   draft_template_version=1)
    monkeypatch.setattr(outreach_mod, "generate_draft_via_gemini",
                        lambda cand: ("s", "<p>b</p>"))

    assert refresh_stale_drafts(limit=2) == 2, (
        "A free-tier instance cannot redraft the whole backlog in one request; "
        "the remainder must roll to the next run."
    )
