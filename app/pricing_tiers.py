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

  The free wait went 14 days -> 7 -> 0. Each cut was the same argument
  reaching its conclusion: time-to-live is the weakest thing a directory can
  sell, and the wait was never what anyone was buying. It sold zero upgrades
  in either form.

  What it did cost was real. A listing that is not public is not being
  crawled, so every day of delay is a day of indexing the site never gets
  back — and for a directory whose whole value to a founder is an indexed
  page that ranks, that is the most expensive thing on the ladder to give
  away. Eleven listings sat approved and invisible at once before this was
  measured (see the admin Listings tab), earning nothing for anybody.

  So a free listing is now live at approval, and the paid tiers no longer
  claim to be faster to publish. What Fast-Track actually sells is unchanged
  and was always the real product: priority in the REVIEW queue (reviewed
  first, target 24h, rather than after every paid submission), placement
  above free listings, the labelled badge, the rail card, partner units,
  digest position, Launch Day and the reporting.

  Fast-Track ($49) sells placement and reporting. Reviewed ($79) sells
  Fast-Track plus the thing that actually survives a week of attention: a
  hands-on editorial review on an indexed page (see app/editorial.py). The
  review alone, for a tool already listed, is $39.

  Listing + Analytics ($19) is the paid entry point, and it is deliberately
  NOT the "claimed listing" the diagnostic proposed. Claiming a listing,
  editing its copy, the maker badge and replying to reviews all shipped
  free (app/claims.py) — anyone who can prove they own the domain gets
  them. Charging for those now would be withdrawing a live free feature and
  calling it a product. What this tier actually sells is the only thing
  behind that wall: the numbers. The dashboard, and the monthly report
  emailed to the founder (app/founder_report.py). It buys no placement, no
  badge and no queue position beyond the ordinary paid-before-free review
  order, and it publishes at approval exactly like free does: a directory
  that sells time-to-live is selling the weakest thing it has.
"""

TIERS = {
    # visibility_delay_days: how long an approved submission sits in the
    # catalog (row exists, hidden=False) before it actually appears in
    # get_visible_tools(). See catalog_tools.visible_at.
    #
    # for_sale: whether the checkout will accept a claim of this tier. A
    # retired tier keeps its entry so existing rows still resolve to it.
    "free": {
        # 0: live at approval. See the module docstring — the wait sold
        # nothing and cost indexing time, which is the one thing this site
        # cannot buy back later.
        "prefix": "free", "price": 0.0, "paid": False,
        "visibility_delay_days": 0, "for_sale": True,
    },
    "analytics": {
        # The $19 entry point. Same speed as free — it sells the reporting,
        # not the speed, and not the claim (which is free for everyone).
        "prefix": "analytics", "price": 19.0, "paid": True,
        "visibility_delay_days": 0, "for_sale": True,
    },
    "quick": {
        "prefix": "quick", "price": 14.99, "paid": True,
        "visibility_delay_days": 2, "for_sale": False,
    },
    # The placement tiers publish at approval too, now that free does. A
    # one-day delay that used to read as "faster than free" would, against a
    # free tier that is instant, read only as "slower" — the exact opposite
    # of what it was there to say.
    "sponsored": {
        "prefix": "sponsored", "price": 49.0, "paid": True,
        "visibility_delay_days": 0, "for_sale": True,
    },
    "reviewed": {
        "prefix": "reviewed", "price": 79.0, "paid": True,
        "visibility_delay_days": 0, "for_sale": True,
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
    """Returns 'analytics' | 'quick' | 'sponsored' | 'reviewed' | 'free' | None.

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
