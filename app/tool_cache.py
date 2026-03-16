import json
from typing import List, Dict, Any


_TOOLS_CACHE: List[Dict[str, Any]] | None = None


def _load_tools_from_disk(data_path: str) -> List[Dict[str, Any]]:
    with open(data_path, "r", encoding="utf-8") as file:
        payload = json.load(file)
    if isinstance(payload, dict):
        tools = payload.get("tools", [])
    else:
        tools = payload
    return tools if isinstance(tools, list) else []


def prime_tools_cache(data_path: str) -> List[Dict[str, Any]]:
    """Load tools into module-level cache once (startup-safe)."""
    global _TOOLS_CACHE
    if _TOOLS_CACHE is None:
        _TOOLS_CACHE = _load_tools_from_disk(data_path)
    return list(_TOOLS_CACHE)


def get_cached_tools(data_path: str) -> List[Dict[str, Any]]:
    """Read tools from cache, priming from disk only when empty."""
    return prime_tools_cache(data_path)


def refresh_tools_cache(data_path: str) -> List[Dict[str, Any]]:
    """Force cache reload from disk after tools.json updates."""
    global _TOOLS_CACHE
    _TOOLS_CACHE = _load_tools_from_disk(data_path)
    return list(_TOOLS_CACHE)
