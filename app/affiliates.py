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
}



def affiliate_for(slug: str | None) -> str | None:
    """Return the affiliate URL for a tool slug, or None if not enrolled."""
    if not slug:
        return None
    return AFFILIATES.get(slug.strip().lower())


def has_affiliate(slug: str | None) -> bool:
    return affiliate_for(slug) is not None
