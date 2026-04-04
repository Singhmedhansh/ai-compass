import os
import re

from flask import Blueprint, jsonify, request
from flask_login import current_user

from app.search_utils import search_tools
from app.services.recommendation_service import recommend_tools
from app.tool_cache import get_cached_tools

api_bp = Blueprint("api", __name__, url_prefix="/api/v1")

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tools.json")


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


@api_bp.get("/tools")
def list_tools():
    return jsonify(_load_tools())


@api_bp.get("/tools/<slug>")
def get_tool(slug: str):
    slug_value = str(slug or "").strip().lower()
    tools = _load_tools()

    for tool in tools:
        if _tool_slug(tool) == slug_value:
            return jsonify(tool)

    return jsonify({"error": "Tool not found"}), 404


@api_bp.get("/search")
def search_tools_endpoint():
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify([])

    results = search_tools(_load_tools(), query, user=current_user if current_user.is_authenticated else None)
    return jsonify(results)


@api_bp.get("/recommendations")
def recommendations():
    ranked = recommend_tools(
        _load_tools(),
        favorite_tools=[],
        limit=6,
        user=current_user if current_user.is_authenticated else None,
    )
    return jsonify(ranked)


@api_bp.get("/auth/me")
def auth_me():
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401

    return jsonify(
        {
            "id": current_user.id,
            "email": current_user.email,
            "display_name": current_user.display_name,
            "is_admin": bool(getattr(current_user, "is_admin", False)),
            "student_status": bool(getattr(current_user, "student_status", False)),
        }
    )
