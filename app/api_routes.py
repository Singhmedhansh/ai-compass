import json
import os
import re
import subprocess
import sys

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_user

from app import bcrypt, csrf, db
from app.ml_recommender import get_recommendations, get_similar_tools
from app.models import Favorite, User
from app.search_utils import search_tools
from app.tool_cache import get_cached_tools, prime_tools_cache

api_bp = Blueprint("api", __name__)

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tools.json")
STACKS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "stacks")
SUBMISSIONS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "submissions.json")
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "recommendation_model.pkl")

GOAL_CATEGORY_MAP = {
    "studying": ["study tools"],
    "coding": ["coding"],
    "writing": ["writing & docs"],
    "research": ["research"],
    "creating": ["image generation", "video generation"],
    "productivity": ["productivity"],
}

COLLECTIONS_CONFIG = {
    "best-free-tools": {
        "title": "Best Free AI Tools",
        "description": "Top free AI tools curated for students, creators, and builders.",
        "meta_title": "Best Free AI Tools 2026 | AI Compass",
        "meta_description": "Discover the best free AI tools for coding, writing, and research in 2026.",
    },
    "best-for-students": {
        "title": "Best AI Tools for Students",
        "description": "Student-friendly AI tools for studying, assignments, and productivity.",
        "meta_title": "Best AI Tools for Students 2026 | AI Compass",
        "meta_description": "Find top student-friendly AI tools for classes, projects, and exam prep.",
    },
    "best-for-coding": {
        "title": "Best AI Tools for Coding",
        "description": "Top coding assistants, debuggers, and dev productivity tools.",
        "meta_title": "Best AI Tools for Coding 2026 | AI Compass",
        "meta_description": "Explore the best AI coding tools for developers and software teams.",
    },
    "best-for-writing": {
        "title": "Best AI Tools for Writing",
        "description": "Discover the best writing and documentation AI tools for faster workflows.",
        "meta_title": "Best AI Tools for Writing 2026 | AI Compass",
        "meta_description": "Compare top AI writing tools for blogs, docs, and professional communication.",
    },
    "best-for-research": {
        "title": "Best AI Tools for Research",
        "description": "Leading AI tools for literature review, synthesis, and deep analysis.",
        "meta_title": "Best AI Tools for Research 2026 | AI Compass",
        "meta_description": "Discover the best AI research tools for students, academics, and analysts.",
    },
    "trending": {
        "title": "Trending AI Tools Right Now",
        "description": "See the AI tools rising fastest this week across categories.",
        "meta_title": "Trending AI Tools 2026 | AI Compass",
        "meta_description": "Track the most popular and fast-growing AI tools right now.",
    },
    "top-rated": {
        "title": "Top Rated AI Tools",
        "description": "Highest rated AI tools selected by quality and user feedback.",
        "meta_title": "Top Rated AI Tools 2026 | AI Compass",
        "meta_description": "Browse the top rated AI tools based on user ratings and performance.",
    },
}


def _tool_slug(tool: dict) -> str:
    explicit_slug = str(tool.get("slug") or "").strip().lower()
    if explicit_slug:
        return explicit_slug

    tool_key = str(tool.get("tool_key") or "").strip().lower()
    if tool_key:
        return tool_key

    name = str(tool.get("name") or "").strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def _load_tools() -> list[dict]:
    return get_cached_tools(DATA_PATH)


def _user_stack_path(user_id: int) -> str:
    os.makedirs(STACKS_PATH, exist_ok=True)
    return os.path.join(STACKS_PATH, f"{user_id}.json")


def _read_user_stack(user_id: int) -> dict:
    stack_path = _user_stack_path(user_id)
    if not os.path.exists(stack_path):
        return {"goal": "", "budget": "", "platform": "", "level": "", "tools": []}

    try:
        with open(stack_path, "r", encoding="utf-8") as stack_file:
            payload = json.load(stack_file)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return {"goal": "", "budget": "", "platform": "", "level": "", "tools": []}

    if not isinstance(payload, dict):
        return {"goal": "", "budget": "", "platform": "", "level": "", "tools": []}

    return payload


def _write_user_stack(user_id: int, payload: dict) -> None:
    stack_path = _user_stack_path(user_id)
    with open(stack_path, "w", encoding="utf-8") as stack_file:
        json.dump(payload, stack_file, indent=2)


def _serialize_user(user: User) -> dict:
    from datetime import datetime, timezone
    
    # Format created_at as "Month Year" (e.g., "December 2024")
    member_since = "April 2026"
    if user.created_at:
        try:
            member_since = user.created_at.strftime("%B %Y")
        except (AttributeError, ValueError):
            member_since = "April 2026"
    
    return {
        "id": user.id,
        "name": user.display_name or "",
        "email": user.email,
        "picture": user.oauth_picture_url or "",
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "member_since": member_since,
    }


def _normalize_text(value: str | None) -> str:
    return str(value or "").strip().lower()


def _pricing_value(tool: dict) -> str:
    return _normalize_text(
        tool.get("pricing")
        or tool.get("price")
        or tool.get("pricingType")
        or tool.get("pricing_type")
    )


def _rating_value(tool: dict) -> float:
    return float(tool.get("rating") or tool.get("average_rating") or tool.get("averageRating") or 0)


def _popularity_value(tool: dict) -> float:
    return float(tool.get("popularity_score") or 0)


def _platform_values(tool: dict) -> list[str]:
    platforms = tool.get("platforms")
    if isinstance(platforms, list):
        return [_normalize_text(item) for item in platforms if item]

    single = _normalize_text(tool.get("platform"))
    return [single] if single else []


def _matches_budget(tool: dict, budget: str) -> bool:
    pricing = _pricing_value(tool)

    if budget == "free":
        return pricing == "free"

    if budget == "freemium":
        return pricing in {"free", "freemium"}

    return True


def _matches_platform(tool: dict, platform: str) -> bool:
    if not platform:
        return True

    platforms = _platform_values(tool)

    if platform == "web":
        return any(item in {"web", "browser"} for item in platforms)

    if platform == "desktop":
        return any("desktop" in item for item in platforms)

    if platform == "mobile":
        return any(item in {"ios", "android", "mobile"} for item in platforms)

    if platform == "api":
        if bool(tool.get("apiAvailable") or tool.get("api_available")):
            return True
        tags = tool.get("tags")
        if isinstance(tags, list):
            normalized_tags = {_normalize_text(tag) for tag in tags}
            return "api" in normalized_tags or "coding" in normalized_tags
        return False

    return True


def _score_tool(tool: dict, goal: str, budget: str, platform: str, level: str) -> tuple[float, str]:
    score = 0.0
    reasons: list[str] = []

    category = _normalize_text(tool.get("category"))
    preferred_categories = GOAL_CATEGORY_MAP.get(goal, [])
    if category in preferred_categories:
        score += 3.0
        reasons.append(f"matches your {goal} goal")

    rating = float(tool.get("rating") or tool.get("average_rating") or tool.get("averageRating") or 0)
    score += min(5.0, max(0.0, rating)) * 1.2

    if bool(tool.get("trending")):
        score += 1.0
        reasons.append("currently trending")

    if _matches_budget(tool, budget):
        score += 1.4
        if budget == "free":
            reasons.append("fits your free-only budget")
        elif budget == "freemium":
            reasons.append("includes a free or freemium plan")

    if _matches_platform(tool, platform):
        score += 1.5
        reasons.append(f"works well on {platform}")

    if level == "beginner":
        if bool(tool.get("studentPerk") or tool.get("student_perk")):
            score += 1.2
            reasons.append("beginner-friendly with student perks")
    elif level == "advanced":
        if bool(tool.get("apiAvailable") or tool.get("api_available")):
            score += 1.2
            reasons.append("supports advanced API workflows")
        if bool(tool.get("openSource") or tool.get("open_source")):
            score += 0.6

    if not reasons:
        reasons.append("strong overall fit for your preferences")

    return score, "; ".join(reasons).capitalize() + "."


@api_bp.route("/ping")
def ping():
    return {"status": "ok"}


@api_bp.get("/tools")
def list_tools():
    tools = _load_tools()
    category = (request.args.get("category") or "").strip().lower()

    if category:
        filtered = []
        for tool in tools:
            tool_category = str(tool.get("category") or "").strip().lower()
            if tool_category == category:
                filtered.append(tool)
        return jsonify(filtered)

    return jsonify(tools)


@api_bp.get("/tools/<slug>")
def get_tool(slug: str):
    slug_value = str(slug or "").strip().lower()
    tools = _load_tools()

    for tool in tools:
        if _tool_slug(tool) == slug_value:
            tool_payload = dict(tool)
            tool_payload["similar_tools"] = get_similar_tools(slug_value, limit=4)
            return jsonify(tool_payload)

    return jsonify({"error": "Tool not found"}), 404


@api_bp.get("/tools/<slug>/reviews")
def get_tool_reviews(slug: str):
    slug_value = str(slug or "").strip().lower()
    tools = _load_tools()

    for tool in tools:
        if _tool_slug(tool) == slug_value:
            reviews = tool.get("reviews")
            return jsonify(reviews if isinstance(reviews, list) else [])

    return jsonify([])


@api_bp.get("/search")
def search_tools_endpoint():
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify([])

    results = search_tools(_load_tools(), query, user=current_user if current_user.is_authenticated else None)
    return jsonify(results)


@api_bp.get("/recommendations")
def recommendations():
    tools = _load_tools()

    ranked = sorted(tools, key=_rating_value, reverse=True)[:6]
    return jsonify(ranked)


@api_bp.get("/collections/<slug>")
def get_collection(slug: str):
    slug_value = str(slug or "").strip().lower()
    config = COLLECTIONS_CONFIG.get(slug_value)

    if config is None:
        return jsonify({"error": "Collection not found"}), 404

    tools = _load_tools()

    if slug_value == "best-free-tools":
        filtered = [
            tool for tool in tools
            if str(tool.get("pricing_tier", "")).strip().lower() == "free"
            or str(tool.get("pricing", "")).strip().lower() == "free"
        ]
        filtered = sorted(filtered, key=_rating_value, reverse=True)
    elif slug_value == "best-for-students":
        filtered = [tool for tool in tools if tool.get("student_friendly") is True]
        filtered = sorted(filtered, key=_rating_value, reverse=True)
    elif slug_value == "best-for-coding":
        filtered = [tool for tool in tools if _normalize_text(tool.get("category")) == "coding"]
        filtered = sorted(filtered, key=_rating_value, reverse=True)
    elif slug_value == "best-for-writing":
        filtered = [tool for tool in tools if _normalize_text(tool.get("category")) == "writing & docs"]
        filtered = sorted(filtered, key=_rating_value, reverse=True)
    elif slug_value == "best-for-research":
        filtered = [tool for tool in tools if _normalize_text(tool.get("category")) == "research"]
        filtered = sorted(filtered, key=_rating_value, reverse=True)
    elif slug_value == "trending":
        filtered = sorted(tools, key=_popularity_value, reverse=True)[:20]
    elif slug_value == "top-rated":
        filtered = sorted(tools, key=_rating_value, reverse=True)[:20]
    else:
        filtered = tools

    seen: set[str] = set()
    unique_tools: list[dict] = []
    for tool in filtered:
        name = str(tool.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        unique_tools.append(tool)

    payload = {
        "slug": slug_value,
        "title": config["title"],
        "description": config["description"],
        "tools": unique_tools,
        "count": len(unique_tools),
        "meta_title": config["meta_title"],
        "meta_description": config["meta_description"],
    }
    return jsonify(payload)


@api_bp.get("/admin/stats")
def admin_stats():
    tools = get_cached_tools(DATA_PATH)
    try:
        total_users = User.query.count()
    except Exception:
        total_users = 0

    payload = {
        "total_tools": len(tools),
        "total_users": total_users,
        "total_favorites": Favorite.query.count(),
        "model_status": "active" if os.path.exists(MODEL_PATH) else "inactive",
    }
    return jsonify(payload)


@api_bp.get("/admin/users")
def admin_users():
    users = User.query.order_by(User.id.asc()).all()
    payload = [
        {
            "id": user.id,
            "display_name": user.display_name,
            "email": user.email,
            "oauth_provider": user.oauth_provider,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "is_admin": bool(user.is_admin),
        }
        for user in users
    ]
    return jsonify(payload)


@csrf.exempt
@api_bp.post("/admin/retrain")
def admin_retrain():
    project_root = os.path.dirname(os.path.dirname(__file__))
    result = subprocess.run(
        [sys.executable, os.path.join("scripts", "train_model.py")],
        capture_output=True,
        text=True,
        cwd=project_root,
    )

    return jsonify(
        {
            "success": result.returncode == 0,
            "output": result.stdout,
            "error": result.stderr,
        }
    )


@csrf.exempt
@api_bp.post("/admin/clear-cache")
def admin_clear_cache():
    prime_tools_cache(DATA_PATH)
    return jsonify({"success": True, "message": "Cache cleared and reloaded"})


@api_bp.get("/admin/submissions")
def admin_submissions():
    if not os.path.exists(SUBMISSIONS_PATH):
        return jsonify([])

    try:
        with open(SUBMISSIONS_PATH, "r", encoding="utf-8") as submissions_file:
            payload = json.load(submissions_file)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return jsonify([])

    if not isinstance(payload, list):
        return jsonify([])

    return jsonify(payload)


@csrf.exempt
@api_bp.post("/finder")
def finder():
    data = request.get_json(silent=True) or {}
    goal = _normalize_text(data.get("goal"))
    budget = _normalize_text(data.get("budget"))
    platform = _normalize_text(data.get("platform"))
    level = _normalize_text(data.get("level"))

    results = get_recommendations(
        goal=goal,
        budget=budget,
        platform=platform,
        level=level,
        limit=6,
    )
    return jsonify({"tools": results, "count": len(results)})


@api_bp.get("/auth/me")
def auth_me():
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401

    return jsonify(_serialize_user(current_user))


@csrf.exempt
@api_bp.route("/auth/login", methods=["POST"])
def auth_login():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()
    password = str(payload.get("password") or "")

    if not email or not password:
        return jsonify({"error": "Invalid credentials"}), 401

    user = User.query.filter_by(email=email).first()
    if user is None or not user.password_hash:
        return jsonify({"error": "Invalid credentials"}), 401

    if not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    login_user(user)
    return jsonify(_serialize_user(user))


@csrf.exempt
@api_bp.route("/auth/register", methods=["POST"])
def auth_register():
    try:
        print(current_app.url_map)
        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")

        if not name or not email or not password:
            return jsonify({"error": "Name, email, and password are required."}), 400

        if len(password) < 8:
            return jsonify({"error": "Password must be at least 8 characters."}), 400

        existing = User.query.filter_by(email=email).first()
        if existing is not None:
            return jsonify({"error": "Email already exists"}), 400

        password_hash = bcrypt.generate_password_hash(password).decode("utf-8")
        user = User(email=email, password_hash=password_hash, display_name=name)
        db.session.add(user)
        db.session.commit()

        return jsonify({"message": "Account created successfully"}), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 500


@csrf.exempt
@api_bp.route("/favorites", methods=["POST"])
def toggle_favorite():
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    tool_id = str(payload.get("slug") or payload.get("tool_id") or "").strip().lower()

    if not tool_id:
        return jsonify({"error": "Tool slug is required."}), 400

    favorite = Favorite.query.filter_by(user_id=current_user.id, tool_id=tool_id).first()

    if favorite is None:
        db.session.add(Favorite(user_id=current_user.id, tool_id=tool_id))
        db.session.commit()
        return jsonify({"favorited": True})

    db.session.delete(favorite)
    db.session.commit()
    return jsonify({"favorited": False})


@api_bp.get("/favorites")
def list_favorites():
    if not current_user.is_authenticated:
        return jsonify([])

    favorites = (
        Favorite.query.filter_by(user_id=current_user.id)
        .order_by(Favorite.id.desc())
        .all()
    )
    favorite_slugs = {str(item.tool_id or "").strip().lower() for item in favorites if item.tool_id}

    if not favorite_slugs:
        return jsonify([])

    tools = _load_tools()
    by_slug = {
        _tool_slug(tool): tool
        for tool in tools
    }

    payload = []
    for favorite in favorites:
        slug = str(favorite.tool_id or "").strip().lower()
        if not slug:
            continue
        tool = by_slug.get(slug)
        if tool:
            payload.append(tool)

    return jsonify(payload)


@csrf.exempt
@api_bp.route('/stack', methods=['POST'])
def save_stack():
    import json, os
    from flask_login import current_user

    data = request.get_json() or {}

    # Get user id from request body (since React uses localStorage not Flask session)
    user_id = data.get('user_id') or (current_user.id if current_user.is_authenticated else None)

    if not user_id:
        return jsonify({'error': 'Not logged in'}), 401

    stack_data = {
        'user_id': user_id,
        'goal': data.get('goal'),
        'budget': data.get('budget'),
        'platform': data.get('platform'),
        'level': data.get('level'),
        'tools': data.get('tools', []),
        'saved_at': str(__import__('datetime').datetime.now())
    }

    stacks_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'stacks')
    os.makedirs(stacks_dir, exist_ok=True)

    stack_path = os.path.join(stacks_dir, f'{user_id}.json')
    with open(stack_path, 'w', encoding='utf-8') as f:
        json.dump(stack_data, f, indent=2)

    return jsonify({'message': 'Stack saved!', 'stack': stack_data}), 200


@api_bp.route('/stack', methods=['GET'])
def get_stack():
    import json, os

    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'stack': None}), 200

    stack_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'data', 'stacks', f'{user_id}.json'
    )
    if not os.path.exists(stack_path):
        return jsonify({'stack': None}), 200

    with open(stack_path, 'r', encoding='utf-8') as f:
        stack = json.load(f)
    return jsonify({'stack': stack}), 200
