import json
import os
import re
from collections import Counter
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy import func

from app import bcrypt, csrf, db
from app.ml_recommender import get_similar_tools
from app.models import Favorite, Rating, Review, ToolRating, User
from app.search_utils import search_tools
from app.tool_cache import DEFAULT_TOOLS_PATH, get_cached_tools, prime_tools_cache

api_bp = Blueprint("api", __name__)
compat_bp = Blueprint("compat", __name__)  # registered at /api for backward compat

DATA_PATH = DEFAULT_TOOLS_PATH
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


@api_bp.get("/suggestions")
def search_suggestions():
    from app.search_utils import tokenize_and_expand_query
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify([])

    tools = _load_tools() or []
    tokens = tokenize_and_expand_query(q)
    suggestions = []
    seen_tools: set = set()
    seen_tags: set = set()
    seen_usecases: set = set()

    for tool in tools:
        name = str(tool.get("name") or "")
        name_lower = name.lower()
        if any(token in name_lower for token in tokens):
            if name_lower not in seen_tools:
                suggestions.append({"type": "tool", "label": name, "sub": tool.get("category", ""), "icon": tool.get("logo_emoji", "")})
                seen_tools.add(name_lower)
            if len([s for s in suggestions if s["type"] == "tool"]) >= 2:
                break

    tag_counts: dict = {}
    for tool in tools:
        for tag in tool.get("tags", []):
            tag_lower = str(tag).lower()
            if any(token in tag_lower for token in tokens):
                tag_counts[tag_lower] = tag_counts.get(tag_lower, 0) + 1
    for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1]):
        if tag not in seen_tags:
            suggestions.append({"type": "tag", "label": f"#{tag}", "sub": f"{count} tools", "icon": "#"})
            seen_tags.add(tag)
        if len([s for s in suggestions if s["type"] == "tag"]) >= 2:
            break

    for tool in tools:
        for uc in tool.get("use_cases", []):
            uc_lower = str(uc).lower()
            if any(token in uc_lower for token in tokens):
                if uc_lower not in seen_usecases:
                    suggestions.append({"type": "usecase", "label": uc, "sub": tool.get("name", ""), "icon": "💡"})
                    seen_usecases.add(uc_lower)
                if len([s for s in suggestions if s["type"] == "usecase"]) >= 2:
                    break
        if len([s for s in suggestions if s["type"] == "usecase"]) >= 2:
            break

    return jsonify(suggestions[:6])



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


def _tools_json_path() -> str:
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "tools.json",
    )


def _serialize_user(user: User) -> dict:
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
    )


def _rating_value(tool: dict) -> float:
    try:
        return float(tool.get("rating", 0) or 0)
    except (TypeError, ValueError):
        return 0.0


@api_bp.get("/tools")
def list_tools():
    from app.tool_cache import get_cached_tools
    from flask import make_response
    try:
        tools = get_cached_tools()
    except Exception:
        tools = []
    response = make_response(jsonify({"results": tools, "total": len(tools), "fallback": not bool(tools)}))
    response.headers["Cache-Control"] = "public, max-age=3600"  # Cache for 1 hour
    return response


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
    try:
        reviews = Review.query.filter_by(
            tool_slug=slug, is_hidden=False
        ).order_by(Review.created_at.desc()).limit(50).all()
        return jsonify({
            "reviews": [{
                "id": r.id,
                "user": (
                    getattr(r.user, "full_name", None)
                    or getattr(r.user, "username", None)
                    or getattr(r.user, "display_name", None)
                    or "Anonymous"
                ) if r.user else "Anonymous",
                "body": r.body,
                "created_at": r.created_at.isoformat(),
            } for r in reviews],
            "count": len(reviews),
            "message": "No reviews yet. Be the first!" if not reviews else None
        })
    except Exception as e:
        print(f"[REVIEWS] Error: {e}")
        return jsonify({"reviews": [], "count": 0,
                      "message": "No reviews yet. Be the first!"}), 200


@api_bp.get("/tools/<slug>/ratings")
def get_tool_ratings(slug: str):
    slug_value = str(slug or "").strip().lower()
    result = (
        db.session.query(
            func.avg(Rating.value).label("avg"),
            func.count(Rating.id).label("count"),
        )
        .filter(Rating.tool_slug == slug_value)
        .first()
    )

    avg = round(float(result.avg), 1) if result and result.avg is not None else 0
    count = int(result.count or 0) if result else 0

    user_rating = None
    if current_user.is_authenticated:
        rating = Rating.query.filter_by(user_id=current_user.id, tool_slug=slug_value).first()
        user_rating = rating.value if rating else None

    return jsonify({
        "average": avg,
        "count": count,
        "user_rating": user_rating,
        "message": "Be the first to rate this tool!" if count == 0 else None,
    })


@api_bp.post("/tools/<slug>/ratings")
@csrf.exempt
@login_required
def rate_tool(slug: str):
    slug_value = str(slug or "").strip().lower()
    payload = request.get_json(silent=True) or {}
    value = payload.get("value")

    if not isinstance(value, int) or value < 1 or value > 5:
        return jsonify({"error": "Rating must be 1-5"}), 400

    existing = Rating.query.filter_by(user_id=current_user.id, tool_slug=slug_value).first()

    if existing:
        existing.value = value
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.session.add(Rating(user_id=current_user.id, tool_slug=slug_value, value=value))

    db.session.commit()
    return jsonify({"success": True, "value": value})


@api_bp.post("/tools/<slug>/reviews")
@csrf.exempt
@login_required
def post_review(slug: str):
    try:
        body = (request.json.get("body") or "").strip()
        if len(body) < 10:
            return jsonify({"error": "Review must be at least 10 characters"}), 400
        if len(body) > 1000:
            return jsonify({"error": "Review too long"}), 400
        existing = Review.query.filter_by(
            user_id=current_user.id, tool_slug=slug
        ).first()
        if existing:
            existing.body = body
            existing.created_at = datetime.now(timezone.utc)
        else:
            rev = Review(user_id=current_user.id, tool_slug=slug, body=body)
            db.session.add(rev)
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        print(f"[REVIEWS POST] Error: {e}")
        return jsonify({"error": "Could not save review"}), 500
@api_bp.get("/search")
def api_search():
    raw_query   = request.args.get('q', '').strip()[:150]
    category    = request.args.get('category', 'All')
    pricing     = request.args.get('pricing', 'All')
    student     = request.args.get('student_only', 'false') == 'true'
    trending    = request.args.get('trending_only', 'false') == 'true'
    sort_by     = request.args.get('sort', 'Relevance')

    output = search_tools(
        raw_query=raw_query,
        category_filter=category,
        pricing_filter_ui=pricing,
        student_only=student,
        trending_only=trending,
        sort_by=sort_by
    )
    return jsonify(output)


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

    tools = get_cached_tools()

    if slug_value == "best-free-tools":
        collection_tools = [
            t for t in tools
            if str(t.get("pricing", "") or t.get("price", "")).strip().lower() == "free"
        ]
        collection_tools.sort(key=lambda t: float(t.get("rating", 0) or 0), reverse=True)
    elif slug_value == "best-for-students":
        collection_tools = [t for t in tools if t.get("student_perk")]
        collection_tools.sort(key=lambda t: float(t.get("rating", 0) or 0), reverse=True)
    elif slug_value == "best-for-coding":
        collection_tools = [
            t for t in tools
            if str(t.get("category", "")).strip().lower() == "coding"
        ]
        collection_tools.sort(key=lambda t: float(t.get("rating", 0) or 0), reverse=True)
    elif slug_value == "best-for-writing":
        collection_tools = [
            t for t in tools
            if str(t.get("category", "")).strip().lower() == "writing & chat"
        ]
        collection_tools.sort(key=lambda t: float(t.get("rating", 0) or 0), reverse=True)
    elif slug_value == "best-for-research":
        collection_tools = [
            t for t in tools
            if str(t.get("category", "")).strip().lower() == "research"
        ]
        collection_tools.sort(key=lambda t: float(t.get("rating", 0) or 0), reverse=True)
    elif slug_value == "trending":
        collection_tools = [t for t in tools if bool(t.get("trending"))]
        collection_tools.sort(key=lambda t: float(t.get("rating", 0) or 0), reverse=True)
    elif slug_value == "top-rated":
        ratings = db.session.query(
            Rating.tool_slug,
            func.avg(Rating.value).label("avg"),
            func.count(Rating.id).label("count"),
        ).group_by(Rating.tool_slug).having(func.count(Rating.id) >= 1).all()

        rated_slugs = {
            r.tool_slug: {"avg": float(r.avg), "count": int(r.count)}
            for r in ratings
        }

        collection_tools = []
        for tool in tools:
            slug_key = _tool_slug(tool)
            if slug_key in rated_slugs:
                tool_copy = dict(tool)
                tool_copy["user_rating"] = rated_slugs[slug_key]["avg"]
                tool_copy["user_rating_count"] = rated_slugs[slug_key]["count"]
                collection_tools.append(tool_copy)

        collection_tools.sort(
            key=lambda t: float(t.get("user_rating", 0) or 0),
            reverse=True,
        )
    else:
        collection_tools = []

    return jsonify(
        {
            **config,
            "slug": slug_value,
            "count": len(collection_tools),
            "tools": collection_tools,
        }
    )

@api_bp.get("/admin/users")
def admin_users():
    users = User.query.all()
    payload = [
        {
            "id": user.id,
            "email": user.email,
            "name": user.display_name,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "is_admin": bool(getattr(user, 'is_admin', False)),
        }
        for user in users
    ]
    return jsonify(payload)


@api_bp.get("/admin/stats")
def admin_stats():
    from app.tool_cache import SEARCH_INDEX, get_cached_tools

    tools = get_cached_tools()
    total_tools = len(tools)
    category_counts = Counter(t.get("category", "Unknown") for t in tools)
    # Only count tools that are 100% free (not freemium)
    free_count = sum(
        1 for t in tools
        if str(t.get("pricing", "") or t.get("price", "")).strip().lower() == "free"
    )
    freemium_count = sum(
        1 for t in tools
        if str(t.get("pricing", "") or t.get("price", "")).strip().lower() == "freemium"
    )

    total_users = User.query.count()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    new_users_today = User.query.filter(User.created_at >= today_start).count()

    index_size = len(SEARCH_INDEX)
    ml_status = "active" if index_size > 0 else "inactive"

    return jsonify(
        {
            "total_tools": total_tools,
            "total_users": total_users,
            "new_users_today": new_users_today,
            "category_counts": dict(category_counts),
            "free_tools": free_count,
            "freemium_tools": freemium_count,
            "ml_status": ml_status,
            "index_size": index_size,
        }
    )


@api_bp.post("/admin/retrain")
@login_required
def retrain_model():
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Forbidden"}), 403
    try:
        from app.tool_cache import SEARCH_INDEX, prime_tools_cache

        data_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data",
            "tools.json",
        )
        prime_tools_cache(data_path)
        return jsonify(
            {
                "success": True,
                "message": f"Index rebuilt with {len(SEARCH_INDEX)} tools",
                "tool_count": len(SEARCH_INDEX),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@csrf.exempt
@api_bp.post("/admin/clear-cache")
@login_required
def admin_clear_cache():
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Forbidden"}), 403
    prime_tools_cache(DATA_PATH)
    return jsonify({"success": True, "message": "Cache cleared and reloaded"})


@api_bp.put("/admin/tools/<slug>")
@login_required
def update_tool(slug):
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    path = _tools_json_path()

    try:
        with open(path, "r", encoding="utf-8") as tools_file:
            tools = json.load(tools_file)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return jsonify({"error": "Unable to load tools data"}), 500

    updated = None
    for tool in tools:
        if str(tool.get("slug") or "").strip().lower() == str(slug).strip().lower():
            tool["name"] = str(payload.get("name") or tool.get("name") or "").strip()
            tool["description"] = str(
                payload.get("description")
                or tool.get("description")
                or tool.get("shortDescription")
                or ""
            ).strip()
            updated = tool
            break

    if updated is None:
        return jsonify({"error": "Tool not found"}), 404

    with open(path, "w", encoding="utf-8") as tools_file:
        json.dump(tools, tools_file, indent=2, ensure_ascii=False)

    prime_tools_cache(path)
    return jsonify({"success": True, "tool": updated})


@api_bp.post("/admin/tools/<slug>/hide")
@login_required
def hide_tool(slug):
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Forbidden"}), 403

    path = _tools_json_path()
    try:
        with open(path, "r", encoding="utf-8") as tools_file:
            tools = json.load(tools_file)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return jsonify({"error": "Unable to load tools data"}), 500

    changed = False
    for tool in tools:
        if str(tool.get("slug") or "").strip().lower() == str(slug).strip().lower():
            tool["hidden"] = True
            changed = True
            break

    if not changed:
        return jsonify({"error": "Tool not found"}), 404

    with open(path, "w", encoding="utf-8") as tools_file:
        json.dump(tools, tools_file, indent=2, ensure_ascii=False)

    prime_tools_cache(path)
    return jsonify({"success": True})


@api_bp.delete("/admin/tools/<slug>")
@login_required
def delete_tool(slug):
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Forbidden"}), 403

    path = _tools_json_path()
    try:
        with open(path, "r", encoding="utf-8") as tools_file:
            tools = json.load(tools_file)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return jsonify({"error": "Unable to load tools data"}), 500

    original_count = len(tools)
    slug_value = str(slug).strip().lower()
    tools = [t for t in tools if str(t.get("slug") or "").strip().lower() != slug_value]

    if len(tools) == original_count:
        return jsonify({"error": "Tool not found"}), 404

    with open(path, "w", encoding="utf-8") as tools_file:
        json.dump(tools, tools_file, indent=2, ensure_ascii=False)

    prime_tools_cache(path)
    return jsonify({"success": True})


@api_bp.delete("/admin/reviews/<int:review_id>")
@login_required
def delete_review(review_id):
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Forbidden"}), 403

    review = ToolRating.query.get_or_404(review_id)
    db.session.delete(review)
    db.session.commit()
    return jsonify({"success": True})


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
    # Always collect use_case from both form and JSON for compatibility
    use_case = request.form.get("use_case", "").strip() or _normalize_text(data.get("use_case"))

    try:
        from app.ml_recommender import get_recommendations

        results = get_recommendations(
            goal=goal,
            budget=budget,
            platform=platform,
            level=level,
            use_case=use_case,
            limit=6,
        )
        if results:
            # Results already include _reason; return as-is
            return jsonify({"tools": results, "count": len(results)})
    except Exception as exc:
        print(f"ML recommender failed: {exc}")

    tools = get_cached_tools(DATA_PATH) or []

    category_map = {
        "coding": "Coding",
        "writing": "Writing & Docs",
        "research": "Research",
        "studying": "Study Tools",
        "creating": "Image Gen",
        "productivity": "Productivity",
    }

    filtered = tools
    if goal and goal in category_map:
        category = category_map[goal]
        filtered = [tool for tool in tools if str(tool.get("category", "")).strip() == category] or tools

    if budget == "free":
        filtered = [
            tool for tool in filtered
            if str(tool.get("pricing", "")).lower() == "free"
            or str(tool.get("pricing_tier", "")).lower() == "free"
        ] or filtered

    filtered.sort(key=lambda tool: float(tool.get("rating", 0) or 0), reverse=True)
    results = filtered[:6]

    for result in results:
        result["match_score"] = 0.5
        result["reason"] = f"Great tool for {goal or 'your workflow'}"

    return jsonify({"tools": results, "count": len(results)})


@api_bp.get("/auth/me")
def auth_me():
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401

    return jsonify(_serialize_user(current_user))


@csrf.exempt
@api_bp.route("/profile", methods=["PUT"])
def update_profile():
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()

    if not name:
        return jsonify({"error": "Display name is required."}), 400

    current_user.display_name = name
    db.session.commit()

    return jsonify(_serialize_user(current_user))


@csrf.exempt
@api_bp.route("/profile", methods=["DELETE"])
@login_required
def delete_account():
    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password") or "")

    user = current_user._get_current_object()
    if not user.password_hash or not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"error": "Incorrect password"}), 401

    user_id = user.id
    ToolRating.query.filter_by(user_id=user_id).delete()
    Favorite.query.filter_by(user_id=user_id).delete()

    logout_user()

    db.session.delete(user)
    db.session.commit()

    return jsonify({"success": True, "message": "Account deleted"})


@csrf.exempt
@api_bp.route("/auth/login", methods=["POST"])
def auth_login():
    try:
        payload = request.get_json(silent=True) or {}
        email = str(payload.get("email") or "").strip().lower()
        password = str(payload.get("password") or "")

        if not email or not password:
            return jsonify({"error": "Invalid credentials"}), 401

        user = User.query.filter_by(email=email).first()
        if user is None or not user.password_hash:
            return jsonify({"error": "Invalid credentials"}), 401

        try:
            password_ok = bool(bcrypt.check_password_hash(user.password_hash, password))
        except (TypeError, ValueError):
            password_ok = False

        if not password_ok:
            return jsonify({"error": "Invalid credentials"}), 401

        login_user(user)
        return jsonify(_serialize_user(user))
    except Exception as e:
        current_app.logger.exception("/auth/login failed: %s", e)
        return jsonify({"error": "Login temporarily unavailable"}), 500


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
@login_required
def toggle_favorite():
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


# ── Backward-compat alias: /api/search → same logic as /api/v1/search ──────────
@compat_bp.get("/search")
def compat_search():
    raw_query   = request.args.get('q', '').strip()[:150]
    category    = request.args.get('category', 'All')
    pricing     = request.args.get('pricing', 'All')
    student     = request.args.get('student_only', 'false') == 'true'
    trending    = request.args.get('trending_only', 'false') == 'true'
    sort_by     = request.args.get('sort', 'Relevance')

    output = search_tools(
        raw_query=raw_query,
        category_filter=category,
        pricing_filter_ui=pricing,
        student_only=student,
        trending_only=trending,
        sort_by=sort_by
    )
    return jsonify(output)


@compat_bp.get("/tools")
def list_all_tools_compat():
    """Compat alias at /api/tools."""
    from app.tool_cache import get_cached_tools
    try:
        tools = get_cached_tools()
    except Exception:
        tools = []
    return jsonify({
        "results": tools,
        "total": len(tools),
        "fallback": not bool(tools)
    })
