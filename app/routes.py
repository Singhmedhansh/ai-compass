import json
import os
import re
from math import ceil
from html import escape
from datetime import datetime, timedelta, timezone
from functools import wraps
from urllib.parse import urlparse

from flask import Blueprint, Response, abort, flash, jsonify, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required

from app import db
from app.discovery import (
    add_notification,
    approve_queue_tool_by_name,
    build_queue_tool_key,
    load_discovery_queue,
    load_discovery_stats,
    load_notifications,
    reject_queue_tool_by_name,
    update_queue_tool_by_name,
)
from app.models import Favorite, NewsletterSubscriber, Submission, ToolRating, ToolView, User
from app.recommendations import recommend_tools
from app.tool_cache import get_cached_tools
from scripts.tool_discovery import run_discovery_pipeline


main_bp = Blueprint("main", __name__)

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tools.json")
DEFAULT_TOOL_ICON = "/static/icons/default.png"
SUPPORTED_SORTS = {"trending", "rating", "popular", "newest", "free"}
TOOLS_PER_PAGE = 20


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            return redirect(url_for("auth.login"))
        if not getattr(current_user, "is_admin", False):
            flash("Admin access required.", "error")
            return redirect(url_for("main.dashboard"))
        return f(*args, **kwargs)
    return decorated


def load_tools():
    return get_cached_tools(DATA_PATH)


def _tool_tags(tool):
    tags = tool.get("tags", [])
    if isinstance(tags, list):
        return {str(tag).strip().lower() for tag in tags if str(tag).strip()}
    if isinstance(tags, str):
        return {segment.strip().lower() for segment in tags.split(",") if segment.strip()}
    return set()


def _has_student_perk(tool):
    value = tool.get("studentPerk")
    if isinstance(value, bool):
        return value
    return bool(str(value or "").strip())


def _is_free_tool(tool):
    return str(tool.get("price") or "").strip().lower() == "free"


def _filter_collection_tools(kind):
    tools = [normalize_tool(tool) for tool in load_tools()]

    def keep(tool):
        category = str(tool.get("category") or "").strip().lower()
        tags = _tool_tags(tool)

        if kind == "students":
            return _has_student_perk(tool) or _is_free_tool(tool)
        if kind == "writing":
            return category in {"writing", "writing & docs", "docs"} or "writing" in tags
        if kind == "coding":
            return category in {"coding", "developer"} or "coding" in tags or "developer" in tags
        if kind == "research":
            return category == "research" or "research" in tags
        if kind == "free":
            return _is_free_tool(tool)
        return False

    filtered = [tool for tool in tools if keep(tool)]
    filtered = sort_tools(filtered, sort_type="rating", view_map=get_view_map(), student_mode=False)
    return filtered[:20]


def normalize_tool(tool):
    item = dict(tool)
    item["tool_key"] = build_tool_key(item)
    icon_path = str(item.get("icon") or "").strip()
    item["icon"] = icon_path if icon_path else DEFAULT_TOOL_ICON
    return item


def _format_weekly_users_from_views(value):
    value = int(value or 0)
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M+"
    if value >= 1_000:
        return f"{value / 1_000:.1f}K+"
    return str(value)


def apply_dynamic_weekly_users(tools, weekly_view_map):
    hydrated = []
    for tool in tools:
        item = dict(tool)
        key = str(item.get("tool_key") or build_tool_key(item))
        weekly_views = int(weekly_view_map.get(key, 0))
        if weekly_views > 0:
            item["weeklyUsers"] = _format_weekly_users_from_views(weekly_views)
        hydrated.append(item)
    return hydrated


def build_tool_key(tool):
    name = str(tool.get("name", "")).strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
    if slug:
        return slug

    raw_id = tool.get("id")
    if raw_id is not None:
        return str(raw_id)

    return "unknown"


def build_tool_slug(tool):
    return build_tool_key(tool)


def build_clearbit_logo_url(tool):
    link = str(tool.get("link") or tool.get("website") or "").strip()
    if not link:
        return ""

    parsed = urlparse(link)
    host = (parsed.netloc or parsed.path or "").strip().lower()
    host = host.replace("www.", "", 1)
    if not host:
        return ""
    return f"https://logo.clearbit.com/{host}"


def build_primary_tool_icon(tool):
    icon = str(tool.get("icon") or "").strip()
    if icon and icon != DEFAULT_TOOL_ICON:
        return icon

    clearbit_logo = build_clearbit_logo_url(tool)
    if clearbit_logo:
        return clearbit_logo
    return DEFAULT_TOOL_ICON


def parse_weekly_users(value):
    text = str(value or "").strip().upper().replace("+", "")
    if not text:
        return 0

    multiplier = 1
    if text.endswith("M"):
        multiplier = 1_000_000
        text = text[:-1]
    elif text.endswith("K"):
        multiplier = 1_000
        text = text[:-1]

    try:
        return int(float(text.replace(",", "")) * multiplier)
    except ValueError:
        return 0


def _parse_bool(value):
    return str(value or "").strip().lower() in {"1", "true", "on", "yes"}


def get_student_mode_from_request(default=False):
    raw = request.args.get("student_mode")
    if raw is None:
        return default
    return _parse_bool(raw)


def get_sort_type_from_request(default="trending"):
    raw = str(request.args.get("sort", default) or default).strip().lower()
    return raw if raw in SUPPORTED_SORTS else default


def _price_bucket(tool):
    model = str(tool.get("price") or "").strip().lower()
    if model == "free":
        return 3
    if model == "freemium":
        return 2
    if model == "paid":
        return 1
    return 0


def student_mode_ranking_score(tool):
    perk_score = 0.5 if tool.get("studentPerk") else 0.0
    model = str(tool.get("price") or "").strip().lower()
    if model == "free":
        price_score = 0.3
    elif model == "freemium":
        price_score = 0.2
    else:
        price_score = 0.0
    rating_score = float(tool.get("rating") or 0) * 0.2
    return perk_score + price_score + rating_score


def _sort_tuple(tool, sort_type, view_map=None):
    view_map = view_map or {}
    rating = float(tool.get("rating") or 0)
    weekly_users = parse_weekly_users(tool.get("weeklyUsers"))
    launch_year = int(tool.get("launchYear") or 0)
    views = int(view_map.get(tool.get("tool_key"), 0))

    if sort_type == "rating":
        return (rating, weekly_users, views)
    if sort_type == "popular":
        return (weekly_users, rating, views)
    if sort_type == "newest":
        return (launch_year, rating, weekly_users)
    if sort_type == "free":
        return (_price_bucket(tool), rating, weekly_users)

    # Default: trending
    return (trending_score(tool, views=views), rating, weekly_users)


def sort_tools(tools, sort_type="trending", view_map=None, student_mode=False):
    if not tools:
        return []

    def key_fn(item):
        if student_mode:
            return (
                student_mode_ranking_score(item),
                *_sort_tuple(item, sort_type, view_map=view_map),
            )
        return _sort_tuple(item, sort_type, view_map=view_map)

    return sorted(tools, key=key_fn, reverse=True)


def _to_set(items):
    if not isinstance(items, list):
        return set()
    return {str(item).strip().lower() for item in items if str(item).strip()}


def _tokenize_query(query):
    return [token for token in re.findall(r"[a-z0-9]+", str(query or "").lower()) if token]


def _search_score(tool, query_tokens):
    if not query_tokens:
        return 0

    name = str(tool.get("name") or "").lower()
    category = str(tool.get("category") or "").lower()
    description = str(tool.get("description") or "").lower()
    tags = " ".join(str(tag).lower() for tag in (tool.get("tags") or []))

    score = 0
    for token in query_tokens:
        if token in name:
            score += 70
            if name.startswith(token):
                score += 20
        if token in tags:
            score += 40
        if token in category:
            score += 25
        if token in description:
            score += 10

    if all(token in name for token in query_tokens):
        score += 30

    return score


def trending_score(tool, views=0):
    rating = float(tool.get("rating") or 0)
    weekly_users = parse_weekly_users(tool.get("weeklyUsers"))
    return (views * 0.5) + (weekly_users * 0.3) + (rating * 0.2)


def get_tool_by_key(tool_key):
    key_text = str(tool_key)
    for tool in load_tools():
        normalized = normalize_tool(tool)
        if normalized["tool_key"] == key_text or str(normalized.get("id")) == key_text:
            return normalized
    return None


def get_related_tools(tool_id, limit=5):
    base_tool = get_tool_by_key(tool_id)
    if not base_tool:
        return []

    tools = [normalize_tool(tool) for tool in load_tools()]
    base_key = base_tool["tool_key"]
    base_category = str(base_tool.get("category", "")).strip().lower()
    base_subcategory = str(base_tool.get("subcategory") or base_tool.get("subCategory") or "").strip().lower()
    base_tags = _to_set(base_tool.get("tags", []))
    base_platforms = _to_set(base_tool.get("platforms", []))

    scored = []
    for tool in tools:
        if tool["tool_key"] == base_key:
            continue

        score = 0
        category = str(tool.get("category", "")).strip().lower()
        subcategory = str(tool.get("subcategory") or tool.get("subCategory") or "").strip().lower()
        tags = _to_set(tool.get("tags", []))
        platforms = _to_set(tool.get("platforms", []))

        if category and category == base_category:
            score += 40
        if subcategory and subcategory == base_subcategory:
            score += 25

        score += len(base_tags & tags) * 8
        score += len(base_platforms & platforms) * 5

        if score > 0:
            scored.append((score, float(tool.get("rating") or 0), tool))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [tool for _, _, tool in scored[:limit]]


def _stack_pick_score(tool, student_mode=False):
    score = float(tool.get("rating") or 0) * 10
    score += parse_weekly_users(tool.get("weeklyUsers")) / 100000
    if tool.get("trending"):
        score += 5

    if student_mode:
        price_model = str(tool.get("price") or "").strip().lower()
        if price_model == "free":
            score += 15
        elif price_model == "freemium":
            score += 8
        if tool.get("studentPerk"):
            score += 10

    return score


def build_ai_stack(selected_categories, student_mode=False):
    tools = [normalize_tool(tool) for tool in load_tools()]
    stack = {}
    for category in selected_categories:
        candidates = [
            tool for tool in tools
            if str(tool.get("category", "")).strip().lower() == str(category).strip().lower()
        ]
        if not candidates:
            stack[category] = None
            continue

        ranked = sorted(candidates, key=lambda tool: _stack_pick_score(tool, student_mode=student_mode), reverse=True)
        stack[category] = ranked[0]

    return stack


FINDER_GOAL_RULES = {
    "writing": {
        "categories": {"writing", "writing & docs", "llm"},
        "tags": {"writing", "docs", "essay", "copy", "content", "grammar"},
    },
    "coding": {
        "categories": {"coding", "developer"},
        "tags": {"coding", "code", "developer", "programming", "refactor", "debug"},
    },
    "research": {
        "categories": {"research"},
        "tags": {"research", "analysis", "citation", "literature", "papers"},
    },
    "studying": {
        "categories": {"research", "writing", "productivity"},
        "tags": {"study", "students", "learning", "notes", "quiz", "flashcards"},
    },
    "productivity": {
        "categories": {"productivity"},
        "tags": {"productivity", "workflow", "automation", "tasks", "organize"},
    },
}

TOOL_FINDER_GOALS = [
    {"key": "writing", "label": "Writing"},
    {"key": "coding", "label": "Coding"},
    {"key": "research", "label": "Research"},
    {"key": "studying", "label": "Studying"},
    {"key": "productivity", "label": "Productivity"},
    {"key": "image_generation", "label": "Image Generation"},
    {"key": "video_creation", "label": "Video Creation"},
]

TOOL_FINDER_GOAL_MAP = {item["key"]: item["label"] for item in TOOL_FINDER_GOALS}

TOOL_FINDER_BUDGETS = [
    {"key": "free_only", "label": "Free only"},
    {"key": "free_freemium", "label": "Free + Freemium"},
    {"key": "any_price", "label": "Any price"},
]

TOOL_FINDER_BUDGET_MAP = {item["key"]: item["label"] for item in TOOL_FINDER_BUDGETS}

TOOL_FINDER_PLATFORMS = [
    {"key": "web", "label": "Web"},
    {"key": "desktop", "label": "Desktop"},
    {"key": "mobile", "label": "Mobile"},
    {"key": "any", "label": "Any"},
]

TOOL_FINDER_PLATFORM_MAP = {item["key"]: item["label"] for item in TOOL_FINDER_PLATFORMS}

TOOL_FINDER_GOAL_RULES = {
    "writing": {
        "categories": {"writing", "writing & docs", "llm"},
        "tags": {"writing", "docs", "essay", "copy", "content", "grammar", "summarization"},
    },
    "coding": {
        "categories": {"coding", "developer"},
        "tags": {"coding", "code", "developer", "programming", "refactor", "debug", "autocomplete"},
    },
    "research": {
        "categories": {"research", "llm"},
        "tags": {"research", "analysis", "citation", "literature", "papers", "search"},
    },
    "studying": {
        "categories": {"research", "writing", "productivity", "llm"},
        "tags": {"study", "students", "learning", "notes", "quiz", "flashcards", "education"},
    },
    "productivity": {
        "categories": {"productivity", "llm"},
        "tags": {"productivity", "workflow", "automation", "tasks", "organize", "notes"},
    },
    "image_generation": {
        "categories": {"image", "design"},
        "tags": {"image", "image-gen", "art", "design", "photo", "illustration"},
    },
    "video_creation": {
        "categories": {"video"},
        "tags": {"video", "video-gen", "editing", "animation", "creator"},
    },
}


def _empty_tool_finder_state():
    return {
        "goal": "",
        "budget": "",
        "platform": "",
        "result_tool_keys": [],
    }


def _get_tool_finder_state(create=False):
    state = session.get("tool_finder")
    if isinstance(state, dict):
        return {
            "goal": str(state.get("goal") or ""),
            "budget": str(state.get("budget") or ""),
            "platform": str(state.get("platform") or ""),
            "result_tool_keys": list(state.get("result_tool_keys") or []),
        }
    if create:
        state = _empty_tool_finder_state()
        session["tool_finder"] = state
        return state
    return _empty_tool_finder_state()


def _set_tool_finder_state(state):
    session["tool_finder"] = {
        "goal": str(state.get("goal") or ""),
        "budget": str(state.get("budget") or ""),
        "platform": str(state.get("platform") or ""),
        "result_tool_keys": list(state.get("result_tool_keys") or []),
    }


def _tool_price_key(tool):
    return str(tool.get("price") or "").strip().lower()


def _budget_allows(tool, budget):
    price = _tool_price_key(tool)
    if budget == "free_only":
        return price == "free"
    if budget == "free_freemium":
        return price in {"free", "freemium"}
    return True


def _is_desktop_platform(value):
    text = str(value or "").strip().lower()
    desktop_markers = {"desktop", "windows", "macos", "linux", "mac", "win", "vs code", "jetbrains", "vim", "cli"}
    return any(marker in text for marker in desktop_markers)


def _is_mobile_platform(value):
    text = str(value or "").strip().lower()
    return "ios" in text or "android" in text or "mobile" in text


def _platform_matches(tool, platform):
    if platform == "any":
        return True

    values = tool.get("platforms")
    if isinstance(values, list):
        candidates = [str(item) for item in values]
    elif isinstance(values, str):
        candidates = [segment.strip() for segment in values.split(",") if segment.strip()]
    else:
        candidates = []

    if not candidates:
        return platform == "any"

    if platform == "web":
        return any("web" in str(item).strip().lower() for item in candidates)
    if platform == "desktop":
        return any(_is_desktop_platform(item) for item in candidates)
    if platform == "mobile":
        return any(_is_mobile_platform(item) for item in candidates)
    return True


def _goal_match_score(tool, goal):
    rule = TOOL_FINDER_GOAL_RULES.get(goal)
    if not rule:
        return 0

    category = str(tool.get("category") or "").strip().lower()
    subcategory = str(tool.get("subcategory") or tool.get("subCategory") or "").strip().lower()
    tags = _to_set(tool.get("tags", []))
    best_for = str(tool.get("bestFor") or "").strip().lower()
    description = str(tool.get("description") or "").strip().lower()

    score = 0.0
    if category in rule["categories"]:
        score += 60.0
    if subcategory and any(keyword in subcategory for keyword in rule["tags"]):
        score += 12.0
    score += len(tags & rule["tags"]) * 15.0
    score += sum(5.0 for token in rule["tags"] if token in best_for)
    score += sum(2.0 for token in rule["tags"] if token in description)
    return score


def _tool_finder_rank_score(tool, goal):
    score = _goal_match_score(tool, goal)
    score += float(tool.get("rating") or 0) * 8.0
    if tool.get("trending"):
        score += 10.0
    if _has_student_perk(tool):
        score += 14.0

    price = _tool_price_key(tool)
    if price == "free":
        score += 12.0
    elif price == "freemium":
        score += 8.0

    score += parse_weekly_users(tool.get("weeklyUsers")) / 2_000_000
    return score


def generate_tool_finder_stack(goal, budget, platform, min_items=3, max_items=6):
    if goal not in TOOL_FINDER_GOAL_MAP:
        return []

    if budget not in TOOL_FINDER_BUDGET_MAP:
        budget = "any_price"
    if platform not in TOOL_FINDER_PLATFORM_MAP:
        platform = "any"

    all_tools = [normalize_tool(tool) for tool in load_tools()]

    def score_rows(tools):
        rows = []
        for tool in tools:
            score = _tool_finder_rank_score(tool, goal)
            if score <= 0:
                continue
            rows.append((score, float(tool.get("rating") or 0), parse_weekly_users(tool.get("weeklyUsers")), tool))
        rows.sort(key=lambda row: (row[0], row[1], row[2]), reverse=True)
        return rows

    strict_candidates = [
        tool for tool in all_tools
        if _budget_allows(tool, budget) and _platform_matches(tool, platform)
    ]
    ranked_rows = score_rows(strict_candidates)

    if len(ranked_rows) < min_items:
        relaxed_platform = [tool for tool in all_tools if _budget_allows(tool, budget)]
        ranked_rows = score_rows(relaxed_platform)

    if len(ranked_rows) < min_items:
        ranked_rows = score_rows(all_tools)

    selected = []
    seen = set()
    for _, _, _, tool in ranked_rows:
        key = str(tool.get("tool_key") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        selected.append(tool)
        if len(selected) >= max_items:
            break

    return selected


def _matches_finder_budget(tool, budget):
    model = str(tool.get("price") or "").strip().lower()
    return model == budget


def _finder_score(tool, goal):
    rule = FINDER_GOAL_RULES.get(goal, {"categories": set(), "tags": set()})
    category = str(tool.get("category") or "").strip().lower()
    tags = _to_set(tool.get("tags", []))
    best_for = str(tool.get("bestFor") or "").strip().lower()
    description = str(tool.get("description") or "").strip().lower()

    score = 0
    if category in rule["categories"]:
        score += 50
    score += len(tags & rule["tags"]) * 12
    if goal in best_for:
        score += 10
    if goal in description:
        score += 5
    return score


def recommend_finder_tools(goal, budget, limit=5):
    tools = [normalize_tool(tool) for tool in load_tools()]
    filtered = [tool for tool in tools if _matches_finder_budget(tool, budget)]

    scored = []
    for tool in filtered:
        score = _finder_score(tool, goal)
        if score > 0:
            scored.append((score, float(tool.get("rating") or 0), parse_weekly_users(tool.get("weeklyUsers")), tool))

    scored.sort(key=lambda row: (row[0], row[1], row[2]), reverse=True)
    return [tool for _, _, _, tool in scored[:limit]]


def get_favorite_tool_keys(user_id):
    rows = Favorite.query.filter_by(user_id=user_id).all()
    return {row.tool_id for row in rows}


def get_view_map():
    rows = (
        db.session.query(ToolView.tool_name, db.func.count(ToolView.id))
        .filter(ToolView.tool_name.isnot(None))
        .group_by(ToolView.tool_name)
        .all()
    )
    return {str(tool_name): int(count) for tool_name, count in rows}


def get_weekly_view_map(days=7):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.session.query(ToolView.tool_name, db.func.count(ToolView.id))
        .filter(ToolView.tool_name.isnot(None))
        .filter(ToolView.timestamp >= since)
        .group_by(ToolView.tool_name)
        .all()
    )
    return {str(tool_name): int(count) for tool_name, count in rows}


def get_views_per_day(days=7):
    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    rows = (
        db.session.query(db.func.date(ToolView.timestamp), db.func.count(ToolView.id))
        .filter(ToolView.timestamp >= since)
        .group_by(db.func.date(ToolView.timestamp))
        .all()
    )

    by_day = {str(day): int(count) for day, count in rows}
    timeline = []
    for offset in range(days):
        day = (since + timedelta(days=offset)).date().isoformat()
        timeline.append({"date": day, "views": by_day.get(day, 0)})
    return timeline


def log_tool_view(tool_key):
    row = ToolView(
        tool_name=str(tool_key),
        user_id=current_user.id if current_user.is_authenticated else None,
        timestamp=datetime.now(timezone.utc),
    )
    db.session.add(row)
    db.session.commit()


def get_most_viewed_tools(limit=8):
    tools = [normalize_tool(tool) for tool in load_tools()]
    by_key = {tool["tool_key"]: tool for tool in tools}
    total_views = get_view_map()
    ranked = sorted(total_views.items(), key=lambda item: item[1], reverse=True)[:limit]

    result = []
    for key, views in ranked:
        tool = by_key.get(str(key))
        if not tool:
            continue
        result.append({"tool": tool, "views": int(views)})
    return result


def get_trending_tools_by_views(limit=8):
    tools = [normalize_tool(tool) for tool in load_tools()]
    by_key = {tool["tool_key"]: tool for tool in tools}
    weekly_views = get_weekly_view_map(days=7)
    ranked = sorted(weekly_views.items(), key=lambda item: item[1], reverse=True)[:limit]

    result = []
    for key, views in ranked:
        tool = by_key.get(str(key))
        if not tool:
            continue
        result.append({"tool": tool, "views": int(views)})
    return result


def get_trending_homepage_tools(limit=6):
    tools = [normalize_tool(tool) for tool in load_tools()]
    trending_tools = [tool for tool in tools if bool(tool.get("trending"))]
    ranked = sorted(
        trending_tools,
        key=lambda item: (float(item.get("rating") or 0), parse_weekly_users(item.get("weeklyUsers"))),
        reverse=True,
    )
    return ranked[:limit]


def get_tool_rating_summary(tool_key):
    avg_rating, review_count = (
        db.session.query(db.func.avg(ToolRating.rating), db.func.count(ToolRating.id))
        .filter(ToolRating.tool_name == str(tool_key))
        .first()
    )
    return {
        "average": round(float(avg_rating or 0), 1) if review_count else 0.0,
        "count": int(review_count or 0),
    }


def get_user_tool_rating(tool_key, user_id):
    if not user_id:
        return 0
    row = ToolRating.query.filter_by(tool_name=str(tool_key), user_id=user_id).first()
    return int(row.rating) if row else 0


@main_bp.route("/")
def index():
    favorite_ids = []
    if current_user.is_authenticated:
        favorite_ids = list(get_favorite_tool_keys(current_user.id))

    tools = [normalize_tool(tool) for tool in load_tools()]
    trending_tools = get_trending_homepage_tools(limit=6)
    categories = {
        str(tool.get("category") or "").strip().lower()
        for tool in tools
        if str(tool.get("category") or "").strip()
    }
    total_users = User.query.count()
    recent_tools = sorted(
        tools,
        key=lambda item: (int(item.get("launchYear") or 0), float(item.get("rating") or 0)),
        reverse=True,
    )[:8]

    return render_template(
        "index.html",
        favorite_ids=favorite_ids,
        is_authenticated=current_user.is_authenticated,
        recent_tools=recent_tools,
        trending_tools=trending_tools,
        total_tools=len(tools),
        total_categories=len(categories),
        total_users=total_users if total_users > 0 else 12000,
    )


@main_bp.route("/newsletter/subscribe", methods=["POST"])
def newsletter_subscribe():
    email = request.form.get("email", "").strip().lower()
    if not email:
        flash("Please enter an email address.", "error")
        return redirect(url_for("main.index"))

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        flash("Please enter a valid email address.", "error")
        return redirect(url_for("main.index"))

    existing = NewsletterSubscriber.query.filter_by(email=email).first()
    if existing:
        flash("You're already subscribed to updates.", "info")
        return redirect(url_for("main.index"))

    db.session.add(NewsletterSubscriber(email=email))
    db.session.commit()
    flash("Thanks for subscribing to AI Compass updates.", "success")
    return redirect(url_for("main.index"))


@main_bp.route("/tools")
def tools_paginated():
    page = request.args.get("page", 1, type=int)
    if page < 1:
        page = 1

    all_tools = [normalize_tool(tool) for tool in load_tools()]
    sorted_tools = sort_tools(all_tools, sort_type="trending", view_map=get_view_map(), student_mode=False)

    total_tools = len(sorted_tools)
    total_pages = max(1, ceil(total_tools / TOOLS_PER_PAGE))
    if page > total_pages:
        page = total_pages

    start = (page - 1) * TOOLS_PER_PAGE
    end = start + TOOLS_PER_PAGE
    page_tools = sorted_tools[start:end]

    page_window_start = max(1, page - 2)
    page_window_end = min(total_pages, page + 2)
    page_numbers = list(range(page_window_start, page_window_end + 1))

    return render_template(
        "tools.html",
        tools=page_tools,
        page=page,
        total_pages=total_pages,
        page_numbers=page_numbers,
        has_prev=page > 1,
        has_next=page < total_pages,
        prev_page=page - 1,
        next_page=page + 1,
        total_tools=total_tools,
        is_authenticated=current_user.is_authenticated,
    )


def _render_collection(kind, title, intro):
    tools = _filter_collection_tools(kind)
    return render_template(
        "collection.html",
        tools=tools,
        collection_title=title,
        collection_intro=intro,
        is_authenticated=current_user.is_authenticated,
    )


@main_bp.route("/best-ai-tools-for-students")
def collection_students():
    return _render_collection(
        "students",
        "Best AI Tools for Students",
        "Discover the best AI tools for students including writing assistants, research tools, coding copilots, and productivity apps.",
    )


@main_bp.route("/best-ai-writing-tools")
def collection_writing():
    return _render_collection(
        "writing",
        "Best AI Writing Tools",
        "Explore top AI writing tools for essays, summaries, editing, and content drafting.",
    )


@main_bp.route("/best-ai-tools-for-coding")
def collection_coding():
    return _render_collection(
        "coding",
        "Best AI Tools for Coding",
        "Compare leading AI coding assistants for autocomplete, debugging, refactoring, and code generation.",
    )


@main_bp.route("/best-ai-research-tools")
def collection_research():
    return _render_collection(
        "research",
        "Best AI Research Tools",
        "Find AI research assistants for literature reviews, citation support, and note synthesis.",
    )


@main_bp.route("/best-free-ai-tools")
def collection_free():
    return _render_collection(
        "free",
        "Best Free AI Tools",
        "Browse high-quality free AI tools across writing, coding, image generation, research, and productivity.",
    )


@main_bp.route("/dashboard")
@login_required
def dashboard():
    tools = [normalize_tool(tool) for tool in load_tools()]
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = get_student_mode_from_request(default=False)
    by_key = {tool["tool_key"]: tool for tool in tools}
    view_map = get_view_map()

    favorite_keys = get_favorite_tool_keys(current_user.id)
    favorite_tools = [by_key[key] for key in favorite_keys if key in by_key]
    favorite_tools = sort_tools(favorite_tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:8]

    recent_keys = session.get("recent_tools", [])
    recent_tools = [by_key[key] for key in recent_keys if key in by_key]
    recent_tools = sort_tools(recent_tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:8]

    recommended_tools = recommend_tools(tools, favorite_tools, limit=16, student_mode=student_mode)
    recommended_tools = sort_tools(recommended_tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:8]
    trending_tools = sort_tools(tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:8]

    return render_template(
        "dashboard.html",
        favorite_tools=favorite_tools,
        recent_tools=recent_tools,
        recommended_tools=recommended_tools,
        trending_tools=trending_tools,
        student_mode=student_mode,
        sort_type=sort_type,
        sort_options=["trending", "rating", "popular", "newest", "free"],
    )


@main_bp.route("/compare")
def compare():
    tools = [normalize_tool(tool) for tool in load_tools()]
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = get_student_mode_from_request(default=False)
    view_map = get_view_map()
    tools = sort_tools(tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)
    query_tools = request.args.get("tools", "")
    selected_keys = [segment.strip() for segment in query_tools.split(",") if segment.strip()]

    selected = []
    by_key = {tool["tool_key"]: tool for tool in tools}
    for key in selected_keys:
        if key in by_key:
            selected.append(by_key[key])

    return render_template(
        "compare.html",
        tools=tools,
        selected_tools=selected,
        selected_keys=selected_keys,
        student_mode=student_mode,
        sort_type=sort_type,
    )


STACK_CATEGORY_MAP = {
    "writing": "writing",
    "coding": "coding",
    "image": "image",
    "video": "video",
    "research": "research",
    "productivity": "productivity",
}


@main_bp.route("/ai-stack-builder", methods=["GET"])
@main_bp.route("/stack-builder", methods=["GET"])
def ai_stack_builder():
    return redirect(url_for("main.ai_tool_finder"))


@main_bp.route("/stack-builder/build", methods=["POST"])
def build_stack():
    return redirect(url_for("main.ai_tool_finder"))


@main_bp.route("/ai-tool-finder", methods=["GET", "POST"])
def ai_tool_finder():
    state = _empty_tool_finder_state()
    _set_tool_finder_state(state)
    return redirect(url_for("main.ai_tool_finder_step", step=1))


@main_bp.route("/ai-tool-finder/step/<int:step>", methods=["GET", "POST"])
def ai_tool_finder_step(step):
    if step not in {1, 2, 3}:
        return redirect(url_for("main.ai_tool_finder_step", step=1))

    state = _get_tool_finder_state(create=True)

    if request.method == "POST":
        if step == 1:
            goal = str(request.form.get("goal") or "").strip().lower()
            if goal not in TOOL_FINDER_GOAL_MAP:
                flash("Please select one goal to continue.", "warning")
                return redirect(url_for("main.ai_tool_finder_step", step=1))

            state["goal"] = goal
            state["budget"] = ""
            state["platform"] = ""
            state["result_tool_keys"] = []
            _set_tool_finder_state(state)
            return redirect(url_for("main.ai_tool_finder_step", step=2))

        if step == 2:
            if state.get("goal") not in TOOL_FINDER_GOAL_MAP:
                flash("Start from Step 1 first.", "warning")
                return redirect(url_for("main.ai_tool_finder_step", step=1))

            budget = str(request.form.get("budget") or "").strip().lower()
            if budget not in TOOL_FINDER_BUDGET_MAP:
                flash("Please select a budget preference.", "warning")
                return redirect(url_for("main.ai_tool_finder_step", step=2))

            state["budget"] = budget
            state["platform"] = ""
            state["result_tool_keys"] = []
            _set_tool_finder_state(state)
            return redirect(url_for("main.ai_tool_finder_step", step=3))

        if state.get("goal") not in TOOL_FINDER_GOAL_MAP:
            flash("Start from Step 1 first.", "warning")
            return redirect(url_for("main.ai_tool_finder_step", step=1))
        if state.get("budget") not in TOOL_FINDER_BUDGET_MAP:
            flash("Complete Step 2 first.", "warning")
            return redirect(url_for("main.ai_tool_finder_step", step=2))

        platform = str(request.form.get("platform") or "").strip().lower()
        if platform not in TOOL_FINDER_PLATFORM_MAP:
            flash("Please select a platform preference.", "warning")
            return redirect(url_for("main.ai_tool_finder_step", step=3))

        state["platform"] = platform
        state["result_tool_keys"] = []
        _set_tool_finder_state(state)
        return redirect(url_for("main.ai_tool_finder_results"))

    if step == 2 and state.get("goal") not in TOOL_FINDER_GOAL_MAP:
        flash("Start from Step 1 first.", "warning")
        return redirect(url_for("main.ai_tool_finder_step", step=1))
    if step == 3:
        if state.get("goal") not in TOOL_FINDER_GOAL_MAP:
            flash("Start from Step 1 first.", "warning")
            return redirect(url_for("main.ai_tool_finder_step", step=1))
        if state.get("budget") not in TOOL_FINDER_BUDGET_MAP:
            flash("Complete Step 2 first.", "warning")
            return redirect(url_for("main.ai_tool_finder_step", step=2))

    return render_template(
        "tool_finder.html",
        step=step,
        goals=TOOL_FINDER_GOALS,
        budgets=TOOL_FINDER_BUDGETS,
        platforms=TOOL_FINDER_PLATFORMS,
        selections=state,
        selected_labels={
            "goal": TOOL_FINDER_GOAL_MAP.get(state.get("goal", ""), ""),
            "budget": TOOL_FINDER_BUDGET_MAP.get(state.get("budget", ""), ""),
            "platform": TOOL_FINDER_PLATFORM_MAP.get(state.get("platform", ""), ""),
        },
        recommendations=[],
        can_save=False,
        is_authenticated=current_user.is_authenticated,
    )


@main_bp.route("/ai-tool-finder/results", methods=["GET", "POST"])
def ai_tool_finder_results():
    state = _get_tool_finder_state(create=True)
    goal = state.get("goal")
    budget = state.get("budget")
    platform = state.get("platform")

    if goal not in TOOL_FINDER_GOAL_MAP:
        flash("Start from Step 1 first.", "warning")
        return redirect(url_for("main.ai_tool_finder_step", step=1))
    if budget not in TOOL_FINDER_BUDGET_MAP:
        flash("Complete Step 2 first.", "warning")
        return redirect(url_for("main.ai_tool_finder_step", step=2))
    if platform not in TOOL_FINDER_PLATFORM_MAP:
        flash("Complete Step 3 first.", "warning")
        return redirect(url_for("main.ai_tool_finder_step", step=3))

    recommendations = generate_tool_finder_stack(goal, budget, platform, min_items=3, max_items=6)
    state["result_tool_keys"] = [tool["tool_key"] for tool in recommendations]
    _set_tool_finder_state(state)

    if request.method == "POST":
        if not current_user.is_authenticated:
            flash("Please log in to save your AI stack.", "warning")
            return redirect(url_for("auth.login"))

        added = 0
        for tool_key in state.get("result_tool_keys", []):
            existing = Favorite.query.filter_by(user_id=current_user.id, tool_id=str(tool_key)).first()
            if existing:
                continue
            db.session.add(Favorite(user_id=current_user.id, tool_id=str(tool_key)))
            added += 1
        db.session.commit()

        if added:
            flash(f"Saved {added} tools to your dashboard favorites.", "success")
        else:
            flash("These tools are already in your favorites.", "info")
        return redirect(url_for("main.dashboard"))

    return render_template(
        "tool_finder.html",
        step=4,
        goals=TOOL_FINDER_GOALS,
        budgets=TOOL_FINDER_BUDGETS,
        platforms=TOOL_FINDER_PLATFORMS,
        selections=state,
        selected_labels={
            "goal": TOOL_FINDER_GOAL_MAP.get(goal, ""),
            "budget": TOOL_FINDER_BUDGET_MAP.get(budget, ""),
            "platform": TOOL_FINDER_PLATFORM_MAP.get(platform, ""),
        },
        recommendations=recommendations,
        can_save=current_user.is_authenticated,
        is_authenticated=current_user.is_authenticated,
    )


@main_bp.route("/api/tools")
def api_tools():
    tools = [normalize_tool(tool) for tool in load_tools()]
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = get_student_mode_from_request(default=False)
    tools = sort_tools(tools, sort_type=sort_type, view_map=get_view_map(), student_mode=student_mode)
    return jsonify(tools)


@main_bp.route("/api/tools/trending")
def api_tools_trending():
    tools = [normalize_tool(tool) for tool in load_tools()]
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = get_student_mode_from_request(default=False)
    view_map = get_view_map()

    top = sort_tools(tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:10]
    return jsonify(top)


@main_bp.route("/api/tools/category/<category>")
def api_tools_category(category):
    tools = [normalize_tool(tool) for tool in load_tools()]
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = get_student_mode_from_request(default=False)
    filtered = [tool for tool in tools if str(tool.get("category", "")).lower() == category.lower()]
    filtered = sort_tools(filtered, sort_type=sort_type, view_map=get_view_map(), student_mode=student_mode)
    return jsonify(filtered)


@main_bp.route("/api/tools/<tool_id>")
def api_tool_detail(tool_id):
    tool = get_tool_by_key(tool_id)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404
    tool = apply_dynamic_weekly_users([tool], get_weekly_view_map())[0]
    return jsonify(tool)


@main_bp.route("/api/search")
def api_search():
    query = str(request.args.get("q", "") or "").strip()
    tokens = _tokenize_query(query)
    if not tokens:
        return jsonify([])

    tools = [normalize_tool(tool) for tool in load_tools()]
    ranked = []
    for tool in tools:
        score = _search_score(tool, tokens)
        if score <= 0:
            continue
        ranked.append((score, float(tool.get("rating") or 0), parse_weekly_users(tool.get("weeklyUsers")), tool))

    ranked.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)

    top = []
    for score, _, _, tool in ranked[:10]:
        top.append(
            {
                "name": tool.get("name", ""),
                "slug": tool.get("tool_key") or build_tool_slug(tool),
                "category": tool.get("category", ""),
                "description": tool.get("description", ""),
                "tags": tool.get("tags", []),
                "icon": tool.get("icon") or DEFAULT_TOOL_ICON,
                "score": score,
            }
        )

    return jsonify(top)


@main_bp.route("/api/favorite", methods=["POST"])
@login_required
def api_favorite():
    payload = request.get_json(silent=True) or {}
    tool_id = str(payload.get("tool_id", "")).strip()
    if not tool_id:
        return jsonify({"error": "tool_id is required"}), 400

    existing = Favorite.query.filter_by(user_id=current_user.id, tool_id=tool_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"ok": True, "favorited": False})

    row = Favorite(user_id=current_user.id, tool_id=tool_id)
    db.session.add(row)
    db.session.commit()
    return jsonify({"ok": True, "favorited": True})


@main_bp.route("/api/view", methods=["POST"])
def api_view():
    payload = request.get_json(silent=True) or {}
    tool_id = str(payload.get("tool_id", "")).strip()
    if not tool_id:
        return jsonify({"error": "tool_id is required"}), 400

    log_tool_view(tool_id)

    recent_tools = session.get("recent_tools", [])
    recent_tools = [item for item in recent_tools if item != tool_id]
    recent_tools.insert(0, tool_id)
    session["recent_tools"] = recent_tools[:12]

    return jsonify({"ok": True, "views": int(get_view_map().get(tool_id, 0))})


# ── Tool Detail ───────────────────────────────────────────────────────────────

@main_bp.route("/tool/<tool_id>")
def tool_detail(tool_id):
    slug = str(tool_id or "").strip().lower()
    tool = get_tool_by_key(slug)
    if not tool:
        abort(404)

    all_tools = [normalize_tool(t) for t in load_tools()]
    favorite_ids: set = set()
    is_favorited = False
    if current_user.is_authenticated:
        favorite_ids = get_favorite_tool_keys(current_user.id)
        is_favorited = tool["tool_key"] in favorite_ids

    rating_summary = get_tool_rating_summary(tool["tool_key"])
    user_rating = get_user_tool_rating(tool["tool_key"], current_user.id if current_user.is_authenticated else None)

    # Track per-visit view event
    log_tool_view(tool["tool_key"])
    view_count = int(get_view_map().get(tool["tool_key"], 0))
    weekly_views = int(get_weekly_view_map().get(tool["tool_key"], 0))
    tool["weeklyUsers"] = _format_weekly_users_from_views(weekly_views) if weekly_views > 0 else tool.get("weeklyUsers")

    # Record in session history
    recent = session.get("recent_tools", [])
    recent = [i for i in recent if i != tool["tool_key"]]
    recent.insert(0, tool["tool_key"])
    session["recent_tools"] = recent[:12]

    related_tools = get_related_tools(tool["tool_key"], limit=3)

    tool_cat = str(tool.get("category", "")).strip().lower()
    similar_tools = [
        candidate for candidate in all_tools
        if candidate["tool_key"] != tool["tool_key"] and str(candidate.get("category", "")).strip().lower() == tool_cat
    ][:3]

    seo_description = (
        tool.get("description")
        or tool.get("tagline")
        or f"Discover {tool.get('name', 'this AI tool')} on AI Compass."
    )
    seo_description = str(seo_description)[:160]

    primary_icon = build_primary_tool_icon(tool)
    schema_tool = {
        **tool,
        "name": tool.get("name"),
        "applicationCategory": tool.get("category") or "AI Tool",
        "operatingSystem": ", ".join(tool.get("platforms", [])) if isinstance(tool.get("platforms"), list) else str(tool.get("platforms") or "Web"),
        "offer_price": tool.get("price") or "freemium",
        "rating_value": rating_summary["average"] or float(tool.get("rating") or 0),
        "rating_count": rating_summary["count"] or parse_weekly_users(tool.get("weeklyUsers")),
        "seo_icon": primary_icon,
        "slug": tool.get("tool_key") or build_tool_slug(tool),
        "subCategory": tool.get("subCategory") or tool.get("subcategory") or "",
    }

    return render_template(
        "tool_page.html",
        tool=schema_tool,
        related_tools=related_tools,
        similar_tools=similar_tools,
        is_favorited=is_favorited,
        is_authenticated=current_user.is_authenticated,
        views=view_count,
        seo_description=seo_description,
        rating_summary=rating_summary,
        user_rating=user_rating,
    )


@main_bp.route("/tool/<tool_id>/rate", methods=["POST"])
@login_required
def rate_tool(tool_id):
    tool = get_tool_by_key(tool_id)
    if not tool:
        abort(404)

    try:
        rating = int(request.form.get("rating", "0") or 0)
    except ValueError:
        rating = 0

    if rating not in {1, 2, 3, 4, 5}:
        flash("Please select a rating between 1 and 5 stars.", "error")
        return redirect(url_for("main.tool_detail", tool_id=tool_id))

    existing = ToolRating.query.filter_by(tool_name=tool["tool_key"], user_id=current_user.id).first()
    if existing:
        existing.rating = rating
        existing.created_at = datetime.now(timezone.utc)
        flash("Your rating was updated.", "success")
    else:
        db.session.add(ToolRating(tool_name=tool["tool_key"], user_id=current_user.id, rating=rating))
        flash("Thanks for rating this tool.", "success")

    db.session.commit()
    return redirect(url_for("main.tool_detail", tool_id=tool_id))


# ── Submit Tool ───────────────────────────────────────────────────────────────

@main_bp.route("/submit-tool", methods=["GET", "POST"])
def submit_tool():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        website = request.form.get("website", "").strip()
        category = request.form.get("category", "").strip()
        description = request.form.get("description", "").strip()
        pricing_model = request.form.get("pricing", "").strip() or request.form.get("pricing_model", "").strip()
        student_perks = request.form.get("student_perks", "").strip()
        tags = request.form.get("tags", "").strip()
        submitter_email = request.form.get("submitter_email", "").strip()

        if not name or not website or not category or not description or not pricing_model:
            flash("Please fill in all required fields.", "error")
            return render_template("submit_tool.html", is_authenticated=current_user.is_authenticated)

        # Basic URL validation (must start with http:// or https://)
        if not re.match(r"^https?://", website):
            flash("Please enter a valid website URL starting with http:// or https://", "error")
            return render_template("submit_tool.html", is_authenticated=current_user.is_authenticated)

        submission = Submission(
            name=name,
            website=website,
            category=category,
            description=description,
            pricing_model=pricing_model,
            student_perks=student_perks or None,
            tags=tags or None,
            submitter_email=submitter_email or None,
        )
        db.session.add(submission)
        db.session.commit()

        # Notify admins in admin panel notifications feed.
        add_notification("new_submission", 1)

        flash("Your tool has been submitted for review. Thank you!", "success")
        return redirect(url_for("main.submit_tool"))

    return render_template("submit_tool.html", is_authenticated=current_user.is_authenticated)


# ── Weekly Updates Feed ───────────────────────────────────────────────────────

@main_bp.route("/updates")
def updates():
    all_tools = [normalize_tool(t) for t in load_tools()]
    cutoff_year = 2025
    # Show tools launched in 2025 or 2026, or marked trending
    recent_tools = [
        t for t in all_tools
        if int(t.get("launchYear") or 0) >= cutoff_year or t.get("trending")
    ]
    # Sort by launchYear desc, then rank asc
    recent_tools.sort(key=lambda t: (-(int(t.get("launchYear") or 0)), int(t.get("rank") or 99999)))
    return render_template(
        "updates.html",
        tools=recent_tools,
        is_authenticated=current_user.is_authenticated,
    )


# ── Admin Panel ───────────────────────────────────────────────────────────────

@main_bp.route("/admin")
@admin_required
def admin():
    pending = Submission.query.filter_by(status="pending").order_by(Submission.submitted_at.desc()).all()
    approved = Submission.query.filter_by(status="approved").order_by(Submission.submitted_at.desc()).limit(20).all()
    all_tools = [normalize_tool(t) for t in load_tools()]
    view_map = get_view_map()
    queue = load_discovery_queue()
    queue_items = [
        {
            "index": index,
            "tool_name": build_queue_tool_key(item.get("tool", {})),
            "status": item.get("status", "pending"),
            "tool": item.get("tool", {}),
        }
        for index, item in enumerate(queue)
    ]
    pending_discovery = [item for item in queue_items if item["status"] == "pending"]

    analytics = {
        "total_tools": len(all_tools),
        "pending_submissions": len(pending),
        "pending_discovery": len(pending_discovery),
        "total_views": sum(view_map.values()),
    }

    most_viewed_tools = get_most_viewed_tools(limit=8)
    views_per_day = get_views_per_day(days=7)
    trending_by_views = get_trending_tools_by_views(limit=8)

    return render_template(
        "admin.html",
        pending_submissions=pending,
        approved_submissions=approved,
        discovery_queue=pending_discovery,
        discovery_stats=load_discovery_stats(),
        notifications=load_notifications()[:10],
        analytics=analytics,
        most_viewed_tools=most_viewed_tools,
        views_per_day=views_per_day,
        trending_by_views=trending_by_views,
        is_authenticated=current_user.is_authenticated,
    )


@main_bp.route("/admin/approve/<int:submission_id>", methods=["POST"])
@admin_required
def admin_approve(submission_id):
    sub = Submission.query.get_or_404(submission_id)
    sub.status = "approved"
    db.session.commit()
    flash(f"'{sub.name}' approved.", "success")
    return redirect(url_for("main.admin"))


@main_bp.route("/admin/reject/<int:submission_id>", methods=["POST"])
@admin_required
def admin_reject(submission_id):
    sub = Submission.query.get_or_404(submission_id)
    sub.status = "rejected"
    db.session.commit()
    flash(f"'{sub.name}' rejected.", "info")
    return redirect(url_for("main.admin"))


def _tool_payload_from_form():
    raw = request.form.get("tool_json", "").strip()
    if not raw:
        return None

    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("Tool payload must be a JSON object")
    return parsed


@main_bp.route("/admin/discovery/run", methods=["POST"])
@admin_required
def admin_discovery_run():
    summary = run_discovery_pipeline()
    flash(
        f"Discovery run complete: queued {summary['queued']} tools, skipped {summary['skipped']} duplicates.",
        "success",
    )
    return redirect(url_for("main.admin"))


@main_bp.route("/admin/update_tool/<tool_name>", methods=["POST"])
@admin_required
def admin_update_tool(tool_name):
    try:
        tool_payload = _tool_payload_from_form()
        if tool_payload is None:
            flash("No tool payload provided.", "error")
            return redirect(url_for("main.admin"))

        update_queue_tool_by_name(tool_name, tool_payload)
        flash("Discovery tool updated.", "success")
    except json.JSONDecodeError:
        flash("Invalid JSON format. Please correct and try again.", "error")
    except (IndexError, ValueError) as exc:
        flash(str(exc), "error")

    return redirect(url_for("main.admin"))


@main_bp.route("/admin/approve_tool/<tool_name>", methods=["POST"])
@admin_required
def admin_approve_tool(tool_name):
    try:
        tool_payload = _tool_payload_from_form()
        ok, result = approve_queue_tool_by_name(tool_name, tool_override=tool_payload)
        if not ok and result == "duplicate":
            flash("Duplicate detected. Tool was not added to tools.json.", "info")
            return redirect(url_for("main.admin"))
        flash(f"Approved and added '{result.get('name', 'tool')}' to tools.json.", "success")
    except json.JSONDecodeError:
        flash("Invalid JSON format. Please correct and try again.", "error")
    except (IndexError, ValueError) as exc:
        flash(str(exc), "error")

    return redirect(url_for("main.admin"))


@main_bp.route("/admin/reject_tool/<tool_name>", methods=["POST"])
@admin_required
def admin_reject_tool(tool_name):
    try:
        item = reject_queue_tool_by_name(tool_name)
        name = item.get("tool", {}).get("name", "tool")
        flash(f"Rejected discovery tool '{name}'.", "info")
    except IndexError as exc:
        flash(str(exc), "error")

    return redirect(url_for("main.admin"))


# ── Public API additions ──────────────────────────────────────────────────────

@main_bp.route("/api/tools/fastest-growing")
def api_tools_fastest_growing():
    """Tools with the highest weeklyUsers values."""
    tools = [normalize_tool(t) for t in load_tools()]
    ranked = sorted(tools, key=lambda t: parse_weekly_users(t.get("weeklyUsers")), reverse=True)
    return jsonify(ranked[:10])


@main_bp.route("/api/tools/student-picks")
def api_tools_student_picks():
    """Tools that have student perks."""
    tools = [normalize_tool(t) for t in load_tools()]
    picks = [t for t in tools if t.get("studentPerk")]
    picks.sort(key=lambda t: float(t.get("rating") or 0), reverse=True)
    return jsonify(picks[:10])


@main_bp.route("/sitemap.xml")
def sitemap_xml():
    tools = [normalize_tool(tool) for tool in load_tools()]
    base_url = request.url_root.rstrip("/")
    today = datetime.now(timezone.utc).date().isoformat()

    url_entries = []

    static_paths = [
        "/",
        "/tools",
        "/ai-tool-finder",
        "/best-ai-tools-for-students",
        "/best-ai-writing-tools",
        "/best-ai-tools-for-coding",
        "/best-ai-research-tools",
        "/best-free-ai-tools",
    ]
    for path in static_paths:
        page_url = f"{base_url}{path}"
        url_entries.append(
            "  <url>"
            f"<loc>{escape(page_url)}</loc>"
            f"<lastmod>{today}</lastmod>"
            "<changefreq>weekly</changefreq>"
            "<priority>0.7</priority>"
            "</url>"
        )

    for tool in tools:
        slug = build_tool_slug(tool)
        tool_url = f"{base_url}/tool/{slug}"
        url_entries.append(
            "  <url>"
            f"<loc>{escape(tool_url)}</loc>"
            f"<lastmod>{today}</lastmod>"
            "<changefreq>weekly</changefreq>"
            "<priority>0.8</priority>"
            "</url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(url_entries)
        + "\n</urlset>"
    )
    return Response(xml, mimetype="application/xml")
