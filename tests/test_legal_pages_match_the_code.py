"""The legal pages have to describe the product that exists.

These pages are not marketing copy. /refunds is what a buyer reads before
sending $79, /terms is what would be argued over if a payment went wrong, and
/privacy is what a regulator or a user compares against actual behaviour. All
three have drifted from the code before — the refunds page once described
cancelling a Stripe subscription through a billing dashboard, a product this
site has never had, and the privacy page described a PostHog configuration
that was the opposite of the real one.

Drift happens because prices and behaviour live in Python while the promises
live in JSX, and nothing connects them. This connects the part that can be
checked mechanically: every price a page quotes must be a price the code
actually charges, and a tier withdrawn from sale must not still be advertised.

What this cannot check is whether a sentence is *true* — "we refund within 5
business days" is a commitment, not a constant. Those are listed in
SECURITY_AUDIT.md and reviewed by hand.
"""

import re
from pathlib import Path

import pytest

from app.editorial import REVIEW_PRICE
from app.pricing_tiers import TIERS
from app.sponsorship import PLACEMENT_PRICING

PAGES_DIR = Path(__file__).resolve().parent.parent / "frontend" / "src" / "pages"
LEGAL_PAGES = ["RefundsPage.jsx", "TermsPage.jsx", "PricingPage.jsx"]

PRICE_IN_COPY = re.compile(r"\$(\d+(?:\.\d{2})?)")


def legitimate_prices():
    """Every amount the code can actually charge."""
    prices = {float(t["price"]) for t in TIERS.values()}
    prices.add(float(REVIEW_PRICE))
    prices.update(float(p) for p in PLACEMENT_PRICING.values())
    return prices


def page_text(name):
    return (PAGES_DIR / name).read_text(encoding="utf-8")


def rendered_text(name):
    """Page copy with source comments stripped.

    These files carry long comments explaining what the copy used to say and
    why it was wrong — RefundsPage.jsx quotes the old subscription wording
    verbatim. Checking the raw file therefore flags the explanation of a fixed
    bug as the bug itself, so the prose checks read this instead.
    """
    text = page_text(name)
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.DOTALL)   # /* block */ and {/* jsx */}
    text = re.sub(r"^\s*//.*$", " ", text, flags=re.MULTILINE)  # // line
    return text


@pytest.mark.parametrize("page", LEGAL_PAGES)
def test_every_price_quoted_is_a_price_we_charge(page):
    """Catches a price edited in one place and not the other."""
    allowed = legitimate_prices()
    quoted = {float(m) for m in PRICE_IN_COPY.findall(rendered_text(page))}

    unknown = {q for q in quoted if q not in allowed}

    assert not unknown, (
        f"{page} quotes {sorted(unknown)}, which no tier, review or placement charges. "
        f"Chargeable amounts are {sorted(allowed)}."
    )


@pytest.mark.parametrize("page", LEGAL_PAGES)
def test_a_tier_withdrawn_from_sale_is_not_still_advertised(page):
    """`for_sale: False` means checkout refuses it. Advertising a price we
    will not accept is the version of this bug that costs someone money."""
    text = rendered_text(page).lower()

    for key, tier in TIERS.items():
        if tier.get("for_sale") or not tier.get("paid"):
            continue
        price = tier["price"]
        # The retired tier's price appearing at all is the signal worth
        # failing on; its internal key ("quick") is too common a word to
        # match on safely.
        rendered = f"${price:g}"
        if rendered in text:
            # A shared price is not proof of advertising: assert it only
            # when no on-sale product charges the same amount.
            on_sale_same_price = any(
                other.get("for_sale") and other["price"] == price
                for other in TIERS.values()
            ) or price in {float(REVIEW_PRICE), *map(float, PLACEMENT_PRICING.values())}
            assert on_sale_same_price, (
                f"{page} advertises {rendered}, but tier '{key}' is for_sale=False "
                "and checkout will refuse it."
            )


def test_no_page_claims_a_subscription():
    """Every paid thing here is a single PayPal charge. The refunds page once
    described cancelling a subscription and keeping premium features until the
    end of a billing period — none of which has ever existed."""
    forbidden = ["billing period", "billing cycle", "recurring payment", "auto-renew", "stripe"]

    for page in LEGAL_PAGES:
        text = rendered_text(page).lower()
        for phrase in forbidden:
            # "no billing cycle" and similar denials are the correct usage.
            for match in re.finditer(re.escape(phrase), text):
                preceding = text[max(0, match.start() - 40):match.start()]
                negated = any(w in preceding for w in ("no ", "not ", "never ", "without "))
                assert negated, (
                    f"{page} refers to '{phrase}' without negating it. "
                    "Nothing on this site recurs."
                )


def test_the_privacy_page_does_not_claim_data_is_stored_in_india():
    """The Render database is in Virginia. The page used to say information
    was "transferred to and stored in India", which confused where the
    business is run from with where the data sits — a material difference for
    an EU or UK user, since one is an international transfer and the other is
    not.

    The phrase survives in exactly one place: the dated correction that says
    the old version was wrong. That is deliberate, so the assertion is about
    the count rather than the presence.
    """
    text = page_text("PrivacyPage.jsx")

    occurrences = text.lower().count("stored in india")

    assert occurrences <= 1, (
        "the 'stored in India' claim appears more than once; only the "
        "correction paragraph should still contain it"
    )
    if occurrences == 1:
        assert "An earlier version of this page" in text, (
            "'stored in India' appears outside the correction paragraph"
        )
    assert "Virginia" in text, "the page should name where the data actually is"
