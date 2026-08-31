"""Canonical submission pricing ladder.

Single source of truth for the tier prefixes/amounts used by submit_tool()
and admin_approve_submission() in api_routes.py — change a price here, not
in three call sites. No Flask/DB imports, so it's safe to import anywhere
without risking a circular import.

The ladder is priced on DELIVERABLES, not on queue position. That is the
correction this file records:

  Quick Review ($14.99) sold nothing but a place in a queue the operator
  personally controls. Twelve consecutive founders declined it, and a toll
  booth is what it reads as. It is retired — `for_sale: False` — rather than
  deleted, because live rows still carry `quick_paypal` pricing_models and
  every reporting and entitlement path has to keep resolving them. "Not for
  sale" and "cannot exist" are different statements; see LIVE_PLACEMENTS in
  sponsorship.py for the same distinction applied to placements.

  The free wait dropped from 14 days to 7. Two weeks of invisibility does
  not create urgency, it creates churn: it left most submitted tools unseen
  for a fortnight, so the founder saw nothing happen and had no reason to
  come back. Time-to-live is the weakest thing a directory can sell, so it
  is no longer what the paid tiers are sold on — they are faster as a side
  effect, not as the product.

  Fast-Track ($49) sells placement and reporting. Reviewed ($79) sells
  Fast-Track plus the thing that actually survives a week of attention: a
  hands-on editorial review on an indexed page (see app/editorial.py). The
  review alone, for a tool already listed, is $39.
"""

TIERS = {
    # visibility_delay_days: how long an approved submission sits in the
    # catalog (row exists, hidden=False) before it actually appears in
    # get_visible_tools(). See catalog_tools.visible_at.
    #
    # for_sale: whether the checkout will accept a claim of this tier. A
    # retired tier keeps its entry so existing rows still resolve to it.
    "free": {
        "prefix": "free", "price": 0.0, "paid": False,
        "visibility_delay_days": 7, "for_sale": True,
    },
    "quick": {
        "prefix": "quick", "price": 14.99, "paid": True,
        "visibility_delay_days": 2, "for_sale": False,
    },
    "sponsored": {
        "prefix": "sponsored", "price": 49.0, "paid": True,
        "visibility_delay_days": 1, "for_sale": True,
    },
    "reviewed": {
        "prefix": "reviewed", "price": 79.0, "paid": True,
        "visibility_delay_days": 1, "for_sale": True,
    },
}

# Tiers that grant the catalog placement perks: above-free ranking, the
# labelled "Sponsored" badge, the homepage strip, the complimentary rail
# card, first position in the digest.
#
# Exists so those perks are decided in ONE place. They used to be gated on
# `tier_key == "sponsored"` inline at four call sites, which is a bug
# waiting for the next tier to be added — exactly what happened here.
SPONSORED_PERK_TIERS = ("sponsored", "reviewed")

# Tiers whose purchase price includes a commissioned editorial review.
REVIEW_INCLUDED_TIERS = ("reviewed",)


def visibility_delay_days_for_tier(tier_key):
    """Days an approved submission waits before going live. Unrecognized
    tiers fall back to the free-tier (longest/safest) delay."""
    return TIERS.get(tier_key, TIERS["free"])["visibility_delay_days"]


def price_for_tier(tier_key):
    """List price in USD. Unrecognized tiers are free — never guess upward,
    since this figure is what a payment is verified against."""
    return TIERS.get(tier_key, TIERS["free"])["price"]


def is_for_sale(tier_key):
    """Whether checkout may accept this tier today.

    Checked server-side, not just hidden in the UI: removing a card from
    React would still leave anyone free to POST a retired tier's
    pricing_model and buy something we have stopped selling.
    """
    return bool(TIERS.get(tier_key, {}).get("for_sale"))


def includes_sponsored_perks(tier_key):
    """Does this tier buy catalog placement (badge, ranking, rail, strip)?"""
    return tier_key in SPONSORED_PERK_TIERS


def includes_editorial_review(tier_key):
    """Does this tier's price include a commissioned hands-on review?"""
    return tier_key in REVIEW_INCLUDED_TIERS


def tier_for_pricing_model(pricing_model_raw):
    """Returns 'quick' | 'sponsored' | 'reviewed' | 'free' | None (unrecognized).

    Matches by prefix against the raw or composite pricing_model string
    (e.g. "quick_paypal" or "sponsored_paypal:8AB12345"). Tier prefixes are
    mutually exclusive by construction, so first-match-wins is safe.
    """
    raw = str(pricing_model_raw or "")
    for key, cfg in TIERS.items():
        if raw.startswith(cfg["prefix"]):
            return key
    return None


def effective_tier(pricing_model_raw, payment_status):
    """The tier a submission actually gets, not merely the one it claimed.

    An unverified paid claim (payment_status != "verified") is treated as
    'free' — the same rule already inlined in submit_tool()/the submitter
    dashboard (api_routes.py). Unrecognized pricing_model strings also fall
    back to 'free'. Always returns one of the TIERS keys.
    """
    claimed = tier_for_pricing_model(pricing_model_raw) or "free"
    return claimed if payment_status == "verified" else "free"
