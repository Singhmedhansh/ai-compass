"""Sponsored-inventory resolution and delivery reporting.

The revenue thesis, stated plainly so the code stays honest to it: people
pay for a placement when they can see (a) that the surface has real
attention on it, (b) exactly what they get and for how long, and (c) what
it delivered afterwards. That maps to three things here — public inventory
with honest scarcity, time-boxed slots, and impression/click reporting.

Nothing in this module can change a leaderboard rank. Paid units are always
resolved as their own labelled row; see community_leaderboard's docstring.
"""

from datetime import datetime, timedelta, timezone
from flask import current_app

from app import db
from app.models import (
    CatalogTool,
    OutboundClick,
    SponsorImpression,
    SponsorSlot,
    Submission,
)
from app.pricing_tiers import SPONSORED_PERK_TIERS, tier_for_pricing_model
from app.tool_cache import get_cached_tools

# How many units each surface can hold at once. These caps are the product:
# an unlimited "featured" section is wallpaper, a capped one is inventory.
PLACEMENT_CAPACITY = {
    "hero": 1,
    "board": 2,
    "rail": 4,
}

PLACEMENT_LABELS = {
    "hero": "Community Spotlight",
    "board": "Presenting Partner",
    "rail": "Featured Tool",
}

# Weekly list price per placement, in USD. Mirrored by SPONSOR_PLACEMENTS in
# frontend/src/config/sponsorTiers.js — change both together.
PLACEMENT_PRICING = {
    "hero": 149.0,
    "board": 89.0,
    "rail": 14.99,
}

# Placements currently on sale. The others still exist as inventory an admin
# can fill manually (comps, hand-negotiated deals) — "not yet for sale" is
# not the same as "cannot exist" — but self-serve checkout refuses them.
#
# This set, not the UI, is the authority: hiding a card in React would still
# leave anyone free to POST placement="hero" at the checkout endpoint and buy
# a tier we have not committed to delivering.
LIVE_PLACEMENTS = {"rail"}


def is_for_sale(placement):
    return placement in LIVE_PLACEMENTS

# Paid submission tiers that earn a complimentary rail slot on approval.
# Sourced from pricing_tiers so a new placement-bearing tier cannot be added
# to the ladder and silently miss this perk — which is exactly how the four
# inline `== "sponsored"` checks would have failed when Reviewed landed.
COMPLIMENTARY_TIERS = set(SPONSORED_PERK_TIERS)
COMPLIMENTARY_WINDOW_DAYS = 30


def _aware(value):
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def active_slots(placement=None):
    """Live slots, soonest-expiring first so renewal nudges are easy."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    query = SponsorSlot.query.filter(
        SponsorSlot.is_active.is_(True),
        SponsorSlot.starts_at <= now,
        SponsorSlot.ends_at > now,
    )
    if placement:
        query = query.filter(SponsorSlot.placement == placement)
    return query.order_by(SponsorSlot.ends_at.asc()).all()


def inventory():
    """Per-placement availability, for the public "slots left" counters.

    Sold-out counts are the single most effective thing on a sponsor page:
    they convert an open-ended ask into a deadline.
    """
    taken = {}
    for slot in active_slots():
        taken[slot.placement] = taken.get(slot.placement, 0) + 1

    out = []
    for placement, capacity in PLACEMENT_CAPACITY.items():
        used = taken.get(placement, 0)
        for_sale = is_for_sale(placement)
        out.append({
            "placement": placement,
            "label": PLACEMENT_LABELS[placement],
            "capacity": capacity,
            "taken": min(used, capacity),
            "available": max(0, capacity - used),
            "price_weekly": PLACEMENT_PRICING[placement],
            "sold_out": used >= capacity,
            "for_sale": for_sale,
            # Distinct from sold_out on purpose: "full this week, book the
            # next one" and "we don't sell this yet" are different answers
            # and the page should not conflate them.
            "coming_soon": not for_sale,
        })
    return out


def _tools_by_slug():
    return {
        str(t.get("slug", "")).strip().lower(): t
        for t in get_cached_tools()
    }


def _clean_emoji(value):
    """Drop an emoji that survived a bad encoding round-trip.

    Some catalog rows carry mojibake in this field (✳️ stored as "âœ³ï¸"),
    and ToolLogo's fallback chain would happily render that garbage as the
    tool's icon. A missing emoji degrades to a clean letter tile, which
    looks deliberate; mojibake just looks broken.
    """
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    return None if any(marker in text for marker in ("Ã", "â", "Â")) else text


def _tool_card(tool, slug):
    """Just enough of a tool to render a sponsored unit."""
    if not tool:
        return {"slug": slug, "name": slug.replace("-", " ").title()}
    return {
        "slug": slug,
        "name": tool.get("name") or slug,
        "category": tool.get("category"),
        "tagline": tool.get("tagline") or tool.get("shortDescription") or tool.get("summary"),
        "logo": tool.get("logo") or tool.get("logo_url") or tool.get("logoUrl"),
        "emoji": _clean_emoji(tool.get("emoji") or tool.get("logo_emoji")),
        # ToolLogo resolves a favicon from the tool's own domain via the
        # first-party /icon proxy. Without one of these fields it cannot,
        # and every row falls through to a generic letter tile.
        "url": tool.get("url") or tool.get("website") or tool.get("link"),
        "website": tool.get("website") or tool.get("url") or tool.get("link"),
        "link": tool.get("link") or tool.get("url") or tool.get("website"),
        "pricing": tool.get("pricing") or tool.get("pricingType") or tool.get("pricing_type"),
        "rating": tool.get("rating") or tool.get("averageRating") or tool.get("average_rating"),
    }


def complimentary_window(submission):
    """(starts_at, ends_at) of a paid submission's free rail boost, or None.

    The single definition of "is this submission currently earning a
    complimentary rail unit". Both the renderer and the founder dashboard
    call it, because the bug this fixes was exactly the two disagreeing: the
    community page showed a sponsor's card while their dashboard reported no
    placements at all, so the perk was delivered and invisible at the same
    time.

    The window runs from APPROVAL, not submission. Measuring it from
    submitted_at billed the founder for our own review queue — a row that sat
    three days in moderation delivered 27 of the 30 days it bought, and
    nothing in the UI accounted for the difference. Rows approved before
    Submission.approved_at existed fall back to submitted_at, which is the
    old (slightly short) behaviour rather than a fabricated start date.

    Deliberately NOT implemented by writing a SponsorSlot row on approval,
    which was the obvious-looking fix. Rail capacity is real inventory
    (PLACEMENT_CAPACITY["rail"] == 4) and next_available_start() counts
    active slots — so materialising comps as slots would let free boosts
    consume, and eventually sell out, the placements we charge money for.
    Complimentary units are synthesised precisely so they yield to paid
    inventory instead of competing with it.
    """
    if submission is None:
        return None
    if getattr(submission, "payment_status", None) != "verified":
        return None
    if tier_for_pricing_model(submission.pricing_model) not in COMPLIMENTARY_TIERS:
        return None
    if getattr(submission, "status", None) != "approved":
        # Nothing is boosted before the listing exists. Worth stating
        # explicitly rather than relying on the renderer's CatalogTool join
        # to filter it: the submitted_at fallback below would otherwise hand
        # a still-pending row a live window, and the admin queue reads this
        # predicate directly, without that join.
        return None
    # A booked Launch Day is what the window is timed on, when there is one:
    # the founder chose that date and told their own audience about it, so
    # starting their rail card days earlier — on whichever afternoon an admin
    # clicked approve — spends the perk before anyone is looking for it.
    # Falls back to approval, then to submission for rows that predate the
    # approved_at column.
    starts = (_aware(getattr(submission, "launch_at", None))
              or _aware(getattr(submission, "approved_at", None))
              or _aware(getattr(submission, "submitted_at", None)))
    if starts is None:
        return None
    ends = starts + timedelta(days=COMPLIMENTARY_WINDOW_DAYS)
    if ends <= datetime.now(timezone.utc):
        return None
    return starts, ends


def complimentary_placement_for_slug(slug):
    """The dashboard's view of the above: a placement dict, or None.

    Mirrors the shape active_slots() produces for a rented slot so the
    founder sees one consistent list regardless of how the placement was
    earned.
    """
    slug = str(slug or "").strip().lower()
    if not slug:
        return None
    row = (
        CatalogTool.query
        .filter(CatalogTool.slug == slug,
                CatalogTool.submission_id.isnot(None),
                CatalogTool.hidden.is_(False))
        .first()
    )
    if row is None:
        return None
    window = complimentary_window(Submission.query.get(row.submission_id))
    if window is None:
        return None
    starts, ends = window
    return {
        "placement": "rail",
        "label": PLACEMENT_LABELS["rail"],
        "starts_at": starts.isoformat(),
        "ends_at": ends.isoformat(),
        "source": "submission",
    }


def _complimentary_rail_units(tools, exclude_slugs):
    """Rail units earned by a recent paid submission rather than a rented slot.

    This preserves the behaviour the Community feature shipped with — a paid
    'sponsored' submission gets a visibility boost for 30 days — while moving
    it onto the same rendering path as rented inventory, so a sponsor sees
    one consistent unit and one consistent report either way.
    """
    units = []

    rows = (
        CatalogTool.query
        .filter(CatalogTool.submission_id.isnot(None), CatalogTool.hidden.is_(False))
        .all()
    )
    submission_ids = [r.submission_id for r in rows]
    if not submission_ids:
        return units

    subs = {
        s.id: s for s in
        Submission.query.filter(
            Submission.id.in_(submission_ids),
            Submission.payment_status == "verified",
        ).all()
    }

    for row in rows:
        slug = str(row.slug or "").strip().lower()
        if not slug or slug in exclude_slugs:
            continue
        # One predicate, shared with the dashboard — see complimentary_window.
        window = complimentary_window(subs.get(row.submission_id))
        if window is None:
            continue
        _submitted, ends = window

        card = _tool_card(tools.get(slug), slug)
        units.append({
            **card,
            "slot_id": None,
            "placement": "rail",
            "label": PLACEMENT_LABELS["rail"],
            "headline": None,
            "blurb": card.get("tagline"),
            "cta_label": "Visit site",
            "ends_at": ends.isoformat(),
            "source": "submission",
        })
        exclude_slugs.add(slug)

    units.sort(key=lambda u: u["ends_at"], reverse=True)
    return units


def sponsored_units():
    """{hero, board, rail} — the sponsored units to render, already capped.

    Rented slots always win over complimentary submission boosts, and the
    rail is topped up with boosts only while paid inventory is unsold.
    """
    tools = _tools_by_slug()
    buckets = {"hero": [], "board": [], "rail": []}
    seen = set()

    for slot in active_slots():
        placement = slot.placement if slot.placement in buckets else "rail"
        if len(buckets[placement]) >= PLACEMENT_CAPACITY[placement]:
            continue
        slug = str(slot.tool_slug or "").strip().lower()
        card = _tool_card(tools.get(slug), slug)
        buckets[placement].append({
            **card,
            "slot_id": slot.id,
            "placement": placement,
            "label": PLACEMENT_LABELS[placement],
            "headline": slot.headline,
            "blurb": slot.blurb or card.get("tagline"),
            "cta_label": slot.cta_label or "Visit site",
            "ends_at": _aware(slot.ends_at).isoformat(),
            "source": "slot",
        })
        seen.add(slug)

    rail_room = PLACEMENT_CAPACITY["rail"] - len(buckets["rail"])
    if rail_room > 0:
        # Complimentary units are a perk; rented slots are revenue. They read
        # different tables (catalog_tools + submissions vs sponsor_slots), and
        # letting the perk lookup fail the whole call meant one bad column on
        # `submissions` blanked the placements people had actually paid for.
        # Degrade the perk, never the paid inventory.
        try:
            buckets["rail"].extend(_complimentary_rail_units(tools, seen)[:rail_room])
        except Exception:
            current_app.logger.exception("complimentary rail units unavailable")
            try:
                db.session.rollback()
            except Exception:
                current_app.logger.exception("complimentary rail rollback failed")

    return buckets


def _week_start(moment):
    """Monday 00:00 UTC of the week containing `moment` (naive UTC)."""
    day = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=day.weekday())


def next_available_start(placement, weeks=1):
    """Earliest Monday a `weeks`-long booking fits without exceeding capacity.

    Capacity has to hold even when two people pay within seconds of each
    other, and money is already captured by the time we get here — so
    rather than failing (and owing a refund) we roll the booking forward to
    the first week with room and tell the buyer the start date. Scarcity
    stays real, nobody gets charged for nothing.
    """
    capacity = PLACEMENT_CAPACITY.get(placement, PLACEMENT_CAPACITY["rail"])
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cursor = _week_start(now)

    existing = SponsorSlot.query.filter(
        SponsorSlot.is_active.is_(True),
        SponsorSlot.placement == placement,
        SponsorSlot.ends_at > now,
    ).all()

    # Bounded scan: a year out is far past the point where the honest
    # answer is "talk to us" rather than an automatic booking.
    for _ in range(52):
        start = cursor
        end = cursor + timedelta(days=7 * max(1, weeks))
        overlapping = sum(
            1 for s in existing
            if s.starts_at < end and s.ends_at > start
        )
        if overlapping < capacity:
            # Never backdate: a slot bought on Thursday starts immediately,
            # not on Monday, but still ends when its final week does.
            return max(start, now), end
        cursor += timedelta(days=7)

    return None, None


def create_slot(
    tool_slug,
    placement,
    weeks=1,
    amount_paid=0.0,
    payment_ref=None,
    contact_email=None,
    headline=None,
    blurb=None,
    cta_label=None,
    submission_id=None,
):
    """Books a slot. Returns (slot, error_code).

    Callers must have verified payment already — this function does not
    know or care how the money was taken.
    """
    slug = str(tool_slug or "").strip().lower()
    if not slug:
        return None, "missing_tool_slug"
    if placement not in PLACEMENT_CAPACITY:
        return None, "unknown_placement"

    if payment_ref:
        existing = SponsorSlot.query.filter_by(payment_ref=payment_ref).first()
        if existing:
            # Idempotent: a retried or double-submitted capture returns the
            # slot it already bought rather than minting a second one.
            return existing, None

    starts_at, ends_at = next_available_start(placement, weeks)
    if starts_at is None:
        return None, "no_capacity_within_a_year"

    slot = SponsorSlot(
        tool_slug=slug,
        placement=placement,
        tier="sponsored",
        headline=(headline or None),
        blurb=(blurb or None),
        cta_label=(cta_label or None),
        starts_at=starts_at,
        ends_at=ends_at,
        is_active=True,
        amount_paid=float(amount_paid or 0.0),
        payment_ref=payment_ref or None,
        contact_email=(contact_email or None),
        submission_id=submission_id,
    )
    try:
        db.session.add(slot)
        db.session.commit()
        return slot, None
    except Exception:
        db.session.rollback()
        return None, "slot_write_failed"


def slot_payload(slot):
    return {
        "id": slot.id,
        "tool_slug": slot.tool_slug,
        "placement": slot.placement,
        "label": PLACEMENT_LABELS.get(slot.placement, slot.placement),
        "headline": slot.headline,
        "blurb": slot.blurb,
        "cta_label": slot.cta_label,
        "starts_at": _aware(slot.starts_at).isoformat(),
        "ends_at": _aware(slot.ends_at).isoformat(),
        "is_active": bool(slot.is_active),
        "amount_paid": slot.amount_paid,
        "contact_email": slot.contact_email,
        "payment_ref": slot.payment_ref,
        "created_at": _aware(slot.created_at).isoformat(),
    }


# Placements an impression may be recorded against. A superset of the
# rentable inventory: "partner" units on the guide and alternatives pages are
# a perk of the paid listing tiers rather than a slot anyone books (see
# app/partner_slots.py), but they are reported on exactly like rented ones —
# a deliverable a sponsor cannot measure is one they have to take on trust.
IMPRESSION_PLACEMENTS = frozenset(PLACEMENT_CAPACITY) | {"partner"}


def record_impression(tool_slug, placement="rail", slot_id=None):
    """Fire-and-forget; a lost beacon must never break a page render."""
    slug = str(tool_slug or "").strip().lower()
    if not slug:
        return False
    try:
        db.session.add(SponsorImpression(
            slot_id=slot_id,
            tool_slug=slug,
            placement=placement if placement in IMPRESSION_PLACEMENTS else "rail",
        ))
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        return False


def delivery_report(tool_slug, days=30):
    """Impressions, clicks and CTR for a sponsor's own dashboard.

    Clicks come from the OutboundClick rows /go/<slug> already writes, so a
    sponsor's report and the site's own analytics can never disagree.
    """
    slug = str(tool_slug or "").strip().lower()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).replace(tzinfo=None)

    impressions = SponsorImpression.query.filter(
        SponsorImpression.tool_slug == slug,
        SponsorImpression.created_at >= since,
    ).count()
    clicks = OutboundClick.query.filter(
        OutboundClick.slug == slug,
        OutboundClick.created_at >= since,
    ).count()

    return {
        "tool_slug": slug,
        "window_days": days,
        "impressions": impressions,
        "clicks": clicks,
        "ctr": round((clicks / impressions) * 100, 2) if impressions else 0.0,
    }
