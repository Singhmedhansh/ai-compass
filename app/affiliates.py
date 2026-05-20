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
}


def affiliate_for(slug: str | None) -> str | None:
    """Return the affiliate URL for a tool slug, or None if not enrolled."""
    if not slug:
        return None
    return AFFILIATES.get(slug.strip().lower())


def has_affiliate(slug: str | None) -> bool:
    return affiliate_for(slug) is not None
