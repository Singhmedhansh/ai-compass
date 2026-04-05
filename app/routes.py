import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from math import ceil
from html import escape
from datetime import datetime, timedelta, timezone
from functools import wraps
from urllib.parse import urlencode, urlparse

from flask import Blueprint, render_template, request, redirect, url_for, flash, jsonify, session, abort, Response, g, current_app
from flask_login import login_required
from werkzeug.local import LocalProxy

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
from app.services.tool_service import get_all_tools
main_bp = Blueprint("main", __name__)


# --- Service-layer tools route ---
@main_bp.route("/tools")
def tools():
    tools_data = get_all_tools()
    return render_template("tools.html", tools=tools_data)
from app.rate_limit import is_rate_limited
from app.search_utils import search_tools, smart_search_fallback, limit_results


main_bp = Blueprint("main", __name__)


def _get_current_user_proxy():
    from flask_login import current_user as _current_user
    return _current_user


current_user = LocalProxy(_get_current_user_proxy)


def _client_ip():
    forwarded = str(request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    return str(request.remote_addr or "unknown")


def _load_tools_for_request():
    cached = getattr(g, "_normalized_tools_cache", None)
    if cached is None:
        cached = load_normalized_tools()
        g._normalized_tools_cache = cached
    return cached


def _unique_tool_list(tools):
    return unique_tools_by_name_casefold(unique_tools_by_identity(tools or []))


def get_cached_tools(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return []
    from app.tool_cache import get_cached_tools as _get_cached_tools
    return _get_cached_tools(*args, **kwargs)


def recommend_tools(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return []
    from app.services.recommendation_service import recommend_tools as _recommend_tools
    return _recommend_tools(*args, **kwargs)


def enrich_tool_with_freshness(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return args[0] if args else {}
    from app.recommendations import enrich_tool_with_freshness as _enrich_tool_with_freshness
    return _enrich_tool_with_freshness(*args, **kwargs)


def get_smart_recommendation_text(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return "Recommendations are temporarily disabled in fast mode."
    from app.recommendations import get_smart_recommendation_text as _get_smart_recommendation_text
    return _get_smart_recommendation_text(*args, **kwargs)


def compute_tool_score(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return 0
    from app.services.recommendation_service import compute_tool_score as _compute_tool_score
    return _compute_tool_score(*args, **kwargs)


def generate_reason(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return "Recommended for broad fit."
    from app.services.recommendation_service import generate_reason as _generate_reason
    return _generate_reason(*args, **kwargs)


def track_user_activity(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return None
    from app.user_analytics import track_user_activity as _track_user_activity
    return _track_user_activity(*args, **kwargs)


def get_user_insights(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return {
            "total_views": 0,
            "total_saves": 0,
            "most_viewed_category": "",
            "preferred_pricing": "",
            "last_active": None,
        }
    from app.user_analytics import get_user_insights as _get_user_insights
    return _get_user_insights(*args, **kwargs)


def run_discovery_pipeline(*args, **kwargs):
    if FAST_ROUTE_MODE:
        return {"queued": 0, "skipped": 0}
    from scripts.tool_discovery import run_discovery_pipeline as _run_discovery_pipeline
    return _run_discovery_pipeline(*args, **kwargs)

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tools.json")
DEFAULT_TOOL_ICON = "/static/icons/default.png"
SUPPORTED_SORTS = {"trending", "rating", "popular", "newest", "latest", "free"}
SORT_ALIASES = {"latest": "newest"}
TOOLS_PER_PAGE = 20
TOOL_NAME_AI_PATTERN = re.compile(r"\bai\b", re.IGNORECASE)
ENABLE_TOOL_LINK_PING = os.getenv("ENABLE_TOOL_LINK_PING", "").strip().lower() in {"1", "true", "yes", "on"}
TOOL_URL_HEALTH_CACHE_TTL_SECONDS = 1800
TOOL_URL_HEALTH_CACHE = {}
FAST_ROUTE_MODE = os.getenv("FAST_ROUTE_MODE", "false").lower() == "true"
UNSAFE_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

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
            flash("Access denied", "danger")
            return redirect(url_for("main.index"))
        return f(*args, **kwargs)
    return decorated


from app.services.tool_service import fetch_tools_data

def load_tools():
    try:
        return fetch_tools_data(FAST_ROUTE_MODE, DATA_PATH)
    except Exception:
        current_app.logger.exception("Failed to load tools dataset")
        return []


def _normalized_tool_name_key(value):
    # Canonicalize names for dedupe by removing AI token and punctuation noise.
    text = normalize_text_key(value)
    text = TOOL_NAME_AI_PATTERN.sub(" ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _tool_url_text(tool):
    return str(tool.get("link") or tool.get("website") or "").strip()


def _tool_url_key(tool):
    url_value = _tool_url_text(tool)
    if not url_value:
        return ""
    if not url_value.startswith(("http://", "https://")):
        url_value = f"https://{url_value}"
    parsed = urlparse(url_value)
    host = (parsed.netloc or "").strip().lower().replace("www.", "", 1)
    path = (parsed.path or "").strip().rstrip("/")
    return f"{host}{path}" if host else ""


def _is_valid_tool_url(value):
    link = str(value or "").strip()
    if not link:
        return False
    if not link.startswith(("http://", "https://")):
        link = f"https://{link}"
    parsed = urlparse(link)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _tool_description_present(tool):
    description = str(tool.get("description") or tool.get("tagline") or "").strip()
    return bool(description)


def _tool_url_is_live(url_value):
    if not ENABLE_TOOL_LINK_PING:
        return True

    url_text = str(url_value or "").strip()
    if not url_text:
        return False
    if not url_text.startswith(("http://", "https://")):
        url_text = f"https://{url_text}"

    now_ts = datetime.now(timezone.utc).timestamp()
    cached = TOOL_URL_HEALTH_CACHE.get(url_text)
    if cached and (now_ts - cached[0]) <= TOOL_URL_HEALTH_CACHE_TTL_SECONDS:
        return bool(cached[1])

    request = Request(url_text, method="HEAD", headers={"User-Agent": "AI-Compass/1.0"})
    is_live = False
    try:
        with urlopen(request, timeout=3) as response:
            status = int(getattr(response, "status", 0) or 0)
            is_live = 200 <= status < 400
    except HTTPError as exc:
        # Treat redirects and method constraints as live URLs.
        is_live = exc.code in {301, 302, 303, 307, 308, 405}
    except URLError:
        is_live = False
    except Exception:
        is_live = False

    TOOL_URL_HEALTH_CACHE[url_text] = (now_ts, is_live)
    return is_live


def _tool_quality_score(tool):
    description_length = len(str(tool.get("description") or "").strip())
    has_valid_url = 1 if _is_valid_tool_url(_tool_url_text(tool)) else 0
    has_verified = 1 if tool.get("verified") else 0
    rating_score = float(tool.get("rating") or 0)
    users_score = parse_weekly_users(tool.get("weeklyUsers"))
    return (has_verified, has_valid_url, description_length, rating_score, users_score)


def deduplicate_tools(tools):
    deduped_by_name = {}

    for tool in tools:
        name_key = _normalized_tool_name_key(tool.get("name"))
        if not name_key:
            name_key = normalize_text_key(tool.get("tool_key") or build_tool_key(tool))
        existing = deduped_by_name.get(name_key)
        if not existing or _tool_quality_score(tool) > _tool_quality_score(existing):
            deduped_by_name[name_key] = tool

    return list(deduped_by_name.values())


def unique_tools_by_identity(tools):
    unique_tools = []
    seen = set()

    for tool in tools:
        tool_id = tool.get("id") or tool.get("tool_key") or tool.get("name")
        tool_id = str(tool_id or "").strip().lower()
        if not tool_id or tool_id in seen:
            continue
        seen.add(tool_id)
        unique_tools.append(tool)

    return unique_tools


def unique_tools_by_name_casefold(tools):
    seen = set()
    unique_tools = []
    for tool in tools:
        name = str(tool.get("name") or "").strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        unique_tools.append(tool)
    return unique_tools


def _tool_identity_key(tool):
    return str(
        tool.get("tool_key")
        or tool.get("id")
        or _normalized_tool_name_key(tool.get("name"))
        or ""
    ).strip().lower()


def _annotate_personalization(tools, user=None, query=None, student_mode=False, score_cache=None):
    score_cache = score_cache if isinstance(score_cache, dict) else {}
    query_key = normalize_text_key(query)
    user_id = int(getattr(user, "id", 0) or 0)

    unique = []
    seen = set()
    for tool in tools or []:
        key = _tool_identity_key(tool)
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(dict(tool))

    scores = []
    for item in unique:
        key = _tool_identity_key(item)
        cache_key = (user_id, bool(student_mode), query_key, key)
        cached_score = score_cache.get(cache_key)
        if cached_score is None:
            cached_score = float(compute_tool_score(item, user=user, query=query, student_mode=student_mode) or 0)
            score_cache[cache_key] = cached_score

        item["ai_score"] = float(item.get("ai_score") or cached_score)
        if not item.get("reason"):
            item["reason"] = generate_reason(item, user=user, query=query, student_mode=student_mode)
        scores.append(item["ai_score"])

    if not unique:
        return []

    min_score = min(scores)
    max_score = max(scores)
    spread = max_score - min_score

    for item in unique:
        if spread <= 0:
            confidence = 82 if item.get("ai_score", 0) > 0 else 0
        else:
            confidence = int(round(((float(item.get("ai_score") or 0) - min_score) / spread) * 100))
        item["confidence_score"] = max(0, min(100, confidence))

    return unique


def _select_top_pick(tools, user=None, query=None, student_mode=False, score_cache=None):
    ranked = _annotate_personalization(tools, user=user, query=query, student_mode=student_mode, score_cache=score_cache)
    if not ranked:
        return None
    return max(ranked, key=lambda item: float(item.get("ai_score") or 0))


def load_normalized_tools(dedupe=True):
    normalized = [normalize_tool(tool) for tool in load_tools()]
    if dedupe:
        return deduplicate_tools(normalized)
    return normalized


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
    tools = load_normalized_tools()

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
    link = _tool_url_text(tool)
    return _is_valid_tool_url(link) and _tool_description_present(tool) and _tool_url_is_live(link)


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
        updated_label = "Actively maintained"
    elif days < 180:
        updated_label = "Stable"
    else:
        updated_label = "Needs review"

    tool["last_updated_days"] = days
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
        return "Best Overall"
    if label_key == "best_free":
        return "Best Free Option"
    if label_key == "best_student":
        return "Best for Students"
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


def sanitize_utf_text(value):
    text = str(value or "")
    text = text.encode("utf-8", "ignore").decode("utf-8", "ignore")
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\ufffd": "",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    if any(token in text for token in ("Ã", "â", "ðŸ")):
        try:
            repaired = text.encode("latin-1", "ignore").decode("utf-8", "ignore")
            if repaired:
                text = repaired
        except Exception:
            pass
    return UNSAFE_CONTROL_CHARS.sub("", text)


def sanitize_text_payload(value):
    if isinstance(value, str):
        return sanitize_utf_text(value)
    if isinstance(value, list):
        return [sanitize_text_payload(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_text_payload(item) for key, item in value.items()}
    return value


def strip_html_tags(value):
    text = str(value or "")
    return re.sub(r"<[^>]+>", "", text)


def _build_ai_recommendation_copy(goal_label, budget_label, platform_label, student_mode, tools, user_name=None):
    if not tools:
        return {
            "summary": "No strong recommendation yet. Try adjusting your filters to see personalized suggestions.",
            "decision_shortcut": "Tip: Broaden one filter to unlock recommendations.",
            "alternatives": [],
        }

    primary = tools[0]
    secondary = tools[1] if len(tools) > 1 else None
    primary_name = sanitize_utf_text(primary.get('name') or 'this tool')
    rating_hint = "highly rated" if float(primary.get("rating") or 0) >= 4.4 else "popular"
    primary_tags = {normalize_text_key(tag) for tag in (primary.get("tags") or []) if normalize_text_key(tag)}
    beginner_hint = " and beginner-friendly" if ({"easy", "beginner"} & primary_tags) else ""

    tone = (
        f"Since you're exploring {goal_label} tools, {primary_name} is a great fit "
        f"because it's {rating_hint}{beginner_hint}."
    )

    if secondary:
        secondary_name = sanitize_utf_text(secondary.get('name') or 'another tool')
        tone += f" {secondary_name} is a strong backup option for similar workflows."

    shortcut = f"Start with {primary_name} for the quickest win."
    alternatives = [tool for tool in tools[1:3]]
    
    return sanitize_text_payload(
        {
            "summary": strip_html_tags(tone),
            "decision_shortcut": strip_html_tags(shortcut),
            "alternatives": alternatives,
        }
    )


def _apply_stack_confidence_scores(items):
    rows = list(items or [])
    if not rows:
        return rows

    raw_scores = [float(row.get("ai_score") or 0) for row in rows]
    min_score = min(raw_scores)
    max_score = max(raw_scores)
    spread = max_score - min_score

    if spread <= 0.001:
        # Stable descending scores when model outputs near-identical values.
        base = 92
        for idx, row in enumerate(rows):
            confidence = max(72, min(98, base - (idx * 3)))
            row["confidence_score"] = confidence
            row["ai_score"] = float(confidence)
        return rows

    for row in rows:
        raw = float(row.get("ai_score") or 0)
        normalized = (raw - min_score) / spread
        confidence = int(round(72 + (normalized * 26)))
        confidence = max(72, min(98, confidence))
        row["confidence_score"] = confidence
        row["ai_score"] = float(confidence)

    rows.sort(key=lambda row: float(row.get("confidence_score") or 0), reverse=True)
    return rows


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


def format_number(value):
    try:
        number = int(float(value or 0))
    except (TypeError, ValueError):
        number = 0

    number = max(0, number)
    if number >= 1_000_000_000:
        formatted = f"{number / 1_000_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}B+"
    if number >= 1_000_000:
        formatted = f"{number / 1_000_000:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}M+"
    if number >= 1_000:
        formatted = f"{number / 1_000:.1f}".rstrip("0").rstrip(".")
        return f"{formatted}K+"
    return f"{number}+"


def _format_weekly_users_from_views(value):
    return format_number(value)


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


def _split_csv_tokens(value):
    items = []
    seen = set()
    for raw_item in str(value or "").split(","):
        token = normalize_text_key(raw_item)
        if not token or token in seen:
            continue
        seen.add(token)
        items.append(token)
    return items


def parse_user_preferences(user):
    raw = str(getattr(user, "preferences", "") or "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}

    if isinstance(parsed, dict):
        merged = dict(parsed)
        if not merged.get("skill_level") and str(getattr(user, "skill_level", "") or "").strip():
            merged["skill_level"] = normalize_text_key(getattr(user, "skill_level"))
        if not merged.get("preferred_pricing") and str(getattr(user, "pricing_pref", "") or "").strip():
            merged["preferred_pricing"] = normalize_text_key(getattr(user, "pricing_pref"))

        existing_goals = merged.get("goals")
        if not existing_goals:
            merged_goals = _split_csv_tokens(getattr(user, "goals", ""))
            if merged_goals:
                merged["goals"] = merged_goals

        if not (merged.get("interest_tags") or merged.get("interests")):
            merged_interests = _split_csv_tokens(getattr(user, "interests", ""))
            if merged_interests:
                merged["interest_tags"] = merged_interests
                merged["interests"] = merged_interests

        return merged

    # Backward compatibility: older profile settings stored a plain list.
    if isinstance(parsed, list):
        interests = [str(item).strip() for item in parsed if str(item).strip()]
        return {
            "interest_tags": interests,
            "interests": interests,
        }
    return {}


def save_user_preferences(user, payload):
    user.preferences = json.dumps(payload)


def is_onboarding_complete(user):
    if bool(getattr(user, "onboarding_completed", False)):
        return True

    if getattr(user, "first_login", False):
        return False

    prefs = parse_user_preferences(user)
    skill_level = str(getattr(user, "skill_level", "") or prefs.get("skill_level") or "").strip().lower()
    preferred_pricing = str(getattr(user, "pricing_pref", "") or prefs.get("preferred_pricing") or "").strip().lower()
    return bool(skill_level and preferred_pricing)


def user_interest_categories(user):
    prefs = parse_user_preferences(user)
    categories = set()

    most_viewed = normalize_text_key(prefs.get("most_viewed_category"))
    if most_viewed:
        categories.add(most_viewed)

    for token in prefs.get("interest_tags") or prefs.get("interests") or []:
        normalized = normalize_text_key(token)
        if not normalized:
            continue
        if normalized in CATEGORY_ALIASES_BROWSE:
            categories.add(CATEGORY_ALIASES_BROWSE[normalized])
        if normalized in CATEGORIES:
            categories.add(normalized)

    return categories


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
    for normalized in load_normalized_tools():
        if normalized["tool_key"] == key_text or str(normalized.get("id")) == key_text:
            return normalized
    return None


def get_related_tools(tool_id, limit=5):
    base_tool = get_tool_by_key(tool_id)
    if not base_tool:
        return []

    tools = load_normalized_tools()
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
            "decision_shortcut": "If you just want one tool: broaden your filters first.",
            "alternatives": [],
        }

    best = generated_stack[0]
    backup = generated_stack[1] if len(generated_stack) > 1 else None

    top_score = float(best.get("confidence_score") or best.get("ai_score") or 0)
    top_score = max(0.0, min(100.0, top_score))
    confidence = max(74, min(98, int(round(top_score))))

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
        "ai_summary": strip_html_tags(sanitize_utf_text(summary)),
        "best_choice": best,
        "confidence": max(0, min(100, int(confidence))),
        "decision_shortcut": strip_html_tags(sanitize_utf_text(ai_copy.get("decision_shortcut") or "")),
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
        tool_copy["ai_score"] = round(max(0.0, min(100.0, float(score or 0))), 1)
        tool_copy["reason"] = explain_tool(tool_copy, user_input)
        tool_copy["best_for"] = _stack_goal_label(user_input.get("goal"))
        tool_copy["strength"] = _stack_tool_strength(tool_copy)
        tool_copy["why_selected"] = f"Best match: {tool_copy['reason']}"
        if tool_copy.get("name"):
            tool_copy["name"] = sanitize_utf_text(tool_copy.get("name"))
        if tool_copy.get("reason"):
            tool_copy["reason"] = sanitize_utf_text(tool_copy.get("reason"))
        if tool_copy.get("why_selected"):
            tool_copy["why_selected"] = sanitize_utf_text(tool_copy.get("why_selected"))
        results.append(tool_copy)
    return _apply_stack_confidence_scores(results)


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
            base["ai_score"] = float(score_tool(base, user_input) or 0)
            base["reason"] = str((item or {}).get("reason") or explain_tool(base, user_input))
            base["best_for"] = _stack_goal_label(user_input.get("goal"))
            base["strength"] = _stack_tool_strength(base)
            base["why_selected"] = f"Best match: {base['reason']}"
            llm_results.append(base)

        return _apply_stack_confidence_scores(llm_results) or None
    except Exception:
        return None


def build_ai_stack(goal=None, budget=None, platform=None, student_mode=False):
    """Build a ranked and deduplicated AI stack from user preferences."""
    tools = load_normalized_tools()
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

    all_tools = load_normalized_tools()

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
        selected.append(dict(tool))
        if len(selected) >= max_items:
            break

    user_for_score = current_user if current_user.is_authenticated else None
    student_mode = session.get("student_mode", False)
    goal_label = TOOL_FINDER_GOAL_MAP.get(goal, goal)
    for item in selected:
        item["ai_score"] = compute_tool_score(
            item,
            user=user_for_score,
            query=goal_label,
            student_mode=student_mode,
        )
        item["reason"] = generate_reason(
            item,
            user=user_for_score,
            query=goal_label,
            student_mode=student_mode,
        )

    selected.sort(key=lambda row: (float(row.get("ai_score") or 0), float(row.get("rating") or 0)), reverse=True)
    if selected:
        min_score = min(float(item.get("ai_score") or 0) for item in selected)
        max_score = max(float(item.get("ai_score") or 0) for item in selected)
        spread = max_score - min_score
        for item in selected:
            if spread <= 0:
                confidence = 82
            else:
                confidence = int(round(((float(item.get("ai_score") or 0) - min_score) / spread) * 100))
            item["confidence_score"] = max(0, min(100, confidence))

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
    tools = load_normalized_tools()
    filtered = [tool for tool in tools if _matches_finder_budget(tool, budget)]

    scored = []
    for tool in filtered:
        score = _finder_score(tool, goal)
        if score > 0:
            scored.append((score, float(tool.get("rating") or 0), parse_weekly_users(tool.get("weeklyUsers")), tool))

    scored.sort(key=lambda row: (row[0], row[1], row[2]), reverse=True)
    return [tool for _, _, _, tool in scored[:limit]]


def get_favorite_tool_keys(user_id):
    if FAST_ROUTE_MODE:
        return set()
    rows = Favorite.query.filter_by(user_id=user_id).all()
    return {row.tool_id for row in rows}


from app.services.tool_service import fetch_tool_view_counts

def get_view_map():
    if FAST_ROUTE_MODE:
        return {}
    return fetch_tool_view_counts()



from app.services.tool_service import (
    fetch_favorite_count_map,
    fetch_rating_metrics_map,
)

def get_favorite_count_map():
    if FAST_ROUTE_MODE:
        return {}
    return fetch_favorite_count_map()


def get_rating_metrics_map():
    if FAST_ROUTE_MODE:
        return {}
    return fetch_rating_metrics_map()



from app.services.tool_service import (
    fetch_recent_click_map,
    fetch_weekly_view_map,
)

def get_recent_click_map(hours=72):
    if FAST_ROUTE_MODE:
        return {}
    return fetch_recent_click_map(hours=hours)


def get_weekly_view_map(days=7):
    if FAST_ROUTE_MODE:
        return {}
    return fetch_weekly_view_map(days=days)



from app.services.tool_service import fetch_views_per_day, insert_tool_view
from flask_login import current_user

def get_views_per_day(days=7):
    if FAST_ROUTE_MODE:
        return []
    return fetch_views_per_day(days=days)


def log_tool_view(tool_key):
    if FAST_ROUTE_MODE:
        return None
    user_id = current_user.id if current_user.is_authenticated else None
    insert_tool_view(tool_key, user_id)


def get_most_viewed_tools(limit=8):
    tools = load_normalized_tools()
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
    tools = load_normalized_tools()
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
    tools = load_normalized_tools()
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
    if FAST_ROUTE_MODE:
        return {"average": 0.0, "count": 0}
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
    if FAST_ROUTE_MODE:
        return 0
    if not user_id:
        return 0
    row = ToolRating.query.filter_by(tool_name=str(tool_key), user_id=user_id).first()
    return int(row.rating) if row else 0


@main_bp.route("/")
def home():
    trust_signals = _trust_signals_context()
    return render_template(
        "index.html",
        trust_signals=trust_signals,
        total_users=trust_signals.get("active_learners", 0),
        updated_label=datetime.now(timezone.utc).strftime("%b %d, %Y"),
    )


main_bp.add_url_rule("/", endpoint="index", view_func=home)


@main_bp.route("/health")
def health():
    return {"status": "ok"}


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

    def curated_unique_tools(items, limit=None):
        curated = unique_tools_by_name_casefold(unique_tools_by_identity(items))
        if limit is not None:
            return curated[:limit]
        return curated

    raw_tools = load_normalized_tools()
    tools = []
    for tool in raw_tools:
        item = dict(tool)
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

    if pricing:
        tools = [t for t in tools if t["pricing"] == pricing]

    showing_closest_matches = False
    search_message = ""
    search_pool = list(tools)
    score_user = current_user if current_user.is_authenticated else None
    student_mode = session.get("student_mode", False)
    score_cache = {}

    if query:
        if current_user.is_authenticated:
            track_user_activity(
                current_user.id,
                "search",
                "search",
                {
                    "query": query,
                    "source": "tools_page",
                    "category": category or "",
                    "pricing": pricing or "",
                },
            )

        ranked_matches = search_tools(search_pool, query, user=score_user, student_mode=student_mode)
        tools = curated_unique_tools(ranked_matches)

        if tools:
            search_message = f"Showing best matches for '{query}'"

        if not tools:
            # First fallback: category contains query.
            category_fallback = [
                tool for tool in search_pool
                if query in str(tool.get("category") or "").lower()
            ]
            tools = curated_unique_tools(category_fallback)

        if not tools:
            # Second fallback: trending tools from current filtered pool.
            fallback_tools = smart_search_fallback(
                tools=search_pool or load_normalized_tools(),
                query=query,
                results_limit=20,
                user=score_user,
                student_mode=student_mode,
            )
            filtered_fallback = []
            for tool in fallback_tools:
                normalized_category = normalize_browse_category(tool.get("category"))
                normalized_pricing = normalize_pricing(tool.get("pricing") or tool.get("price"))
                if category and normalized_category != category:
                    continue
                if pricing and normalized_pricing != pricing:
                    continue
                if session.get("student_mode", False) and normalized_pricing != "free":
                    continue
                item = dict(tool)
                item["category"] = normalized_category
                item["pricing"] = normalized_pricing
                filtered_fallback.append(item)

            tools = curated_unique_tools(limit_results(filtered_fallback, limit=20))
            if tools:
                showing_closest_matches = True
                search_message = f"Showing best matches for '{query}'"

    tools = unique_tools_by_name_casefold(unique_tools_by_identity(tools))

    if not query:
        if sort == "latest":
            tools.sort(key=lambda x: created_sort_value(x), reverse=True)
        elif sort == "free":
            tools.sort(key=lambda x: x["pricing"] == "free", reverse=True)
        elif sort == "trending":
            # Sort by trending status first, then by weekly user count
            tools.sort(key=lambda x: (x.get("trending", False), parse_weekly_users(x.get("weeklyUsers", ""))), reverse=True)
        elif sort == "popular":
            tools.sort(
                key=lambda x: (
                    compute_tool_score(x, user=score_user, student_mode=student_mode),
                    x.get("popularity", 0),
                ),
                reverse=True,
            )

    tools = _annotate_personalization(
        tools,
        user=score_user,
        query=query,
        student_mode=student_mode,
        score_cache=score_cache,
    )

    top_pick = None
    if current_user.is_authenticated:
        top_pick = _select_top_pick(
            tools,
            user=score_user,
            query=query,
            student_mode=student_mode,
            score_cache=score_cache,
        )

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
        showing_closest_matches=showing_closest_matches,
        search_message=search_message,
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
        top_pick=top_pick,
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

def _format_last_active(last_active_datetime):
    """Format a datetime to a human-readable 'time ago' string"""
    if not last_active_datetime:
        return "Never"

    # Ensure we're comparing timezone-aware datetimes.
    if last_active_datetime.tzinfo is None:
        last_active_datetime = last_active_datetime.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    diff = now - last_active_datetime

    # Calculate various time units.
    seconds = diff.total_seconds()
    minutes = int(seconds // 60)
    hours = int(seconds // 3600)
    days = int(seconds // 86400)
    weeks = int(days // 7)

    if minutes < 1:
        return "Just now"
    if minutes < 60:
        return f"{minutes} minute{'s' if minutes != 1 else ''} ago"
    if hours < 24:
        return f"{hours} hour{'s' if hours != 1 else ''} ago"
    if days < 7:
        return f"{days} day{'s' if days != 1 else ''} ago"
    if weeks < 4:
        return f"{weeks} week{'s' if weeks != 1 else ''} ago"
    if days < 365:
        months = int(days // 30)
        return f"{months} month{'s' if months != 1 else ''} ago"
    years = int(days // 365)
    return f"{years} year{'s' if years != 1 else ''} ago"


def _generate_next_steps(user_insights):
    """Generate suggested next actions based on user activity"""
    steps = []

    total_views = user_insights.get("total_views", 0)
    total_saves = user_insights.get("total_saves", 0)

    # Step 1: Explore more if low engagement.
    if total_views < 5:
        steps.append("Explore more tools to find the perfect fit")

    # Step 2: Save favorites if not already.
    if total_saves == 0:
        steps.append("Save your favorite tools to create a collection")

    # Step 3: Build a stack if enough saves.
    if total_saves > 0 and total_saves < 3:
        steps.append("Build your first AI stack with saved tools")

    # Step 4: Compare tools if enough saves.
    if total_saves >= 3:
        steps.append("Compare your favorite tools to make informed decisions")

    # Always suggest discovery if high engagement.
    if total_views > 20:
        steps.append("Discover new tools by category to expand your toolkit")

    # Return top 2-3 steps.
    return steps[:3] if steps else ["Explore our tool collection to get started"]


@main_bp.route("/dashboard")
@login_required
def dashboard():
    if not is_onboarding_complete(current_user):
        return redirect(url_for("main.onboarding"))

    tools = load_normalized_tools()
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = session.get("student_mode", False)
    score_cache = {}
    by_key = {tool["tool_key"]: tool for tool in tools}
    view_map = get_view_map()

    favorite_keys = get_favorite_tool_keys(current_user.id)
    favorite_tools = [by_key[key] for key in favorite_keys if key in by_key]
    favorite_tools = sort_tools(favorite_tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:8]

    recent_keys = session.get("recent_tools", [])
    recent_tools = [by_key[key] for key in recent_keys if key in by_key]
    recent_tools = sort_tools(recent_tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:8]

    recommended_tools = recommend_tools(tools, favorite_tools, limit=5, student_mode=student_mode, user=current_user)
    recommended_tools = unique_tools_by_identity(recommended_tools)
    recommended_tools = sort_tools(recommended_tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:5]
    recommended_tools = _annotate_personalization(
        recommended_tools,
        user=current_user,
        student_mode=student_mode,
        score_cache=score_cache,
    )
    favorite_tools = _annotate_personalization(
        favorite_tools,
        user=current_user,
        student_mode=student_mode,
        score_cache=score_cache,
    )
    recent_tools = _annotate_personalization(
        recent_tools,
        user=current_user,
        student_mode=student_mode,
        score_cache=score_cache,
    )
    trending_tools = sort_tools(tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:8]
    trending_tools = _annotate_personalization(
        trending_tools,
        user=current_user,
        student_mode=student_mode,
        score_cache=score_cache,
    )
    top_pick = _select_top_pick(
        tools,
        user=current_user,
        student_mode=student_mode,
        score_cache=score_cache,
    )
    stacks_created = SavedStack.query.filter_by(user_id=current_user.id).count()

    # Get user activity insights
    user_insights = get_user_insights(current_user.id)
    preferred_pricing = str(user_insights.get("preferred_pricing") or "").strip().lower()
    if preferred_pricing == "free":
        preferred_pricing_label = "Free"
    elif preferred_pricing == "freemium":
        preferred_pricing_label = "Freemium"
    else:
        preferred_pricing_label = "Flexible"

    if stacks_created == 0 and user_insights.get("total_saves", 0) > 0:
        next_step = {
            "label": "Build your AI stack",
            "description": "Turn your saved tools into a practical stack for your daily workflow.",
            "href": url_for("main.stack_builder"),
        }
    else:
        next_step = {
            "label": "Explore trending tools",
            "description": "Discover fresh tools aligned with what you already like.",
            "href": url_for("main.tools_paginated", sort="trending"),
        }

    activity_stats = {
        "tools_viewed": user_insights.get("total_views", 0),
        "tools_saved": user_insights.get("total_saves", 0),
        "top_category": user_insights.get("most_viewed_category") or "Exploring",
        "preferred_pricing": preferred_pricing_label,
        "stacks_created": stacks_created,
        "last_active": user_insights.get("last_active"),
        "last_active_label": _format_last_active(user_insights.get("last_active")),
        "next_steps": _generate_next_steps(user_insights),
        "next_step": next_step,
    }

    return render_template(
        "dashboard.html",
        favorite_tools=favorite_tools,
        recent_tools=recent_tools,
        recommended_tools=recommended_tools,
        trending_tools=trending_tools,
        activity_stats=activity_stats,
        sort_type=sort_type,
        sort_options=["trending", "rating", "popular", "newest", "free"],
        trust_signals=_trust_signals_context(),
        greeting_message=_get_greeting_prefix(current_user.display_name) if current_user.is_authenticated else "Welcome",
        top_pick=top_pick,
    )


@main_bp.route("/onboarding", methods=["GET", "POST"])
@login_required
def onboarding():
    existing_prefs = parse_user_preferences(current_user)
    existing_prefs["use_for"] = normalize_text_key(existing_prefs.get("use_for") or existing_prefs.get("most_viewed_category"))
    existing_prefs["skill_level"] = normalize_text_key(existing_prefs.get("skill_level") or getattr(current_user, "skill_level", ""))
    existing_prefs["preferred_pricing"] = normalize_text_key(existing_prefs.get("preferred_pricing") or getattr(current_user, "pricing_pref", ""))
    existing_prefs["goals"] = existing_prefs.get("goals") or _split_csv_tokens(getattr(current_user, "goals", ""))

    if request.method == "POST":
        use_for = normalize_text_key(request.form.get("use_for") or request.form.get("primary_interest"))
        skill_level = normalize_text_key(request.form.get("skill_level"))
        preferred_pricing = normalize_text_key(request.form.get("preferred_pricing") or request.form.get("pricing_pref"))
        interests_raw = str(request.form.get("interest_tags") or "").strip()
        goals_raw = str(request.form.get("goals") or "").strip()

        allowed_use_for = {"coding", "writing", "studying", "research", "design", "productivity"}
        allowed_skill = {"beginner", "intermediate", "advanced"}
        allowed_pricing = {"free", "freemium", "paid"}

        if use_for not in allowed_use_for or skill_level not in allowed_skill or preferred_pricing not in allowed_pricing:
            flash("Please complete all required onboarding fields.", "warning")
            return render_template("onboarding.html", onboarding_values=existing_prefs)

        tags = _split_csv_tokens(interests_raw)
        goals = _split_csv_tokens(goals_raw)

        prefs = parse_user_preferences(current_user)
        prefs.update(
            {
                "use_for": use_for,
                "primary_interest": use_for,
                "most_viewed_category": use_for,
                "preferred_pricing": preferred_pricing,
                "skill_level": skill_level,
                "interest_tags": tags,
                "interests": tags,
                "goals": goals,
            }
        )

        User.query.filter_by(id=int(current_user.id)).update(
            {
                "interests": ", ".join(tags) if tags else None,
                "skill_level": skill_level,
                "pricing_pref": preferred_pricing,
                "goals": ", ".join(goals) if goals else None,
                "onboarding_completed": True,
                "preferences": json.dumps(prefs),
                "first_login": False,
            },
            synchronize_session=False,
        )
        db.session.commit()

        flash("Preferences saved. Your recommendations are now personalized.", "success")
        return redirect(url_for("main.dashboard"))

    return render_template("onboarding.html", onboarding_values=existing_prefs)


@main_bp.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    user = current_user
    prefs = parse_user_preferences(user)
    existing_preferences = [str(item).strip() for item in prefs.get("interests") or prefs.get("interest_tags") or [] if str(item).strip()]
    preference_options = ["Coding", "Writing", "Research", "Productivity", "Image Generation", "Video Generation"]
    known_preference_tokens = {normalize_text_key(option) for option in preference_options}
    custom_preferences = [item for item in existing_preferences if normalize_text_key(item) not in known_preference_tokens]
    goals_pref = prefs.get("goals")
    if isinstance(goals_pref, str):
        goals_pref = _split_csv_tokens(goals_pref)
    elif not isinstance(goals_pref, list):
        goals_pref = []
    existing_goals = [str(item).strip() for item in (goals_pref or _split_csv_tokens(user.goals)) if str(item).strip()]

    if request.method == "POST":
        display_name = str(request.form.get("display_name") or "").strip()
        skill_level = normalize_text_key(request.form.get("skill_level"))
        preferred_pricing = normalize_text_key(request.form.get("preferred_pricing") or request.form.get("pricing_pref"))
        student_status = _parse_bool(request.form.get("student_status"))
        preferences = request.form.getlist("preferences")
        custom_preferences = str(request.form.get("custom_preferences") or "").strip()
        goals = _split_csv_tokens(request.form.get("goals"))
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

        allowed_skill_levels = {"", "beginner", "intermediate", "advanced"}
        allowed_pricing = {"", "free", "freemium", "paid"}
        if skill_level not in allowed_skill_levels or preferred_pricing not in allowed_pricing:
            flash("Please select valid profile preferences.", "error")
            return redirect(url_for("main.profile"))

        prefs["interests"] = deduped_preferences
        prefs["interest_tags"] = deduped_preferences
        prefs["goals"] = goals
        if skill_level:
            prefs["skill_level"] = skill_level
            user.skill_level = skill_level
        else:
            prefs.pop("skill_level", None)
            user.skill_level = None
        if preferred_pricing:
            prefs["preferred_pricing"] = preferred_pricing
            user.pricing_pref = preferred_pricing
        else:
            prefs.pop("preferred_pricing", None)
            user.pricing_pref = None
        if deduped_preferences:
            prefs["most_viewed_category"] = normalize_text_key(deduped_preferences[0])

        user.interests = ", ".join(deduped_preferences) if deduped_preferences else None
        user.goals = ", ".join(goals) if goals else None
        if user.skill_level and user.pricing_pref:
            user.onboarding_completed = True

        save_user_preferences(user, prefs)
        db.session.commit()

        flash("Profile updated successfully.", "success")
        return redirect(url_for("main.profile"))

    return render_template(
        "profile.html",
        preferences=existing_preferences,
        skill_level=str(prefs.get("skill_level") or ""),
        preferred_pricing=str(prefs.get("preferred_pricing") or ""),
        goals=", ".join(existing_goals),
        preference_options=preference_options,
        custom_preferences=", ".join(custom_preferences),
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
    tools = load_normalized_tools()
    by_key = {tool["tool_key"]: tool for tool in tools}

    account_saved_tools = []
    if current_user.is_authenticated:
        favorite_keys = get_favorite_tool_keys(current_user.id)
        account_saved_tools = [by_key[key] for key in favorite_keys if key in by_key][:12]

    recent_keys = session.get("recent_tools", [])
    recent_tools = [by_key[key] for key in recent_keys if key in by_key][:8]

    return render_template(
        "saved_tools.html",
        account_saved_tools=sanitize_text_payload(account_saved_tools),
        recent_tools=recent_tools,
        trust_signals=_trust_signals_context(),
    )


def _compare_context_from_keys(selected_keys):
    tools = load_normalized_tools()
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
    
    if not current_user.is_authenticated:
        next_url = url_for("main.stack_builder_step")
        return redirect(url_for("auth.login", next=next_url))

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


@main_bp.route("/generate-stack", methods=["POST"])
def generate_stack_api():
    if not current_user.is_authenticated:
        return jsonify({"error": "login_required"}), 401

    payload = request.get_json(silent=True) or {}

    selected_goal = str(payload.get("goal") or "").strip()
    selected_budget = str(payload.get("budget") or "").strip()
    selected_platform = str(payload.get("platform") or "").strip()
    student_mode = bool(payload.get("student_mode"))

    if not selected_goal or not selected_budget or not selected_platform:
        return jsonify({
            "error": "Missing required selections.",
            "tools": [],
        }), 400

    session["student_mode"] = student_mode
    session.modified = True

    generated_stack = build_ai_stack(
        goal=selected_goal,
        budget=selected_budget,
        platform=selected_platform,
        student_mode=student_mode,
    )

    if not generated_stack:
        return jsonify({
            "tools": [],
            "message": "No tools found matching your criteria.",
            "ai_summary": None,
            "best_choice": None,
            "confidence": 0,
            "decision_shortcut": None,
            "alternatives": [],
        })

    session["stack_builder_used"] = True
    session.modified = True

    summary = _stack_result_summary(
        generated_stack,
        goal=selected_goal,
        budget=selected_budget,
        platform=selected_platform,
        student_mode=student_mode,
    )

    return jsonify({
        "tools": generated_stack,
        "summary": summary.get("ai_summary"),
        "ai_summary": summary.get("ai_summary"),
        "best_choice": summary.get("best_choice"),
        "confidence": summary.get("confidence", 0),
        "decision_shortcut": summary.get("decision_shortcut"),
        "alternatives": summary.get("alternatives", []),
    })


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
    tools = _load_tools_for_request()
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    tools = _unique_tool_list(tools)
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = session.get("student_mode", False)
    if student_mode:
        tools = [tool for tool in tools if _is_free_tool(tool)]
    tools = sort_tools(tools, sort_type=sort_type, view_map=get_view_map(), student_mode=student_mode)
    return jsonify(sanitize_text_payload(tools))


@main_bp.route("/api/tools/trending")
def api_tools_trending():
    tools = _load_tools_for_request()
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    tools = _unique_tool_list(tools)
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = session.get("student_mode", False)
    view_map = get_view_map()
    if student_mode:
        tools = [tool for tool in tools if _is_free_tool(tool)]

    top = sort_tools(tools, sort_type=sort_type, view_map=view_map, student_mode=student_mode)[:10]
    return jsonify(sanitize_text_payload(top))


@main_bp.route("/api/tools/category/<category>")
def api_tools_category(category):
    tools = _load_tools_for_request()
    tools = apply_dynamic_weekly_users(tools, get_weekly_view_map())
    tools = _unique_tool_list(tools)
    sort_type = get_sort_type_from_request(default="trending")
    student_mode = session.get("student_mode", False)
    if student_mode:
        tools = [tool for tool in tools if _is_free_tool(tool)]
    filtered = [tool for tool in tools if str(tool.get("category", "")).lower() == category.lower()]
    filtered = sort_tools(filtered, sort_type=sort_type, view_map=get_view_map(), student_mode=student_mode)
    return jsonify(sanitize_text_payload(filtered))


@main_bp.route("/api/tools/<tool_id>")
def api_tool_detail(tool_id):
    tool = get_tool_by_key(tool_id)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404
    tool = apply_dynamic_weekly_users([tool], get_weekly_view_map())[0]
    return jsonify(sanitize_text_payload(tool))


@main_bp.route("/api/search")
def api_search():
    try:
        query = str(request.args.get("q", "") or "").strip()
        if query and current_user.is_authenticated:
            track_user_activity(
                current_user.id,
                "search",
                "search",
                {"query": query, "source": "api_search"},
            )

        if not query:
            return jsonify({"results": [], "message": "", "showing_closest_matches": False})

        tools = _load_tools_for_request()
        score_user = current_user if current_user.is_authenticated else None
        student_mode = session.get("student_mode", False)
        ranked_matches = unique_tools_by_identity(search_tools(tools, query, user=score_user, student_mode=student_mode))

        def serialize_result(tool, score):
            return {
                "name": tool.get("name", ""),
                "slug": tool.get("tool_key") or build_tool_slug(tool),
                "category": tool.get("category", ""),
                "description": tool.get("description", ""),
                "tags": tool.get("tags", []),
                "icon": tool.get("icon") or DEFAULT_TOOL_ICON,
                "score": score,
                "confidence_score": max(0, min(100, int(score))),
                "reason": tool.get("reason") or generate_reason(tool, user=score_user, query=query, student_mode=student_mode),
            }

        top = []
        seen = set()
        for index, tool in enumerate(ranked_matches):
            slug = str(tool.get("tool_key") or build_tool_slug(tool)).strip().lower()
            name_key = _normalized_tool_name_key(tool.get("name"))
            dedupe_key = slug or name_key
            if not dedupe_key or dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            top.append(serialize_result(tool, score=max(1, 100 - index)))
            if len(top) >= 5:
                break

        showing_closest_matches = False
        message = ""
        if not top:
            category_fallback = [
                tool for tool in tools
                if query.lower() in str(tool.get("category") or "").lower()
            ]
            if category_fallback:
                fallback_tools = limit_results(category_fallback, limit=5)
            else:
                fallback_tools = smart_search_fallback(
                    tools,
                    query,
                    results_limit=5,
                    user=score_user,
                    student_mode=student_mode,
                )

            fallback_tools = unique_tools_by_identity(limit_results(fallback_tools, limit=5))
            for tool in fallback_tools:
                slug = str(tool.get("tool_key") or build_tool_slug(tool)).strip().lower()
                name_key = _normalized_tool_name_key(tool.get("name"))
                dedupe_key = slug or name_key
                if not dedupe_key or dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                top.append(serialize_result(tool, score=0))
                if len(top) >= 5:
                    break

            if top:
                showing_closest_matches = True
                message = "Showing closest matches"

        return jsonify(
            sanitize_text_payload(
                {
                    "results": top[:5],
                    "message": message or "",
                    "showing_closest_matches": bool(showing_closest_matches),
                }
            )
        )
    except Exception:
        current_app.logger.exception("Search API failed")
        return jsonify(
            {
                "results": [],
                "message": "Search is temporarily unavailable.",
                "showing_closest_matches": False,
            }
        ), 500


@main_bp.route("/api/favorite", methods=["POST"])
def api_favorite():
    if not current_user.is_authenticated:
        return jsonify({"error": "login_required"}), 401

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

    track_user_activity(
        current_user.id,
        tool_id,
        "save",
        {"source": "api_favorite"},
    )

    return jsonify({"ok": True, "favorited": True})


@main_bp.route("/api/view", methods=["POST"])
def api_view():
    payload = request.get_json(silent=True) or {}
    tool_id = str(payload.get("tool_id", "")).strip()
    if not tool_id:
        return jsonify({"error": "tool_id is required"}), 400

    log_tool_view(tool_id)
    if current_user.is_authenticated:
        track_user_activity(
            current_user.id,
            tool_id,
            "view",
            {"source": "api_view"},
        )

    recent_tools = session.get("recent_tools", [])
    recent_tools = [item for item in recent_tools if item != tool_id]
    recent_tools.insert(0, tool_id)
    session["recent_tools"] = recent_tools[:12]

    return jsonify({"ok": True, "views": int(get_view_map().get(tool_id, 0))})


@main_bp.route("/api/activity/track", methods=["POST"])
@login_required
def api_track_activity():
    """Track user activity (view, save, search, rate)."""
    payload = request.get_json(silent=True) or {}
    tool_id = str(payload.get("tool_id", "")).strip()
    action = str(payload.get("action", "")).strip().lower()
    
    if not tool_id or not action:
        return jsonify({"error": "tool_id and action are required"}), 400
    
    if action not in ["view", "save", "search", "rate"]:
        return jsonify({"error": "action must be one of: view, save, search, rate"}), 400
    
    metadata = payload.get("metadata")
    track_user_activity(current_user.id, tool_id, action, metadata)
    
    return jsonify({"ok": True, "action": action, "tool_id": tool_id})


@main_bp.route("/api/user/insights", methods=["GET"])
@login_required
def api_user_insights():
    """Get user activity insights and behavior summary"""
    insights = get_user_insights(current_user.id)
    return jsonify({
        "ok": True,
        "insights": insights,
    })


# ── Tool Detail ───────────────────────────────────────────────────────────────

@main_bp.route("/tool/<tool_id>")
def tool_detail(tool_id):
    slug = str(tool_id or "").strip().lower()
    tool = get_tool_by_key(slug)
    if not tool:
        abort(404)

    all_tools = load_normalized_tools()
    favorite_ids: set = set()
    is_favorited = False
    if current_user.is_authenticated:
        favorite_ids = get_favorite_tool_keys(current_user.id)
        is_favorited = tool["tool_key"] in favorite_ids
        # Track view activity
        track_user_activity(current_user.id, tool["tool_key"], "view")

    rating_summary = get_tool_rating_summary(tool["tool_key"])
    user_rating = get_user_tool_rating(tool["tool_key"], current_user.id if current_user.is_authenticated else None)

    # Track per-visit view event
    log_tool_view(tool["tool_key"])
    view_count = int(get_view_map().get(tool["tool_key"], 0))
    weekly_views = int(get_weekly_view_map().get(tool["tool_key"], 0))
    tool["weeklyUsers"] = _format_weekly_users_from_views(weekly_views) if weekly_views > 0 else tool.get("weeklyUsers")
    today_views_estimate = max(12, int(round((weekly_views or 0) / 7.0))) if weekly_views else int(tool.get("activity_today") or 0)

    # Enrich tool with freshness data
    tool = enrich_tool_with_freshness(tool)

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


# ── Weekly Updates Feed ───────────────────────────────────────────────────────

def _weekly_newest_tools(limit=10):
    all_tools = load_normalized_tools()
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
    all_tools = load_normalized_tools()
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
    tools = load_normalized_tools()
    indexed_count = len(tools)
    free_or_freemium = [
        t for t in tools
        if _stack_tool_pricing(t) in {"free", "freemium"}
    ]
    weekly_users_total = sum(parse_weekly_users(t.get("weeklyUsers")) for t in tools)
    active_learners = max(10000, int(round(weekly_users_total / 1000.0)) * 100)
    indexed_tools = max(indexed_count, 500)
    free_options = len(free_or_freemium)
    return {
        "active_learners": active_learners,
        "active_learners_compact": format_number(active_learners),
        "indexed_tools": indexed_tools,
        "indexed_tools_compact": format_number(indexed_tools),
        "free_options": free_options,
        "free_options_compact": format_number(free_options),
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
        if is_rate_limited(f"report_bug:{_client_ip()}", limit=10, window_seconds=60):
            flash("Too many reports submitted too quickly. Please wait a minute.", "error")
            return render_template("report_bug.html")

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


# ── Admin Panel ───────────────────────────────────────────────────────────────

def _admin_tools_payload():
    try:
        with open(DATA_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return [], []

    if isinstance(payload, dict):
        tools = payload.get("tools", [])
    else:
        tools = payload

    if not isinstance(tools, list):
        tools = []
    return payload, tools


def _persist_admin_tools(payload, tools):
    data = payload if isinstance(payload, dict) else list(tools)
    if isinstance(data, dict):
        data["tools"] = list(tools)

    with open(DATA_PATH, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)

    from app.tool_cache import refresh_tools_cache as _refresh_tools_cache

    _refresh_tools_cache(DATA_PATH)


def _admin_tool_id(tool):
    key = str(tool.get("tool_key") or "").strip()
    if key:
        return key
    row_id = str(tool.get("id") or "").strip()
    if row_id:
        return row_id
    return _normalized_tool_name_key(tool.get("name"))


def _tool_index_by_admin_id(tools, tool_id):
    lookup = str(tool_id or "").strip().lower()
    for index, item in enumerate(tools):
        if _admin_tool_id(item).lower() == lookup:
            return index
    return -1


def _admin_summary():
    all_tools = load_normalized_tools()
    view_map = get_view_map()
    pending = Submission.query.filter_by(status="pending").order_by(Submission.submitted_at.desc()).all()
    bug_reports = BugReport.query.order_by(BugReport.created_at.desc()).limit(50).all()
    total_users = User.query.count()
    total_tools = len(all_tools)
    total_saves = Favorite.query.count()
    total_views = sum(view_map.values())
    return {
        "total_users": total_users,
        "total_users_compact": format_number(total_users),
        "total_tools": total_tools,
        "total_tools_compact": format_number(total_tools),
        "total_saves": total_saves,
        "total_saves_compact": format_number(total_saves),
        "total_views": total_views,
        "total_views_compact": format_number(total_views),
        "pending_submissions": len(pending),
        "open_bug_reports": len([r for r in bug_reports if str(r.status or "open").lower() == "open"]),
    }, pending, bug_reports

@main_bp.route("/admin")
@main_bp.route("/admin/dashboard")
@admin_required
def admin():
    analytics, pending, bug_reports = _admin_summary()
    return render_template("admin/dashboard.html", analytics=analytics, pending_submissions=pending[:8], bug_reports=bug_reports[:8])


@main_bp.route("/admin/users")
@admin_required
def admin_users():
    users = User.query.order_by(User.created_at.desc()).all()
    return render_template("admin/users.html", users=users)


@main_bp.route("/admin/analytics")
@admin_required
def admin_analytics():
    analytics, _, _ = _admin_summary()
    analytics["most_viewed_tools"] = get_most_viewed_tools(limit=8)
    analytics["views_per_day"] = get_views_per_day(days=7)
    return render_template("admin/analytics.html", analytics=analytics)


@main_bp.route("/admin/tools")
@admin_required
def admin_tools():
    tools = load_tools()
    tools = sorted(tools, key=lambda item: str(item.get("name") or "").lower())
    rows = []
    for tool in tools:
        item = dict(tool)
        item["admin_id"] = _admin_tool_id(item)
        rows.append(item)
    return render_template("admin/tools.html", tools=rows)


@main_bp.route("/admin/tools/add", methods=["GET", "POST"])
@admin_required
def admin_tools_add():
    if request.method == "POST":
        payload, tools = _admin_tools_payload()
        name = str(request.form.get("name") or "").strip()
        category = str(request.form.get("category") or "other").strip()
        description = str(request.form.get("description") or "").strip()
        link = str(request.form.get("link") or "").strip()
        price = str(request.form.get("price") or "Freemium").strip()
        tags_raw = str(request.form.get("tags") or "").strip()

        if not name:
            flash("Tool name is required.", "error")
            return redirect(url_for("main.admin_tools_add"))

        next_id = max([int(t.get("id") or 0) for t in tools if str(t.get("id") or "").isdigit()] + [0]) + 1
        new_tool = {
            "id": next_id,
            "name": name,
            "category": category,
            "description": description,
            "link": link,
            "price": price,
            "tags": [segment.strip() for segment in tags_raw.split(",") if segment.strip()],
        }
        tools.append(new_tool)
        _persist_admin_tools(payload, tools)
        flash("Tool added.", "success")
        return redirect(url_for("main.admin_tools"))

    return render_template("admin/tools.html", tools=None, form_mode="add")


@main_bp.route("/admin/tools/edit/<tool_id>", methods=["GET", "POST"])
@admin_required
def admin_tools_edit(tool_id):
    payload, tools = _admin_tools_payload()
    index = _tool_index_by_admin_id(tools, tool_id)
    if index < 0:
        flash("Tool not found.", "error")
        return redirect(url_for("main.admin_tools"))

    if request.method == "POST":
        tool = dict(tools[index])
        tool["name"] = str(request.form.get("name") or tool.get("name") or "").strip()
        tool["category"] = str(request.form.get("category") or tool.get("category") or "other").strip()
        tool["description"] = str(request.form.get("description") or tool.get("description") or "").strip()
        tool["link"] = str(request.form.get("link") or tool.get("link") or "").strip()
        tool["price"] = str(request.form.get("price") or tool.get("price") or "Freemium").strip()
        tags_raw = str(request.form.get("tags") or "").strip()
        tool["tags"] = [segment.strip() for segment in tags_raw.split(",") if segment.strip()]
        tools[index] = tool
        _persist_admin_tools(payload, tools)
        flash("Tool updated.", "success")
        return redirect(url_for("main.admin_tools"))

    selected = dict(tools[index])
    selected["admin_id"] = _admin_tool_id(selected)
    return render_template("admin/tools.html", tools=None, form_mode="edit", tool_item=selected)


@main_bp.route("/admin/tools/delete/<tool_id>", methods=["POST"])
@admin_required
def admin_tools_delete(tool_id):
    payload, tools = _admin_tools_payload()
    index = _tool_index_by_admin_id(tools, tool_id)
    if index < 0:
        flash("Tool not found.", "error")
        return redirect(url_for("main.admin_tools"))

    removed = tools.pop(index)
    _persist_admin_tools(payload, tools)
    flash(f"Deleted '{removed.get('name', 'tool')}'.", "success")
    return redirect(url_for("main.admin_tools"))


@main_bp.route("/admin/submissions")
@admin_required
def admin_submissions():
    pending = Submission.query.filter_by(status="pending").order_by(Submission.submitted_at.desc()).all()
    approved = Submission.query.filter_by(status="approved").order_by(Submission.submitted_at.desc()).limit(100).all()
    return render_template("admin/submissions.html", pending_submissions=pending, approved_submissions=approved)


@main_bp.route("/admin/feedback")
@admin_required
def admin_feedback():
    bug_reports = BugReport.query.order_by(BugReport.created_at.desc()).all()
    return render_template("admin/feedback.html", bug_reports=bug_reports)


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


# ── Public API additions ──────────────────────────────────────────────────────

@main_bp.route("/api/tools/fastest-growing")
def api_tools_fastest_growing():
    """Tools with the highest weeklyUsers values."""
    tools = load_normalized_tools()
    ranked = sorted(tools, key=lambda t: parse_weekly_users(t.get("weeklyUsers")), reverse=True)
    return jsonify(ranked[:10])


@main_bp.route("/api/tools/student-picks")
def api_tools_student_picks():
    """Tools that have student perks."""
    tools = load_normalized_tools()
    picks = [t for t in tools if t.get("studentPerk")]
    picks.sort(key=lambda t: float(t.get("rating") or 0), reverse=True)
    return jsonify(picks[:10])


@main_bp.route("/sitemap.xml")
def sitemap_xml():
    tools = load_normalized_tools()
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


# ── Catch-all Route (Redirect to React Frontend) ──────────────────────────────

@main_bp.route('/', defaults={'path': ''})
@main_bp.route('/<path:path>')
def catch_all(path):
    """
    Catch-all route that redirects unmatched paths to the React frontend.
    Excludes /api/ and /auth/ routes which should return 404 if not already handled.
    """
    # Don't redirect /api/ or /auth/ routes - let them 404 if not already matched
    if path.startswith('api/') or path.startswith('auth/'):
        abort(404)
    # Redirect all other routes to React frontend
    return redirect(f'http://localhost:5173/{path}')
