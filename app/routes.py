import json
import os
import re
from math import ceil
from html import escape
from datetime import datetime, timedelta, timezone
from functools import wraps
from urllib.parse import urlencode, urlparse

from flask import Blueprint, Response, abort, current_app, flash, jsonify, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required

from app import db, csrf
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
from app.models import BugReport, Favorite, NewsletterSubscriber, SavedStack, Submission, ToolRating, ToolView, User
from app.recommendations import recommend_tools
from app.tool_cache import get_cached_tools
from scripts.tool_discovery import run_discovery_pipeline


main_bp = Blueprint("main", __name__)

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tools.json")
DEFAULT_TOOL_ICON = "/static/icons/default.png"
SUPPORTED_SORTS = {"trending", "rating", "popular", "newest", "latest", "free"}
SORT_ALIASES = {"latest": "newest"}
TOOLS_PER_PAGE = 20

CATEGORIES = [
    "writing",
    "coding",
    "research",
    "image generation",
    "video generation",
    "productivity",
    "design",
    "data analysis",
    "study tools",
    "other",
]

CATEGORY_ALIASES_BROWSE = {
    "writing & docs": "writing",
    "docs": "writing",
    "code": "coding",
    "developer": "coding",
    "developers": "coding",
    "image": "image generation",
    "image gen": "image generation",
    "image-generation": "image generation",
    "video": "video generation",
    "video gen": "video generation",
    "video-generation": "video generation",
    "analytics": "data analysis",
    "data-analysis": "data analysis",
    "study": "study tools",
    "education": "study tools",
}

TOOLS_CATEGORY_MAP = {
    "all": {"all"},
    "writing": {"writing", "writing & docs", "docs"},
    "coding": {"coding", "code", "developer"},
    "research": {"research"},
    "productivity": {"productivity"},
    "design": {"design"},
    "data-analysis": {"data analysis", "analytics"},
    "image-generation": {"image generation", "image", "image-gen"},
    "video-generation": {"video generation", "video", "video-gen"},
    "presentation": {"presentation", "slides"},
    "study-tools": {"study tools", "study", "education"},
}

TOOLS_CATEGORY_LABELS = {
    "all": "All",
    "writing": "Writing",
    "coding": "Coding",
    "research": "Research",
    "productivity": "Productivity",
    "design": "Design",
    "data-analysis": "Data Analysis",
    "image-generation": "Image Generation",
    "video-generation": "Video Generation",
    "presentation": "Presentation",
    "study-tools": "Study Tools",
}

CATEGORY_ALIASES = {
    "code": "coding",
    "developer": "coding",
    "developers": "coding",
    "image": "image-generation",
    "images": "image-generation",
    "video": "video-generation",
    "videos": "video-generation",
    "study": "study-tools",
    "education": "study-tools",
    "data": "data-analysis",
    "analysis": "data-analysis",
}

DATASET_CATEGORY_TO_FILTER = {
    "writing & docs": "writing",
    "coding": "coding",
    "research": "research",
    "productivity": "productivity",
    "design": "design",
    "data analysis": "data-analysis",
    "image generation": "image-generation",
    "video generation": "video-generation",
    "presentation": "presentation",
    "study tools": "study-tools",
}


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
    item["icon_url"] = get_tool_icon(item, source_key="url") or build_primary_tool_icon(item)
    _annotate_tool_trust_and_freshness(item)
    return item


def _stable_hash_int(value):
    text = str(value or "")
    return sum(ord(ch) for ch in text)


def _tool_last_updated_days(tool):
    now = datetime.now(timezone.utc)
    created_at = tool.get("created_at") or tool.get("createdAt")

    if isinstance(created_at, (int, float)):
        diff = now.timestamp() - float(created_at)
        return max(0, int(diff // 86400))

    created_text = str(created_at or "").strip()
    if created_text:
        created_text = created_text.replace("Z", "+00:00")
        try:
            created_dt = datetime.fromisoformat(created_text)
            diff = now - created_dt
            return max(0, int(diff.total_seconds() // 86400))
        except ValueError:
            pass

    launch_year = int(tool.get("launchYear") or 0)
    if launch_year:
        approx = max(0, now.year - launch_year) * 365
        return approx

    # Optional freshness simulation for legacy records without timestamps.
    key = tool.get("tool_key") or build_tool_key(tool)
    return (_stable_hash_int(key) % 7) + 1


def _tool_verification_state(tool):
    has_link = bool(str(tool.get("link") or tool.get("website") or "").strip())
    rating = float(tool.get("rating") or 0)
    return has_link and rating >= 3.8


def _tool_activity_today_estimate(tool):
    weekly = parse_weekly_users(tool.get("weeklyUsers"))
    if weekly > 0:
        return max(12, int(round(weekly / 7.0)))
    baseline = _stable_hash_int(tool.get("tool_key") or build_tool_key(tool))
    return 40 + (baseline % 180)


def _annotate_tool_trust_and_freshness(tool):
    days = _tool_last_updated_days(tool)
    student_friendly = _has_student_perk(tool) or _is_free_tool(tool)
    is_new = days <= 14

    if days < 7:
        updated_label = "Updated recently"
    elif days < 30:
        updated_label = "Updated this month"
    else:
        updated_label = "Updated a while ago"

    tool["last_updated_days"] = min(days, 30)
    tool["last_updated_label"] = updated_label
    tool["verified"] = _tool_verification_state(tool)
    tool["recently_updated"] = days <= 7
    tool["student_friendly"] = student_friendly
    tool["is_new"] = is_new
    tool["trending_this_week"] = bool(tool.get("trending")) or parse_weekly_users(tool.get("weeklyUsers")) >= 1500
    tool["activity_today"] = _tool_activity_today_estimate(tool)
    return tool


def _tool_priority_labels(tools):
    labels = {}
    if not tools:
        return labels

    best_overall = max(tools, key=lambda t: float(t.get("ai_score") or t.get("rating") or 0))
    labels[str(best_overall.get("tool_key") or "")] = "best_overall"

    free_candidates = [t for t in tools if _stack_tool_pricing(t) == "free"]
    if free_candidates:
        best_free = max(free_candidates, key=lambda t: float(t.get("ai_score") or t.get("rating") or 0))
        labels[str(best_free.get("tool_key") or "")] = "best_free"

    student_candidates = [t for t in tools if _stack_tool_student_perk(t)]
    if student_candidates:
        best_student = max(student_candidates, key=lambda t: float(t.get("ai_score") or t.get("rating") or 0))
        labels[str(best_student.get("tool_key") or "")] = "best_student"

    return labels


def _label_badge_text(label_key):
    if label_key == "best_overall":
        return "ðŸ† Best Overall"
    if label_key == "best_free":
        return "ðŸ†“ Best Free Option"
    if label_key == "best_student":
        return "ðŸŽ“ Best for Students"
    return ""


def _get_greeting_prefix(user_name):
    """Generate a time-based greeting with user name"""
    from datetime import datetime
    hour = datetime.now().hour
    
    if user_name:
        if 5 <= hour < 12:
            return f"Good morning, {user_name}"
        elif 12 <= hour < 17:
            return f"Hey {user_name}"
        else:
            return f"Good evening, {user_name}"
    else:
        if 5 <= hour < 12:
            return "Good morning"
        elif 12 <= hour < 17:
            return "Hey there"
        else:
            return "Good evening"


def _build_ai_recommendation_copy(goal_label, budget_label, platform_label, student_mode, tools, user_name=None):
    if not tools:
        return {
            "summary": "No strong recommendation yet. Try adjusting your filters to see personalized suggestions.",
            "decision_shortcut": "ðŸ’¡ Tip: Broaden one filter to unlock recommendations.",
            "alternatives": [],
        }

    primary = tools[0]
    secondary = tools[1] if len(tools) > 1 else None
    primary_name = primary.get('name') or 'this tool'
    
    # Determine greeting to use
    greeting = user_name[:user_name.find(' ')] if user_name and ' ' in user_name else user_name
    greeting = greeting or "Hey"
    
    # Use conversational, human-like tone with variation
    import random
    tone = random.choice([
        f"{greeting}, for {goal_label}, <strong>{primary_name}</strong> is your best choice â€” it's fast, reliable, and widely trusted.",
        f"{greeting}, if you're focusing on {goal_label}, go with <strong>{primary_name}</strong>. It's one of the strongest options right now.",
        f"{greeting}, <strong>{primary_name}</strong> is perfect for {goal_label}. It's currently one of the most popular and reliable tools.",
    ])
    
    if secondary:
        secondary_name = secondary.get('name') or 'another tool'
        tone += f" <strong>{secondary_name}</strong> works well as a solid backup."
    
    # Keep shortcut brief and action-oriented
    shortcut = f"ðŸ‘‰ Go with {primary_name} â€” that's your winner here."
    alternatives = [tool for tool in tools[1:3]]
    
    return {
        "summary": tone,
        "decision_shortcut": shortcut,
        "alternatives": alternatives,
    }


def _nl_query_to_preferences(query_text):
    text = normalize_text_key(query_text)
    if not text:
        return {"goal": "", "budget": "", "platform": ""}

    goal_map = {
        "coding": {"coding", "developer", "programming", "code", "interview", "debug"},
        "research": {"research", "paper", "citation", "references", "study"},
        "writing": {"writing", "essay", "content", "copy", "grammar", "blog"},
        "studying": {"student", "exam", "learn", "notes", "quiz", "flashcard"},
        "productivity": {"productivity", "organize", "tasks", "workflow", "automation"},
        "image_generation": {"image", "design", "photo", "illustration", "art"},
        "video_creation": {"video", "edit", "animation", "clips"},
    }

    budget = ""
    if any(token in text for token in {"free", "no cost", "without paying", "budget"}):
        budget = "free_only"
    elif any(token in text for token in {"freemium", "trial"}):
        budget = "free_freemium"
    elif any(token in text for token in {"paid", "pro", "premium"}):
        budget = "any_price"

    platform = ""
    if any(token in text for token in {"web", "browser", "online"}):
        platform = "web"
    elif any(token in text for token in {"desktop", "windows", "mac", "linux", "pc"}):
        platform = "desktop"
    elif any(token in text for token in {"mobile", "ios", "android", "phone"}):
        platform = "mobile"

    scored_goals = []
    for key, hints in goal_map.items():
        score = sum(1 for hint in hints if hint in text)
        if score > 0:
            scored_goals.append((score, key))
    scored_goals.sort(reverse=True)
    goal = scored_goals[0][1] if scored_goals else ""

    return {"goal": goal, "budget": budget, "platform": platform}


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


def get_tool_icon(url, source_key="url"):
    try:
        if isinstance(url, dict):
            raw_url = (
                url.get(source_key)
                or url.get("link")
                or url.get("website")
                or ""
            )
        else:
            raw_url = url

        domain = str(raw_url or "").replace("https://", "").replace("http://", "").split("/")[0].strip().lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return f"https://logo.clearbit.com/{domain}" if domain else None
    except Exception:
        return None


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


def normalize_text_key(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def normalize_category_filter(value):
    raw = normalize_text_key(value).replace("_", "-").replace(" ", "-")
    if not raw:
        return "all"
    if raw in TOOLS_CATEGORY_MAP:
        return raw
    return CATEGORY_ALIASES.get(raw, raw)


def normalize_tool_category(value):
    normalized = normalize_text_key(value)
    if not normalized:
        return ""
    return DATASET_CATEGORY_TO_FILTER.get(normalized, normalized.replace(" ", "-"))


def tool_matches_category(tool, category_filter):
    if category_filter in {"", "all"}:
        return True

    category_value = normalize_tool_category(tool.get("category"))
    allowed = TOOLS_CATEGORY_MAP.get(category_filter)
    if allowed:
        allowed_keys = {normalize_tool_category(value) for value in allowed}
        return category_value in allowed_keys or category_value == category_filter

    return category_value == category_filter


def build_tools_category_items(tools):
    category_counts = {}
    for tool in tools:
        category_key = normalize_tool_category(tool.get("category"))
        if not category_key:
            continue
        category_counts[category_key] = category_counts.get(category_key, 0) + 1

    items = []
    for key, label in TOOLS_CATEGORY_LABELS.items():
        if key == "all":
            count = len(tools)
        else:
            count = category_counts.get(key, 0)
        items.append({"key": key, "label": label, "count": count})
    return items


def get_student_mode_from_request(default=False):
    raw = request.args.get("student_mode")
    if raw is None:
        return default
    return _parse_bool(raw)


def get_sort_type_from_request(default="trending"):
    raw = str(request.args.get("sort", default) or default).strip().lower()
    if raw not in SUPPORTED_SORTS:
        return default
    return SORT_ALIASES.get(raw, raw)


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
    created_at = tool.get("created_at") or tool.get("createdAt")
    created_timestamp = 0
    if created_at:
        created_text = str(created_at).strip().replace("Z", "+00:00")
        try:
            created_timestamp = int(datetime.fromisoformat(created_text).timestamp())
        except ValueError:
            created_timestamp = 0

    launch_year = int(tool.get("launchYear") or 0)
    latest_rank = created_timestamp if created_timestamp else launch_year
    views = int(view_map.get(tool.get("tool_key"), 0))

    if sort_type == "rating":
        return (rating, weekly_users, views)
    if sort_type == "popular":
        return (rating, weekly_users, views)
    if sort_type == "newest":
        return (latest_rank, rating, weekly_users)
    if sort_type == "free":
        return (_price_bucket(tool), rating, weekly_users, views)

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


def _is_free_tool(tool):
    price_model = str(tool.get("pricing") or tool.get("price") or "").strip().lower()
    return price_model == "free"


def _created_timestamp(tool):
    created_at = tool.get("created_at") or tool.get("createdAt")
    if isinstance(created_at, (int, float)):
        return float(created_at)

    text = str(created_at or "").strip()
    if text:
        text = text.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(text).timestamp()
        except ValueError:
            pass

    launch_year = int(tool.get("launchYear") or 0)
    return float(launch_year)


def _display_year(tool):
    created_at = tool.get("created_at") or tool.get("createdAt")
    text = str(created_at or "").strip()
    if text:
        text = text.replace("Z", "+00:00")
        try:
            return str(datetime.fromisoformat(text).year)
        except ValueError:
            pass

    launch_year = int(tool.get("launchYear") or 0)
    return str(launch_year) if launch_year else "-"


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


# Lightweight in-process cache for stack recommendations.
STACK_RECOMMENDATION_CACHE = {}
STACK_RECOMMENDATION_CACHE_TTL_SECONDS = 120


def _stack_normalize_pricing(value):
    pricing = normalize_text_key(value)
    if pricing in {"free", "freemium", "paid"}:
        return pricing
    if pricing in {"free only", "free-only"}:
        return "free"
    if pricing in {"any", "any budget", "any_price", "all"}:
        return "paid"
    return pricing


def _stack_tool_pricing(tool):
    return _stack_normalize_pricing(tool.get("pricing") or tool.get("price") or tool.get("pricing_model"))


def _stack_tool_student_perk(tool):
    value = tool.get("student_perk")
    if value is None:
        value = tool.get("studentPerk")
    if isinstance(value, bool):
        return value
    return bool(str(value or "").strip() or str(tool.get("uniHack") or "").strip())


def _stack_tool_platforms(tool):
    platforms = set()
    raw = tool.get("platforms")
    if isinstance(raw, list):
        for item in raw:
            token = normalize_text_key(item)
            if token:
                platforms.add(token)
    elif raw:
        token = normalize_text_key(raw)
        if token:
            platforms.add(token)

    # Fallback inferencing for tools where platforms are not explicitly set.
    blob = " ".join(
        [
            str(tool.get("name") or ""),
            str(tool.get("description") or ""),
            str(tool.get("tagline") or ""),
        ]
    ).lower()
    if any(token in blob for token in {"web", "browser", "online", "saas"}):
        platforms.add("web")
    if any(token in blob for token in {"desktop", "windows", "mac", "linux"}):
        platforms.add("desktop")
    if any(token in blob for token in {"mobile", "ios", "android", "app"}):
        platforms.add("mobile")

    return platforms


def _stack_goal_matches(tool, user_input):
    goal = normalize_text_key(user_input.get("goal"))
    category = normalize_text_key(tool.get("category"))

    goal_aliases = {
        "writing": {"writing", "writing & docs", "docs"},
        "coding": {"coding", "developer", "developers", "code"},
        "research": {"research"},
        "studying": {"research", "writing", "study tools", "education"},
        "productivity": {"productivity"},
        "design": {"image generation", "design", "image", "graphics"},
    }
    if goal in goal_aliases:
        return category in goal_aliases[goal]
    return bool(goal and category == goal)


def _stack_build_user_input(goal=None, budget=None, platform=None, student_mode=False):
    normalized_goal = normalize_text_key(goal)
    normalized_budget = normalize_text_key(budget)
    normalized_platform = normalize_text_key(platform)

    budget_map = {
        "free": ["free"],
        "freemium": ["free", "freemium"],
        "paid": ["free", "freemium", "paid"],
    }

    platform_values = []
    if normalized_platform in {"web", "mobile", "desktop"}:
        platform_values = [normalized_platform]

    return {
        "goal": normalized_goal,
        "budget": budget_map.get(normalized_budget, ["free", "freemium", "paid"]),
        "platform": platform_values,
        "student_mode": bool(student_mode),
    }


def score_tool(tool, user_input):
    score = 0.0

    if _stack_goal_matches(tool, user_input):
        score += 50

    pricing = _stack_tool_pricing(tool)
    if pricing in set(user_input.get("budget") or []):
        score += 20

    platforms = _stack_tool_platforms(tool)
    user_platforms = set(user_input.get("platform") or [])
    if not user_platforms or any(p in platforms for p in user_platforms):
        score += 15

    if user_input.get("student_mode") and _stack_tool_student_perk(tool):
        score += 15

    score += float(tool.get("rating") or 0) * 2
    return round(score, 2)


def explain_tool(tool, user_input):
    reasons = []

    if _stack_goal_matches(tool, user_input):
        reasons.append("matches your goal")

    pricing = _stack_tool_pricing(tool)
    if pricing in set(user_input.get("budget") or []):
        reasons.append("fits your budget")

    user_platforms = set(user_input.get("platform") or [])
    tool_platforms = _stack_tool_platforms(tool)
    if not user_platforms or any(p in tool_platforms for p in user_platforms):
        if user_platforms:
            reasons.append("works on your platform")

    if user_input.get("student_mode") and _stack_tool_student_perk(tool):
        reasons.append("has student perks")

    if float(tool.get("rating") or 0) > 4.5:
        reasons.append("highly rated")

    if not reasons:
        reasons.append("strong overall fit")

    return " + ".join(reasons)


def _stack_goal_label(goal):
    labels = {
        "writing": "writing",
        "coding": "coding",
        "research": "research",
        "studying": "study",
        "productivity": "productivity",
        "design": "design",
    }
    normalized = normalize_text_key(goal)
    return labels.get(normalized, "general work")


def _stack_tool_strength(tool):
    rating = float(tool.get("rating") or 0)
    if _stack_tool_student_perk(tool):
        return "student-friendly pricing"
    if rating >= 4.7:
        return "top-tier quality"
    if _stack_tool_pricing(tool) == "free":
        return "free to start"
    if _stack_tool_pricing(tool) == "freemium":
        return "balanced free and paid plan"
    return "strong overall utility"


def _stack_result_summary(generated_stack, goal=None, budget=None, platform=None, student_mode=False):
    if not generated_stack:
        return {
            "ai_summary": "No clear recommendation yet. Try broader filters.",
            "best_choice": None,
            "confidence": 0,
            "decision_shortcut": "ðŸ‘‰ If you just want ONE tool: broaden your filters first",
            "alternatives": [],
        }

    best = generated_stack[0]
    backup = generated_stack[1] if len(generated_stack) > 1 else None

    top_score = float(best.get("ai_score") or 0)
    confidence = max(74, min(98, int(round(top_score * 0.9))))

    budget_label = normalize_text_key(budget) or "paid"
    platform_label = normalize_text_key(platform) or "web"
    goal_label = _stack_goal_label(goal)
    student_phrase = "with student perks prioritized" if student_mode else "optimized for overall value"

    ai_copy = _build_ai_recommendation_copy(
        goal_label=goal_label,
        budget_label=budget_label,
        platform_label=platform_label,
        student_mode=student_mode,
        tools=generated_stack,
        user_name=current_user.display_name if current_user.is_authenticated else None,
    )

    summary = ai_copy.get("summary") or (
        f"For {goal_label} on {platform_label} with a {budget_label} budget, "
        f"{best.get('name') or 'this tool'} leads because it {best.get('reason') or 'fits your priorities'}."
    )
    if backup and backup not in (ai_copy.get("alternatives") or []):
        summary += f" Runner-up: {backup.get('name') or 'another tool'} for {backup.get('reason') or 'its complementary strengths'}."
    summary += f" {student_phrase}."

    labels = _tool_priority_labels(generated_stack)
    for item in generated_stack:
        label_key = labels.get(str(item.get("tool_key") or ""))
        if label_key:
            item["priority_label"] = _label_badge_text(label_key)

    return {
        "ai_summary": summary,
        "best_choice": best,
        "confidence": confidence,
        "decision_shortcut": ai_copy.get("decision_shortcut"),
        "alternatives": ai_copy.get("alternatives", []),
    }


def _recommend_tools_scored(tools, user_input):
    scored_tools = []
    for tool in tools:
        tool_score = score_tool(tool, user_input)
        scored_tools.append((tool_score, tool))

    scored_tools.sort(key=lambda x: x[0], reverse=True)

    unique = {}
    for score, tool in scored_tools:
        key = normalize_text_key(tool.get("name")) or str(tool.get("tool_key") or tool.get("id") or "")
        if key in unique:
            continue
        unique[key] = (score, tool)

    final_tools = list(unique.values())[:5]
    results = []
    for score, tool in final_tools:
        tool_copy = dict(tool)
        tool_copy["pricing"] = _stack_tool_pricing(tool_copy)
        tool_copy["student_perk"] = _stack_tool_student_perk(tool_copy)
        tool_copy["ai_score"] = score
        tool_copy["reason"] = explain_tool(tool_copy, user_input)
        tool_copy["best_for"] = _stack_goal_label(user_input.get("goal"))
        tool_copy["strength"] = _stack_tool_strength(tool_copy)
        tool_copy["why_selected"] = f"Best match: {tool_copy['reason']}"
        results.append(tool_copy)
    return results


def _recommend_tools_with_optional_llm(tools, user_input):
    """Optional LLM hook. Safe fallback keeps deterministic scoring as primary path."""
    if os.getenv("ENABLE_LLM_STACK_RECS", "").strip().lower() not in {"1", "true", "yes", "on"}:
        return None

    try:
        import importlib

        openai_module = importlib.import_module("openai")
        OpenAI = getattr(openai_module, "OpenAI", None)
        if OpenAI is None:
            return None

        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            return None

        client = OpenAI(api_key=api_key)
        minimal_tools = [
            {
                "name": tool.get("name"),
                "category": tool.get("category"),
                "pricing": _stack_tool_pricing(tool),
                "platforms": sorted(_stack_tool_platforms(tool)),
                "rating": float(tool.get("rating") or 0),
                "student_perk": _stack_tool_student_perk(tool),
                "tags": tool.get("tags") or [],
            }
            for tool in tools[:80]
        ]

        prompt = (
            "Recommend the best 5 tools for this user and explain why. "
            "Return strict JSON with keys: recommendations:[{name,reason}].\\n"
            f"User: {json.dumps(user_input)}\\n"
            f"Tools: {json.dumps(minimal_tools)}"
        )

        response = client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            input=prompt,
            max_output_tokens=500,
        )

        content = getattr(response, "output_text", "") or ""
        if not content:
            return None

        parsed = json.loads(content)
        picks = parsed.get("recommendations") or []
        if not isinstance(picks, list):
            return None

        by_name = {normalize_text_key(tool.get("name")): tool for tool in tools}
        llm_results = []
        for item in picks[:5]:
            name = normalize_text_key((item or {}).get("name"))
            if not name or name not in by_name:
                continue
            base = dict(by_name[name])
            base["pricing"] = _stack_tool_pricing(base)
            base["student_perk"] = _stack_tool_student_perk(base)
            base["ai_score"] = score_tool(base, user_input)
            base["reason"] = str((item or {}).get("reason") or explain_tool(base, user_input))
            base["best_for"] = _stack_goal_label(user_input.get("goal"))
            base["strength"] = _stack_tool_strength(base)
            base["why_selected"] = f"Best match: {base['reason']}"
            llm_results.append(base)

        return llm_results or None
    except Exception:
        return None


def build_ai_stack(goal=None, budget=None, platform=None, student_mode=False):
    """Build a ranked and deduplicated AI stack from user preferences."""
    tools = [normalize_tool(tool) for tool in load_tools()]
    user_input = _stack_build_user_input(
        goal=goal,
        budget=budget,
        platform=platform,
        student_mode=student_mode,
    )

    cache_key = (
        user_input.get("goal"),
        tuple(user_input.get("budget") or []),
        tuple(user_input.get("platform") or []),
        bool(user_input.get("student_mode")),
        len(tools),
    )
    now = datetime.now(timezone.utc).timestamp()

    cached = STACK_RECOMMENDATION_CACHE.get(cache_key)
    if cached:
        cached_at, cached_results = cached
        if now - cached_at <= STACK_RECOMMENDATION_CACHE_TTL_SECONDS:
            return [dict(item) for item in cached_results]

    llm_results = _recommend_tools_with_optional_llm(tools, user_input)
    if llm_results:
        STACK_RECOMMENDATION_CACHE[cache_key] = (now, [dict(item) for item in llm_results])
        return llm_results

    scored_results = _recommend_tools_scored(tools, user_input)
    STACK_RECOMMENDATION_CACHE[cache_key] = (now, [dict(item) for item in scored_results])
    return scored_results


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


def get_favorite_count_map():
    rows = (
        db.session.query(Favorite.tool_id, db.func.count(Favorite.id))
        .filter(Favorite.tool_id.isnot(None))
        .group_by(Favorite.tool_id)
        .all()
    )
    return {str(tool_id): int(count) for tool_id, count in rows}


def get_rating_metrics_map():
    rows = (
        db.session.query(ToolRating.tool_name, db.func.avg(ToolRating.rating), db.func.count(ToolRating.id))
        .filter(ToolRating.tool_name.isnot(None))
        .group_by(ToolRating.tool_name)
        .all()
    )
    metrics = {}
    for tool_name, avg_rating, count in rows:
        metrics[str(tool_name)] = {
            "avg": round(float(avg_rating or 0), 2),
            "count": int(count or 0),
        }
    return metrics


def get_recent_click_map(hours=72):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = (
        db.session.query(ToolView.tool_name, db.func.count(ToolView.id))
        .filter(ToolView.tool_name.isnot(None))
        .filter(ToolView.timestamp >= since)
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
    total_views = get_view_map()
    favorite_counts = get_favorite_count_map()
    rating_metrics = get_rating_metrics_map()
    recent_clicks = get_recent_click_map(hours=72)

    def score(tool):
        key = str(tool.get("tool_key") or "")
        rating = rating_metrics.get(key, {})
        avg_rating = float(rating.get("avg", float(tool.get("rating") or 0)))
        rating_count = int(rating.get("count", 0))
        total_view_count = int(total_views.get(key, 0))
        recent_view_count = int(recent_clicks.get(key, 0))
        favorite_count = int(favorite_counts.get(key, 0))

        # Balance velocity + quality so new tools can trend without overpowering established favorites.
        return (
            (total_view_count * 0.02)
            + (recent_view_count * 0.08)
            + (favorite_count * 2.0)
            + (avg_rating * 8.0)
            + (rating_count * 0.5)
            + (4.0 if tool.get("trending") else 0.0)
        )

    ranked = sorted(
        tools,
        key=lambda item: (
            score(item),
            float(item.get("rating") or 0),
            parse_weekly_users(item.get("weeklyUsers")),
        ),
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
    launch_user_floor = int(os.getenv("LAUNCH_USER_FLOOR", "12000") or "12000")
    total_users_display = max(total_users, launch_user_floor)
    recent_tools = sorted(
        tools,
        key=lambda item: (int(item.get("launchYear") or 0), float(item.get("rating") or 0)),
        reverse=True,
    )[:8]

    return render_template(
        "index.html",
        favorite_ids=favorite_ids,
        recent_tools=recent_tools,
        trending_tools=trending_tools,
        total_categories=len(categories),
        total_users=total_users_display,
        trust_signals=_trust_signals_context(),
        updated_label=datetime.now(timezone.utc).strftime("%b %d, %Y"),
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


@main_bp.route("/toggle-student-mode", methods=["POST"])
def toggle_student_mode():
    """Toggle student mode for the current session."""
    try:
        # Try to parse JSON body first (for new frontend)
        data = request.get_json(silent=True) or {}
        enabled = data.get('enabled')
        
        # If no JSON data, toggle the current session value
        if enabled is None:
            session["student_mode"] = not session.get("student_mode", False)
        else:
            # Set to the exact value provided
            session["student_mode"] = bool(enabled)
        
        session.modified = True
        return jsonify({"status": "success", "student_mode": session.get("student_mode", False)}), 200
    except Exception:
        current_app.logger.exception("Failed to toggle student mode")
        return jsonify({"status": "error", "message": "Unable to toggle student mode."}), 500


@main_bp.route("/set-student-mode", methods=["POST"])
def set_student_mode():
    """Set student mode explicitly for the current session."""
    try:
        data = request.get_json(silent=True) or {}
        session["student_mode"] = bool(data.get("enabled", False))
        session.modified = True
        return jsonify({"status": "ok", "student_mode": session.get("student_mode", False)}), 200
    except Exception:
        current_app.logger.exception("Failed to set student mode")
        return jsonify({"status": "error", "message": "Unable to set student mode."}), 500


@main_bp.route("/tools")
def tools_paginated():
    def normalize_browse_category(raw_value):
        normalized = normalize_text_key(raw_value).replace("_", " ").replace("-", " ")
        normalized = re.sub(r"\s+", " ", normalized).strip()
        if not normalized:
            return "other"
        normalized = CATEGORY_ALIASES_BROWSE.get(normalized, normalized)
        return normalized if normalized in CATEGORIES else "other"

    def normalize_pricing(raw_value):
        pricing = normalize_text_key(raw_value)
        if pricing in {"free", "freemium", "paid"}:
            return pricing
        return "paid"

    def created_sort_value(tool):
        created_at = tool.get("created_at")
        if isinstance(created_at, (int, float)):
            return float(created_at)
        text = str(created_at or "").strip()
        if not text:
            return 0
        try:
            return float(text)
        except ValueError:
            text = text.replace("Z", "+00:00")
            try:
                return datetime.fromisoformat(text).timestamp()
            except ValueError:
                return 0

    def parse_weekly_users(weekly_users_str):
        """Parse weeklyUsers like '100M+', '10K+' to numeric value"""
        if not weekly_users_str:
            return 0
        text = str(weekly_users_str).upper().replace('+', '').strip()
        multipliers = {'K': 1_000, 'M': 1_000_000, 'B': 1_000_000_000}
        for suffix, mult in multipliers.items():
            if text.endswith(suffix):
                try:
                    return float(text[:-1]) * mult
                except ValueError:
                    return 0
        try:
            return float(text)
        except ValueError:
            return 0

    def matches_query(tool, query_text):
        if not query_text:
            return True

        haystack = " ".join(
            [
                str(tool.get("name") or ""),
                str(tool.get("description") or ""),
                str(tool.get("category") or ""),
                str(tool.get("bestFor") or ""),
                " ".join(str(tag) for tag in (tool.get("tags") or [])),
            ]
        ).lower()
        return query_text in haystack

    raw_tools = load_tools()
    tools = []
    for tool in raw_tools:
        item = normalize_tool(tool)
        item["category"] = normalize_browse_category(item.get("category"))
        item["pricing"] = normalize_pricing(item.get("pricing") or item.get("price"))
        item["created_at"] = item.get("created_at") or item.get("createdAt") or item.get("launchYear")
        item["popularity"] = int(item.get("popularity") or 0)
        tools.append(item)

    if session.get("student_mode", False):
        tools = [t for t in tools if t.get("pricing") == "free"]

    category = normalize_text_key(request.args.get("category"))
    if category:
        category = normalize_browse_category(category)

    query = normalize_text_key(request.args.get("q"))

    pricing = normalize_text_key(request.args.get("pricing"))
    if pricing not in {"", "free", "freemium", "paid"}:
        pricing = ""

    sort = normalize_text_key(request.args.get("sort", "popular"))
    if sort not in {"popular", "latest", "free", "trending"}:
        sort = "popular"

    if category:
        tools = [t for t in tools if t["category"] == category]

    if query:
        tools = [t for t in tools if matches_query(t, query)]

    if pricing:
        tools = [t for t in tools if t["pricing"] == pricing]

    if sort == "latest":
        tools.sort(key=lambda x: created_sort_value(x), reverse=True)
    elif sort == "free":
        tools.sort(key=lambda x: x["pricing"] == "free", reverse=True)
    elif sort == "trending":
        # Sort by trending status first, then by weekly user count
        tools.sort(key=lambda x: (x.get("trending", False), parse_weekly_users(x.get("weeklyUsers", ""))), reverse=True)
    elif sort == "popular":
        tools.sort(key=lambda x: x.get("popularity", 0), reverse=True)

    top_recommendations = tools[:5]
    labels = _tool_priority_labels(top_recommendations)
    for item in top_recommendations:
        label_key = labels.get(str(item.get("tool_key") or ""))
        if label_key:
            item["priority_label"] = _label_badge_text(label_key)

    has_filters = bool(category or pricing or sort != "popular" or session.get("student_mode", False))
    stack_builder_used = bool(session.get("stack_builder_used", False))
    show_ai_recommendation = bool(query or has_filters or stack_builder_used)

    ai_reco = {}
    if show_ai_recommendation:
        ai_reco = _build_ai_recommendation_copy(
            goal_label=query or (category or "general"),
            budget_label=pricing or "any",
            platform_label="web",
            student_mode=session.get("student_mode", False),
            tools=top_recommendations,
            user_name=current_user.display_name if current_user.is_authenticated else None,
        )

    page = max(1, request.args.get("page", 1, type=int))
    per_page = 20
    filtered_total = len(tools)
    total_pages = max(1, ceil(filtered_total / per_page))
    if page > total_pages:
        page = total_pages

    start = (page - 1) * per_page
    end = start + per_page
    paginated_tools = tools[start:end]

    def build_tools_url(**updates):
        params = {
            "category": category,
            "pricing": pricing,
            "sort": sort,
            "page": page,
            "q": query,
        }
        params.update(updates)
        clean = {k: v for k, v in params.items() if v not in {"", None}}
        if clean.get("page") == 1:
            clean.pop("page")
        query_string = urlencode(clean)
        return f"{url_for('main.tools_paginated')}?{query_string}" if query_string else url_for("main.tools_paginated")

    return render_template(
        "browse.html",
        tools=paginated_tools,
        current_category=category,
        current_pricing=pricing,
        current_sort=sort,
        page=page,
        total_pages=total_pages,
        filtered_total=filtered_total,
        has_prev=page > 1,
        has_next=page < total_pages,
        prev_url=build_tools_url(page=page - 1),
        next_url=build_tools_url(page=page + 1),
        build_tools_url=build_tools_url,
        top_recommendations=top_recommendations,
        ai_summary=ai_reco.get("summary") if show_ai_recommendation else None,
        decision_shortcut=ai_reco.get("decision_shortcut") if show_ai_recommendation else None,
        alternatives=ai_reco.get("alternatives", []) if show_ai_recommendation else [],
        show_ai_recommendation=show_ai_recommendation,
        active_query=query,
    )


def _render_collection(kind, title, intro):
    tools = _filter_collection_tools(kind)
    return render_template(
        "collection.html",
        tools=tools,
        collection_title=title,
        collection_intro=intro,
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
    student_mode = session.get("student_mode", False)
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
        sort_type=sort_type,
        sort_options=["trending", "rating", "popular", "newest", "free"],
        trust_signals=_trust_signals_context(),
        greeting_message=_get_greeting_prefix(current_user.display_name) if current_user.is_authenticated else "Welcome",
    )




def _parse_onboarding_preferences(user):
    raw = str(getattr(user, "preferences", "") or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, list):
        interests = [str(item).strip() for item in parsed if str(item).strip()]
        return {
            "interest_tags": interests,
            "interests": interests,
        }
    return {}


@main_bp.route("/onboarding", methods=["GET", "POST"])
@login_required
def onboarding():
    existing_prefs = _parse_onboarding_preferences(current_user)

    if request.method == "POST":
        use_for = normalize_text_key(request.form.get("use_for"))
        skill_level = normalize_text_key(request.form.get("skill_level"))
        preferred_pricing = normalize_text_key(request.form.get("preferred_pricing"))
        interests_raw = str(request.form.get("interest_tags") or "").strip()

        allowed_use_for = {"coding", "writing", "studying", "research", "design", "productivity"}
        allowed_skill = {"beginner", "intermediate", "advanced"}
        allowed_pricing = {"free", "freemium", "paid"}

        if use_for not in allowed_use_for or skill_level not in allowed_skill or preferred_pricing not in allowed_pricing:
            flash("Please complete all required onboarding fields.", "warning")
            return render_template("onboarding.html", onboarding_values=existing_prefs)

        tags = []
        if interests_raw:
            seen = set()
            for item in interests_raw.split(","):
                token = normalize_text_key(item)
                if not token or token in seen:
                    continue
                seen.add(token)
                tags.append(token)

        prefs = _parse_onboarding_preferences(current_user)
        prefs.update(
            {
                "most_viewed_category": use_for,
                "preferred_pricing": preferred_pricing,
                "skill_level": skill_level,
                "interest_tags": tags,
                "interests": tags,
            }
        )
        current_user.preferences = json.dumps(prefs)
        current_user.skill_level = skill_level
        current_user.pricing_pref = preferred_pricing
        current_user.interests = ", ".join(tags) if tags else None
        current_user.onboarding_completed = True
        current_user.first_login = False
        db.session.commit()

        flash("Preferences saved. Your recommendations are now personalized.", "success")
        return redirect(url_for("main.dashboard"))

    return render_template("onboarding.html", onboarding_values=existing_prefs)
@main_bp.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    user = current_user
    existing_preferences = []
    try:
        raw_preferences = str(user.preferences or "").strip()
        parsed_preferences = json.loads(raw_preferences) if raw_preferences else []
        if isinstance(parsed_preferences, list):
            existing_preferences = [str(item).strip() for item in parsed_preferences if str(item).strip()]
    except (json.JSONDecodeError, TypeError, ValueError):
        existing_preferences = []

    if request.method == "POST":
        display_name = str(request.form.get("display_name") or "").strip()
        student_status = _parse_bool(request.form.get("student_status"))
        preferences = request.form.getlist("preferences")
        custom_preferences = str(request.form.get("custom_preferences") or "").strip()
        if custom_preferences:
            preferences.extend([item.strip() for item in custom_preferences.split(",") if item.strip()])

        deduped_preferences = []
        seen = set()
        for pref in preferences:
            token = normalize_text_key(pref)
            if not token or token in seen:
                continue
            seen.add(token)
            deduped_preferences.append(pref.strip())

        user.display_name = display_name or None
        user.student_status = student_status
        user.preferences = json.dumps(deduped_preferences)
        db.session.commit()

        flash("Profile updated successfully.", "success")
        return redirect(url_for("main.profile"))

    return render_template(
        "profile.html",
        preferences=existing_preferences,
        preference_options=["Coding", "Writing", "Research", "Productivity", "Image Generation", "Video Generation"],
    )


@main_bp.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    user = current_user

    if request.method == "POST":
        theme_preference = str(request.form.get("theme_preference") or "").strip().lower()
        if theme_preference not in {"", "dark", "light"}:
            theme_preference = ""

        student_mode_enabled = _parse_bool(request.form.get("student_mode"))
        notifications_enabled = _parse_bool(request.form.get("notifications_enabled"))

        user.theme_preference = theme_preference or None
        user.notifications_enabled = notifications_enabled
        db.session.commit()

        session["student_mode"] = student_mode_enabled
        session.modified = True

        flash("Settings updated.", "success")
        return redirect(url_for("main.settings"))

    return render_template("settings.html")


@main_bp.route("/saved-tools")
def saved_tools():
    tools = [normalize_tool(tool) for tool in load_tools()]
    by_key = {tool["tool_key"]: tool for tool in tools}

    account_saved_tools = []
    if current_user.is_authenticated:
        favorite_keys = get_favorite_tool_keys(current_user.id)
        account_saved_tools = [by_key[key] for key in favorite_keys if key in by_key][:12]

    recent_keys = session.get("recent_tools", [])
    recent_tools = [by_key[key] for key in recent_keys if key in by_key][:8]

    return render_template(
        "saved_tools.html",
        account_saved_tools=account_saved_tools,
        recent_tools=recent_tools,
        trust_signals=_trust_signals_context(),
    )


def _compare_context_from_keys(selected_keys):
    tools = [normalize_tool(tool) for tool in load_tools()]
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = session.get("student_mode", False)
    view_map = get_view_map()
    tools = sort_tools(tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)

    selected = []
    by_key = {tool["tool_key"]: tool for tool in tools}
    for key in selected_keys:
        if key in by_key:
            selected.append(by_key[key])

    def _price_rank(tool):
        pricing = _stack_tool_pricing(tool)
        if pricing == "free":
            return 3
        if pricing == "freemium":
            return 2
        if pricing == "paid":
            return 1
        return 0

    best_compare_key = None
    if selected:
        scored = []
        for tool in selected:
            compare_score = (
                float(tool.get("rating") or 0) * 12
                + _price_rank(tool) * 4
                + (2 if _stack_tool_student_perk(tool) else 0)
                + min(parse_weekly_users(tool.get("weeklyUsers")) / 50000.0, 4)
            )
            tool["compare_score"] = round(compare_score, 2)
            scored.append((compare_score, tool.get("tool_key")))
        scored.sort(key=lambda item: item[0], reverse=True)
        best_compare_key = scored[0][1]

    compare_suggestions = []
    if len(selected) == 1:
        anchor = selected[0]
        anchor_key = anchor.get("tool_key")
        anchor_category = normalize_text_key(anchor.get("category"))
        related = [
            tool for tool in tools
            if tool.get("tool_key") != anchor_key and normalize_text_key(tool.get("category")) == anchor_category
        ]
        if not related:
            related = [tool for tool in tools if tool.get("tool_key") != anchor_key]
        compare_suggestions = related[:4]

    return {
        "tools": tools,
        "selected_tools": selected,
        "selected_keys": selected_keys,
        "student_mode": student_mode,
        "sort_type": sort_type,
        "best_compare_key": best_compare_key,
        "compare_suggestions": compare_suggestions,
    }


@main_bp.route("/compare")
@main_bp.route("/compare-tools")
def compare():
    query_tools = request.args.get("tools", "")
    selected_keys = []
    for segment in query_tools.split(","):
        key = segment.strip()
        if not key or key in selected_keys:
            continue
        selected_keys.append(key)
        if len(selected_keys) >= 3:
            break

    context = _compare_context_from_keys(selected_keys)
    return render_template("compare.html", **context)


@main_bp.route("/compare/<comparison_slug>")
def compare_slug(comparison_slug):
    parts = [segment.strip() for segment in str(comparison_slug or "").split("-vs-") if segment.strip()]
    selected_keys = []
    for key in parts:
        if key in selected_keys:
            continue
        selected_keys.append(key)
        if len(selected_keys) >= 3:
            break

    if len(selected_keys) < 2:
        flash("Select at least two tools to compare.", "warning")
        return redirect(url_for("main.compare"))

    context = _compare_context_from_keys(selected_keys)

    return render_template(
        "compare.html",
        **context,
    )


# Multi-step Stack Builder Route Handler
@main_bp.route("/ai-stack-builder", methods=["GET", "POST"])
@main_bp.route("/stack-builder", methods=["GET", "POST"])
def stack_builder_step():
    """
    Handle the multi-step AI Stack Builder wizard.
    Manages step progression (1-4) and final results generation.
    """
    if request.method == "GET":
        current_student_mode = session.get("student_mode", False)
        # Initial load - show step 1
        return render_template(
            "stack_builder.html",
            current_step=1,
            selected_goal=None,
            selected_budget=None,
            selected_platform=None,
            student_mode=current_student_mode,
            generated_stack=None,
            ai_summary=None,
            best_choice=None,
            confidence=0,
            decision_shortcut=None,
            alternatives=[],
        )
    
    # POST handler - process form submission
    current_step = int(request.form.get("current_step", 1))
    action = request.form.get("action", "next")
    
    # Extract selections from form
    selected_goal = request.form.get("goal", "").strip()
    selected_budget = request.form.get("budget", "").strip()
    selected_platform = request.form.get("platform", "").strip()
    student_mode = bool(request.form.get("student_mode"))
    session["student_mode"] = student_mode
    session.modified = True
    
    # Handle navigation
    if action == "back":
        next_step = max(1, current_step - 1)
    elif action == "generate":
        # Generate final stack with all selections
        generated_stack = build_ai_stack(
            goal=selected_goal,
            budget=selected_budget,
            platform=selected_platform,
            student_mode=student_mode
        )
        
        if not generated_stack:
            flash("No tools found matching your criteria. Try different selections.", "warning")
            next_step = 1
            generated_stack = None
        else:
            session["stack_builder_used"] = True
            session.modified = True
            summary = _stack_result_summary(
                generated_stack,
                goal=selected_goal,
                budget=selected_budget,
                platform=selected_platform,
                student_mode=student_mode,
            )
            # Results view (step=5 conceptually, but same template)
            return render_template(
                "stack_builder.html",
                current_step=5,
                selected_goal=selected_goal,
                selected_budget=selected_budget,
                selected_platform=selected_platform,
                student_mode=student_mode,
                generated_stack=generated_stack,
                ai_summary=summary.get("ai_summary"),
                best_choice=summary.get("best_choice"),
                confidence=summary.get("confidence", 0),
                decision_shortcut=summary.get("decision_shortcut"),
                alternatives=summary.get("alternatives", []),
            )
    else:  # action == "next"
        next_step = min(4, current_step + 1)
    
    # Validation for next step
    if action == "next":
        if current_step == 1 and not selected_goal:
            flash("Please select a goal.", "warning")
            next_step = 1
        elif current_step == 2 and not selected_budget:
            flash("Please select a budget.", "warning")
            next_step = 2
        elif current_step == 3 and not selected_platform:
            flash("Please select a platform.", "warning")
            next_step = 3
    
    # Render the next step
    return render_template(
        "stack_builder.html",
        current_step=next_step,
        selected_goal=selected_goal,
        selected_budget=selected_budget,
        selected_platform=selected_platform,
        student_mode=student_mode,
        generated_stack=None,
        ai_summary=None,
        best_choice=None,
        confidence=0,
        decision_shortcut=None,
        alternatives=[],
    )


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
            intent_text = str(request.form.get("intent") or "").strip()
            action = str(request.form.get("action") or "next").strip().lower()
            goal = str(request.form.get("goal") or "").strip().lower()

            parsed_budget = ""
            parsed_platform = ""
            if not goal and intent_text:
                parsed = _nl_query_to_preferences(intent_text)
                goal = parsed.get("goal") or ""
                parsed_budget = parsed.get("budget") or "free_freemium"
                parsed_platform = parsed.get("platform") or "web"

            if goal not in TOOL_FINDER_GOAL_MAP:
                flash("Please select one goal to continue.", "warning")
                return redirect(url_for("main.ai_tool_finder_step", step=1))

            state["goal"] = goal
            state["budget"] = parsed_budget if parsed_budget in TOOL_FINDER_BUDGET_MAP else ""
            state["platform"] = parsed_platform if parsed_platform in TOOL_FINDER_PLATFORM_MAP else ""
            state["result_tool_keys"] = []
            _set_tool_finder_state(state)

            if action == "instant" and state.get("budget") and state.get("platform"):
                return redirect(url_for("main.ai_tool_finder_results"))
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

    recommendations = generate_tool_finder_stack(goal, budget, platform, min_items=3, max_items=5)
    labels = _tool_priority_labels(recommendations)
    for item in recommendations:
        label_key = labels.get(str(item.get("tool_key") or ""))
        if label_key:
            item["priority_label"] = _label_badge_text(label_key)

    ai_reco = _build_ai_recommendation_copy(
        goal_label=TOOL_FINDER_GOAL_MAP.get(goal, "general"),
        budget_label=TOOL_FINDER_BUDGET_MAP.get(budget, "any"),
        platform_label=TOOL_FINDER_PLATFORM_MAP.get(platform, "any"),
        student_mode=session.get("student_mode", False),
        tools=recommendations,
        user_name=current_user.display_name if current_user.is_authenticated else None,
    )
    state["result_tool_keys"] = [tool["tool_key"] for tool in recommendations]
    _set_tool_finder_state(state)

    if request.method == "POST":
        if not current_user.is_authenticated:
            flash("Please log in to save your AI stack.", "warning")
            return redirect(url_for("auth.login"))

        stack_name = str(request.form.get("stack_name") or "").strip()
        if not stack_name:
            stack_name = f"{TOOL_FINDER_GOAL_MAP.get(goal, 'AI')} Stack - {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"

        payload = {
            "goal": goal,
            "budget": budget,
            "platform": platform,
            "tools": state.get("result_tool_keys", []),
        }
        saved = SavedStack(
            user_id=current_user.id,
            name=stack_name[:255],
            tools_json=json.dumps(payload),
        )
        db.session.add(saved)
        db.session.commit()

        flash("AI stack saved successfully.", "success")
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
        ai_summary=ai_reco.get("summary"),
        decision_shortcut=ai_reco.get("decision_shortcut"),
        alternatives=ai_reco.get("alternatives", []),
        best_tool=(recommendations[0] if recommendations else None),
    )


@main_bp.route("/api/tools")
def api_tools():
    tools = [normalize_tool(tool) for tool in load_tools()]
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = session.get("student_mode", False)
    if student_mode:
        tools = [tool for tool in tools if _is_free_tool(tool)]
    tools = sort_tools(tools, sort_type=sort_type, view_map=get_view_map(), student_mode=student_mode)
    return jsonify(tools)


@main_bp.route("/api/tools/trending")
def api_tools_trending():
    tools = [normalize_tool(tool) for tool in load_tools()]
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = session.get("student_mode", False)
    view_map = get_view_map()
    if student_mode:
        tools = [tool for tool in tools if _is_free_tool(tool)]

    top = sort_tools(tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:10]
    return jsonify(top)


@main_bp.route("/api/tools/category/<category>")
def api_tools_category(category):
    tools = [normalize_tool(tool) for tool in load_tools()]
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = session.get("student_mode", False)
    if student_mode:
        tools = [tool for tool in tools if _is_free_tool(tool)]
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
    try:
        query = str(request.args.get("q", "") or "").strip()
        tokens = _tokenize_query(query)
        if not tokens:
            return jsonify({"results": [], "message": "", "showing_closest_matches": False})

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

        return jsonify({"results": top, "message": "", "showing_closest_matches": False})
    except Exception:
        current_app.logger.exception("Search API failed")
        return jsonify({
            "results": [],
            "message": "Search is temporarily unavailable.",
            "showing_closest_matches": False,
        }), 500


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


# â”€â”€ Tool Detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    today_views_estimate = max(12, int(round((weekly_views or 0) / 7.0))) if weekly_views else int(tool.get("activity_today") or 0)

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
        views=view_count,
        today_views=today_views_estimate,
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


# â”€â”€ Submit Tool â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            return render_template("submit_tool.html")

        # Basic URL validation (must start with http:// or https://)
        if not re.match(r"^https?://", website):
            flash("Please enter a valid website URL starting with http:// or https://", "error")
            return render_template("submit_tool.html")

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

    return render_template("submit_tool.html")


# â”€â”€ Weekly Updates Feed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _weekly_newest_tools(limit=10):
    all_tools = [normalize_tool(t) for t in load_tools()]
    recent_tools = sorted(
        all_tools,
        key=lambda t: (
            _created_timestamp(t),
            float(t.get("rating") or 0),
            parse_weekly_users(t.get("weeklyUsers")),
        ),
        reverse=True,
    )
    top = recent_tools[:limit]
    for tool in top:
        tool["display_year"] = _display_year(tool)
    return top


def _weekly_popular_tools(limit=4):
    all_tools = [normalize_tool(t) for t in load_tools()]
    ranked = sorted(
        all_tools,
        key=lambda t: (
            parse_weekly_users(t.get("weeklyUsers")),
            float(t.get("rating") or 0),
        ),
        reverse=True,
    )
    return ranked[:limit]


def _trust_signals_context():
    tools = [normalize_tool(t) for t in load_tools()]
    indexed_count = len(tools)
    free_or_freemium = [
        t for t in tools
        if _stack_tool_pricing(t) in {"free", "freemium"}
    ]
    weekly_users_total = sum(parse_weekly_users(t.get("weeklyUsers")) for t in tools)
    active_learners = max(10000, int(round(weekly_users_total / 1000.0)) * 100)
    return {
        "active_learners": active_learners,
        "indexed_tools": max(indexed_count, 500),
        "free_options": len(free_or_freemium),
    }


@main_bp.route("/updates")
@main_bp.route("/weekly-ai-tools")
def updates():
    return render_template(
        "weekly.html",
        tools=_weekly_newest_tools(limit=10),
        popular_tools=_weekly_popular_tools(limit=4),
        trust_signals=_trust_signals_context(),
        updated_label=datetime.now(timezone.utc).strftime("%b %d, %Y"),
    )


@main_bp.route("/report-bug", methods=["GET", "POST"])
def report_bug():
    if request.method == "POST":
        description = str(request.form.get("bug_description") or "").strip()
        page_url = str(request.form.get("page_url") or "").strip()
        email = str(request.form.get("email") or "").strip().lower()

        if not description:
            flash("Please describe the bug.", "error")
            return render_template("report_bug.html")
        if not page_url:
            page_url = request.referrer or request.url_root

        report = BugReport(
            description=description,
            page_url=page_url,
            email=email or None,
            status="open",
        )
        db.session.add(report)
        db.session.commit()

        flash("Thanks, your bug report was submitted.", "success")
        return redirect(url_for("main.report_bug"))

    return render_template("report_bug.html")


# â”€â”€ Admin Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    bug_reports = BugReport.query.order_by(BugReport.created_at.desc()).limit(50).all()
    open_bug_reports = [report for report in bug_reports if str(report.status or "open").lower() == "open"]

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
        bug_reports=bug_reports,
        open_bug_reports=open_bug_reports,
    )


@main_bp.route("/admin/users")
@admin_required
def admin_users():
    return admin()


@main_bp.route("/admin/tools")
@admin_required
def admin_tools():
    return admin()


@main_bp.route("/admin/analytics")
@admin_required
def admin_analytics():
    return admin()


@main_bp.route("/admin/bug-report/<int:report_id>/resolve", methods=["POST"])
@admin_required
def admin_resolve_bug_report(report_id):
    report = BugReport.query.get_or_404(report_id)
    report.status = "resolved"
    db.session.commit()
    flash("Bug report marked as resolved.", "success")
    return redirect(url_for("main.admin"))


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


# â”€â”€ Public API additions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        "/weekly-ai-tools",
        "/report-bug",
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




