"""Category landing pages — the canonical category list, derived live.

The catalog's `category` strings are the source of truth and this module
never rewrites or merges them: a page exists for whatever the catalog
actually contains, so adding a category to a tool is enough to make its
landing page appear. Slugs are derived from the canonical name, so they
stay stable as long as the name does.

Two things this module deliberately does NOT do:

  1. It does not merge near-duplicate categories ("Design & Graphics" vs
     "Design & Creative"). That is a catalog decision, not a routing one,
     and quietly folding them here would make the site disagree with the
     admin panel about how many categories exist.
  2. It does not invent counts. A category page renders the tools that are
     visible right now, which is why `build_index()` reads the live cache
     on every call rather than caching a snapshot at import time.

`MIN_INDEXABLE` is the one editorial judgement in here: a landing page
built on one or two tools is a thin page, and asking Google to index a
few dozen of those is how a directory earns a quality demotion across the
whole domain. Below the threshold the page still *works* — a human
following a link gets the real thing — it just carries `noindex` and
stays out of the sitemap until the category grows into it.
"""

from __future__ import annotations

import re

from app.tool_cache import get_visible_tools

# A category needs this many visible tools before we ask a crawler to index
# its landing page. Matches HUB_MIN_PER_SECTION in DirectoryPage.jsx, which
# is the same judgement applied to the /tools hub sections.
MIN_INDEXABLE = 6

# Per-category copy. Keyed by the lowercased canonical name so a rename that
# only changes capitalisation doesn't silently drop the blurb. A category
# with no entry falls back to generated copy — it renders fine, it just
# reads generically, which is the nudge to write a real line for it.
_COPY: dict[str, str] = {
    "coding": (
        "AI pair programmers, code review bots, and terminal agents — the "
        "tools that write, explain, and debug code alongside you."
    ),
    "coding & programming": (
        "Programming assistants and developer utilities for building, "
        "testing, and shipping code faster."
    ),
    "productivity": (
        "Note-taking, task management, scheduling, and meeting tools that "
        "cut the admin work around actually studying or building."
    ),
    "research": (
        "Literature search, paper summarisers, citation managers, and "
        "reading assistants for coursework and dissertations."
    ),
    "research & productivity": (
        "Tools that sit between reading and writing — capture, summarise, "
        "and organise sources without losing the thread."
    ),
    "research & study": (
        "Study aids, flashcard generators, and revision planners built "
        "around how exams are actually revised for."
    ),
    "writing & chat": (
        "Chat assistants, drafting tools, and editors for essays, emails, "
        "and everything in between."
    ),
    "design & graphics": (
        "Interface design, illustration, and layout tools — from quick "
        "social graphics to full product mockups."
    ),
    "design & creative": (
        "Creative tooling for visual work: mockups, branding, and the "
        "asset-generation end of design."
    ),
    "courses & tutorials": (
        "Structured learning — courses, guided tutorials, and practice "
        "platforms for picking up a new skill properly."
    ),
    "image generation": (
        "Text-to-image models and editors for illustration, mockups, and "
        "presentation visuals."
    ),
    "video generation": (
        "Text-to-video, avatar presenters, and AI editors for turning a "
        "script or a rough cut into something watchable."
    ),
    "audio & voice": (
        "Speech synthesis, voice cloning, transcription, and music tools "
        "for narration, podcasts, and lecture notes."
    ),
    "education": (
        "Classroom and learning-platform tools for students and the people "
        "teaching them."
    ),
    "developer tools": (
        "Supporting infrastructure for developers — the tooling around the "
        "code rather than the code itself."
    ),
}


def slugify(name: str) -> str:
    """Canonical category name -> URL slug.

    Deliberately the same transform DirectoryPage.jsx's categorySlug() uses,
    so a slug minted in the client and one minted here always agree.
    """
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", (name or "").lower()))


def describe(name: str, count: int) -> str:
    """Blurb for a category — hand-written where we have one."""
    written = _COPY.get((name or "").strip().lower())
    if written:
        return written
    plural = "tool" if count == 1 else "tools"
    return (
        f"{count} hand-tested {name} {plural} on AI Compass — pricing, free "
        "tiers, and student options compared."
    )


def _ranked(members: list[dict], sponsored_first: bool = True) -> list[dict]:
    """Order a category's tools.

    Reuses api_routes' sort keys rather than restating them, so a change to
    how placement sorts lands here too instead of leaving category pages
    quietly on an older rule. Imported lazily because api_routes imports
    plenty at module scope and this module is pulled in from the SPA shell
    path.

    `sponsored_first=False` drops paid placement from the sort and orders on
    the curation score alone. That is the mode the sitemap uses, and the
    reason it exists: on a *page*, a sponsored tool taking the top slot is
    fine because the card is labelled and the reader can see the trade. In
    the sitemap there is no label and no reader — picking which comparison
    pages get submitted to Google by sponsorship would quietly hand paying
    tools a pile of indexed real estate their curation score never earned.
    That is the promise on /how-we-rank in everything but name.

    Paid placement reorders a disclosed slot and nothing else. No affiliate
    or coupon state is readable from here, and it must stay that way — see
    the two rules at the top of docs/affiliate-programs.md.
    """
    try:
        from app.api_routes import _placement_rank, _summary_score
    except Exception:
        return sorted(members, key=lambda t: str(t.get("name") or "").lower())
    key = _placement_rank if sponsored_first else _summary_score
    return sorted(members, key=key, reverse=True)


def build_index() -> list[dict]:
    """Every category present in the visible catalog, biggest first.

    Returns dicts of {slug, name, count, description, indexable}. Never
    raises: a broken cache yields an empty list so /categories renders an
    empty state rather than 500-ing the whole SPA shell.
    """
    try:
        tools = get_visible_tools() or []
    except Exception:
        return []

    buckets: dict[str, list[dict]] = {}
    for tool in tools:
        name = str(tool.get("category") or "").strip()
        if not name:
            continue
        buckets.setdefault(name, []).append(tool)

    index = []
    for name, members in buckets.items():
        slug = slugify(name)
        if not slug:
            continue
        index.append(
            {
                "slug": slug,
                "name": name,
                "count": len(members),
                "description": describe(name, len(members)),
                "indexable": len(members) >= MIN_INDEXABLE,
            }
        )

    index.sort(key=lambda c: (-c["count"], c["name"].lower()))
    return index


def get_category(slug: str) -> dict | None:
    """One category entry by slug, or None if no such category exists."""
    if not slug:
        return None
    wanted = slugify(slug)
    for entry in build_index():
        if entry["slug"] == wanted:
            return entry
    return None


def tools_for(
    slug: str,
    limit: int | None = None,
    sponsored_first: bool = True,
) -> list[dict]:
    """Visible tools in a category, ranked. Empty list for an unknown slug.

    Pass `sponsored_first=False` when the result decides something a reader
    will never see labelled — see _ranked().
    """
    entry = get_category(slug)
    if not entry:
        return []
    try:
        tools = get_visible_tools() or []
    except Exception:
        return []
    members = _ranked(
        [
            t
            for t in tools
            if str(t.get("category") or "").strip().lower() == entry["name"].lower()
        ],
        sponsored_first=sponsored_first,
    )
    return members[:limit] if limit else members


def indexable_slugs() -> list[str]:
    """Slugs whose pages are substantial enough to put in the sitemap."""
    return [c["slug"] for c in build_index() if c["indexable"]]
