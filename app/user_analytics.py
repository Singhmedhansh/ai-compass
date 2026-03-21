import json
from datetime import datetime, timezone
import re

from app.models import Favorite, ToolView, User


def normalize_text_key(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def build_tool_key(tool):
    name = str(tool.get("name", "")).strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
    if slug:
        return slug

    raw_id = tool.get("id")
    if raw_id is not None:
        return str(raw_id)
    return ""


def load_normalized_tools():
    from app.tool_cache import get_cached_tools
    import os

    data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tools.json")
    tools = []
    for tool in get_cached_tools(data_path):
        item = dict(tool)
        item["tool_key"] = build_tool_key(item)
        tools.append(item)
    return tools


def _load_user_pref_object(user: User):
    raw = str(user.preferences or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}
    if isinstance(parsed, dict):
        return parsed
    return {}


def _save_user_pref_object(user: User, payload):
    user.preferences = json.dumps(payload)


def track_user_activity(user_id, tool_id, action, metadata=None):
    user = User.query.get(int(user_id)) if user_id else None
    if not user:
        return

    metadata = metadata or {}
    action = str(action or "").strip().lower()

    if action == "view":
        tool_name = str(tool_id or "").strip() or str(metadata.get("tool_name") or "")
        if tool_name:
            event = ToolView(tool_name=tool_name, user_id=user.id)
            event.timestamp = datetime.now(timezone.utc)
            from app import db

            db.session.add(event)
            db.session.commit()
        return

    prefs = _load_user_pref_object(user)
    if action == "search":
        recent = list(prefs.get("recent_searches") or [])
        query = str(metadata.get("query") or "").strip()
        if query:
            recent = [item for item in recent if item != query]
            recent.insert(0, query)
            prefs["recent_searches"] = recent[:20]
    elif action == "save":
        saves = int(prefs.get("save_count") or 0)
        prefs["save_count"] = saves + 1

    _save_user_pref_object(user, prefs)
    from app import db

    db.session.commit()


def get_user_insights(user_id):
    user = User.query.get(int(user_id)) if user_id else None
    if not user:
        return {
            "total_views": 0,
            "total_saves": 0,
            "most_viewed_category": "",
            "preferred_pricing": "",
            "last_active": None,
        }

    total_views = ToolView.query.filter_by(user_id=user.id).count()
    total_saves = Favorite.query.filter_by(user_id=user.id).count()
    last_event = (
        ToolView.query.filter_by(user_id=user.id)
        .order_by(ToolView.timestamp.desc())
        .first()
    )

    by_tool_key = {tool.get("tool_key"): tool for tool in load_normalized_tools()}
    category_counts = {}
    pricing_counts = {}

    events = ToolView.query.filter_by(user_id=user.id).all()
    for event in events:
        key = normalize_text_key(event.tool_name)
        tool = by_tool_key.get(key)
        if not tool:
            continue
        category = normalize_text_key(tool.get("category"))
        pricing = normalize_text_key(tool.get("price"))
        if category:
            category_counts[category] = category_counts.get(category, 0) + 1
        if pricing:
            pricing_counts[pricing] = pricing_counts.get(pricing, 0) + 1

    most_viewed_category = ""
    if category_counts:
        most_viewed_category = max(category_counts.items(), key=lambda row: row[1])[0]

    preferred_pricing = ""
    if pricing_counts:
        preferred_pricing = max(pricing_counts.items(), key=lambda row: row[1])[0]

    return {
        "total_views": int(total_views or 0),
        "total_saves": int(total_saves or 0),
        "most_viewed_category": most_viewed_category,
        "preferred_pricing": preferred_pricing,
        "last_active": last_event.timestamp if last_event else None,
    }
