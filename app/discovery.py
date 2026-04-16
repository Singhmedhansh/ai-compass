import json
import os
import re
from datetime import datetime, timezone
from filelock import FileLock, Timeout
from difflib import SequenceMatcher
from urllib.parse import urlparse

from app.tool_cache import refresh_tools_cache

PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
TOOLS_PATH = os.path.join(DATA_DIR, "tools.json")
DISCOVERY_QUEUE_PATH = os.path.join(DATA_DIR, "discovery_queue.json")
NOTIFICATIONS_PATH = os.path.join(DATA_DIR, "notifications.json")
DISCOVERY_STATS_PATH = os.path.join(DATA_DIR, "discovery_stats.json")

DEFAULT_TOOL = {
    "id": "",
    "name": "",
    "maker": "",
    "tagline": "",
    "category": "",
    "subcategory": "",
    "price": "",
    "pricingDetail": "",
    "bestFor": "",
    "tags": [],
    "trending": False,
    "rating": "",
    "weeklyUsers": "",
    "link": "",
    "apiAvailable": False,
    "openSource": False,
    "studentPerk": "",
    "uniHack": "",
    "features": [],
    "platforms": [],
    "languages": "",
    "launchYear": "",
    "description": "",
}

DEFAULT_DISCOVERY_STATS = {
    "tools_discovered": 0,
    "tools_approved": 0,
    "tools_rejected": 0,
}


def _get_lock_path(path):
    return f"{path}.lock"


def _read_json(path, default):
    if not os.path.exists(path):
        return default
    lock = FileLock(_get_lock_path(path), timeout=5)
    try:
        with lock:
            with open(path, "r", encoding="utf-8") as f:
                try:
                    return json.load(f)
                except json.JSONDecodeError:
                    return default
    except Timeout:
        return default


def _write_json(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lock = FileLock(_get_lock_path(path), timeout=5)
    try:
        with lock:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
    except Timeout:
        raise RuntimeError("Failed to acquire lock to write JSON file")


def ensure_discovery_files():
    os.makedirs(DATA_DIR, exist_ok=True)

    if not os.path.exists(DISCOVERY_QUEUE_PATH):
        _write_json(DISCOVERY_QUEUE_PATH, [])
    if not os.path.exists(NOTIFICATIONS_PATH):
        _write_json(NOTIFICATIONS_PATH, [])
    if not os.path.exists(DISCOVERY_STATS_PATH):
        _write_json(DISCOVERY_STATS_PATH, dict(DEFAULT_DISCOVERY_STATS))


def load_tools_payload():
    payload = _read_json(TOOLS_PATH, {"meta": {}, "tools": []})
    if isinstance(payload, list):
        return {"meta": {}, "tools": payload}
    payload.setdefault("meta", {})
    payload.setdefault("tools", [])
    return payload


def save_tools_payload(payload):
    payload = payload or {"meta": {}, "tools": []}
    payload.setdefault("meta", {})
    payload.setdefault("tools", [])
    payload["meta"]["count"] = len(payload["tools"])
    payload["meta"]["updated"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    _write_json(TOOLS_PATH, payload)
    refresh_tools_cache(TOOLS_PATH)


def load_discovery_queue():
    ensure_discovery_files()
    queue = _read_json(DISCOVERY_QUEUE_PATH, [])
    if not isinstance(queue, list):
        return []
    return queue


def save_discovery_queue(queue):
    ensure_discovery_files()
    _write_json(DISCOVERY_QUEUE_PATH, queue)


def load_notifications():
    ensure_discovery_files()
    notifications = _read_json(NOTIFICATIONS_PATH, [])
    if not isinstance(notifications, list):
        return []
    return notifications


def save_notifications(notifications):
    ensure_discovery_files()
    _write_json(NOTIFICATIONS_PATH, notifications)


def load_discovery_stats():
    ensure_discovery_files()
    stats = _read_json(DISCOVERY_STATS_PATH, dict(DEFAULT_DISCOVERY_STATS))
    if not isinstance(stats, dict):
        return dict(DEFAULT_DISCOVERY_STATS)
    normalized = dict(DEFAULT_DISCOVERY_STATS)
    normalized.update({k: int(v) for k, v in stats.items() if k in DEFAULT_DISCOVERY_STATS})
    return normalized


def save_discovery_stats(stats):
    ensure_discovery_files()
    normalized = dict(DEFAULT_DISCOVERY_STATS)
    normalized.update({k: int(v) for k, v in (stats or {}).items() if k in DEFAULT_DISCOVERY_STATS})
    _write_json(DISCOVERY_STATS_PATH, normalized)


def increment_discovery_stats(metric, amount=1):
    stats = load_discovery_stats()
    if metric not in stats:
        return stats
    stats[metric] = int(stats.get(metric, 0)) + int(amount)
    save_discovery_stats(stats)
    return stats


def add_notification(notification_type, count):
    notifications = load_notifications()
    notifications.insert(
        0,
        {
            "type": notification_type,
            "count": int(count),
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        },
    )
    save_notifications(notifications[:100])


def _clean_name(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def build_queue_tool_key(value):
    if isinstance(value, dict):
        value = value.get("name", "")
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")


def _normalize_url(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    netloc = parsed.netloc.lower().replace("www.", "")
    path = parsed.path.rstrip("/")
    return f"{netloc}{path}" if netloc else ""


def _name_similarity(a, b):
    left = _clean_name(a)
    right = _clean_name(b)
    if not left or not right:
        return 0
    return int(SequenceMatcher(None, left, right).ratio() * 100)


def _extract_website(tool):
    return tool.get("website") or tool.get("link") or ""


def is_duplicate_tool(candidate, existing_tools):
    candidate_name = _clean_name(candidate.get("name"))
    candidate_site = _normalize_url(_extract_website(candidate))

    for item in existing_tools:
        existing_name = _clean_name(item.get("name"))
        existing_site = _normalize_url(_extract_website(item))

        if candidate_name and candidate_name == existing_name:
            return True
        if candidate_site and existing_site and candidate_site == existing_site:
            return True
        if candidate_name and existing_name and _name_similarity(candidate_name, existing_name) > 80:
            return True

    return False


def normalize_structured_tool(raw_tool):
    tool = dict(DEFAULT_TOOL)
    source = raw_tool or {}

    key_map = {
        "subCategory": "subcategory",
        "sub_category": "subcategory",
        "website": "link",
    }

    for key, value in source.items():
        target_key = key_map.get(key, key)
        if target_key in tool:
            tool[target_key] = value

    # Keep list fields as lists.
    for list_key in ("tags", "features", "platforms"):
        value = tool.get(list_key)
        if isinstance(value, str):
            tool[list_key] = [v.strip() for v in value.split(",") if v.strip()]
        elif not isinstance(value, list):
            tool[list_key] = []

    return tool


def queue_discovered_tools(structured_tools):
    ensure_discovery_files()

    payload = load_tools_payload()
    existing_tools = payload.get("tools", [])
    queue = load_discovery_queue()

    pending_tools = [item.get("tool", {}) for item in queue if item.get("status") == "pending"]

    added = 0
    for raw in structured_tools:
        tool = normalize_structured_tool(raw)
        if is_duplicate_tool(tool, existing_tools):
            continue
        if is_duplicate_tool(tool, pending_tools):
            continue

        queue.append({"status": "pending", "tool": tool})
        pending_tools.append(tool)
        added += 1

    if added:
        save_discovery_queue(queue)
        increment_discovery_stats("tools_discovered", added)
        add_notification("new_tools_discovered", added)

    return added


def _next_numeric_value(tools, key):
    values = []
    for tool in tools:
        try:
            values.append(int(tool.get(key) or 0))
        except (TypeError, ValueError):
            continue
    return (max(values) + 1) if values else 1


def update_queue_tool(queue_index, tool):
    queue = load_discovery_queue()
    if queue_index < 0 or queue_index >= len(queue):
        raise IndexError("Queue item out of range")

    queue[queue_index]["tool"] = normalize_structured_tool(tool)
    save_discovery_queue(queue)
    return queue[queue_index]


def _find_queue_index(tool_name):
    target_key = build_queue_tool_key(tool_name)
    queue = load_discovery_queue()
    for index, item in enumerate(queue):
        if build_queue_tool_key(item.get("tool", {})) == target_key:
            return queue, index
    raise IndexError("Queue item not found")


def update_queue_tool_by_name(tool_name, tool):
    queue, queue_index = _find_queue_index(tool_name)
    queue[queue_index]["tool"] = normalize_structured_tool(tool)
    save_discovery_queue(queue)
    return queue[queue_index]


def _persist_tool_to_db(tool_dict):
    from app.models import Tool, Category, Tag
    from app import db
    
    cat_name = str(tool_dict.get('category') or tool_dict.get('subcategory') or 'Other').strip()
    cat_slug = build_queue_tool_key(cat_name) or "other"
    
    cat = Category.query.filter_by(slug=cat_slug).first()
    if not cat:
        cat = Category(slug=cat_slug, name=cat_name)
        db.session.add(cat)
        db.session.flush()

    tool_slug = tool_dict.get('tool_key') or build_queue_tool_key(tool_dict.get('name', ''))
    
    price = str(tool_dict.get('price') or tool_dict.get('pricingDetail') or tool_dict.get('pricing_model') or '').strip().lower()
    perk = tool_dict.get('studentPerk', False)
    if isinstance(perk, str):
        perk = perk.lower() in ('true', '1', 'yes')
        
    raw_launch = tool_dict.get('launchYear')
    launch_year = int(raw_launch) if raw_launch else None
    
    # Weekly users parsing based on existing string format
    text_users = str(tool_dict.get('weeklyUsers') or "").strip().upper().replace("+", "")
    w_users = 0
    if text_users:
        multiplier = 1
        if text_users.endswith("M"):
            multiplier = 1000000
            text_users = text_users[:-1]
        elif text_users.endswith("K"):
            multiplier = 1000
            text_users = text_users[:-1]
        try:
            w_users = int(float(text_users.replace(",", "")) * multiplier)
        except ValueError:
            pass

    tool = Tool(
        slug=tool_slug,
        name=tool_dict.get('name', ''),
        description=tool_dict.get('description', '') or tool_dict.get('tagline', ''),
        link=tool_dict.get('link') or tool_dict.get('website', ''),
        icon=tool_dict.get('icon', ''),
        price=price,
        student_perk=bool(perk),
        rating=float(tool_dict.get('rating') or 0.0),
        weekly_users=w_users,
        launch_year=launch_year,
        category_id=cat.id
    )
    db.session.add(tool)

    raw_tags = tool_dict.get('tags', [])
    if isinstance(raw_tags, str):
        raw_tags = [x.strip() for x in raw_tags.split(',')]
    
    for t_str in raw_tags:
        tag_name = str(t_str).strip()
        if not tag_name:
            continue
        tag_slug = build_queue_tool_key(tag_name)
        if not tag_slug:
            continue
        
        tag = Tag.query.filter_by(slug=tag_slug).first()
        if not tag:
            tag = Tag(slug=tag_slug, name=tag_name)
            db.session.add(tag)
            db.session.flush()
        if tag not in tool.tags:
            tool.tags.append(tag)
            
    db.session.commit()
    tool_dict['id'] = tool.id
    return tool_dict


def approve_queue_tool(queue_index, tool_override=None):
    queue = load_discovery_queue()
    if queue_index < 0 or queue_index >= len(queue):
        raise IndexError("Queue item out of range")

    item = queue[queue_index]
    tool = normalize_structured_tool(tool_override if tool_override is not None else item.get("tool", {}))

    payload = load_tools_payload()
    existing_tools = payload.get("tools", [])
    if is_duplicate_tool(tool, existing_tools):
        return False, "duplicate"

    tool = _persist_tool_to_db(tool)
    
    # Also keep legacy JSON in sync temporarily, but rely purely on DB reads.
    tool["rank"] = _next_numeric_value(existing_tools, "rank")
    payload["tools"].append(tool)
    save_tools_payload(payload)

    queue[queue_index]["status"] = "approved"
    queue[queue_index]["tool"] = tool
    save_discovery_queue(queue)

    increment_discovery_stats("tools_approved", 1)
    return True, tool


def approve_queue_tool_by_name(tool_name, tool_override=None):
    queue, queue_index = _find_queue_index(tool_name)

    item = queue[queue_index]
    tool = normalize_structured_tool(tool_override if tool_override is not None else item.get("tool", {}))

    payload = load_tools_payload()
    existing_tools = payload.get("tools", [])
    if is_duplicate_tool(tool, existing_tools):
        return False, "duplicate"

    tool = _persist_tool_to_db(tool)

    tool["rank"] = _next_numeric_value(existing_tools, "rank")
    payload["tools"].append(tool)
    save_tools_payload(payload)

    queue.pop(queue_index)
    save_discovery_queue(queue)

    increment_discovery_stats("tools_approved", 1)
    return True, tool


def reject_queue_tool(queue_index):
    queue = load_discovery_queue()
    if queue_index < 0 or queue_index >= len(queue):
        raise IndexError("Queue item out of range")

    queue[queue_index]["status"] = "rejected"
    save_discovery_queue(queue)

    increment_discovery_stats("tools_rejected", 1)
    return queue[queue_index]


def reject_queue_tool_by_name(tool_name):
    queue, queue_index = _find_queue_index(tool_name)
    item = queue.pop(queue_index)
    save_discovery_queue(queue)

    increment_discovery_stats("tools_rejected", 1)
    return item
