import json
import os
import re
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, render_template, request, session
from flask_login import current_user, login_required

from app import db
from app.models import Favorite, ToolView
from app.recommendations import recommend_tools


main_bp = Blueprint("main", __name__)

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tools.json")


def load_tools():
    with open(DATA_PATH, "r", encoding="utf-8") as file:
        payload = json.load(file)
    if isinstance(payload, dict):
        return payload.get("tools", [])
    return payload


def normalize_tool(tool):
    item = dict(tool)
    item["tool_key"] = build_tool_key(item)
    return item


def build_tool_key(tool):
    name = str(tool.get("name", "")).strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
    if slug:
        return slug

    raw_id = tool.get("id")
    if raw_id is not None:
        return str(raw_id)

    return "unknown"


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


def get_favorite_tool_keys(user_id):
    rows = Favorite.query.filter_by(user_id=user_id).all()
    return {row.tool_id for row in rows}


def get_view_map():
    rows = ToolView.query.all()
    return {row.tool_id: row.views for row in rows}


@main_bp.route("/")
def index():
    favorite_ids = []
    if current_user.is_authenticated:
        favorite_ids = list(get_favorite_tool_keys(current_user.id))

    return render_template(
        "index.html",
        favorite_ids=favorite_ids,
        is_authenticated=current_user.is_authenticated,
    )


@main_bp.route("/dashboard")
@login_required
def dashboard():
    tools = [normalize_tool(tool) for tool in load_tools()]
    by_key = {tool["tool_key"]: tool for tool in tools}
    view_map = get_view_map()

    favorite_keys = get_favorite_tool_keys(current_user.id)
    favorite_tools = [by_key[key] for key in favorite_keys if key in by_key]

    recent_keys = session.get("recent_tools", [])
    recent_tools = [by_key[key] for key in recent_keys if key in by_key][:8]

    recommended_tools = recommend_tools(tools, favorite_tools, limit=8)
    trending_ranked = sorted(
        tools,
        key=lambda item: trending_score(item, views=view_map.get(item["tool_key"], 0)),
        reverse=True,
    )
    trending_tools = trending_ranked[:8]

    return render_template(
        "dashboard.html",
        favorite_tools=favorite_tools,
        recent_tools=recent_tools,
        recommended_tools=recommended_tools,
        trending_tools=trending_tools,
    )


@main_bp.route("/compare")
def compare():
    tools = [normalize_tool(tool) for tool in load_tools()]
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
    )


@main_bp.route("/api/tools")
def api_tools():
    tools = [normalize_tool(tool) for tool in load_tools()]
    return jsonify(tools)


@main_bp.route("/api/tools/trending")
def api_tools_trending():
    tools = [normalize_tool(tool) for tool in load_tools()]
    view_map = get_view_map()

    ranked = []
    for tool in tools:
        views = view_map.get(tool["tool_key"], 0)
        ranked.append((trending_score(tool, views=views), tool))

    ranked.sort(key=lambda item: item[0], reverse=True)
    top = [tool for _, tool in ranked[:10]]
    return jsonify(top)


@main_bp.route("/api/tools/category/<category>")
def api_tools_category(category):
    tools = [normalize_tool(tool) for tool in load_tools()]
    filtered = [tool for tool in tools if str(tool.get("category", "")).lower() == category.lower()]
    return jsonify(filtered)


@main_bp.route("/api/tools/<tool_id>")
def api_tool_detail(tool_id):
    tool = get_tool_by_key(tool_id)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404
    return jsonify(tool)


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

    view_row = ToolView.query.filter_by(tool_id=tool_id).first()
    if not view_row:
        view_row = ToolView(tool_id=tool_id, views=0)
        db.session.add(view_row)

    view_row.views += 1
    db.session.commit()

    recent_tools = session.get("recent_tools", [])
    recent_tools = [item for item in recent_tools if item != tool_id]
    recent_tools.insert(0, tool_id)
    session["recent_tools"] = recent_tools[:12]

    return jsonify({"ok": True, "views": view_row.views})
