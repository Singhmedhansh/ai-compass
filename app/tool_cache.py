import json
import os
import re
import sys
import time
from typing import List, Dict, Any
from filelock import FileLock, Timeout

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_TOOLS_PATH = os.path.join(BASE_DIR, "data", "tools.json")

if not os.path.exists(DEFAULT_TOOLS_PATH):
    import sys
    print(f"CRITICAL: tools.json not found at {DEFAULT_TOOLS_PATH}", file=sys.stderr)
    print(f"cwd={os.getcwd()}, BASE_DIR={BASE_DIR}", file=sys.stderr)


_TOOLS_CACHE: List[Dict[str, Any]] | None = None
_TOOLS_CACHE_MTIME: float | None = None
_DB_BACKED: bool = False  # True once the catalog is served from the DB
_LAST_DB_COUNT_CHECK_TIME: float = 0.0
# Check at most once every 5 minutes — the previous 30s interval kept Neon's
# compute endpoint perpetually active, burning CU-hrs even during quiet periods.
# 300s still catches admin catalog updates within a predictable window.
_DB_CHECK_INTERVAL: float = 300.0  # seconds
TOOL_CACHE: Dict[str, Dict[str, Any]] = {}

CANONICAL_CATEGORIES = {
    "coding": "Coding",
    "writing & chat": "Writing & Chat",
    "research": "Research",
    "productivity": "Productivity",
    "image generation": "Image Generation",
    "video generation": "Video Generation",
    "audio & voice": "Audio & Voice",
    "design & graphics": "Design & Graphics",
}

CATEGORY_ALIASES = {
    "writing": "Writing & Chat",
    "writing & docs": "Writing & Chat",
    "chat": "Writing & Chat",
    "image gen": "Image Generation",
    "video gen": "Video Generation",
    "audio": "Audio & Voice",
    "voice": "Audio & Voice",
    "design": "Design & Graphics",
    "graphics": "Design & Graphics",
}

CATEGORY_KEYWORDS = {
    "Coding": ["code", "coding", "programming", "developer", "github", "api", "ide", "full-stack", "terminal"],
    "Writing & Chat": ["writing", "essay", "grammar", "paraphrase", "summar", "chat", "copy", "blog"],
    "Research": ["research", "citation", "paper", "academic", "scholar", "literature", "study"],
    "Productivity": ["task", "calendar", "note", "workflow", "focus", "planner", "todo", "automation"],
    "Image Generation": ["image", "photo", "art", "design", "render", "diffusion", "visual", "poster"],
    "Video Generation": ["video", "subtitle", "screen", "record", "transcript", "editing", "film", "animation"],
    "Audio & Voice": ["audio", "voice", "speech", "podcast", "music", "transcription", "tts"],
    "Design & Graphics": ["design", "graphic", "canvas", "draw", "sketch", "vector", "prototype", "wireframe", "cad", "autocad", "figma", "canva", "3d", "mockup", "logo"],
}


def _get_lock_path(path: str) -> str:
    return f"{path}.lock"


def _tool_slug(tool: Dict[str, Any]) -> str:
    explicit_slug = str(tool.get("slug") or "").strip().lower()
    if explicit_slug:
        return explicit_slug.replace(".", "-")

    tool_key = str(tool.get("tool_key") or "").strip().lower()
    if tool_key:
        return tool_key.replace(".", "-")

    name = str(tool.get("name") or "").strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def _fix_mojibake_text(value: str) -> str:
    if not isinstance(value, str):
        return value

    text = value
    replacements = {
        "â€™": "'",
        "â€˜": "'",
        "â€œ": '"',
        "â€\x9d": '"',
        "â€“": "-",
        "â€”": "-",
        "â€¦": "...",
        "â€¢": "-",
        "Ãƒ©": "é",
        "Ã¢â‚¬\"": "-",
        "Ã¢â‚¬â€œ": "-",
        "Ã¢â‚¬â€\x9d": "-",
        "Â": "",
    }
    for wrong, right in replacements.items():
        if wrong in text:
            text = text.replace(wrong, right)

    marker_chars = ("Ã", "â", "Â")

    def marker_score(candidate: str) -> int:
        return sum(candidate.count(m) for m in marker_chars)

    # Handle double-encoded sequences conservatively.
    for _ in range(2):
        if not any(marker in text for marker in marker_chars):
            break
        try:
            repaired = text.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            break

        if not repaired or "\ufffd" in repaired:
            break

        if marker_score(repaired) <= marker_score(text):
            text = repaired
        else:
            break

    for wrong, right in replacements.items():
        if wrong in text:
            text = text.replace(wrong, right)

    return text


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_fix_mojibake_text(str(item)).strip() for item in value if str(item).strip()]


def _infer_category(tool: Dict[str, Any], current_category: str) -> str:
    haystack = " ".join(
        [
            str(tool.get("name") or ""),
            str(tool.get("description") or ""),
            " ".join(_normalize_string_list(tool.get("tags"))),
            " ".join(_normalize_string_list(tool.get("use_cases"))),
        ]
    ).lower()

    scores: Dict[str, int] = {category: 0 for category in CATEGORY_KEYWORDS}
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in haystack:
                scores[category] += 1

    winner, winner_score = max(scores.items(), key=lambda item: item[1])
    current_score = scores.get(current_category, 0)

    # Conservative override: only if the winning category clearly dominates.
    if winner_score >= 2 and winner_score >= current_score + 2:
        return winner
    return current_category


def _normalize_category(raw_category: Any, tool: Dict[str, Any]) -> str:
    normalized = _fix_mojibake_text(str(raw_category or "")).strip()
    key = normalized.lower()

    canonical = CANONICAL_CATEGORIES.get(key)
    if canonical:
        return _infer_category(tool, canonical)

    alias = CATEGORY_ALIASES.get(key)
    if alias:
        return _infer_category(tool, alias)

    # Unknown category labels are mapped to a safe default from inferred content.
    inferred = _infer_category(tool, "Productivity")
    return inferred


def _normalize_tool_record(tool: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(tool, dict):
        return {}

    normalized = dict(tool)
    for key, value in list(normalized.items()):
        if isinstance(value, str):
            normalized[key] = _fix_mojibake_text(value)
        elif isinstance(value, list):
            normalized[key] = [
                _fix_mojibake_text(item) if isinstance(item, str) else item
                for item in value
            ]

    normalized["category"] = _normalize_category(normalized.get("category"), normalized)
    return normalized


def _load_tools_from_disk(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    if not os.path.exists(data_path):
        print(
            f"[STARTUP] ERROR: tools.json not found at {data_path!r}. "
            f"cwd={os.getcwd()!r}",
            file=sys.stderr,
        )
        return []

    lock = FileLock(_get_lock_path(data_path), timeout=5)
    try:
        with lock:
            with open(data_path, "r", encoding="utf-8") as file:
                payload = json.load(file)
    except Timeout:
        print(f"[STARTUP] ERROR: FileLock timed out for {data_path!r}", file=sys.stderr)
        return []
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        print(f"[STARTUP] ERROR: Failed to load {data_path!r}: {exc}", file=sys.stderr)
        return []

    if isinstance(payload, dict):
        tools = payload.get("tools", [])
    else:
        tools = payload

    if not isinstance(tools, list):
        return []

    return [_normalize_tool_record(tool) for tool in tools if isinstance(tool, dict)]



def _load_tools(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    """Source of truth: the DB catalog if seeded, else tools.json.

    The DB path is wrapped so that ANY failure transparently falls back to
    the JSON loader — the read path can never break because of the DB.
    """
    global _DB_BACKED
    try:
        from app.catalog_store import load_tools_from_db

        db_tools = load_tools_from_db()
        if db_tools:
            _DB_BACKED = True
            return [_normalize_tool_record(t) for t in db_tools if isinstance(t, dict)]
    except Exception as exc:  # noqa: BLE001
        print(f"[CATALOG] DB load failed, using tools.json: {exc}", file=sys.stderr)

    _DB_BACKED = False
    return _load_tools_from_disk(data_path)


SEARCH_INDEX = []

def build_search_index(tools):
    """Builds the global search index for search_utils.py."""
    global SEARCH_INDEX, TOOL_CACHE
    SEARCH_INDEX = []
    TOOL_CACHE.clear()
    for tool in tools:
        slug = _tool_slug(tool)
        if slug:
            TOOL_CACHE[slug] = tool
        SEARCH_INDEX.append({
            "_raw":             tool,
            "_name_lower":      tool.get("name", "").lower(),
            "_category_lower":  tool.get("category", "").lower(),
            "_tags_lower":      [str(t).lower() for t in tool.get("tags", [])],
            "_desc_lower":      tool.get("description", "").lower(),
            "_longdesc_lower":  tool.get("long_description", "").lower(),
            "_uses_lower":      [str(u).lower() for u in tool.get("use_cases", [])],
            "_strengths_lower": [str(s).lower() for s in tool.get("strengths", [])],
            "_company_lower":   tool.get("company", "").lower(),
        })

def prime_tools_cache(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    """Load tools into module-level cache once (startup-safe)."""
    global _TOOLS_CACHE, _TOOLS_CACHE_MTIME
    if _TOOLS_CACHE is None:
        _TOOLS_CACHE = _load_tools(data_path)
        if not _TOOLS_CACHE:
            print(
                f"[STARTUP] WARNING: Tool cache is empty after loading {data_path!r}. "
                f"File exists: {os.path.exists(data_path)}",
                file=sys.stderr,
            )
        try:
            _TOOLS_CACHE_MTIME = os.path.getmtime(data_path)
        except OSError:
            _TOOLS_CACHE_MTIME = None
        build_search_index(_TOOLS_CACHE)
    return list(_TOOLS_CACHE)


def get_cached_tools(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    """Read tools from cache and reload automatically if the file changed."""
    global _TOOLS_CACHE_MTIME

    if _TOOLS_CACHE is None:
        return prime_tools_cache(data_path)

    # When the catalog comes from the DB, file mtime is meaningless — the
    # cache is busted explicitly by admin writes via refresh_tools_cache().
    if _DB_BACKED:
        global _LAST_DB_COUNT_CHECK_TIME
        now = time.time()
        if now - _LAST_DB_COUNT_CHECK_TIME >= _DB_CHECK_INTERVAL:
            _LAST_DB_COUNT_CHECK_TIME = now
            try:
                from app.models import CatalogTool
                db_count = CatalogTool.query.count()
                if db_count > 5 and db_count != len(_TOOLS_CACHE):
                    refresh_tools_cache(data_path)
            except Exception:
                pass
        return list(_TOOLS_CACHE)

    try:
        current_mtime = os.path.getmtime(data_path)
    except OSError:
        current_mtime = None

    if _TOOLS_CACHE_MTIME != current_mtime:
        return refresh_tools_cache(data_path)

    return list(_TOOLS_CACHE)


def get_visible_tools(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    """Tools actually shown to users — excludes admin-hidden entries.

    Single source of truth so the catalog listing and the public tool
    count can never disagree (or drift from a hardcoded number). A tool
    hidden via the admin panel must not be displayed *and* must not be
    counted.
    """
    return [t for t in get_cached_tools(data_path) if not t.get("hidden")]


def refresh_tools_cache(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    """Force cache reload from disk after tools.json updates."""
    global _TOOLS_CACHE, _TOOLS_CACHE_MTIME, _LAST_DB_COUNT_CHECK_TIME
    _LAST_DB_COUNT_CHECK_TIME = time.time()
    _TOOLS_CACHE = _load_tools(data_path)
    try:
        _TOOLS_CACHE_MTIME = os.path.getmtime(data_path)
    except OSError:
        _TOOLS_CACHE_MTIME = None
    build_search_index(_TOOLS_CACHE)
    try:
        from app.ml_recommender import clear_model_cache
        clear_model_cache()
    except Exception:
        pass
    return list(_TOOLS_CACHE)


CURATED_ALTERNATIVES = {
    "chatgpt": [
        {
            "slug": "claude",
            "why": "Claude offers unmatched reasoning and nuanced writing capabilities. Its longer context window and clean artifacts interface make it exceptionally strong for coding, complex text analysis, and creative writing."
        },
        {
            "slug": "gemini",
            "why": "Gemini features deep integration with Google Workspace and a massive context window. It excels at web-connected research, processing complex multimodal files (documents, images, audio), and fast information retrieval."
        },
        {
            "slug": "manus-ai",
            "why": "Manus is an autonomous AI agent that goes beyond chat. It accepts high-level task descriptions and independently plans and executes multi-step workflows like running code, browsing the web, and compiling reports."
        },
        {
            "slug": "perplexity-ai",
            "why": "Perplexity is optimized specifically for conversational search. It synthesizes real-time web results and academic papers, providing clickable citations and structured answers that make fact-checking seamless."
        },
        {
            "slug": "microsoft-copilot",
            "why": "Copilot integrates directly into Word, Excel, PowerPoint, and Teams. It is powered by GPT-4 and is often available completely free for students via university Microsoft 365 licenses."
        },
        {
            "slug": "poe",
            "why": "Poe is an aggregator that allows you to access multiple top models (Claude, GPT-4, Llama) inside a single interface and build custom bots, making it a great budget-friendly utility."
        },
        {
            "slug": "mistral-ai",
            "why": "Mistral AI is a privacy-conscious, developer-focused alternative offering strong open-weights models and excellent multilingual support for European languages."
        }
    ]
}


def get_alternatives_for_tool(slug_value: str, tools: list = None) -> tuple[dict | None, list[dict]]:
    if tools is None:
        tools = get_cached_tools() or []

    slug_value = str(slug_value or "").strip().lower()
    main_tool = next((t for t in tools if str(t.get('slug', '')).strip().lower() == slug_value), None)
    if not main_tool:
        return None, []

    curated = CURATED_ALTERNATIVES.get(slug_value)
    if curated:
        alternatives = []
        for item in curated:
            alt_slug = item["slug"]
            alt_tool = next((t for t in tools if str(t.get('slug', '')).strip().lower() == alt_slug), None)
            if alt_tool:
                alt_copy = dict(alt_tool)
                alt_copy["why_alternative"] = item["why"]
                alternatives.append(alt_copy)
        return main_tool, alternatives

    # Fallback to dynamic category/similarity matching
    main_category = (main_tool.get('category') or '').strip().lower()
    TARGET = 10

    recommender_results = []
    try:
        from app.ml_recommender import get_similar_tools
        similar = get_similar_tools(slug_value, limit=20)
        slug_lookup = {t['slug']: t for t in tools if t.get('slug')}
        name_lookup = {(t.get('name') or '').strip().lower(): t for t in tools if t.get('name')}
        if similar and isinstance(similar[0], str):
            recommender_results = [slug_lookup[s] for s in similar if s in slug_lookup]
        elif similar:
            for entry in similar:
                if entry.get('slug') and entry['slug'] in slug_lookup:
                    recommender_results.append(slug_lookup[entry['slug']])
                    continue
                name_key = (entry.get('name') or '').strip().lower()
                if name_key and name_key in name_lookup:
                    recommender_results.append(name_lookup[name_key])
    except Exception:
        recommender_results = []

    if main_category:
        alternatives = [
            t for t in recommender_results
            if (t.get('category') or '').strip().lower() == main_category
            and (t.get('slug') or '').strip().lower() != slug_value
        ]

        if len(alternatives) < TARGET:
            seen = {(t.get('slug') or '').strip().lower() for t in alternatives}
            seen.add(slug_value)
            for t in tools:
                if len(alternatives) >= TARGET:
                    break
                if (t.get('category') or '').strip().lower() != main_category:
                    continue
                s = (t.get('slug') or '').strip().lower()
                if not s or s in seen:
                    continue
                alternatives.append(t)
                seen.add(s)
    else:
        alternatives = [
            t for t in recommender_results
            if (t.get('slug') or '').strip().lower() != slug_value
        ]

    return main_tool, alternatives[:TARGET]
