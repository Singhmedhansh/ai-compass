
import json
import os
from typing import List, Dict, Any
from filelock import FileLock, Timeout

# Always resolve relative to this file's location
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_TOOLS_PATH = os.path.join(BASE_DIR, "data", "tools.json")

# Startup check for tools.json existence
if not os.path.exists(DEFAULT_TOOLS_PATH):
    raise FileNotFoundError(
        f"tools.json not found at {DEFAULT_TOOLS_PATH}. "
        f"BASE_DIR={BASE_DIR}, cwd={os.getcwd()}"
    )


_TOOLS_CACHE: List[Dict[str, Any]] | None = None
_TOOLS_CACHE_MTIME: float | None = None


def _get_lock_path(path: str) -> str:
    return f"{path}.lock"


def _load_tools_from_disk(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    lock = FileLock(_get_lock_path(data_path), timeout=5)
    try:
        with lock:
            with open(data_path, "r", encoding="utf-8") as file:
                payload = json.load(file)
    except (OSError, json.JSONDecodeError, TypeError, ValueError, Timeout):
        return []
    if isinstance(payload, dict):
        tools = payload.get("tools", [])
    else:
        tools = payload
    return tools if isinstance(tools, list) else []



SEARCH_INDEX = []

def build_search_index(tools):
    """Builds the global search index for search_utils.py."""
    global SEARCH_INDEX
    SEARCH_INDEX = []
    for tool in tools:
        SEARCH_INDEX.append({
            "_raw":             tool,
            "_name_lower":      tool.get("name", "").lower(),
            "_category_lower":  tool.get("category", "").lower(),
            "_tags_lower":      [t.lower() for t in tool.get("tags", [])],
            "_desc_lower":      tool.get("description", "").lower(),
            "_longdesc_lower":  tool.get("long_description", "").lower(),
            "_uses_lower":      [u.lower() for u in tool.get("use_cases", [])],
            "_strengths_lower": [s.lower() for s in tool.get("strengths", [])],
            "_company_lower":   tool.get("company", "").lower(),
        })

def prime_tools_cache(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    """Load tools into module-level cache once (startup-safe)."""
    global _TOOLS_CACHE, _TOOLS_CACHE_MTIME
    if _TOOLS_CACHE is None:
        _TOOLS_CACHE = _load_tools_from_disk(data_path)
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

    try:
        current_mtime = os.path.getmtime(data_path)
    except OSError:
        current_mtime = None

    if _TOOLS_CACHE_MTIME != current_mtime:
        return refresh_tools_cache(data_path)

    return list(_TOOLS_CACHE)


def refresh_tools_cache(data_path: str = DEFAULT_TOOLS_PATH) -> List[Dict[str, Any]]:
    """Force cache reload from disk after tools.json updates."""
    global _TOOLS_CACHE, _TOOLS_CACHE_MTIME
    _TOOLS_CACHE = _load_tools_from_disk(data_path)
    try:
        _TOOLS_CACHE_MTIME = os.path.getmtime(data_path)
    except OSError:
        _TOOLS_CACHE_MTIME = None
    build_search_index(_TOOLS_CACHE)
    return list(_TOOLS_CACHE)
