"""Central affiliate-link registry.

Add a program here as you join it: tool slug -> affiliate destination URL.
The /go/<slug> redirect resolves through this; a tool with no entry simply
falls back to its normal link, so onboarding a new affiliate program is a
one-line change with zero frontend redeploy.

Keep this honest: an affiliate link must never change which tools we
recommend or how they're ranked. It only changes the outbound URL.
"""

AFFILIATES: dict[str, str] = {
    # slug: affiliate URL
    "sudowrite": "https://www.sudowrite.com/?via=medhansh",
    # ElevenLabs affiliate program (PartnerStack), joined 2026-05.
    # Same URL is also on the catalog row's `affiliate_url` field as a
    # belt-and-braces fallback, but the registry is the authoritative
    # source — outbound() checks it first.
    "elevenlabs": "https://try.elevenlabs.io/2f10b9jmqa4g",
    # Screenpipe affiliate program (Dub), applied via
    # https://partners.dub.co/screenpipe/apply and approved 2026-09-06.
    # 25% of a referred customer's first paid subscription transaction;
    # free signups generate $0 commission. Same URL is also mirrored onto
    # the catalog row's `affiliate_url` field as a belt-and-braces
    # fallback, but this registry is authoritative — outbound() checks
    # it first.
    "screenpipe": "https://go.screenpi.pe/ai-compass",
    # Jenni AI affiliate program (Rewardful), joined 2026-09. 30% of every
    # payment in a referred customer's first 6 months. First commission
    # landed 2026-09 and confirmed the /go/ hop attributes correctly.
    #
    # This link already worked before it was listed here, via the catalog
    # row's affiliate_url fallback in outbound() — which is exactly why it
    # is being added: a program that only lives in the database is invisible
    # to anyone reading this file to find out what we are enrolled in.
    "jenni-ai": "https://jenni.ai/?via=medhansh",
    # SciSpace ambassador program (Rewardful), joined 2026-09.
    # 10% commission on the first payment within the first 1 month.
    "scispace": "https://scispace.com/?via=medhansh",
    "typeset": "https://scispace.com/?via=medhansh",
    # Taskade affiliate partnership program (FirstPromoter), joined 2026-09.
    # 20% recurring commission.
    "taskade": "https://www.taskade.com/?via=medhansh",
    # Paperpal affiliate program (LinkMink), joined 2026-09. 30% commission
    # on every sale through the link. The dashboard also issues a reader
    # discount code, PAP20 — see COUPONS below.
    "paperpal": "https://paperpal.com/?linkId=lp_726731&sourceId=medhansh&tenantId=paperpal",
}


# Reader-facing discount codes that come WITH an affiliate program.
#
# Two things must stay true about anything in here:
#   1. The code is a genuine saving the reader gets for using our link. It is
#      never a reason a tool ranks higher — ranking never sees this table.
#   2. We only list a code the program actually issued us. A made-up or
#      expired code costs a reader their trust at the checkout page, which is
#      the worst possible place to lose it, so remove an entry the moment the
#      program retires it.
#
# `expires` is an ISO date (YYYY-MM-DD) or None for open-ended. An expired
# code stops being served — see coupon_for().
COUPONS: dict[str, dict] = {
    "paperpal": {
        "code": "PAP20",
        "discount": "20% off",
        "detail": "20% off all Paperpal plans",
        "expires": None,
    },
}



def affiliate_for(slug: str | None) -> str | None:
    """Return the affiliate URL for a tool slug, or None if not enrolled."""
    if not slug:
        return None
    return AFFILIATES.get(slug.strip().lower())


def has_affiliate(slug: str | None) -> bool:
    return affiliate_for(slug) is not None


def coupon_for(slug: str | None) -> dict | None:
    """Return the live discount code for a tool slug, or None.

    Returns None for an expired code rather than the expired code itself: a
    reader who types a dead code at checkout blames us, not the vendor, so
    lapsing quietly is the only acceptable failure mode.
    """
    if not slug:
        return None
    entry = COUPONS.get(slug.strip().lower())
    if not entry:
        return None
    expires = entry.get("expires")
    if expires:
        from datetime import date

        try:
            if date.fromisoformat(str(expires)) < date.today():
                return None
        except ValueError:
            # Unparseable date — serve it rather than silently dropping a
            # live code over a typo, but it will show up in the admin count.
            pass
    return {
        "code": entry["code"],
        "discount": entry.get("discount") or "",
        "detail": entry.get("detail") or "",
        "expires": expires,
    }


def enrolled_slugs() -> list[str]:
    """Every tool slug with a registry affiliate link, sorted."""
    return sorted(AFFILIATES)


def program_count() -> int:
    """Number of distinct affiliate PROGRAMS, not enrolled slugs.

    Two slugs can point at one program — `scispace` and `typeset` are the
    same company under two names — and counting slugs would overstate how
    many applications have actually been approved, which is the number this
    exists to report.
    """
    return len({url.split("?", 1)[0].rstrip("/") for url in AFFILIATES.values()})
