"""Partner units on the pages that actually rank.

The best-of guides and the /alternatives/<slug> pages are the highest-intent
surfaces the site owns: somebody reading "Best Coding Tools" or "Notion
alternatives" has already decided to switch and is picking. "Your tool
appears on the guide for your category, labelled as a partner" is a
concrete, checkable deliverable — which "placement above free listings" is
not, however true it is.

This is a DELIVERABLE OF THE PAID LISTING TIERS, not a new thing to buy.
Fast-Track and Reviewed already grant placement; this is what that placement
looks like on the pages worth being placed on. Deliberately not a new SKU:
the ladder was just simplified, and adding a fourth price point to sell the
same audience again is how it grows back.

Three rules, enforced here rather than promised:

  1. Partner units are their own labelled block. They never enter the
     editorial ranking on the page, and the guide's own list is untouched.
     Same rule as sponsorship.py and community_leaderboard: a paid unit sits
     beside the editorial content, never inside it.
  2. A unit must be TRUE of the page it sits on. A paid-only tool cannot
     appear on the free-tools guide, and a tool with no student angle cannot
     appear on the students guide — eligibility is checked per surface, not
     just "did they pay". A guide that lies to a reader stops being a guide
     anyone reads, at which point the placement is worth nothing anyway.
  3. Capacity is fixed and oversubscription rotates, so a sponsor who bought
     a permanent listing gets exposure over time rather than losing forever
     to whoever was approved first.
"""

from datetime import datetime, timezone

from app.tool_cache import _sponsored_active, get_visible_tools

# Partner units rendered per page. Two: enough to be worth selling, few
# enough that the block stays a footnote to the editorial list rather than
# competing with it.
SURFACE_CAPACITY = 2

LABEL = "Partner"

# The disclosure printed on every unit. Not configurable, for the same
# reason editorial.DISCLOSURE is not.
DISCLOSURE = (
    "Partners are tools whose makers paid for a listing on AI Compass. "
    "They are shown separately and never affect the picks above."
)


def _pricing(tool):
    return str(tool.get("pricing") or tool.get("price") or "").strip().lower()


def _is_free_ish(tool):
    """Free or freemium — what the free-tools guide is about."""
    return _pricing(tool) in ("free", "freemium")


def _is_student_relevant(tool):
    return bool(
        tool.get("student_friendly")
        or tool.get("studentPerk")
        or tool.get("student_perk")
        or tool.get("student_discount")
    )


# surface id -> (human label, eligibility predicate)
#
# The predicate is the honesty rule from the docstring: it is what stops a
# paid placement from putting a $40/month tool on the free-tools guide.
GUIDE_SURFACES = {
    "best-coding-tools": (
        "Best Coding Tools",
        lambda t: str(t.get("category") or "").strip().lower() == "coding",
    ),
    "best-free-ai-tools": ("Best Free AI Tools", _is_free_ish),
    "best-ai-tools-for-students": ("Best AI Tools for Students", _is_student_relevant),
    # Teachers' picks use the same student-relevance signal: it is the one
    # the catalog actually records, and inventing an "educator" flag we do
    # not collect would be a predicate that silently always passes.
    "best-ai-tools-for-teachers": ("Best AI Tools for Teachers", _is_student_relevant),
}

# Prefix for the per-tool alternatives pages, e.g. "alternatives:notion".
ALTERNATIVES_PREFIX = "alternatives:"


def _rotation_offset(pool_size):
    """Which slice of an oversubscribed pool shows today.

    Rotating on the day means every eligible sponsor surfaces on a schedule
    they can predict and check, instead of the two earliest-approved tools
    owning the page permanently. Deterministic, so a page render and its
    impression beacon agree, and so a cached response is not lying.
    """
    if pool_size <= 0:
        return 0
    return datetime.now(timezone.utc).toordinal() % pool_size


def _eligible(surface, tools):
    """Sponsored, visible tools that are honestly at home on this surface."""
    surface = str(surface or "").strip().lower()

    if surface in GUIDE_SURFACES:
        _label, predicate = GUIDE_SURFACES[surface]
        return [t for t in tools if _sponsored_active(t) and predicate(t)]

    if surface.startswith(ALTERNATIVES_PREFIX):
        slug = surface[len(ALTERNATIVES_PREFIX):].strip().lower()
        if not slug:
            return []
        subject = next(
            (t for t in tools if str(t.get("slug") or "").strip().lower() == slug),
            None,
        )
        if subject is None:
            return []
        category = str(subject.get("category") or "").strip().lower()
        return [
            t for t in tools
            if _sponsored_active(t)
            and str(t.get("category") or "").strip().lower() == category
            # Never offer a tool as an alternative to itself.
            and str(t.get("slug") or "").strip().lower() != slug
        ]

    return []


def is_known_surface(surface):
    surface = str(surface or "").strip().lower()
    return surface in GUIDE_SURFACES or surface.startswith(ALTERNATIVES_PREFIX)


def partner_units(surface, limit=SURFACE_CAPACITY):
    """The labelled partner units to render on `surface`.

    Empty list for an unknown surface, and empty whenever nobody eligible is
    currently sponsored — the page then renders nothing at all rather than an
    empty "Partners" heading, which is the honest shape of no inventory.
    """
    if not is_known_surface(surface):
        return []

    pool = _eligible(surface, get_visible_tools() or [])
    if not pool:
        return []

    # Stable ordering before rotation, so the rotation is the only thing that
    # changes what a reader sees day to day.
    pool.sort(key=lambda t: str(t.get("slug") or ""))

    limit = max(1, min(int(limit or SURFACE_CAPACITY), SURFACE_CAPACITY))
    if len(pool) <= limit:
        chosen = pool
    else:
        start = _rotation_offset(len(pool))
        doubled = pool + pool
        chosen = doubled[start:start + limit]

    from app.sponsorship import _tool_card

    units = []
    for tool in chosen:
        slug = str(tool.get("slug") or "").strip().lower()
        card = _tool_card(tool, slug)
        units.append({
            **card,
            "placement": "partner",
            "label": LABEL,
            "surface": str(surface).strip().lower(),
            "blurb": card.get("tagline"),
            "cta_label": "Visit site",
            "source": "listing",
        })
    return units


def surfaces_for_tool(tool):
    """Every surface a given tool currently qualifies for.

    The founder-facing half: a sponsor's dashboard can name the exact pages
    their unit appears on, which is the difference between a checkable
    deliverable and a claim. Returns [] for an unsponsored tool.
    """
    if not tool or not _sponsored_active(tool):
        return []

    out = []
    for surface, (label, predicate) in GUIDE_SURFACES.items():
        if predicate(tool):
            out.append({"surface": surface, "label": label, "path": f"/{surface}"})

    category = str(tool.get("category") or "").strip().lower()
    slug = str(tool.get("slug") or "").strip().lower()
    if category:
        # Alternatives pages are per-tool and there are hundreds, so this
        # reports the count rather than listing them all.
        peers = [
            t for t in (get_visible_tools() or [])
            if str(t.get("category") or "").strip().lower() == category
            and str(t.get("slug") or "").strip().lower() != slug
        ]
        if peers:
            out.append({
                "surface": f"{ALTERNATIVES_PREFIX}*",
                "label": f"Alternatives pages for {len(peers)} tools in {tool.get('category')}",
                "path": f"/alternatives/{peers[0].get('slug')}",
                "count": len(peers),
            })
    return out
