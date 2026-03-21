import json
import os
from typing import List, Dict, Any


_TOOLS_CACHE: List[Dict[str, Any]] | None = None
_TOOLS_CACHE_MTIME: float | None = None


def _load_tools_from_disk(data_path: str) -> List[Dict[str, Any]]:
    try:
        with open(data_path, "r", encoding="utf-8") as file:
            payload = json.load(file)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return []
    if isinstance(payload, dict):
        tools = payload.get("tools", [])
    else:
        tools = payload
    return tools if isinstance(tools, list) else []


def prime_tools_cache(data_path: str) -> List[Dict[str, Any]]:
    """Load tools into module-level cache once (startup-safe)."""
    global _TOOLS_CACHE, _TOOLS_CACHE_MTIME
    if _TOOLS_CACHE is None:
        _TOOLS_CACHE = _load_tools_from_disk(data_path)
        try:
            _TOOLS_CACHE_MTIME = os.path.getmtime(data_path)
        except OSError:
            _TOOLS_CACHE_MTIME = None
    return list(_TOOLS_CACHE)


def get_cached_tools(data_path: str) -> List[Dict[str, Any]]:
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


def refresh_tools_cache(data_path: str) -> List[Dict[str, Any]]:
    """Force cache reload from disk after tools.json updates."""
    global _TOOLS_CACHE, _TOOLS_CACHE_MTIME
    _TOOLS_CACHE = _load_tools_from_disk(data_path)
    try:
        _TOOLS_CACHE_MTIME = os.path.getmtime(data_path)
    except OSError:
        _TOOLS_CACHE_MTIME = None
    return list(_TOOLS_CACHE)
