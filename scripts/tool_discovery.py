"""scripts/tool_discovery.py

Automatically discovers new AI tools from popular directories and GitHub.
Scraped results are checked for duplicates against data/tools.json and any
new entries are written to data/discovery_queue.json for admin review.

Sources:
    - https://theresanaiforthat.com
    - https://futurepedia.io
    - https://producthunt.com/topics/artificial-intelligence
    - https://github.com/topics/ai

Run directly:
    python scripts/tool_discovery.py
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

# ── Project root on sys.path so `from app.*` works when run directly ─────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# These imports are deferred inside run_discovery_pipeline so the script can
# also run as a standalone, schema-free queuer (just needs requests + bs4).
_TOOLS_JSON = os.path.join(PROJECT_ROOT, "data", "tools.json")
_QUEUE_JSON = os.path.join(PROJECT_ROOT, "data", "discovery_queue.json")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── HTTP helpers ──────────────────────────────────────────────────────────────

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/123.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
_TIMEOUT = 18
_SOURCE_DELAY = 2.0  # seconds between sources to avoid rate limits


def _fetch(url: str) -> BeautifulSoup | None:
    """GET *url* and return a BeautifulSoup tree, or None on any error."""
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=_TIMEOUT)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as exc:
        log.warning("Fetch failed [%s]: %s", url, exc)
        return None


def _clean(text: str) -> str:
    return " ".join((text or "").split()).strip()


def _abs_url(href: str, base: str) -> str:
    href = (href or "").strip()
    if href.startswith("http"):
        return href
    if href.startswith("//"):
        return "https:" + href
    if href.startswith("/"):
        parsed = urlparse(base)
        return f"{parsed.scheme}://{parsed.netloc}{href}"
    return href


# ── Source scrapers ───────────────────────────────────────────────────────────

def _discover_theresanaiforthat() -> list[dict]:
    """Scrape the most-saved tools listing on theresanaiforthat.com."""
    base = "https://theresanaiforthat.com"
    soup = _fetch(f"{base}/most-saved/")
    if not soup:
        return []

    results: list[dict] = []
    seen: set[str] = set()

    # Tool cards link via href="/ai/<slug>"; text inside is the tool name.
    for anchor in soup.select("a[href*='/ai/']"):
        name = _clean(anchor.get_text())
        href = anchor.get("href", "")
        if not name or len(name) > 80 or not href or href in seen:
            continue
        seen.add(href)
        # Try to pull a short description from a sibling/child element
        parent = anchor.find_parent(["li", "div", "article"])
        desc_el = parent.find("p") if parent else None
        desc = _clean(desc_el.get_text()) if desc_el else ""
        results.append({
            "name": name,
            "link": _abs_url(href, base),
            "description": desc,
            "discoveredFrom": "theresanaiforthat.com",
        })
        if len(results) >= 25:
            break

    log.info("theresanaiforthat.com → %d tools", len(results))
    return results


def _discover_futurepedia() -> list[dict]:
    """Scrape the AI tools directory on futurepedia.io."""
    base = "https://www.futurepedia.io"
    soup = _fetch(f"{base}/ai-tools")
    if not soup:
        return []

    results: list[dict] = []
    seen: set[str] = set()

    # Each tool card has an anchor with href="/tool/<slug>"
    for anchor in soup.select("a[href*='/tool/']"):
        name = _clean(anchor.get_text())
        href = anchor.get("href", "")
        if not name or len(name) > 80 or not href or href in seen:
            continue
        seen.add(href)
        parent = anchor.find_parent(["li", "div", "article"])
        desc_el = parent.find("p") if parent else None
        desc = _clean(desc_el.get_text()) if desc_el else ""
        results.append({
            "name": name,
            "link": _abs_url(href, base),
            "description": desc,
            "discoveredFrom": "futurepedia.io",
        })
        if len(results) >= 25:
            break

    log.info("futurepedia.io → %d tools", len(results))
    return results


def _discover_producthunt() -> list[dict]:
    """Scrape AI product listings from Product Hunt's AI topic page."""
    base = "https://www.producthunt.com"
    soup = _fetch(f"{base}/topics/artificial-intelligence")
    if not soup:
        return []

    results: list[dict] = []
    seen: set[str] = set()

    # PH renders post links like /posts/<slug> inside list items / articles
    for anchor in soup.select("a[href*='/posts/']"):
        # Prefer an explicit heading child; fall back to the link text itself
        heading = anchor.find(["h3", "h2", "h1", "strong"])
        name = _clean(heading.get_text() if heading else anchor.get_text())
        href = anchor.get("href", "")
        if not name or len(name) > 80 or not href or href in seen:
            continue
        seen.add(href)
        # Tagline often lives in a <p> or sibling span near the heading
        parent = anchor.find_parent(["li", "div", "article"])
        tagline_el = parent.find("p") if parent else None
        tagline = _clean(tagline_el.get_text()) if tagline_el else ""
        results.append({
            "name": name,
            "link": _abs_url(href, base),
            "tagline": tagline,
            "discoveredFrom": "producthunt.com",
        })
        if len(results) >= 25:
            break

    log.info("producthunt.com → %d tools", len(results))
    return results


def _discover_github_topics() -> list[dict]:
    """Scrape open-source AI repositories from github.com/topics/ai."""
    base = "https://github.com"
    soup = _fetch(f"{base}/topics/ai")
    if not soup:
        return []

    results: list[dict] = []
    seen: set[str] = set()

    # Each repo is wrapped in an <article class="border ..."> element
    for article in soup.select("article.border"):
        h3 = article.find("h3")
        anchor = h3.find("a") if h3 else None
        if not anchor:
            continue
        href = anchor.get("href", "").strip()
        # Repo path is /owner/repo — derive a readable name from the repo part
        repo_part = href.split("/")[-1] if href else ""
        name = _clean(repo_part.replace("-", " ").replace("_", " ").title())
        if not name or not href or href in seen:
            continue
        seen.add(href)
        desc_el = article.find("p")
        description = _clean(desc_el.get_text()) if desc_el else ""
        results.append({
            "name": name,
            "link": _abs_url(href, base),
            "description": description,
            "openSource": True,
            "apiAvailable": True,
            "discoveredFrom": "github.com/topics/ai",
        })
        if len(results) >= 25:
            break

    log.info("github.com/topics/ai → %d tools", len(results))
    return results


# ── Duplicate detection ───────────────────────────────────────────────────────

def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower().strip())


def _load_existing_names() -> set[str]:
    """Return a set of slugged names from tools.json + discovery_queue.json."""
    known: set[str] = set()
    for path in (_TOOLS_JSON, _QUEUE_JSON):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            items: list[dict]
            if isinstance(data, dict):
                # tools.json wraps list under "tools" key
                items = data.get("tools", [])
            elif isinstance(data, list):
                # discovery_queue.json is a bare list of {"status":…,"tool":{…}}
                items = [entry.get("tool", entry) for entry in data]
            else:
                items = []
            for item in items:
                name = item.get("name", "")
                if name:
                    known.add(_slug(name))
        except (FileNotFoundError, json.JSONDecodeError):
            pass
    return known


def _is_duplicate(entry: dict, known: set[str]) -> bool:
    return _slug(entry.get("name", "")) in known


# ── Direct queue writer (no app import required) ──────────────────────────────

def _write_to_queue(entries: list[dict]) -> int:
    """Append *entries* to discovery_queue.json and return how many were added."""
    queue: list[dict] = []
    try:
        with open(_QUEUE_JSON, encoding="utf-8") as fh:
            existing = json.load(fh)
        if isinstance(existing, list):
            queue = existing
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    added = 0
    for entry in entries:
        queue.append({"status": "pending", "tool": entry})
        added += 1

    os.makedirs(os.path.dirname(_QUEUE_JSON), exist_ok=True)
    with open(_QUEUE_JSON, "w", encoding="utf-8") as fh:
        json.dump(queue, fh, indent=2, ensure_ascii=False)

    return added


# ── Discovery pipeline ────────────────────────────────────────────────────────

def discover_tools() -> list[dict]:
    """Run all source scrapers with a polite delay between each."""
    scrapers = [
        _discover_theresanaiforthat,
        _discover_futurepedia,
        _discover_producthunt,
        _discover_github_topics,
    ]
    all_results: list[dict] = []
    for scraper in scrapers:
        try:
            all_results.extend(scraper())
        except Exception:
            log.exception("Unhandled error in scraper %s", scraper.__name__)
        time.sleep(_SOURCE_DELAY)
    return all_results


def to_ai_compass_schema(entry: dict) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "id": "",
        "name": entry.get("name", ""),
        "maker": entry.get("maker", ""),
        "tagline": entry.get("tagline", ""),
        "category": entry.get("category", ""),
        "subcategory": entry.get("subCategory", entry.get("subcategory", "")),
        "price": entry.get("price", ""),
        "pricingDetail": entry.get("pricingDetail", ""),
        "bestFor": entry.get("bestFor", ""),
        "tags": entry.get("tags", []),
        "trending": bool(entry.get("trending", False)),
        "rating": entry.get("rating", ""),
        "weeklyUsers": entry.get("weeklyUsers", ""),
        "link": entry.get("link", entry.get("website", "")),
        "apiAvailable": bool(entry.get("apiAvailable", False)),
        "openSource": bool(entry.get("openSource", False)),
        "studentPerk": entry.get("studentPerk", ""),
        "uniHack": entry.get("uniHack", ""),
        "features": entry.get("features", []),
        "platforms": entry.get("platforms", []),
        "languages": entry.get("languages", ""),
        "launchYear": entry.get("launchYear", now.year),
        "description": entry.get("description", ""),
        "discoveredFrom": entry.get("discoveredFrom", ""),
        "discoveredAt": now.isoformat(),
    }


def run_discovery_pipeline() -> dict:
    """
    Full pipeline: scrape → deduplicate → queue.

    Imported by app/routes.py for the admin 'Run Discovery' button;
    also callable directly via __main__.
    """
    discovered = discover_tools()
    known = _load_existing_names()

    new_entries = []
    skipped = 0
    for raw in discovered:
        if _is_duplicate(raw, known):
            skipped += 1
            continue
        schema_entry = to_ai_compass_schema(raw)
        new_entries.append(schema_entry)
        # Mark as known immediately to suppress intra-run duplicates
        known.add(_slug(schema_entry["name"]))

    # Try the richer app-level queue writer first (attaches admin metadata)
    try:
        from app.discovery import normalize_structured_tool, queue_discovered_tools
        from scripts.tool_enrichment import enrich_tool

        normalised = [normalize_structured_tool(e) for e in new_entries]
        enriched = [enrich_tool(e) for e in normalised]
        queued_count = queue_discovered_tools(enriched)
    except Exception:
        log.warning("app.discovery not available — writing directly to queue JSON")
        queued_count = _write_to_queue(new_entries)

    return {
        "discovered": len(discovered),
        "queued": queued_count,
        "skipped": skipped,
    }


# ── CLI entry point ───────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Discover new AI tools and queue them for admin review."
    )
    parser.add_argument(
        "--once", action="store_true", help="Run discovery once and exit (default when called directly)"
    )
    parser.add_argument(
        "--sources", nargs="+",
        choices=["theresanaiforthat", "futurepedia", "producthunt", "github"],
        help="Limit to specific sources",
    )
    args = parser.parse_args()

    summary = run_discovery_pipeline()
    print(
        f"\nDiscovery complete\n"
        f"  Discovered : {summary['discovered']}\n"
        f"  Queued     : {summary['queued']}\n"
        f"  Skipped    : {summary['skipped']} (duplicates)\n"
    )

    if not args.once:
        print("Tip: run scripts/scheduler.py for automatic 24 h repeats.")


if __name__ == "__main__":
    main()
