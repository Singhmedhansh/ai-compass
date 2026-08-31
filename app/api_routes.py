import importlib.util
import json
import os
import re
from difflib import SequenceMatcher
import subprocess
import sys
import threading
import time
from collections import Counter
from datetime import datetime, timedelta, timezone

import requests
from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from html import escape as html_escape

from app import bcrypt, cache, csrf, db
from app.ml_recommender import clear_model_cache, get_similar_tools, load_model
from app.models import Favorite, Rating, Review, ToolRating, User, ReviewVote
from app.rate_limit import is_rate_limited
from app.search_utils import search_tools, llm_fallback_search
from app.tool_cache import (
    DEFAULT_TOOLS_PATH,
    TOOL_CACHE,
    _sponsored_active,
    apply_editorial_blurb,
    get_cached_tools,
    get_visible_tools,
)

api_bp = Blueprint("api", __name__)
compat_bp = Blueprint("compat", __name__)  # registered at /api for backward compat

DATA_PATH = DEFAULT_TOOLS_PATH
STACKS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "stacks")
MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "recommendation_model.pkl")

GOAL_CATEGORY_MAP = {
    "learning": ["courses & tutorials", "research", "productivity"],
    "coding": ["coding"],
    "writing": ["writing & chat"],
    "research": ["research"],
    "creating": ["image generation", "video generation", "audio & voice", "design & graphics"],
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


def _normalize_search_terms(raw_value: str) -> list[str]:
    terms: list[str] = []
    for part in re.split(r"[\n,;|]+", raw_value or ""):
        normalized = re.sub(r"\s+", " ", part).strip().lower()
        if normalized:
            terms.append(normalized)
    return terms


def _tool_matches_search_terms(tool: dict, terms: list[str]) -> bool:
    if not terms:
        return False

    searchable_parts = [
        tool.get("name"),
        tool.get("description"),
        tool.get("summary"),
        tool.get("shortDescription"),
        tool.get("category"),
        tool.get("subCategory"),
        tool.get("tagline"),
        " ".join(str(tag) for tag in (tool.get("tags") or [])),
        " ".join(str(item) for item in (tool.get("use_cases") or [])),
    ]
    searchable_blob = " ".join(str(part).lower() for part in searchable_parts if part)
    return any(term in searchable_blob for term in terms)


QUESTION_INTENT_RE = re.compile(
    r"\b(is it possible|can i|should i|how to|how do i|what is the best way|is there a way)\b",
    re.IGNORECASE,
)


def _looks_like_question_intent(raw_query: str) -> bool:
    return bool(QUESTION_INTENT_RE.search(raw_query or ""))


def _safe_float(v):
    try:
        if v in (None, "", "N/A"):
            return 0.0
        return float(v)
    except (ValueError, TypeError):
        return 0.0

def _safe_int(v):
    try:
        if v in (None, "", "N/A"):
            return 0
        return int(v)
    except (ValueError, TypeError):
        return 0


def _local_fuzzy_search(raw_query: str, limit: int = 10, threshold: float = 0.72) -> list[dict]:
    query = str(raw_query or "").strip().lower()
    if len(query) < 2:
        return []

    try:
        tools = get_visible_tools(DATA_PATH)
    except Exception:
        tools = []

    ranked: list[tuple[float, dict]] = []
    for tool in tools:
        if tool.get("hidden"):
            continue

        name = str(tool.get("name") or "").strip().lower()
        slug = str(tool.get("slug") or "").strip().lower().replace("-", " ")
        candidates = [candidate for candidate in (name, slug) if candidate]
        if not candidates:
            continue

        best_score = max(SequenceMatcher(None, query, candidate).ratio() for candidate in candidates)
        if best_score >= threshold:
            ranked.append((best_score, tool))

    # Query relevance stays the primary key — paid placement is only a
    # tie-break between comparably-matching tools. Letting sponsorship
    # outrank the match score would surface an unrelated paid tool above the
    # thing someone actually searched for.
    ranked.sort(
        key=lambda item: (item[0],) + _placement_rank(item[1]),
        reverse=True,
    )

    return [{**tool, "_score": round(score * 100, 2), "_match_type": "fuzzy"} for score, tool in ranked[:limit]]


def _search_catalog_tools(raw_query: str, category: str, pricing: str, student_only: bool, trending_only: bool, sort_by: str, actually_free: bool = False, open_source: bool = False, self_hosted: bool = False, pay_as_you_go: bool = False) -> dict:
    if not raw_query:
        return search_tools(
            raw_query=raw_query,
            category_filter=category,
            pricing_filter_ui=pricing,
            student_only=student_only,
            trending_only=trending_only,
            sort_by=sort_by,
            actually_free=actually_free,
            open_source=open_source,
            self_hosted=self_hosted,
            pay_as_you_go=pay_as_you_go,
        )

    try:
        tools = get_visible_tools(DATA_PATH)
    except Exception:
        tools = []

    selected_category = None if category in ("All", "", None) else category
    selected_pricing = None if pricing in ("All", "", None) else pricing.lower()

    filtered_tools: list[dict] = []
    for tool in tools:
        tool_pricing = str(tool.get("pricing", "freemium")).lower()
        if selected_pricing and tool_pricing != selected_pricing:
            continue
        if selected_category and tool.get("category") != selected_category:
            continue
        if student_only and not (tool.get("student_perk") or tool.get("studentPerk")):
            continue
        if actually_free and tool_pricing not in ("free", "freemium"):
            continue
        if trending_only and not tool.get("trending"):
            continue
        if open_source and not (tool.get("openSource") or tool.get("open_source")):
            continue
        if self_hosted and not any(p.lower() in ("self-hosted", "local", "docker", "local os", "linux") for p in tool.get("platforms", [])):
            continue
        if pay_as_you_go and not ("pay-as-you-go" in str(tool.get("pricingDetail") or "").lower() or "pay-as-you-go" in str(tool.get("pricing") or "").lower() or "usage-based" in str(tool.get("pricingDetail") or "").lower()):
            continue
        filtered_tools.append(tool)

    def _handle_llm_response(llm_resp):
        from app.ml_recommender import clear_model_cache
        
        llm_slugs = llm_resp.get("slugs", [])
        llm_msg = llm_resp.get("message", "")
        new_tools = llm_resp.get("new_tools", [])
        
        if new_tools:
            try:
                # We dynamically assign IDs and slugs and add them to the in-memory tools list
                # for the current session/cache, but we DO NOT write them to tools.json on disk
                # to prevent persistent database pollution.
                max_id = max((t.get('id', 0) for t in tools), default=0)
                for nt in new_tools:
                    max_id += 1
                    nt['id'] = max_id
                    nt['slug'] = nt.get('slug', '').lower().replace(' ', '-')
                    tools.append(nt) # add to memory
                    llm_slugs.append(nt['slug'])
                clear_model_cache()
            except Exception as e:
                print(f"Failed to add new tools dynamically: {e}")

        if llm_slugs:
            llm_results = []
            for slug in llm_slugs:
                matched = next((t for t in tools if t.get("slug") == slug), None)
                if matched:
                    llm_results.append({**matched, "_score": 100, "_match_type": "llm"})
            return {
                "results": llm_results,
                "fallback": False,
                "fuzzy_matched": False,
                "fallback_detected": True,
                "llm_matched": True,
                "message": llm_msg,
                "original_query": raw_query,
                "total": len(llm_results),
            }
        return {
            "results": [],
            "fallback": False,
            "fuzzy_matched": False,
            "fallback_detected": True,
            "message": llm_msg or "We couldn't find any tools matching your search.",
            "original_query": raw_query,
            "total": 0,
        }

    is_complex_query = raw_query and len(raw_query.split()) >= 3 and not (selected_category or selected_pricing or student_only or trending_only)
    
    if is_complex_query:
        llm_resp = llm_fallback_search(raw_query, tools)
        if llm_resp.get("success") or llm_resp.get("slugs") or llm_resp.get("new_tools"):
            return _handle_llm_response(llm_resp)
        
        # If LLM search failed/skipped (e.g. no key), and it looks like a question, don't fall through to keyword search
        if _looks_like_question_intent(raw_query):
            return {
                "results": [],
                "fallback": False,
                "fuzzy_matched": False,
                "fallback_detected": True,
                "original_query": raw_query,
                "total": 0,
            }

    output = search_tools(
        raw_query=raw_query,
        category_filter=category,
        pricing_filter_ui=pricing,
        student_only=student_only,
        trending_only=trending_only,
        sort_by=sort_by,
        limit=50,
        actually_free=actually_free,
    )
    if "fallback" in output:
        output["fallback_detected"] = output["fallback"]
    return output



@api_bp.get("/tools/by-tags")
def tools_by_tags():
    raw_tags = request.args.get("tags", "").strip()
    terms = _normalize_search_terms(raw_tags)

    try:
        tools = get_visible_tools(DATA_PATH)
    except Exception:
        tools = []

    matched_tools: list[dict] = []
    for tool in tools:
        if _tool_matches_search_terms(tool, terms):
            matched_tools.append(tool)

    # Every tool here already matched the query, so promoting sponsored ones
    # within that matched set is the placement being sold — and the client
    # labels them "Sponsored", so it's disclosed rather than hidden.
    matched_tools.sort(key=_placement_rank, reverse=True)

    payload = {
        "results": [_card_projection(tool) for tool in matched_tools],
        "total": len(matched_tools),
        "fallback": False,
        "fallback_detected": not bool(matched_tools),
        "original_query": raw_tags,
        "query_tags": terms,
    }
    return jsonify(payload)


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
                suggestions.append({
                    "type": "tool",
                    "label": name,
                    "slug": tool.get("slug") or _tool_slug(tool),
                    "sub": tool.get("category", ""),
                    "icon": tool.get("logo_emoji", ""),
                    "link": tool.get("link", "")
                })
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
    
    allow = current_app.config.get("ADMIN_EMAILS", [])
    is_admin = bool(getattr(user, "is_admin", False)) or (
        str(user.email or "").strip().lower() in allow
    )

    interests_list = [x.strip() for x in (user.interests or "").split(",") if x.strip()]
    goals_list = [x.strip() for x in (user.goals or "").split(",") if x.strip()]

    # "Founder account" isn't a stored flag — it's just whether any
    # Submission points founder_user_id at this user (see
    # app/founder_accounts.py). Computing it here keeps the FK the single
    # source of truth instead of drifting a redundant column out of sync.
    from app.models import Submission
    is_founder = db.session.query(
        Submission.query.filter_by(founder_user_id=user.id).exists()
    ).scalar()

    return {
        "id": user.id,
        "name": user.display_name or "",
        "email": user.email,
        "picture": user.oauth_picture_url or "",
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "member_since": member_since,
        "is_admin": is_admin,
        "must_change_password": bool(getattr(user, "must_change_password", False)),
        "is_founder": bool(is_founder),
        "is_verified": bool(getattr(user, "is_verified", False)),
        "onboarding_completed": bool(getattr(user, "onboarding_completed", False)),
        "interests": interests_list,
        "skill_level": user.skill_level or "",
        "pricing_pref": user.pricing_pref or "",
        "goals": goals_list,
        "student_status": bool(getattr(user, "student_status", False)),
        "preferences": user.preferences or "{}",
    }


def _normalize_text(value) -> str:
    return str(value or "").strip().lower()


def _as_choice_list(value) -> list[str]:
    """Accepts a single str, a list of str, or falsy; returns a normalized list."""
    if isinstance(value, list):
        return [_normalize_text(item) for item in value if item]
    return [_normalize_text(value)] if value else []


def _pricing_value(tool: dict) -> str:
    return _normalize_text(
        tool.get("pricing")
        or tool.get("price")
        or tool.get("pricingType")
    )


def _rating_value(tool: dict) -> float:
    # Ratings are no longer fabricated, so real review-backed ratings are
    # usually 0. Fall back to the honest internal curation_score so
    # "top rated", related tools, and collection ordering stay meaningful.
    try:
        rating = float(tool.get("rating", 0) or 0)
    except (TypeError, ValueError):
        rating = 0.0
    if rating > 0:
        return rating
    try:
        return float(tool.get("curation_score", 0) or 0) / 20.0
    except (TypeError, ValueError):
        return 0.0


def _normalize_budget_choice(budget: str) -> str:
    value = _normalize_text(budget)
    if value == "any":
        return "paid"
    if value in {"free", "freemium", "paid"}:
        return value
    return "freemium"


def _tool_supports_platform(tool: dict, platform) -> bool:
    platform_keys = _as_choice_list(platform)
    if not platform_keys:
        return True

    aliases = {
        "web": {"web", "browser"},
        "mobile": {"mobile", "ios", "android"},
        "desktop": {"desktop", "windows", "mac", "linux"},
        "api": {"api", "sdk", "cli"},
    }
    wanted = set()
    for key in platform_keys:
        wanted.update(aliases.get(key, {key}))
    supported = {_normalize_text(item) for item in (tool.get("platforms") or [])}
    if not supported:
        return False

    for item in supported:
        if any(alias in item for alias in wanted):
            return True
    return False


FINDER_GOAL_CATEGORY_MAP = {
    "learning": [
        "courses & tutorials", "research", "productivity", "education",
        "research & study", "research & productivity", "study tools"
    ],
    "coding": [
        "coding", "coding & programming", "development", "developer tools"
    ],
    "writing": [
        "writing & chat", "email & communication", "writing & docs"
    ],
    "research": [
        "research", "research & study", "research & productivity", "education"
    ],
    "creating": [
        "image generation", "video generation", "audio & voice", "design & graphics",
        "video & animation", "design & creative", "video & audio", "audio & video", "design"
    ],
    "productivity": [
        "productivity", "research & productivity", "email & communication", "business operations"
    ]
}


# Defense-in-depth tag veto. The category hard-gate above filters by
# tools.json's `category` field, but that field has ~60 mis-labels
# (Suno tagged Coding, Power BI tagged Coding, courses tagged Video
# Generation, etc.). A tool only passes if its tags or use_cases also
# contain a keyword relevant to the chosen goal. Until the catalog
# audit lands, this stops mis-tagged tools from surfacing as top
# recommendations.
FINDER_GOAL_KEYWORDS = {
    "coding": [
        "code", "coding", "programming", "program", "developer", "develop",
        "github", "gitlab", "git ", "vcs", "version control", "pull request",
        "vscode", "neovim", "intellij", "pycharm", "webstorm", "sublime text",
        "ide ",
        "debug", "debugging", "autocomplete", "autocompletion",
        "sdk", "framework", "compiler", "interpreter",
        "terminal", "cli", "shell", "bash", "zsh",
        "npm", "yarn", "pnpm", "package manager", "pip install",
        "repository", "devops", "devtools",
        "backend", "frontend", "fullstack", "full-stack", "full stack",
        "script", "scripting",
        "python", "javascript", "typescript", "kotlin", "swift",
        "golang", "rust", "c++", "c#", "ruby", "php",
        "react", "vue", "angular", "node.js", "nodejs",
        "next.js", "nextjs", "django", "flask", "rails", "spring",
        "express", "deno",
        "runtime", "kubernetes", "docker", "container",
        "deploy", "deployment", "ci/cd", "cicd",
        "lint", "linter", "unit test", "integration test", "pytest", "jest",
        "open source", "opensource",
        "llm framework", "ml framework", "ai framework", "agent framework",
        "rag", "vector database", "embeddings",
        "fastapi", "oauth", "jwt",
        "no-code", "no code", "low-code", "low code",
        "browser extension", "chrome extension",
        "machine learning", "data engineering",
        "scraping", "web scraping", "ai agent", "agentic",
    ],
    "writing": [
        "writ", "chat", "chatbot", "essay", "draft", "grammar", "spell",
        "paraphras", "summariz", "summary", "rewrit", "rephras",
        "language", "languag", "text", "prose", "copywrit",
        "blog", "article", "story", "storytelling", "narrative",
        "creative writ", "email", "newsletter", "letter", "memo",
        "report", "doc", "documentation", "note", "notebook", "journal",
        "edit", "editor", "llm", "assistant", "conversation",
        "translation", "translat", "transcrib", "voice to text",
        "outline", "structure", "thesis", "academic writing",
        "tone of voice", "seo content", "marketing copy", "ad copy",
        "social media post", "caption", "headline", "title",
        "completion", "ai writer", "fiction", "non-fiction",
    ],
    "research": [
        "research", "literature", "literatur", "paper", "papers", "scholar",
        "academic", "citation", "cite", "reference", "bibliograph",
        "scientific", "science", "study", "studie", "thesis",
        "dissertation", "abstract", "journal", "synthesis",
        "systematic review", "meta-analysis", "knowledge",
        "fact-check", "factchecking", "factual", "verify", "evidence",
        "data analysis", "statistics", "summariz", "extraction",
        "find papers", "literature review", "qualitative", "quantitative",
        "survey", "dataset", "data set", "wiki", "answer engine",
        "information retrieval", "rag", "perplexity", "explainer",
        "deep dive", "search engine",
    ],
    "creating": [
        # Image generation
        "image", "photo", "picture", "art", "illustration", "draw",
        "render", "rendering", "diffusion", "stable diffusion", "midjourney",
        "ai art", "ai-generated", "text-to-image", "text to image",
        # Video generation
        "video", "film", "animation", "animate", "edit video",
        "video editing", "vfx", "motion", "scene", "clip", "subtitle",
        "transcript",
        # Design & graphics
        "design", "designer", "graphic", "logo",
        "brand", "branding", "visual", "thumbnail", "poster", "wallpaper",
        "icon", "ui design", "ux design", "ui ", " ui", "ux ", " ux",
        "mockup", "wireframe", "prototype", "layout",
        "vector", "vector graphics", "vector design",
        "figma", "canva", "adobe", "photoshop", "sketch",
        "presentation", "slide", "slides", "deck", "pitch deck",
        "infographic", "diagram", "diagrams",
        # Audio & voice
        "music", "song", "songs", "songwrit",
        "audio", "voice", "voices", "voiceover", "tts", "speech",
        "podcast", "podcasts", "sound", "compose", "composition",
        "instrument", "instruments", "vocal", "vocals",
        "track", "remix", "beat", "audio editing",
        "voice cloning", "voice clone", "ai voice",
        # Creator/social umbrella
        "youtube", "tiktok", "shorts", "reels", "social media",
        "content creation", "creative", "create", "generative",
        "3d", "modeling", "avatar", "character",
    ],
    "productivity": [
        "productivity", "task", "todo", "to-do", "to do", "kanban",
        "project management", "calendar", "schedule", "scheduling",
        "meeting", "meetings", "agenda", "minutes", "transcrib",
        "note", "notes", "notebook", "journal", "second brain",
        "knowledge management", "memo", "doc", "documentation",
        "workflow", "workflows", "automation", "automate", "zapier",
        "integration", "trigger", "workspace", "team", "collaboration",
        "collaborat", "communication", "communicat", "messaging",
        "channel", "thread", "async", "focus", "pomodoro", "timer",
        "habit", "tracker", "tracking", "planner", "planning",
        "email", "inbox", "reminder", "spreadsheet", "sheet", "table",
        "database", "crm", "form builder", "online form", "survey",
        "poll", "screen recording", "screen record", "loom",
        "video message", "presentation", "slide", "deck", "pitch", "wiki",
        "data visualization", "data viz", "dashboard", "analytics",
        "business intelligence", "bi tool", "report", "reporting",
    ],
    "learning": [
        # Courses & Tutorials primary signal
        "course", "courses", "online course", "online courses",
        "tutorial", "tutorials", "lesson", "lessons", "lecture", "lectures",
        "curriculum", "syllabus", "mooc", "moocs",
        "learning platform", "elearning", "e-learning",
        "courseware", "instructor", "instructors",
        "udemy", "coursera", "edx", "khan academy", "freecodecamp",
        "mit ocw", "opencourseware", "cs50",
        "exam prep", "test prep",
        # Study/general learning
        "study", "studie", "studying", "student", "school", "college",
        "university", "campus", "class", "classes", "classroom",
        "learn", "learning", "education", "educational", "edtech",
        "homework", "assignment", "exam",
        "quiz", "flashcard", "flashcards", "spaced repetition",
        "anki", "memoriz", "retention",
        "tutor", "tutoring", "teach", "teaching",
        "explain", "explainer", "concept", "subject", "topic",
        "math", "physics", "chemistry", "biology", "history",
        "language learning", "vocabulary",
        # Research overlap (allowed cat)
        "research", "paper", "essay", "thesis", "academic", "scholar",
        "reading", "summariz",
        # Productivity overlap (allowed cat)
        "note-taking", "note taking", "notes",
        "knowledge", "skill", "stem", "task", "todo", "planner",
        "calendar", "focus", "pomodoro", "habit", "tracker",
        "workflow", "organization",
    ],
}


def _tool_passes_category_keyword_veto(tool: dict, goal: str) -> bool:
    keywords = FINDER_GOAL_KEYWORDS.get(goal)
    if not keywords:
        return True

    tags = tool.get("tags") or []
    use_cases = tool.get("use_cases") or []

    # Neutral-tools policy: thin metadata gets benefit of the doubt as long
    # as a description exists. Stub entries with no description still get
    # vetoed.
    if (len(tags) + len(use_cases)) < 3 and str(tool.get("description") or "").strip():
        return True

    blob = " ".join(
        str(item).lower() for item in (
            tool.get("name") or "",
            tool.get("description") or "",
            *(tags or []),
            *(use_cases or [])
        )
    )
    return any(keyword in blob for keyword in keywords)


CATEGORY_USE_CASE_DEFAULTS = {
    "coding": "coding tasks",
    "writing & chat": "writing tasks",
    "research": "research",
    "image generation": "image generation",
    "productivity": "productivity",
    "video generation": "video creation",
    "audio & voice": "audio creation",
    "courses & tutorials": "learning",
    "design & graphics": "design work",
}


def _format_review_count(count: int) -> str:
    if count >= 10000:
        return f"{count // 1000}K"
    if count >= 1000:
        return f"{count / 1000:.1f}K"
    return str(count)


def _build_finder_reason(tool: dict, use_case: str, normalized_budget: str) -> str:
    pricing = _pricing_value(tool)
    if pricing in {"free", "freemium"}:
        pricing_word = "free"
    elif pricing == "paid":
        pricing_word = "paid"
    else:
        pricing_word = ""

    category = str(tool.get("category") or "").strip() or "AI"

    user_supplied_use_case = bool((use_case or "").strip())
    use_case_text = (use_case or "").strip()
    if not use_case_text:
        use_case_text = CATEGORY_USE_CASE_DEFAULTS.get(category.lower(), f"{category.lower()} tasks")

    parts = ["Best"]
    if pricing_word:
        parts.append(pricing_word)
    parts.extend([category, "tool"])

    # Skip the redundant "for <use_case>" clause when the fallback string
    # restates the category (e.g. Research → "research", Productivity →
    # "productivity"). Keep it whenever the user typed a use_case.
    category_lower = category.lower()
    fallback_is_redundant = (
        not user_supplied_use_case
        and (use_case_text == category_lower or use_case_text in category_lower or category_lower in use_case_text)
    )
    if not fallback_is_redundant:
        parts.extend(["for", use_case_text])

    base = " ".join(parts)

    try:
        rating_value = float(tool.get("rating") or 0)
    except (TypeError, ValueError):
        rating_value = 0.0

    try:
        review_count = int(tool.get("review_count") or 0)
    except (TypeError, ValueError):
        review_count = 0

    if rating_value > 0 and review_count > 0:
        return f"{base} — {rating_value:.1f}★ from {_format_review_count(review_count)} users"

    return base


SYNONYM_MAP = {
    "essay": ["writing", "academic writing", "essay", "paper", "literature review", "thesis", "citations"],
    "blog": ["writing", "blog", "content", "seo", "article", "copywriting"],
    "code": ["coding", "programming", "software", "development", "debugging", "developer", "ide"],
    "develop": ["coding", "programming", "software", "development", "debugging", "developer", "ide"],
    "video": ["video editing", "subtitle", "transcribe", "film", "animation", "video generation"],
    "design": ["presentation", "slideshow", "design", "graphics", "ui", "ux", "logo", "figma"],
    "ui": ["presentation", "slideshow", "design", "graphics", "ui", "ux", "logo", "figma"],
    "notes": ["notetaking", "summarize", "summarization", "organization", "notebook", "notes"],
    "study": ["research", "homework", "exam", "quiz", "academic", "study"],
}

def _finder_tool_score(tool: dict, goal, budget: str, platform, level: str, use_case: str) -> tuple[float, dict]:
    goals = _as_choice_list(goal)
    platforms = _as_choice_list(platform)

    category = _normalize_text(tool.get("category"))
    allowed_categories = set()
    for g in goals:
        allowed_categories.update(_normalize_text(cat) for cat in FINDER_GOAL_CATEGORY_MAP.get(g, []))

    breakdown = {
        "category": False,
        "budget": False,
        "platform": False,
        "experience": False,
        "use_case": False
    }

    if allowed_categories and category not in allowed_categories:
        return 0.0, breakdown

    if goals and not any(_tool_passes_category_keyword_veto(tool, g) for g in goals):
        return 0.0, breakdown

    score = 35.0

    if category in allowed_categories:
        score += 45.0
        breakdown["category"] = True

    tool_tags = [str(tag).lower() for tag in (tool.get("tags") or [])]
    tool_text = " ".join(
        [
            str(tool.get("name") or ""),
            str(tool.get("description") or ""),
            " ".join(tool_tags),
            " ".join(str(item) for item in (tool.get("use_cases") or [])),
        ]
    ).lower()

    if use_case:
        use_case_lower = use_case.lower().strip()
        matched_use_case = False
        
        # Fuzzy match using rapidfuzz token_set_ratio
        try:
            from rapidfuzz import fuzz
            sim = fuzz.token_set_ratio(use_case_lower, tool_text)
            if sim >= 80:
                score += 35.0
                matched_use_case = True
            elif sim >= 50:
                score += 20.0
                matched_use_case = True
            elif sim >= 30:
                score += 10.0
                matched_use_case = True
        except ImportError:
            use_case_tokens = [token for token in re.split(r"[^a-z0-9]+", use_case_lower) if token]
            if use_case_lower in tool_text:
                score += 28.0
                matched_use_case = True
            elif any(token in tool_text for token in use_case_tokens):
                score += 14.0
                matched_use_case = True
                
            synonym_boosted = False
            for token in use_case_tokens:
                if token in SYNONYM_MAP:
                    for syn in SYNONYM_MAP[token]:
                        if syn in tool_text:
                            score += 10.0
                            synonym_boosted = True
                            matched_use_case = True
                            break
                    if synonym_boosted:
                        break
        
        if matched_use_case:
            breakdown["use_case"] = True

    normalized_budget = _normalize_budget_choice(budget)
    pricing = _pricing_value(tool)
    pricing_bonus = {
        ("free", "free"): 24.0,
        ("free", "freemium"): 12.0,
        ("free", "paid"): -18.0,
        ("freemium", "free"): 18.0,
        ("freemium", "freemium"): 18.0,
        ("freemium", "paid"): -8.0,
        ("paid", "free"): 8.0,
        ("paid", "freemium"): 10.0,
        ("paid", "paid"): 14.0,
    }
    bonus = pricing_bonus.get((normalized_budget, pricing), 0.0)
    score += bonus
    if bonus >= 0:
        breakdown["budget"] = True

    tool_platforms = [str(platform_value).lower() for platform_value in (tool.get("platforms") or [])]
    platform_hits = {
        "web": ["web"],
        "mobile": ["ios", "android", "mobile"],
        "desktop": ["windows", "mac", "linux", "desktop"],
        "api": ["api", "sdk", "cli"],
    }
    if platforms:
        matched_platform = False
        for plat in platforms:
            candidates = platform_hits.get(plat, [plat])
            if any(c in tool_platforms for c in candidates):
                matched_platform = True
                break
        if matched_platform:
            score += 18.0
            breakdown["platform"] = True
        else:
            score -= 14.0
    else:
        breakdown["platform"] = True

    if level in ("beginner", "novice"):
        if any(tag in tool_tags for tag in ["beginner-friendly", "no-code", "easy"]):
            score += 18.0
            breakdown["experience"] = True
        elif not any(tag in tool_tags for tag in ["advanced", "developer"]):
            breakdown["experience"] = True
    elif level in ("advanced", "expert"):
        if any(tag in tool_tags for tag in ["api", "open-source", "advanced", "developer"]):
            score += 18.0
            breakdown["experience"] = True
    else:
        breakdown["experience"] = True

    # Student Perks Boost
    if tool.get("studentPerk") or tool.get("student_perk") or any(tag in tool_tags for tag in ["student-discount", "student-deal", "education-discount"]):
        score += 15.0

    score += _rating_value(tool) * 4.0

    if tool.get("featured"):
        score += 4.0
    if tool.get("trending"):
        score += 4.0

    review_count = 0
    try:
        review_count = int(tool.get("review_count", 0) or 0)
    except (TypeError, ValueError):
        review_count = 0

    if review_count >= 10000:
        score += 5.0
    elif review_count >= 1000:
        score += 3.0

    return score, breakdown


def _rank_finder_tools(tools: list[dict], goal, budget: str, platform, level: str, use_case: str, limit: int = 6) -> list[dict]:
    normalized_budget = _normalize_budget_choice(budget)
    platforms = _as_choice_list(platform)
    scored = []

    for tool in tools:
        score, breakdown = _finder_tool_score(tool, goal, budget, platform, level, use_case)
        if score > 0:
            scored.append((tool, score, breakdown))

    scored.sort(key=lambda item: item[1], reverse=True)

    platform_matched = [item for item in scored if _tool_supports_platform(item[0], platforms)]
    if platforms and len(platform_matched) >= 3:
        leftovers = [item for item in scored if not _tool_supports_platform(item[0], platforms)]
        scored = platform_matched + leftovers

    results = []
    for tool, score, breakdown in scored[:limit]:
        # Calculate a dynamic and realistic match confidence (between 70% and 99%)
        # A typical good match score is around 140-160, and a perfect match score with high rating,
        # custom use-case match, and featured/trending status can reach 190+.
        # We scale the score dynamically and apply a slight penalty if the custom use-case didn't match.
        base_confidence = 70.0
        
        # Scale based on a realistic maximum score of 195.0
        ratio = min(max(score / 195.0, 0.0), 1.0)
        calc_confidence = base_confidence + (ratio * 28.0)
        
        # If the user provided a custom use case but this tool didn't match the specifics,
        # apply a penalty and cap it so it doesn't show an artificially high match.
        if use_case and not breakdown.get("use_case", False):
            calc_confidence = min(calc_confidence, 84.0)
            # Add a small variance based on rating to avoid flat identical scores
            rating_val = _rating_value(tool)
            calc_confidence -= (5.0 - rating_val) * 2.0
            
        confidence = int(min(max(calc_confidence, 70.0), 99.0))
        results.append(
            {
                **tool,
                "match_score": round(score, 2),
                "match_confidence": confidence,
                "match_breakdown": breakdown,
                "reason": _build_finder_reason(tool, use_case, normalized_budget),
            }
        )

    return results


# Fields the directory/list cards actually render (mirrors mapTool in
# frontend/src/pages/DirectoryPage.jsx). Requesting ?fields=card drops the
# heavy per-tool payload — pricing_tiers, features, use_cases, strengths,
# tags, platforms, long description — which the list view never shows. This
# cuts /api/v1/tools from ~1MB to a few hundred KB (faster transfer, parse,
# and server serialize/compress). The full payload stays the default for
# the admin panel and dashboard.
_CARD_FIELDS = (
    "slug", "name", "shortDescription", "summary", "category", "subCategory",
    "rating", "averageRating", "average_rating",
    "review_count", "reviewCount", "reviews", "total_reviews",
    "pricing", "pricingType", "pricing_type", "pricing_tier", "pricingDetail",
    "createdAt", "created_at", "publishedAt", "published_at",
    "logo", "emoji", "icon", "logo_url", "logoUrl", "logo_emoji",
    "url", "website", "link", "accent_color", "tagline",
    "featured", "student_friendly", "trending", "sponsored", "sponsored_until",
    "curation_score", "popularity_score", "openSource", "open_source", "platforms",
    # Date of the last hand-test pass. Cards use it for the "Verified <Mon
    # YYYY>" chip shown when a tool has no real user reviews — a claim we can
    # actually back, unlike the synthetic student count it replaced.
    "last_verified_at",
)



# _sponsored_active lives in app/tool_cache.py now — apply_editorial_blurb()
# there needs it too, and importing api_routes.py from tool_cache.py would
# be circular. Imported below, not redefined.


def _placement_rank(tool: dict) -> tuple:
    """Sort key ordering paid placement above everything else.

    Sponsored first, then the editorial curation score, then the hand-picked
    'featured' flag as the tie-break it already was. Used with reverse=True.
    """
    return (
        1 if _sponsored_active(tool) else 0,
        _summary_score(tool),
        1 if tool.get("featured") else 0,
    )


def _card_projection(tool: dict) -> dict:
    # Sponsored-tier editorial blurb (if set and currently active) replaces
    # description/tagline before anything below reads them — see
    # apply_editorial_blurb() in tool_cache.py for why this happens here
    # rather than at normalization/storage time.
    tool = apply_editorial_blurb(tool)
    out = {k: tool[k] for k in _CARD_FIELDS if k in tool}
    # Send the *effective* flag so the client never has to reason about
    # subscription expiry dates.
    out["sponsored"] = _sponsored_active(tool)
    desc = tool.get("description")
    if isinstance(desc, str) and len(desc) > 240:
        desc = desc[:237].rstrip() + "…"
    if desc:
        out["description"] = desc
    return out


def _summary_score(tool: dict) -> float:
    for key in ("curation_score", "popularity_score", "rating", "averageRating", "average_rating"):
        value = tool.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return float("-inf")


def _rank_summary_tools(tools: list[dict], limit: int = 6) -> list[dict]:
    ordered = sorted(tools, key=_placement_rank, reverse=True)
    return [_card_projection(tool) for tool in ordered[:limit]]


def _directory_summary_payload(tools: list[dict]) -> dict:
    counts = Counter()
    for tool in tools:
        category = str(tool.get("category") or "").strip() or "Uncategorized"
        counts[category] += 1

    sections = []
    for canonical, total in sorted(counts.items(), key=lambda item: (-item[1], item[0].lower())):
        if total < 6:
            continue
        category_tools = [tool for tool in tools if str(tool.get("category") or "").strip() == canonical]
        sections.append({
            "canonical": canonical,
            "slug": re.sub(r"[^a-z0-9]+", "-", canonical.lower()).strip("-"),
            "total": total,
            "top": _rank_summary_tools(category_tools, 6),
        })

    featured_tools = [tool for tool in tools if tool.get("featured")]
    student_tools = featured_tools if len(featured_tools) >= 6 else [tool for tool in tools if tool.get("student_friendly")]

    return {
        "sections": sections,
        "studentTop": _rank_summary_tools(student_tools, 6),
        "total": len(tools),
        "results": [],
        "fallback": not bool(tools),
    }


@api_bp.get("/tools/sponsored")
@cache.cached(timeout=60, query_string=True)
def tools_sponsored():
    """Homepage 'Featured on AI Compass' strip. Reuses the existing paid-
    placement mechanism (_sponsored_active/_placement_rank/_card_projection)
    — no schema change, no new approval-flow logic. Returns an empty list
    when nobody's currently sponsored; the frontend renders nothing rather
    than fake placeholder inventory.
    """
    try:
        tools = get_visible_tools(DATA_PATH)
    except Exception:
        tools = []

    sponsored_tools = [tool for tool in tools if _sponsored_active(tool)]
    sponsored_tools.sort(key=_placement_rank, reverse=True)

    try:
        limit = int(request.args.get("limit", 8))
    except (TypeError, ValueError):
        limit = 8
    limit = max(1, min(limit, 24))

    results = [_card_projection(tool) for tool in sponsored_tools[:limit]]
    return jsonify({"results": results, "total": len(results)})


@api_bp.get("/tools")
@cache.cached(timeout=60, query_string=True)
def list_tools():
    from flask import make_response
    try:
        tools = get_visible_tools(DATA_PATH)
    except Exception:
        tools = []

    student_only = request.args.get("student_only", "false") == "true"
    actually_free = request.args.get("actually_free", "false") == "true"
    open_source = request.args.get("open_source", "false") == "true"
    self_hosted = request.args.get("self_hosted", "false") == "true"
    pay_as_you_go = request.args.get("pay_as_you_go", "false") == "true"

    if student_only:
        tools = [t for t in tools if t.get("student_perk") or t.get("studentPerk") or t.get("student_friendly")]
    if actually_free:
        tools = [t for t in tools if str(t.get("pricing", "freemium")).lower() in ("free", "freemium")]
    if open_source:
        tools = [t for t in tools if t.get("openSource") or t.get("open_source")]
    if self_hosted:
        tools = [t for t in tools if any(p.lower() in ("self-hosted", "local", "docker", "local os", "linux") for p in t.get("platforms", []))]
    if pay_as_you_go:
        tools = [t for t in tools if "pay-as-you-go" in str(t.get("pricingDetail") or "").lower() or "pay-as-you-go" in str(t.get("pricing") or "").lower() or "usage-based" in str(t.get("pricingDetail") or "").lower()]

    fields = request.args.get("fields")
    if fields == "summary":
        return jsonify(_directory_summary_payload(tools))
    if fields == "card":
        tools = [_card_projection(t) for t in tools]
    response = make_response(jsonify({"results": tools, "total": len(tools), "fallback": not bool(tools)}))
    # 60 seconds is enough to absorb back-to-back navigations on a single
    # session without making editorial edits invisible for an hour, which
    # is what the old max-age=3600 caused (a /admin save would land in the
    # DB instantly but the directory would keep serving the stale list
    # until the cache expired). stale-while-revalidate lets the browser
    # show the cached copy for up to 5 more minutes while refetching in
    # the background, so perceived nav stays snappy.
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return response


@api_bp.get("/student-discounts")
@cache.cached(timeout=60, query_string=True)
def get_student_discounts():
    from flask import make_response
    try:
        tools = get_visible_tools(DATA_PATH)
    except Exception:
        tools = []

    UNIDAYS_DEALS = {
        "adobe": "60% Off",
        "adobe firefly": "60% Off",
        "canva": "100% Free",
        "notion": "100% Free",
        "grammarly": "20% Off",
        "microsoft": "100% Free",
        "perplexity": "100% Free",
        "github": "100% Free",
        "github copilot": "100% Free",
        "quizlet": "33% Off",
        "codeium": "50% Off",
        "wolfram alpha": "35% Off",
        "spotify": "50% Off",
        "apple": "10% Off",
    }

    results = []
    for t in tools:
        if t.get("studentPerk") or t.get("student_perk"):
            pricing_detail = t.get("pricingDetail") or ""
            description = t.get("description") or ""
            name = t.get("name") or ""
            tagline = t.get("tagline") or ""
            link = t.get("link") or t.get("website") or t.get("url") or ""
            logo_emoji = t.get("logo_emoji") or t.get("emoji") or t.get("logoEmoji") or ""

            # 1. Determine UNiDAYS status and exact percentage
            unidays_verified = False
            discount_val = None

            name_lower = name.lower().strip()
            matched_deal_key = None
            for k in UNIDAYS_DEALS:
                if k in name_lower or name_lower in k:
                    matched_deal_key = k
                    break

            if matched_deal_key:
                unidays_verified = True
                discount_val = UNIDAYS_DEALS[matched_deal_key]
            else:
                all_text = f"{name} {tagline} {pricing_detail} {description}".lower()
                if "unidays" in all_text:
                    unidays_verified = True

            # 2. Extract discount percentage / label if not already mapped
            if not discount_val:
                pct_match = re.search(r"(\d+)\s*%", pricing_detail)
                if pct_match:
                    discount_val = f"{pct_match.group(1)}% Off"
                else:
                    pricing_lower = pricing_detail.lower()
                    desc_lower = description.lower()
                    if "free for students" in pricing_lower or "free for students" in desc_lower or "free student tier" in pricing_lower or "free student tier" in desc_lower or "free via .edu" in pricing_lower:
                        discount_val = "Free Student Tier"
                    elif "student discount" in pricing_lower or "student rate" in pricing_lower:
                        discount_val = "Student Discount"
                    elif "free" in pricing_lower:
                        discount_val = "Free Tier Available"
                    else:
                        discount_val = "Special Student Perk"

            results.append({
                "name": name,
                "slug": _tool_slug(t),
                "icon": t.get("icon"),
                "link": link,
                "logo_emoji": logo_emoji,
                "tagline": tagline,
                "category": t.get("category"),
                "pricing": t.get("pricing") or t.get("price"),
                "pricingDetail": pricing_detail,
                "rating": t.get("rating") or 0.0,
                "unidays_verified": unidays_verified,
                "discount_val": discount_val
            })

    # Sort: UNiDAYS verified first, then by rating (descending), then by name (ascending)
    results.sort(key=lambda x: (not x["unidays_verified"], -float(x["rating"] or 0), x["name"].lower()))

    response = make_response(jsonify({"results": results, "total": len(results)}))
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"
    return response


@api_bp.get("/partners")
@cache.cached(timeout=300, query_string=True)
def partner_units():
    """Labelled partner units for one high-intent page.

    ?surface=best-coding-tools | best-free-ai-tools |
             best-ai-tools-for-students | best-ai-tools-for-teachers |
             alternatives:<slug>

    Always 200 with a list, empty when nobody eligible is sponsored — the
    page then renders nothing at all, which is the honest shape of no
    inventory. The eligibility rules (a paid-only tool cannot appear on the
    free-tools guide, and so on) live in app/partner_slots.py.
    """
    from app import partner_slots

    surface = (request.args.get("surface") or "").strip().lower()
    try:
        units = partner_slots.partner_units(surface)
    except Exception:
        # A guide page must render with or without us.
        current_app.logger.exception("partner units failed for surface=%s", surface)
        units = []

    return jsonify({
        "surface": surface,
        "label": partner_slots.LABEL,
        "disclosure": partner_slots.DISCLOSURE,
        "units": units,
    })


@api_bp.get("/stats")
def get_public_stats():
    # Public counterpart to /admin/stats — used by the homepage to display a live tool count
    # instead of a hardcoded number that drifts every time the catalog changes.
    # Counts only visible tools so it always matches what the catalog displays
    # (a hidden tool is neither shown nor counted).
    return jsonify({"total_tools": len(get_visible_tools(DATA_PATH))})


@api_bp.get("/tools/<slug>")
def get_tool(slug: str):
    slug_value = str(slug or "").strip().lower()
    t0 = time.time()
    current_app.logger.info(f"[PERF] tool detail start: {slug_value}")

    # Trigger mtime check so TOOL_CACHE picks up tools.json edits without a Flask restart.
    # Direct dict access below would otherwise serve stale records on cache hits.
    get_cached_tools(DATA_PATH)
    tool = TOOL_CACHE.get(slug_value)
    current_app.logger.info(f"[PERF] after cache lookup: {time.time() - t0:.2f}s")

    if tool is None:
        tools = _load_tools() or []
        for candidate in tools:
            if _tool_slug(candidate) == slug_value:
                tool = candidate
                break
        current_app.logger.info(f"[PERF] after fallback scan: {time.time() - t0:.2f}s")

    if tool is not None:
        # Sponsored-tier editorial blurb replaces description/tagline on the
        # detail page (body copy, meta tags, JSON-LD) — see
        # apply_editorial_blurb() in tool_cache.py.
        tool_payload = apply_editorial_blurb(tool)
        tool_payload["similar_tools"] = [
            apply_editorial_blurb(t) for t in get_similar_tools(slug_value, limit=4)
        ]
        current_app.logger.info(f"[PERF] after related tools: {time.time() - t0:.2f}s")

        # Aggregate live user ratings into the payload so the tool detail page
        # and its SoftwareApplication JSON-LD render real numbers instead of
        # the static rating from tools.json.
        try:
            agg = (
                db.session.query(
                    func.count(Rating.id).label("count"),
                    func.sum(Rating.value).label("sum"),
                )
                .filter(Rating.tool_slug == slug_value)
                .first()
            )
            db_count = int(agg.count or 0) if agg else 0
            db_sum = float(agg.sum or 0) if agg and agg.sum is not None else 0

            seed_avg = float(tool.get("rating") or 0.0)
            seed_count = int(tool.get("review_count") or tool.get("reviewCount") or tool.get("reviews") or 0)

            combined_count = seed_count + db_count
            if combined_count > 0:
                combined_avg = round(((seed_avg * seed_count) + db_sum) / combined_count, 1)
                tool_payload["rating"] = combined_avg
                tool_payload["review_count"] = combined_count
        except Exception:
            # Ratings table missing or unreachable — fall back to static fields.
            db.session.rollback()
        current_app.logger.info(f"[PERF] after rating aggregate: {time.time() - t0:.2f}s")

        # "Claimed by the maker" badge, when someone has proven they own the
        # tool. Says the copy has an owner answerable for it — never that the
        # tool is better, which is why the payload carries no endorsement and
        # names nobody.
        try:
            from app import claims

            badge = claims.public_claim_badge(slug_value)
            if badge:
                tool_payload["claim"] = badge
        except Exception:
            db.session.rollback()

        # Commissioned hands-on review, if one is published for this tool.
        # Attached here rather than fetched separately by the client so the
        # review is part of the same payload the page already waits on — a
        # second round trip would render it below the fold a beat late, and
        # the review is the most valuable thing on the page when it exists.
        try:
            from app import editorial

            review = editorial.published_review_for_slug(slug_value)
            if review is not None:
                tool_payload["editorial_review"] = editorial.public_payload(review)
        except Exception:
            # A missing table or unreachable DB must never take the tool page
            # down — same stance as the rating aggregate above.
            db.session.rollback()
        current_app.logger.info(f"[PERF] total: {time.time() - t0:.2f}s")
        from flask import make_response
        response = make_response(jsonify(tool_payload))
        # Tool detail pages are the surface most likely to be edited
        # through /admin (pricing tweaks, last_verified_at, copy fixes).
        # Without an explicit Cache-Control the browser uses heuristic
        # caching from Last-Modified, which routinely served stale copies
        # after admin saves. no-cache forces the browser to revalidate
        # every navigation; must-revalidate forbids serving stale on
        # network failure. Flask's automatic ETag will still let us
        # return 304 when the body hasn't changed.
        response.headers["Cache-Control"] = "no-cache, must-revalidate"
        return response

    return jsonify({"error": "Tool not found"}), 404


@api_bp.post("/tools/<slug>/view")
@csrf.exempt
def record_tool_view(slug: str):
    """Best-effort page-view counter powering the submitter dashboard.
    Never fails the page load — same failure philosophy as the /go/<slug>
    click logger in routes.py."""
    from app.models import ToolPageView

    slug_l = (slug or "").strip().lower()
    if not slug_l:
        return jsonify({"ok": False}), 400
    try:
        db.session.add(ToolPageView(slug=slug_l))
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("record_tool_view failed for slug=%s", slug_l)
    return jsonify({"ok": True}), 201


@api_bp.get("/tools/<slug>/alternatives")
def tool_alternatives(slug):
    from app.tool_cache import get_alternatives_for_tool
    tools = get_cached_tools(DATA_PATH)
    main_tool, alternatives = get_alternatives_for_tool(slug, tools)
    if not main_tool:
        return jsonify({"error": "Tool not found"}), 404

    from flask import make_response
    response = make_response(jsonify({
        "tool": apply_editorial_blurb(main_tool),
        "alternatives": [apply_editorial_blurb(t) for t in alternatives],
        "count": len(alternatives),
    }))
    # Alternatives are derived from the tool itself + the similarity
    # graph, both of which change on admin edits. Same revalidation
    # policy as /tools/<slug>.
    response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response


@api_bp.get("/tools/<slug>/reviews")
def get_tool_reviews(slug: str):
    try:
        t0 = time.time()
        current_app.logger.info(f"[PERF] reviews start: {slug}")
        reviews = (
            Review.query.options(joinedload(Review.user), joinedload(Review.votes))
            .filter_by(tool_slug=slug, is_hidden=False)
            .order_by(Review.created_at.desc())
            .limit(50)
            .all()
        )
        payload = {
            "reviews": [{
                "id": r.id,
                "user": (
                    getattr(r.user, "full_name", None)
                    or getattr(r.user, "username", None)
                    or getattr(r.user, "display_name", None)
                    or "Anonymous"
                ) if r.user else "Anonymous",
                "is_student_verified": bool(r.user.student_status) if r.user else False,
                "body": r.body,
                "created_at": r.created_at.isoformat(),
                "score": sum(v.vote_type for v in r.votes),
                "user_vote": next((v.vote_type for v in r.votes if v.user_id == current_user.id), None) if current_user and current_user.is_authenticated else None,
                # The maker's single public answer, if they left one.
                "maker_reply": r.maker_reply,
                "maker_reply_at": r.maker_reply_at.isoformat() if r.maker_reply_at else None,
            } for r in reviews],
            "count": len(reviews),
            "message": "No reviews yet. Be the first!" if not reviews else None
        }
        current_app.logger.info(f"[PERF] total reviews: {time.time() - t0:.2f}s")
        return jsonify(payload)
    except Exception:
        current_app.logger.exception("reviews endpoint failed")
        return jsonify({"reviews": [], "count": 0,
                      "message": "No reviews yet. Be the first!"}), 200


def _combined_rating_summary(slug_value: str):
    """(average, count) blending live Rating rows with the seed rating/
    review_count baked into the catalog JSON at import time — same
    weighting get_tool_ratings has always used, factored out so the
    submitter dashboard can show the same number without duplicating it."""
    result = (
        db.session.query(
            func.count(Rating.id).label("count"),
            func.sum(Rating.value).label("sum"),
        )
        .filter(Rating.tool_slug == slug_value)
        .first()
    )
    db_count = int(result.count or 0) if result else 0
    db_sum = float(result.sum or 0) if result and result.sum is not None else 0

    seed_avg = 0.0
    seed_count = 0
    from app.models import CatalogTool
    row = CatalogTool.query.filter_by(slug=slug_value).first()
    if row:
        try:
            rec = json.loads(row.data) if row.data else {}
            seed_avg = float(rec.get("rating") or 0.0)
            seed_count = int(rec.get("review_count") or rec.get("reviewCount") or rec.get("reviews") or 0)
        except Exception:
            pass

    combined_count = seed_count + db_count
    if combined_count > 0:
        combined_avg = round(((seed_avg * seed_count) + db_sum) / combined_count, 1)
    else:
        combined_avg = 0.0
    return combined_avg, combined_count


@api_bp.get("/tools/<slug>/ratings")
def get_tool_ratings(slug: str):
    slug_value = str(slug or "").strip().lower()
    t0 = time.time()
    current_app.logger.info(f"[PERF] ratings start: {slug_value}")
    combined_avg, combined_count = _combined_rating_summary(slug_value)
    current_app.logger.info(f"[PERF] after ratings query: {time.time() - t0:.2f}s")

    user_rating = None
    if current_user.is_authenticated:
        rating = Rating.query.filter_by(user_id=current_user.id, tool_slug=slug_value).first()
        user_rating = rating.value if rating else None

    current_app.logger.info(f"[PERF] total ratings: {time.time() - t0:.2f}s")

    return jsonify({
        "average": combined_avg,
        "count": combined_count,
        "user_rating": user_rating,
        "message": "Be the first to rate this tool!" if combined_count == 0 else None,
    })


@api_bp.post("/tools/<slug>/ratings")
@csrf.exempt
@login_required
def rate_tool(slug: str):
    try:
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
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Rating submit error")
        return jsonify({"error": "Unable to submit right now"}), 500


@api_bp.post("/tools/<slug>/reviews")
@csrf.exempt
@login_required
def post_review(slug: str):
    try:
        slug_value = str(slug or "").strip().lower()
        payload = request.get_json(silent=True) or {}
        body = str(payload.get("body") or "").strip()
        if len(body) < 10:
            return jsonify({"error": "Review must be at least 10 characters"}), 400
        if len(body) > 1000:
            return jsonify({"error": "Review too long"}), 400
        existing = Review.query.filter_by(
            user_id=current_user.id, tool_slug=slug_value
        ).first()
        if existing:
            existing.body = body
            existing.created_at = datetime.now(timezone.utc)
        else:
            rev = Review(user_id=current_user.id, tool_slug=slug_value, body=body)
            db.session.add(rev)
        db.session.commit()
        return jsonify({"success": True})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Review submit error")
        return jsonify({"error": "Could not save review"}), 500


@api_bp.post("/reviews/<int:review_id>/reply")
@csrf.exempt
@login_required
def reply_to_review(review_id: int):
    """The claimed maker's public answer to one review of their tool.

    Replying is the half of "claim your listing" that a reader benefits
    from: an unanswered complaint is worth less to everyone than one with
    the maker's side next to it. Bounded deliberately — one reply per
    review, editable, and never able to hide or alter the review itself.
    """
    from app import claims

    review = Review.query.get(review_id)
    if review is None:
        return jsonify({"error": "Review not found"}), 404

    if not claims.user_can_edit(current_user, review.tool_slug):
        return jsonify({
            "error": "Only the claimed maker of this tool can reply to its reviews.",
        }), 403

    body = str((request.get_json(silent=True) or {}).get("body") or "").strip()
    if not body:
        # Empty means "take my reply down", which a maker must be able to do
        # without asking us.
        review.maker_reply = None
        review.maker_reply_at = None
    else:
        if len(body) > 1000:
            return jsonify({"error": "Replies are limited to 1000 characters."}), 400
        review.maker_reply = body
        review.maker_reply_at = datetime.now(timezone.utc)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("maker reply failed for review %s", review_id)
        return jsonify({"error": "Could not save that reply"}), 500

    return jsonify({
        "success": True,
        "maker_reply": review.maker_reply,
        "maker_reply_at": review.maker_reply_at.isoformat() if review.maker_reply_at else None,
    })


@api_bp.post("/reviews/<int:review_id>/vote")
@csrf.exempt
@login_required
def vote_review(review_id: int):
    try:
        payload = request.get_json(silent=True) or {}
        vote_type = payload.get("vote_type")  # 1 or -1, or 0 to clear
        if vote_type not in (1, -1, 0):
            return jsonify({"error": "Invalid vote type"}), 400

        existing = ReviewVote.query.filter_by(review_id=review_id, user_id=current_user.id).first()
        if vote_type == 0:
            if existing:
                db.session.delete(existing)
        else:
            if existing:
                existing.vote_type = vote_type
            else:
                vote = ReviewVote(review_id=review_id, user_id=current_user.id, vote_type=vote_type)
                db.session.add(vote)

        db.session.commit()
        
        # Calculate new score
        votes = ReviewVote.query.filter_by(review_id=review_id).all()
        score = sum(v.vote_type for v in votes)
        return jsonify({"success": True, "score": score})
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Review vote error")
        return jsonify({"error": "Could not save vote"}), 500



@api_bp.get("/config/paypal")
def get_paypal_config():
    """PayPal SDK config for the browser.

    ?context=sponsor returns the sponsorship app's credentials, which are
    deliberately separate from the submission flow's hosted-button client
    ID (see payments.sponsor_credentials). Only the public client ID is
    ever returned — the secret stays server-side.
    """
    if (request.args.get("context") or "").strip().lower() == "sponsor":
        from app.payments import sponsor_credentials

        client_id, _secret, mode = sponsor_credentials()
        return jsonify({"client_id": client_id or "", "mode": mode, "context": "sponsor"})

    return jsonify({
        "client_id": os.environ.get("PAYPAL_CLIENT_ID", ""),
        "mode": os.environ.get("PAYPAL_MODE", "sandbox")
    })


# Tier labels the /submit checkout may ask for. Echoed back only — the
# amount that actually gets verified comes from pricing_tiers, never from
# this parameter. "quick" stays accepted so a stale cached bundle asking
# for it gets a config response instead of a silent fallback surprise.
_PAYPAL_TIERS = ("sponsor", "reviewed", "analytics", "quick")


@api_bp.get("/config/paypal-hosted")
def get_paypal_hosted_config():
    """PayPal client config for the /submit checkout. Smart Buttons only.

    The hosted-button flow this endpoint used to drive is gone. It sent the
    buyer to an NCP payment link and then asked them to paste a "Transaction
    ID / Receipt Number" back into the form — a value that can NEVER verify,
    because a transaction ID is not an order ID and verify_paypal_order()
    resolves order IDs at /v2/checkout/orders/{id}. Every payment made that
    way was destined for 'unverified_review' no matter how genuine it was,
    and the buyer got a free listing and silence.

    Smart Buttons are the only flow that yields an independently
    confirmable order ID, so they are now the sole path.

    hosted_button_id/payment_url are still emitted, hardcoded empty, on
    purpose: a browser holding a cached copy of the old bundle reads them as
    "no hosted flow configured" and falls through to Smart Buttons. Removing
    the keys outright would make that stale bundle read `undefined` and
    behave the same, but leaving them explicit documents the contract and
    costs nothing. Do not reintroduce a way to populate them without also
    building a reference capture that can actually be verified.
    """
    tier = (request.args.get("tier") or "sponsor").strip().lower()
    if tier not in _PAYPAL_TIERS:
        tier = "sponsor"
    return jsonify({
        "client_id": os.environ.get("PAYPAL_CLIENT_ID", ""),
        "hosted_button_id": "",
        "payment_url": "",
        "mode": os.environ.get("PAYPAL_MODE", "live"),
        "tier": tier,
    })


@api_bp.get("/admin/diagnostics/paypal")
@login_required
def paypal_diagnostics():
    """Confirms PAYPAL_CLIENT_ID/SECRET are a valid matching pair, without a
    real order or a Render Shell (not available on the free plan). Runs the
    exact OAuth call verify_paypal_order() depends on and reports pass/fail
    only — the secret itself is never read back, only whether PayPal's API
    accepted it.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    from app.payments import (
        _paypal_access_token,
        _paypal_base_url,
        looks_like_hosted_button_id,
        sponsor_credentials,
    )

    client_id = os.environ.get("PAYPAL_CLIENT_ID", "")
    client_secret = os.environ.get("PAYPAL_CLIENT_SECRET", "")
    token = _paypal_access_token()

    # The sponsorship checkout can run on its own REST app, so it needs its
    # own verdict — a green light on the shared credentials tells you
    # nothing about whether a placement can actually be sold.
    s_id, s_secret, s_mode = sponsor_credentials()
    s_token = _paypal_access_token(s_id, s_secret, s_mode) if (s_id and s_secret) else None
    sponsor_block = {
        "client_id_set": bool(s_id),
        "client_id_preview": f"{s_id[:6]}…" if s_id else None,
        "client_id_looks_like_hosted_button": looks_like_hosted_button_id(s_id),
        "client_secret_set": bool(s_secret),
        "mode": s_mode,
        "api_base": _paypal_base_url(s_mode),
        "using_dedicated_app": bool(os.environ.get("PAYPAL_SPONSOR_CLIENT_ID")),
        "oauth_token_acquired": bool(s_token),
    }
    if s_token:
        sponsor_block["verdict"] = "OK — sponsorship checkout can verify payments."
    elif not s_secret:
        sponsor_block["verdict"] = (
            "FAILED — no client secret. Set PAYPAL_SPONSOR_CLIENT_SECRET (or "
            "PAYPAL_CLIENT_SECRET). Without it every booking is refused."
        )
    elif looks_like_hosted_button_id(s_id):
        sponsor_block["verdict"] = (
            "FAILED — this looks like a hosted-button client ID, which cannot "
            "call the REST API. Create a REST app at developer.paypal.com and "
            "set PAYPAL_SPONSOR_CLIENT_ID / PAYPAL_SPONSOR_CLIENT_SECRET."
        )
    else:
        sponsor_block["verdict"] = (
            "FAILED — PayPal rejected these credentials. Check the ID/secret are "
            "a matching pair and that the mode matches the app (sandbox vs live)."
        )

    # Submission checkout verdict — same shape and specificity as the
    # sponsorship block above. It previously collapsed every failure into
    # "see server logs", which is how a missing secret and a hosted-button
    # ID in PAYPAL_CLIENT_ID went undiagnosed for a month.
    if token:
        submit_verdict = "OK — /submit can verify payments."
    elif not client_id:
        submit_verdict = (
            "FAILED — PAYPAL_CLIENT_ID is unset. Every paid submission will "
            "land as unverified_review."
        )
    elif not client_secret:
        submit_verdict = (
            "FAILED — no client secret. Set PAYPAL_CLIENT_SECRET from the same "
            "REST app as PAYPAL_CLIENT_ID. Without it every paid submission is refused."
        )
    elif looks_like_hosted_button_id(client_id):
        submit_verdict = (
            "FAILED — this looks like a hosted-button client ID (~25 chars), which "
            "cannot call the REST API. Use the Client ID from a REST app at "
            "developer.paypal.com (~80 chars) and keep the hosted-button ID in "
            "PAYPAL_HOSTED_BUTTON_ID."
        )
    else:
        submit_verdict = (
            "FAILED — PayPal rejected these credentials. Check the ID/secret are "
            "a matching pair and that PAYPAL_MODE matches the app (sandbox vs live)."
        )

    return jsonify({
        "sponsorship": sponsor_block,
        "client_id_set": bool(client_id),
        "client_id_preview": f"{client_id[:6]}…" if client_id else None,
        "client_id_length": len(client_id) or None,
        "client_id_looks_like_hosted_button": looks_like_hosted_button_id(client_id),
        "client_secret_set": bool(client_secret),
        "mode": os.environ.get("PAYPAL_MODE", "live"),
        "api_base": _paypal_base_url(),
        "oauth_token_acquired": bool(token),
        "verdict": submit_verdict,
    })


@api_bp.post("/submit-tool")
@csrf.exempt
def submit_tool():
    # Receive a public tool-submission form. A Submission row is written to
    # the DB (the durable source of truth the admin review queue reads) and
    # a notification email is sent to SUBMIT_NOTIFY_EMAIL when configured.
    # Email is best-effort — a delivery failure does not fail the request.
    try:
        # Per-IP rate limit — without this, spamming this endpoint with junk
        # transaction_ref values each triggers a real outbound PayPal OAuth +
        # order-lookup call plus an admin notification email; cheap for a
        # human submitting a tool, not cheap at scale.
        ip = _feedback_client_ip()
        if is_rate_limited(f"submit_tool:{ip}", limit=5, window_seconds=3600):
            return jsonify({"error": "Too many submissions. Please try again later."}), 429

        payload = request.get_json(silent=True) or {}

        name = str(payload.get("name") or "").strip()
        url = str(payload.get("url") or "").strip()
        category = str(payload.get("category") or "").strip()
        reason = str(payload.get("reason") or "").strip()
        pricing_model_raw = str(payload.get("pricing_model") or "free").strip()
        transaction_ref = str(payload.get("transaction_ref") or "").strip()

        # Payment verification — a claimed paid submission (Quick Review or
        # Fast-Track) is never trusted on the client's say-so. Only a PayPal
        # order ID that we can independently confirm as COMPLETED for the
        # right tier's amount counts as paid; everything else (fake ref, no
        # ref, or a payment method with no real server-side gateway wired up
        # yet) is recorded as 'unverified_review' so it can never silently
        # unlock PAYMENT APPROVED / fast-track / an invoice email on its own.
        from app.pricing_tiers import (
            TIERS,
            includes_editorial_review,
            includes_sponsored_perks,
            is_for_sale,
            price_for_tier,
            tier_for_pricing_model,
        )
        tier_key = tier_for_pricing_model(pricing_model_raw)
        is_paid_claim = bool(TIERS.get(tier_key, {}).get("paid"))

        # A retired tier is refused BEFORE any payment work, the same way
        # sponsor_checkout() refuses a placement that isn't on sale: taking
        # money for something we have stopped delivering means holding a
        # charge we owe back. Retired only ever means retired for NEW
        # purchases — existing rows keep resolving to their tier everywhere
        # else (see pricing_tiers.TIERS).
        if is_paid_claim and not is_for_sale(tier_key):
            return jsonify({
                "error": "That tier is no longer offered. Pick Fast-Track or Reviewed on "
                         "/pricing — or submit for free, which now goes live in 7 days.",
            }), 400
        payment_verified = False
        payment_note = None
        # 'refused' | 'indeterminate' once a paid claim fails. See
        # payments.classify_failure — the distinction is the whole point:
        # 'refused' means PayPal told us the payment isn't real, while
        # 'indeterminate' means we never found out, and treating the second
        # like the first is how someone who genuinely paid ends up on a free
        # listing with no email.
        payment_outcome = None
        if is_paid_claim:
            from app.payments import (
                VERIFY_INDETERMINATE,
                classify_failure,
                verify_paypal_order,
            )
            if "paypal" in pricing_model_raw and transaction_ref:
                expected_amount = price_for_tier(tier_key)
                payment_verified, detail = verify_paypal_order(
                    transaction_ref, expected_amount=expected_amount
                )
            elif transaction_ref:
                detail = "no_verifiable_gateway"
            else:
                detail = "missing_reference"

            if payment_verified:
                payment_note = detail
            else:
                payment_outcome = classify_failure(detail)
                # Keep the reference next to the reason. It is the only
                # evidence a real payment left behind, and an admin
                # reconciling a charge in PayPal needs it in the row rather
                # than having to reconstruct it from pricing_model.
                payment_note = f"{payment_outcome}:{detail}"
                if transaction_ref:
                    payment_note = f"{payment_note} ref={transaction_ref}"
                payment_note = payment_note[:255]

                if payment_outcome == VERIFY_INDETERMINATE:
                    # error, not warning: this is OUR failure, and it may be
                    # sitting on top of a real charge.
                    current_app.logger.error(
                        "UNRESOLVED paid submission for '%s' — payment may be genuine. "
                        "pricing_model=%s ref=%s reason=%s",
                        name, pricing_model_raw, transaction_ref, detail,
                    )
                else:
                    current_app.logger.warning(
                        "Refused paid submission claim for '%s': pricing_model=%s ref=%s reason=%s",
                        name, pricing_model_raw, transaction_ref, detail,
                    )

        if payment_verified:
            payment_status = "verified"
        elif payment_outcome == "indeterminate":
            payment_status = "needs_manual_review"
        elif is_paid_claim:
            payment_status = "unverified_review"
        else:
            payment_status = "unpaid"

        pricing_model = pricing_model_raw
        if transaction_ref and is_paid_claim:
            combined = f"{pricing_model_raw}:{transaction_ref}"
            pricing_model = combined[:50]

        student_perks = str(payload.get("student_perks") or "").strip()

        if not name or not url or not category or not reason:
            return jsonify({"error": "Name, URL, category, and reason are all required."}), 400

        if len(name) > 200 or len(url) > 500 or len(category) > 100 or len(reason) > 2000:
            return jsonify({"error": "One or more fields exceed length limits."}), 400

        if not (url.startswith("http://") or url.startswith("https://")):
            return jsonify({"error": "URL must start with http:// or https://"}), 400

        submitted_at = datetime.now(timezone.utc).isoformat()
        submitter_email_payload = str(payload.get("submitter_email") or "").strip()
        submitter_email = submitter_email_payload if submitter_email_payload else (current_user.email if current_user.is_authenticated else None)

        # Durable record: a Submission row in the DB — this is the table the
        # admin review queue (/admin/submissions) and the approve/reject
        # flow read. The old code wrote an ephemeral JSON file that Render
        # wiped on every deploy, so the queue was permanently empty and no
        # submission could ever be reviewed. Email notify below stays
        # best-effort and is no longer the durable channel.
        sub = None
        # True only when THIS request created the row. The paid-claim
        # acknowledgement email below is send-once, and the retry dedup a few
        # lines down is what makes this a sound guard: a resubmitted
        # transaction_ref reuses the existing row, so it lands here False and
        # the founder is not emailed twice about one payment.
        submission_row_created = False
        try:
            from app.models import Submission

            # A retried request (network retry, double-click on the PayPal
            # redirect) resubmits the same transaction_ref. `pricing_model`
            # already encodes tier+ref together (e.g. "quick_paypal:XYZ"), so
            # matching on it catches the retry before a duplicate Submission
            # row — and a duplicate founder account / welcome email — can be
            # created from it.
            if is_paid_claim and transaction_ref:
                sub = Submission.query.filter_by(pricing_model=pricing_model).first()

            if sub is None:
                sub = Submission(
                    name=name,
                    website=url,
                    category=category,
                    description=reason,
                    pricing_model=pricing_model,
                    student_perks=student_perks,
                    submitter_email=submitter_email,
                    status="pending",
                    payment_status=payment_status,
                    payment_note=payment_note,
                    is_priority=payment_verified,
                )
                db.session.add(sub)
                db.session.commit()
                submission_row_created = True
            elif sub.payment_status != payment_status or sub.payment_note != payment_note:
                # A retry can succeed where the first attempt didn't (e.g. a
                # transient PayPal lookup failure) — keep the reused row's
                # verification fields current rather than stuck on stale
                # first-attempt values.
                sub.payment_status = payment_status
                sub.payment_note = payment_note
                sub.is_priority = payment_verified
                db.session.commit()
        except Exception:
            db.session.rollback()
            current_app.logger.exception("Failed to persist submission to DB")
            # Don't hard-fail the user — the notification email below is
            # the backup channel.

        # The Reviewed tier's price includes a commissioned hands-on review,
        # so the commission is queued here rather than waiting for someone to
        # notice the tier on the invoice. An owed deliverable that exists only
        # in a human's memory is the failure this whole ladder was rebuilt to
        # stop repeating.
        #
        # Only on a VERIFIED payment — an unverified claim buys nothing, here
        # as everywhere else. create_order() is idempotent on payment_ref, so
        # a retried checkout reuses the commission instead of queueing a
        # second one.
        if payment_verified and includes_editorial_review(tier_key) and sub is not None:
            try:
                from app import editorial

                review_slug = _slugify(name)
                _review, review_err = editorial.create_order(
                    tool_slug=review_slug,
                    contact_email=submitter_email,
                    brief=None,
                    # Zero, deliberately: the $79 is already counted as
                    # submission revenue, and booking it again on the review
                    # row would double-count one payment across two reports.
                    # The note carries where the money actually landed.
                    amount_paid=0.0,
                    payment_ref=transaction_ref or None,
                )
                if review_err:
                    current_app.logger.error(
                        "Reviewed tier paid but review commission failed: "
                        "submission_id=%s slug=%s reason=%s",
                        sub.id, review_slug, review_err,
                    )
                else:
                    review_note = (
                        f"Included in the ${price_for_tier(tier_key):.0f} Reviewed tier "
                        f"— billed on submission #{sub.id}."
                    )
                    editorial.update_review(_review, {"admin_note": review_note})
            except Exception:
                db.session.rollback()
                current_app.logger.exception(
                    "Reviewed tier paid but review commission errored (submission_id=%s)",
                    getattr(sub, "id", None),
                )

        notify_email = os.environ.get("SUBMIT_NOTIFY_EMAIL", "admin@ai-compass.in")

        import app.email_utils as email_utils_mod
        from app.email_utils import send_email
        from flask import render_template
        import random

        # 1. Only send an invoice / "payment approved" language for a
        # server-verified payment — never for an unverified claim.
        is_paid = payment_verified
        dash_link = None
        register_link = None
        if sub is not None and submitter_email:
            try:
                from app.submission_dashboard import dashboard_url
                dash_link = dashboard_url(sub.id, submitter_email)
            except Exception:
                current_app.logger.exception("Failed to mint dashboard link for submission_id=%s", getattr(sub, "id", None))
            try:
                from urllib.parse import quote
                from app.oauth import _frontend_base_url
                register_link = f"{_frontend_base_url()}/register?email={quote(submitter_email)}"
            except Exception:
                current_app.logger.exception("Failed to build register link for submission_id=%s", getattr(sub, "id", None))

        # Founder account creation/linking now fires here — at payment
        # verification, in this same request — instead of at admin curation
        # review (which can lag verification by up to 72 hours). Gated on
        # welcome_email_sent_at rather than re-running on every call: the
        # pricing_model-based dedup above already routes a retried request to
        # this same Submission row, so this guard is what actually stops a
        # retry from re-creating/re-emailing (get_or_create_founder_account
        # itself is idempotent by email, but that alone wouldn't stop a
        # second email send).
        founder_result = None
        # Gates BOTH the founder-account creation call below AND the
        # invoice/welcome email send further down — a retry that the
        # pricing_model dedup above routed to an already-processed
        # Submission row must do neither a second time (Constraint 3).
        should_process_founder_account = (
            is_paid and submitter_email and sub is not None and sub.welcome_email_sent_at is None
        )
        if should_process_founder_account:
            try:
                from app.founder_accounts import get_or_create_founder_account
                founder_result = get_or_create_founder_account(submitter_email, sub.id)
            except Exception:
                current_app.logger.exception(
                    "Failed to create/link founder account for submission_id=%s", getattr(sub, "id", None)
                )

        # Real credentials/"your account is ready" copy only goes out once the
        # founder explicitly confirms the first-login password-change UI
        # (Prompt 3) is live — until then this stays a dry run: the account
        # is created for real, but the email keeps today's register-CTA
        # wording instead of advertising a login that has nowhere to land.
        welcome_content_live = email_utils_mod.founder_welcome_email_live()
        founder_account_created = bool(founder_result and founder_result.created and welcome_content_live)
        founder_account_linked = bool(founder_result and not founder_result.created and welcome_content_live)
        founder_temp_password = founder_result.temp_password if (founder_result and welcome_content_live) else None
        if founder_result is not None and not welcome_content_live:
            current_app.logger.info(
                "[DRY-RUN] founder account ready for submission_id=%s (new_account=%s) — "
                "credentials/linked-account email content withheld until FOUNDER_WELCOME_EMAIL_LIVE=1",
                sub.id, founder_result.created,
            )

        if is_paid and submitter_email and should_process_founder_account:
            try:
                # Extract clean payment method name
                pay_method = "PayPal"
                if "stripe" in pricing_model:
                    pay_method = "Stripe"
                elif "razorpay" in pricing_model:
                    pay_method = "Razorpay"
                
                # Extract clean transaction ref
                clean_ref = transaction_ref or "N/A"
                if (clean_ref == "N/A" or not clean_ref) and ":" in pricing_model:
                    clean_ref = pricing_model.split(":", 1)[1]
                
                today_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
                invoice_num = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{random.randint(1000, 9999)}"

                tier_names = {
                    # Retired, but rows bought under it still generate invoices
                    # and dashboards, so it keeps its name.
                    "quick": "Quick Review",
                    "analytics": "Listing + Analytics",
                    "sponsored": "Fast-Track",
                    "reviewed": "Reviewed Listing",
                }
                tier_review_promises = {
                    "quick": "Our editorial team will review it within 48–72 hours.",
                    "analytics": (
                        "We review it ahead of the free queue, and it goes live 7 days after "
                        "approval. Your dashboard starts counting the day it does."
                    ),
                    "sponsored": "We review yours first — target 24 hours — and it goes live the next day.",
                    "reviewed": (
                        "We review yours first — target 24 hours — it goes live the next day, "
                        "and your hands-on review follows within 10 days."
                    ),
                }
                tier_name = tier_names.get(tier_key, "Fast-Track")
                tier_amount = price_for_tier(tier_key)
                review_promise = tier_review_promises.get(tier_key, "Our editorial team will review it shortly.")

                invoice_html = render_template(
                    'emails/invoice.html',
                    invoice_number=invoice_num,
                    date=today_str,
                    payment_method=pay_method,
                    transaction_ref=clean_ref,
                    customer_email=submitter_email,
                    tool_name=name,
                    tier_name=tier_name,
                    review_promise=review_promise,
                    line_item_label=f"{tier_name} Curation",
                    line_item_amount=f"${tier_amount:.2f}",
                    total_amount=f"${tier_amount:.2f} USD",
                    dashboard_url=dash_link,
                    # Launch Day is the one perk a founder has to act on, and
                    # the invoice is the only moment we know they are reading.
                    # Left to the dashboard alone it goes unbooked, and an
                    # unbooked launch is a perk paid for and never delivered.
                    launch_eligible=includes_sponsored_perks(tier_key),
                    # The auto-created/linked-account callout replaces the
                    # generic "create a free account" CTA — showing both
                    # would tell a founder to sign up for an account they
                    # (once welcome_content_live) already have.
                    register_url=register_link if not (founder_account_created or founder_account_linked) else None,
                    founder_account_created=founder_account_created,
                    founder_account_linked=founder_account_linked,
                    founder_temp_password=founder_temp_password,
                )

                invoice_text = f"Thank you for your purchase! {tier_name} payment of ${tier_amount:.2f} USD has been received. Invoice Number: {invoice_num}, Transaction Ref: {clean_ref}."
                if dash_link:
                    invoice_text += f" Track clicks and views on your listing: {dash_link}"
                if dash_link and includes_sponsored_perks(tier_key):
                    invoice_text += (
                        " Your listing also comes with a Launch Day: pick the date your placement, "
                        "rail card and digest spot all start on, from the same dashboard. "
                        "We run one launch a day."
                    )
                if founder_account_created:
                    invoice_text += (
                        f" We've created a Growth Hub account for you (login: {submitter_email}) — "
                        "see this email's HTML version for your temporary password. "
                        "You'll be asked to set a new one on first login."
                    )
                elif founder_account_linked:
                    invoice_text += " This tool is now linked to your existing AI Compass account — log in as usual to find it in your Growth Hub."
                elif register_link:
                    invoice_text += f" Create a free account for one-click access: {register_link}"

                # This send is unconditional — it's the pre-existing payment
                # receipt email, unaffected by the welcome_content_live gate.
                # Only the founder-account section above (credentials /
                # "linked to existing account" copy vs. the plain register
                # CTA) changes based on that flag.
                send_email(
                    to=submitter_email,
                    subject=f"AI Compass - Payment Confirmation & Invoice ({invoice_num})",
                    html=invoice_html,
                    text=invoice_text,
                )

                # Send-once guard (Constraint 3): independent of
                # get_or_create_founder_account()'s own account-level
                # idempotency, this stops a retried request — which the
                # pricing_model dedup above already routes to this same
                # Submission row — from re-sending this email.
                if should_process_founder_account:
                    sub.welcome_email_sent_at = datetime.now(timezone.utc)
                    db.session.commit()
            except Exception:
                current_app.logger.exception("Failed to send user invoice email — submission still recorded")
        elif is_paid_claim and submitter_email and submission_row_created and payment_outcome:
            # A paid claim we could not verify used to send NOTHING — the
            # reasoning being that these are almost all bogus, and mailing a
            # possibly-forged address is its own problem. But the cost is
            # wildly asymmetric: spam that gets one transactional email is a
            # nuisance, while a founder who paid $49.99 and hears nothing
            # concludes they were robbed. That silence is the single most
            # expensive behaviour in this funnel, so it ends here.
            #
            # The copy differs by outcome and never overstates what we know
            # (see the template): 'indeterminate' says we are checking
            # manually and not to pay again; 'refused' says PayPal reported no
            # completed charge and invites proof. Neither grants a perk —
            # payment_status is unchanged and only 'verified' unlocks
            # anything.
            #
            # missing_reference is excluded by requiring payment_outcome from
            # a real verification attempt with a reference: someone who picked
            # a paid tier and never paid gets the ordinary free-tier flow, not
            # a note about a payment that never happened.
            try:
                from app.payments import VERIFY_INDETERMINATE

                indeterminate = payment_outcome == VERIFY_INDETERMINATE
                tier_display = {
                    "quick": "Quick Review",
                    "sponsored": "Fast-Track Sponsored Curation",
                }.get(tier_key, "paid")

                if indeterminate:
                    ack_subject = f"We're confirming your payment for {name}"
                    ack_text = (
                        f"Thanks for submitting {name} to AI Compass. We have your payment "
                        f"reference ({transaction_ref or 'not supplied'}) but couldn't confirm it "
                        f"with PayPal automatically, so a person is checking it by hand now. "
                        f"Please don't pay again — if you were charged, your listing will be "
                        f"upgraded to {tier_display} and backdated to today."
                    )
                else:
                    ack_subject = f"We couldn't confirm your payment for {name}"
                    ack_text = (
                        f"Thanks for submitting {name} to AI Compass. PayPal could not confirm "
                        f"the payment reference ({transaction_ref or 'not supplied'}) as a "
                        f"completed charge, so as far as we can tell you have not been charged. "
                        f"Your tool is in the standard free review queue either way. If you "
                        f"believe you were charged, reply with your PayPal order ID."
                    )
                if dash_link:
                    ack_text += f" Track your submission: {dash_link}"

                send_email(
                    to=submitter_email,
                    subject=ack_subject,
                    html=render_template(
                        'emails/payment_under_review.html',
                        tool_name=name,
                        tier_name=tier_display,
                        transaction_ref=transaction_ref,
                        indeterminate=indeterminate,
                        dashboard_url=dash_link,
                    ),
                    text=ack_text,
                )
            except Exception:
                current_app.logger.exception(
                    "Failed to send paid-claim acknowledgement for submission_id=%s",
                    getattr(sub, "id", None),
                )
        elif not is_paid and not is_paid_claim and submitter_email and dash_link:
            # Free-tier submitters previously got no email at all — this is
            # new behavior, not a bug fix. Doubles as the upsell funnel:
            # the dashboard's free view links out to /pricing. `not is_paid`
            # keeps a paid retry (is_paid True, should_process_founder_account
            # False — already handled) from falling through to this branch
            # and getting the free-tier email instead. `not is_paid_claim`
            # keeps an UNVERIFIED paid claim (bogus/automated, almost always
            # anonymous) from triggering an email to a possibly-forged address.
            try:
                confirm_html = render_template(
                    'emails/submission_received.html',
                    tool_name=name,
                    dashboard_url=dash_link,
                    register_url=register_link,
                )
                confirm_text = f"Thanks for submitting {name}! We review free submissions in queue order (usually within 2 weeks). Track its status: {dash_link}"
                if register_link:
                    confirm_text += f" Create a free account for one-click access: {register_link}"
                send_email(
                    to=submitter_email,
                    subject="We received your AI Compass submission",
                    html=confirm_html,
                    text=confirm_text,
                )
            except Exception:
                current_app.logger.exception("Failed to send free-tier submission confirmation email")

        # 2. Send submission details to the admin. The subject line makes the
        # trust level obvious at a glance — an unverified sponsored claim
        # must never look like a confirmed payment in the inbox.
        #
        # Unverified paid claims used to be silently swallowed here on the
        # theory that they are all spam. That held only while every claim
        # failed for the same undifferentiated reason. Now that a failure is
        # classified, the two cases are not comparable: a REFUSED claim is
        # very likely bogus, but an INDETERMINATE one means we could not
        # reach an answer and there may be real money behind it. Never
        # emailing about the second is how a paying founder goes unnoticed.
        #
        # The only claim that still sends nothing is one with no reference at
        # all — someone picked a paid tier and never paid. That is not a
        # payment event, it is an abandoned checkout, and the row is in
        # /admin/submissions if it matters.
        skip_admin_notification = is_paid_claim and not payment_verified and not transaction_ref
        if skip_admin_notification:
            current_app.logger.info(
                "Skipping admin email for paid-tier claim '%s' with no payment reference "
                "(note=%s) — visible in /admin/submissions queue instead.",
                name, payment_note or "none",
            )

        if is_paid:
            subject_tag = "[PAYMENT APPROVED]"
        elif is_paid_claim and payment_outcome == "indeterminate":
            # Distinct from the refused tag on purpose: this one may be real
            # money and needs a person today, while the refused pile can be
            # triaged whenever. Keeping them separable in the inbox is what
            # stops the urgent case drowning in the spam case.
            subject_tag = "[ACTION NEEDED — POSSIBLE UNCONFIRMED PAYMENT]"
        elif is_paid_claim:
            subject_tag = "[UNVERIFIED PAYMENT CLAIM — DO NOT FAST-TRACK]"
        else:
            subject_tag = "[AI Compass]"
        admin_subject = f"{subject_tag} New Tool Submission: {name}" if is_paid or is_paid_claim else f"{subject_tag} New tool submission: {name}"
        if transaction_ref:
            admin_subject += f" (Ref: {transaction_ref})"

        # An alert that doesn't say what to do gets triaged as noise. For the
        # case that may be real money, spell out the reconciliation step and
        # the exact reference to search PayPal for.
        action_html = ""
        action_text = ""
        if is_paid_claim and payment_outcome == "indeterminate":
            action_html = (
                f"<p style='background:#fff4e5;border-left:4px solid #d97706;padding:12px 16px;'>"
                f"<b>Action needed — this may be a real payment.</b><br/>"
                f"Verification did not fail because PayPal rejected the order; it failed because "
                f"we could not get an answer (<code>{payment_note or 'unknown'}</code>).<br/><br/>"
                f"Search PayPal Activity for <b>{transaction_ref or 'the reference above'}</b>, or by "
                f"amount and date. If it captured, mark the submission verified in "
                f"/admin/submissions and reply to the founder. If it did not, no action is needed — "
                f"they have already been told they were not charged."
                f"</p>"
            )
            action_text = (
                f"\nACTION NEEDED — this may be a real payment.\n"
                f"Verification failed because we could not get an answer from PayPal "
                f"({payment_note or 'unknown'}), not because PayPal rejected it.\n"
                f"Search PayPal Activity for {transaction_ref or 'the reference above'}, or by "
                f"amount and date. If it captured, mark it verified in /admin/submissions and "
                f"reply to the founder.\n"
            )

        admin_html = (
            f"<h2>{subject_tag} New Tool Submission</h2>"
            f"{action_html}"
            f"<p>A new tool was submitted via ai-compass.in/submit:</p>"
            f"<ul>"
            f"<li><b>Name:</b> {name}</li>"
            f"<li><b>URL:</b> <a href='{url}'>{url}</a></li>"
            f"<li><b>Category:</b> {category}</li>"
            f"<li><b>Pricing Model / Payment:</b> {pricing_model}</li>"
            f"<li><b>Transaction Ref:</b> {transaction_ref or 'N/A'}</li>"
            f"<li><b>Payment Status:</b> {payment_status}{f' ({payment_note})' if payment_note else ''}</li>"
            f"<li><b>Student Perks:</b> {student_perks or 'None'}</li>"
            f"<li><b>Founder Contact Email:</b> {submitter_email or 'anonymous (not logged in)'}</li>"
            f"<li><b>Submitted at:</b> {submitted_at}</li>"
            f"</ul>"
            f"<p><b>Why it's useful / description:</b><br/>{reason}</p>"
        )
        admin_text = (
            f"{subject_tag} New tool submission via ai-compass.in/submit:\n"
            f"{action_text}\n"
            f"Name: {name}\n"
            f"URL: {url}\n"
            f"Category: {category}\n"
            f"Pricing Model: {pricing_model}\n"
            f"Transaction Ref: {transaction_ref or 'N/A'}\n"
            f"Payment Status: {payment_status}{f' ({payment_note})' if payment_note else ''}\n"
            f"Student Perks: {student_perks or 'None'}\n"
            f"Founder Contact Email: {submitter_email or 'anonymous (not logged in)'}\n"
            f"Submitted at: {submitted_at}\n\n"
            f"Why it's useful:\n{reason}\n"
        )

        admin_recipients = set()
        if notify_email:
            admin_recipients.add(notify_email)
        admin_emails_config = current_app.config.get("ADMIN_EMAILS", [])
        for e in admin_emails_config:
            if e and isinstance(e, str):
                admin_recipients.add(e.strip())

        for recipient in (admin_recipients if not skip_admin_notification else ()):
            try:
                send_email(
                    to=recipient,
                    subject=admin_subject,
                    html=admin_html,
                    text=admin_text
                )
            except Exception:
                current_app.logger.exception("Failed to send admin submission email to %s", recipient)

        # Success-page data (Step 3): the dashboard link works immediately —
        # it's the same magic-link token minted above, independent of the
        # welcome email actually being sent or of Prompt 3's login UI. The
        # account_created/account_linked flags are withheld while
        # welcome_content_live is off so the page never promises "check your
        # email for login details" when no such email went out.
        return jsonify({
            "success": True,
            "message": "Submission received. Thanks!",
            "payment_status": payment_status,
            "payment_verified": payment_verified,
            "tier": tier_key or "free",
            "tier_price": TIERS.get(tier_key, {}).get("price", 0.0),
            "dashboard_url": dash_link,
            "founder_account_created": founder_account_created,
            "founder_account_linked": founder_account_linked,
        }), 201

    except Exception:
        current_app.logger.exception("Tool submission error")
        return jsonify({"error": "Unable to submit right now"}), 500


@api_bp.get("/search")
def api_search():
    raw_query   = request.args.get('q', '').strip()[:150]
    category    = request.args.get('category', 'All')
    pricing     = request.args.get('pricing', 'All')
    student     = request.args.get('student_only', 'false') == 'true'
    actually_f  = request.args.get('actually_free', 'false') == 'true'
    trending    = request.args.get('trending_only', 'false') == 'true'
    sort_by     = request.args.get('sort', 'Relevance')
    open_source = request.args.get('open_source', 'false') == 'true'
    self_hosted = request.args.get('self_hosted', 'false') == 'true'
    pay_as_you_go = request.args.get('pay_as_you_go', 'false') == 'true'

    output = _search_catalog_tools(
        raw_query=raw_query,
        category=category,
        pricing=pricing,
        student_only=student,
        trending_only=trending,
        sort_by=sort_by,
        actually_free=actually_f,
        open_source=open_source,
        self_hosted=self_hosted,
        pay_as_you_go=pay_as_you_go,
    )
    # search_tools() (unlike the directory/?fields=card path) returns raw
    # tool dicts, not _card_projection() output — apply the Sponsored-tier
    # editorial blurb override here so search results show the same
    # description a card or the detail page would.
    if isinstance(output, dict) and isinstance(output.get("results"), list):
        output["results"] = [apply_editorial_blurb(t) for t in output["results"]]
    return jsonify(output)


@api_bp.get("/recommendations")
@login_required
def recommendations():
    tools = _load_tools()

    ranked = sorted(tools, key=_rating_value, reverse=True)[:6]
    return jsonify(ranked)


@api_bp.get("/dashboard/recommendations")
@login_required
def dashboard_recommendations():
    from flask import session
    print("ENDPOINT COOKIES:", request.cookies)
    print("ENDPOINT SESSION:", session)
    print("ENDPOINT USER:", current_user)
    from app.services.personalized_recommender import get_personalized_recommendations
    limit = request.args.get("limit", 6, type=int)
    results = get_personalized_recommendations(current_user, limit=limit)
    return jsonify(results)


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
        collection_tools.sort(key=_rating_value, reverse=True)
    elif slug_value == "best-for-students":
        collection_tools = [t for t in tools if t.get("student_perk")]
        collection_tools.sort(key=_rating_value, reverse=True)
    elif slug_value == "best-for-coding":
        collection_tools = [
            t for t in tools
            if str(t.get("category", "")).strip().lower() == "coding"
        ]
        collection_tools.sort(key=_rating_value, reverse=True)
    elif slug_value == "best-for-writing":
        collection_tools = [
            t for t in tools
            if str(t.get("category", "")).strip().lower() == "writing & chat"
        ]
        collection_tools.sort(key=_rating_value, reverse=True)
    elif slug_value == "best-for-research":
        collection_tools = [
            t for t in tools
            if str(t.get("category", "")).strip().lower() == "research"
        ]
        collection_tools.sort(key=_rating_value, reverse=True)
    elif slug_value == "trending":
        collection_tools = [t for t in tools if bool(t.get("trending"))]
        collection_tools.sort(key=_rating_value, reverse=True)
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

        # Fallback: if we have fewer than 12 rated tools in the DB, fill with the highest-rated static tools from cache.
        if len(collection_tools) < 12:
            existing_slugs = {t.get("slug") or _tool_slug(t) for t in collection_tools}
            sorted_by_static = sorted(tools, key=lambda t: _safe_float(t.get("rating")), reverse=True)
            for tool in sorted_by_static:
                slug_key = _tool_slug(tool)
                if slug_key not in existing_slugs:
                    tool_copy = dict(tool)
                    # Use static rating & review count as fallback metrics
                    tool_copy["user_rating"] = _safe_float(tool.get("rating"))
                    tool_copy["user_rating_count"] = _safe_int(tool.get("review_count") or 5)
                    collection_tools.append(tool_copy)
                    existing_slugs.add(slug_key)
                if len(collection_tools) >= 24:
                    break

        collection_tools.sort(
            key=lambda t: float(t.get("user_rating", 0) or 0),
            reverse=True,
        )
    else:
        collection_tools = []

    from flask import make_response
    response = make_response(jsonify(
        {
            **config,
            "slug": slug_value,
            "count": len(collection_tools),
            "tools": collection_tools,
        }
    ))
    # Collections derive from the catalog; if any included tool changes
    # via /admin, the collection should reflect it on next nav.
    response.headers["Cache-Control"] = "no-cache, must-revalidate"
    return response


@api_bp.get("/trending")
def get_trending_today():
    from app.services.trending_data import resolve_trending_tools
    from app.models import TrendingVote
    from flask_login import current_user
    try:
        data = resolve_trending_tools()
        all_votes = TrendingVote.query.all()
        
        votes_by_slug = {}
        for vote in all_votes:
            slug = str(vote.tool_slug).strip().lower()
            if slug not in votes_by_slug:
                votes_by_slug[slug] = {"upvotes": 0, "downvotes": 0, "user_vote": 0}
            
            if vote.vote_type == 1:
                votes_by_slug[slug]["upvotes"] += 1
            elif vote.vote_type == -1:
                votes_by_slug[slug]["downvotes"] += 1
                
            if current_user.is_authenticated and vote.user_id == current_user.id:
                votes_by_slug[slug]["user_vote"] = vote.vote_type

        for category, items in data.items():
            for item in items:
                slug = str(item["slug"]).strip().lower()
                vote_info = votes_by_slug.get(slug, {"upvotes": 0, "downvotes": 0, "user_vote": 0})
                
                baseline = 100 - (item["rank"] * 10)
                net_votes = vote_info["upvotes"] - vote_info["downvotes"]
                item["final_score"] = baseline + net_votes
                item["upvotes"] = vote_info["upvotes"]
                item["downvotes"] = vote_info["downvotes"]
                item["user_vote"] = vote_info["user_vote"]
                item["net_votes"] = net_votes
                
            items.sort(key=lambda x: x["final_score"], reverse=True)
            
            for index, sorted_item in enumerate(items):
                sorted_item["display_rank"] = index + 1

        return jsonify(data)
    except Exception as e:
        current_app.logger.exception("Failed to get trending tools: %s", e)
        return jsonify({"error": "Failed to load trending tools"}), 500


@api_bp.post("/trending/vote")
@csrf.exempt
@login_required
def cast_trending_vote():
    from flask_login import current_user
    if not current_user.is_authenticated:
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json() or {}
    tool_slug = str(data.get("slug", "")).strip().lower()
    vote_type = data.get("vote_type")

    if not tool_slug or vote_type not in (1, -1):
        return jsonify({"error": "Invalid payload"}), 400

    from app.models import TrendingVote
    existing = TrendingVote.query.filter_by(user_id=current_user.id, tool_slug=tool_slug).first()

    if existing:
        if existing.vote_type == vote_type:
            db.session.delete(existing)
            user_vote = 0
        else:
            existing.vote_type = vote_type
            user_vote = vote_type
    else:
        new_vote = TrendingVote(user_id=current_user.id, tool_slug=tool_slug, vote_type=vote_type)
        db.session.add(new_vote)
        user_vote = vote_type

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("Failed to commit trending vote: %s", e)
        return jsonify({"error": "Database error"}), 500

    upvotes = TrendingVote.query.filter_by(tool_slug=tool_slug, vote_type=1).count()
    downvotes = TrendingVote.query.filter_by(tool_slug=tool_slug, vote_type=-1).count()

    return jsonify({
        "success": True,
        "user_vote": user_vote,
        "upvotes": upvotes,
        "downvotes": downvotes,
        "net_votes": upvotes - downvotes
    })


@api_bp.route('/public-stacks', methods=['GET'])
def get_public_stacks():
    from app.models import SavedStack, User, StackVote
    from flask_login import current_user

    rows = SavedStack.query.all()
    results = []

    # Pre-map votes
    votes = StackVote.query.all()
    votes_by_stack = {}
    for vote in votes:
        if vote.stack_id not in votes_by_stack:
            votes_by_stack[vote.stack_id] = {"count": 0, "users": set()}
        votes_by_stack[vote.stack_id]["count"] += 1
        votes_by_stack[vote.stack_id]["users"].add(vote.user_id)

    for row in rows:
        stack_data = {}
        if row.tools_json:
            try:
                stack_data = json.loads(row.tools_json)
            except Exception:
                pass

        is_private = bool(stack_data.get('is_private', False))
        if is_private:
            continue

        vote_info = votes_by_stack.get(row.id, {"count": 0, "users": set()})
        has_voted = False
        if current_user.is_authenticated and current_user.id in vote_info["users"]:
            has_voted = True

        creator = User.query.get(row.user_id)
        creator_name = creator.display_name or creator.email.split('@')[0] if creator else "Student"

        results.append({
            'id': row.id,
            'name': row.name or 'default',
            'created_at': row.created_at.isoformat() if row.created_at else None,
            'tools': stack_data.get('tools', []),
            'goal': stack_data.get('goal', ''),
            'budget': stack_data.get('budget', ''),
            'platform': stack_data.get('platform', ''),
            'level': stack_data.get('level', ''),
            'creator_name': creator_name,
            'upvotes': vote_info["count"],
            'has_voted': has_voted
        })

    results.sort(key=lambda x: (x['upvotes'], x['created_at'] or ''), reverse=True)
    return jsonify(results), 200


@csrf.exempt
@api_bp.route('/public-stacks/<int:stack_id>/upvote', methods=['POST'])
@login_required
def upvote_stack(stack_id):
    from app.models import StackVote, SavedStack
    SavedStack.query.get_or_404(stack_id)

    existing = StackVote.query.filter_by(user_id=current_user.id, stack_id=stack_id).first()
    if existing:
        db.session.delete(existing)
        user_voted = False
    else:
        db.session.add(StackVote(user_id=current_user.id, stack_id=stack_id))
        user_voted = True

    db.session.commit()
    upvotes = StackVote.query.filter_by(stack_id=stack_id).count()
    return jsonify({
        "success": True,
        "upvotes": upvotes,
        "has_voted": user_voted
    }), 200


@csrf.exempt
@api_bp.route('/public-stacks/<int:stack_id>/clone', methods=['POST'])
@login_required
def clone_stack(stack_id):
    from app.models import SavedStack
    original = SavedStack.query.get_or_404(stack_id)

    # Prepend 'Cloned: ' to distinguish the clone
    cloned = SavedStack(
        user_id=current_user.id,
        name=f"Cloned: {original.name}",
        tools_json=original.tools_json
    )
    db.session.add(cloned)
    db.session.commit()

    return jsonify({
        "success": True,
        "id": cloned.id,
        "name": cloned.name
    }), 201


# Link Finder Admin Background Task State
link_audit_state = {
    "is_running": False,
    "current_index": 0,
    "total_count": 0,
    "broken_links": [],
    "last_completed": None
}
link_audit_lock = threading.Lock()


def bg_link_audit_task(app_context):
    global link_audit_state
    with app_context:
        from app.tool_cache import get_cached_tools
        tools = get_cached_tools()

        with link_audit_lock:
            link_audit_state["is_running"] = True
            link_audit_state["total_count"] = len(tools)
            link_audit_state["current_index"] = 0
            link_audit_state["broken_links"] = []

        for tool in tools:
            with link_audit_lock:
                if not link_audit_state["is_running"]:
                    break
                link_audit_state["current_index"] += 1

            url = tool.get("affiliate_url") or tool.get("website") or tool.get("link") or tool.get("url")
            if not url:
                continue

            try:
                headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
                res = requests.head(url, timeout=4, headers=headers, allow_redirects=True)
                if res.status_code in (405, 403, 401):
                    res = requests.get(url, timeout=4, headers=headers, allow_redirects=True, stream=True)

                if res.status_code >= 400:
                    with link_audit_lock:
                        link_audit_state["broken_links"].append({
                            "slug": tool.get("slug"),
                            "name": tool.get("name"),
                            "url": url,
                            "status": res.status_code,
                            "error": f"HTTP {res.status_code}"
                        })
            except Exception as e:
                with link_audit_lock:
                    link_audit_state["broken_links"].append({
                        "slug": tool.get("slug"),
                        "name": tool.get("name"),
                        "url": url,
                        "status": "Error",
                        "error": str(type(e).__name__)
                    })

        with link_audit_lock:
            link_audit_state["is_running"] = False
            link_audit_state["last_completed"] = datetime.now(timezone.utc).isoformat()


@api_bp.get("/admin/audit-links")
@login_required
def admin_get_audit_links():
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Admin required"}), 403
    return jsonify(link_audit_state), 200


@csrf.exempt
@api_bp.post("/admin/audit-links")
@login_required
def admin_start_audit_links():
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Admin required"}), 403

    global link_audit_state
    with link_audit_lock:
        if link_audit_state["is_running"]:
            return jsonify({"message": "Audit is already running"}), 400

    try:
        app_obj = current_app._get_current_object()
        app_context = app_obj.app_context()
    except Exception:
        app_context = None
    if app_context:
        threading.Thread(target=bg_link_audit_task, args=(app_context,), daemon=True).start()
    return jsonify({"success": True, "message": "Audit started"}), 200


@csrf.exempt
@api_bp.post("/admin/audit-links/cancel")
@login_required
def admin_cancel_audit_links():
    if not getattr(current_user, "is_admin", False):
        return jsonify({"error": "Admin required"}), 403

    global link_audit_state
    with link_audit_lock:
        link_audit_state["is_running"] = False

    return jsonify({"success": True, "message": "Audit cancellation requested"}), 200


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
    ml_status = "active" if load_model() is not None else "inactive"

    return jsonify(
        {
            "total_tools": total_tools,
            "total_users": total_users,
            "new_users_today": new_users_today,
            "category_counts": dict(category_counts),
            "free_tools": free_count,
            "freemium_tools": freemium_count,
            "ml_status": ml_status,
            "model_status": ml_status,
            "index_size": index_size,
        }
    )


@api_bp.get("/admin/tier-breakdown")
@login_required
def admin_tier_breakdown():
    """Read-only reporting: how many catalog listings / pending submissions
    sit in each pricing tier (Free / Listing + Analytics / Fast-Track /
    Reviewed, plus the retired Quick Review, which still has live rows).

    Tier is OUR submission pricing ladder (app/pricing_tiers.py), not the
    tool's own Free/Freemium/Paid price label (that's what /admin/stats'
    free_tools counts). "live" = tools actually shown to visitors
    (get_visible_tools() — excludes hidden + not-yet-released). A live
    listing's tier is only recoverable by joining back to its Submission
    via CatalogTool.submission_id; Fast-Track is additionally detectable
    from the catalog row itself via _sponsored_active(). Tools seeded from
    tools.json never went through the ladder at all — reported separately
    as "editorial" so the live counts still reconcile to the visible total.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    from app.models import CatalogTool, Submission
    from app.pricing_tiers import TIERS, effective_tier

    # --- Pending submissions, grouped by effective tier -------------------
    # One bucket per tier in the ladder, retired ones included — a report
    # that silently drops a tier is how a paying cohort goes unnoticed.
    pending = {key: 0 for key in TIERS}
    for pricing_model, payment_status in db.session.query(
        Submission.pricing_model, Submission.payment_status
    ).filter(Submission.status == "pending", Submission.is_test.is_(False)):
        pending[effective_tier(pricing_model, payment_status)] += 1

    # --- Live catalog tools, grouped by tier -----------------------------
    # slug -> effective tier of the submission that created the row (if any)
    sub_tier_by_slug = {}
    for slug, pricing_model, payment_status in (
        db.session.query(
            CatalogTool.slug, Submission.pricing_model, Submission.payment_status
        )
        .join(Submission, CatalogTool.submission_id == Submission.id)
    ):
        sub_tier_by_slug[slug] = effective_tier(pricing_model, payment_status)

    live = {key: 0 for key in TIERS}
    # Seeded from tools.json, never ticketed through the ladder at all.
    live["editorial"] = 0
    for tool in get_visible_tools(DATA_PATH):
        tier = sub_tier_by_slug.get(tool.get("slug"))
        if _sponsored_active(tool):
            # Placement is visible on the catalog row itself, so it can be
            # counted without a submission — but when there IS one, credit
            # the tier that actually paid rather than lumping Reviewed in
            # with Fast-Track.
            live[tier if tier in live else "sponsored"] += 1
            continue
        if tier in live:
            # Any non-placement tier, named rather than listed inline: the
            # $19 Listing + Analytics tier buys no placement, so it reaches
            # here, and an inline ("quick", "free") tuple would have quietly
            # filed a paying cohort under "editorial".
            live[tier] += 1
        else:
            # No linked submission — seeded from tools.json, never ticketed.
            live["editorial"] += 1

    # --- Paid attempts: the fact the tier counts above deliberately hide --
    #
    # effective_tier() folds every unverified paid claim into "free". That is
    # correct for entitlement — an unconfirmed payment must never buy a perk —
    # but it also erases the single most important operational signal there
    # is: somebody tried to give us money. For a month the UI said only
    # "everyone picks free", when what had actually happened was that no
    # payment could be verified at all. This block exists so that reading
    # cannot happen again.
    from app.pricing_tiers import tier_for_pricing_model

    attempts = {
        "total": 0,
        "verified": 0,
        # Indeterminate — we never got an answer, so this may be real money
        # sitting unacknowledged. The number to act on.
        "needs_manual_review": 0,
        # PayPal answered and said no.
        "refused": 0,
        # Picked a paid tier and never paid. An abandoned checkout, not a
        # payment event — counted apart so it can't inflate "refused".
        "no_reference": 0,
        "revenue_usd": 0.0,
    }
    failure_reasons = Counter()

    for pricing_model, payment_status, payment_note in db.session.query(
        Submission.pricing_model, Submission.payment_status, Submission.payment_note
    ).filter(Submission.is_test.is_(False)):
        if not TIERS.get(tier_for_pricing_model(pricing_model), {}).get("paid"):
            continue
        attempts["total"] += 1

        if payment_status == "verified":
            attempts["verified"] += 1
            attempts["revenue_usd"] += float(
                TIERS.get(tier_for_pricing_model(pricing_model), {}).get("price", 0.0)
            )
            continue

        # payment_note is "<outcome>:<reason> ref=<ref>" since the
        # refused/indeterminate split. Older rows hold a bare reason or
        # nothing at all, so parse defensively rather than assuming shape.
        note = str(payment_note or "")
        reason = note.split(" ref=", 1)[0]
        if ":" in reason:
            reason = reason.split(":", 1)[1]
        reason = reason.strip() or "unknown"

        if payment_status == "needs_manual_review":
            attempts["needs_manual_review"] += 1
        elif reason == "missing_reference":
            attempts["no_reference"] += 1
        else:
            attempts["refused"] += 1
        failure_reasons[reason] += 1

    attempts["revenue_usd"] = round(attempts["revenue_usd"], 2)

    return jsonify(
        {
            "live": live,
            "pending": pending,
            "live_total": sum(live.values()),
            "pending_total": sum(pending.values()),
            "attempts": attempts,
            # Surfaced rather than silently dropped: a reporting screen that
            # quietly omits rows is how you end up mistrusting it later.
            "test_rows_excluded": db.session.query(Submission)
            .filter(Submission.is_test.is_(True))
            .count(),
            # Most common first — the top row is what to fix next.
            "failure_reasons": [
                {"reason": reason, "count": count}
                for reason, count in failure_reasons.most_common()
            ],
        }
    )


@api_bp.post("/admin/retrain")
@login_required
def retrain_model():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    try:
        from app.tool_cache import SEARCH_INDEX, refresh_tools_cache

        data_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "data",
            "tools.json",
        )
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        train_result = subprocess.run(
            [sys.executable, os.path.join(project_root, "scripts", "train_model.py")],
            cwd=project_root,
            capture_output=True,
            text=True,
            timeout=180,
        )
        if train_result.returncode != 0:
            return jsonify({"error": "Model retraining failed", "details": (train_result.stderr or train_result.stdout or "")[:500]}), 500

        clear_model_cache()

        refresh_tools_cache(data_path)
        model_status = "active" if load_model() is not None else "inactive"
        return jsonify(
            {
                "success": True,
                "message": f"Index rebuilt with {len(SEARCH_INDEX)} tools",
                "tool_count": len(SEARCH_INDEX),
                "model_status": model_status,
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@csrf.exempt
@api_bp.post("/admin/clear-cache")
@login_required
def admin_clear_cache():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    # Use refresh (via _refresh_catalog), NOT prime_tools_cache: prime is a
    # no-op once the cache is warm, so it silently failed to pick up catalog
    # changes (e.g. tools imported into the DB after startup). refresh_tools_cache
    # unconditionally reloads from the source of truth and rebuilds the index.
    _refresh_catalog()
    return jsonify({"success": True, "message": "Cache cleared and reloaded"})


def _is_admin() -> bool:
    """Admin if the account flag is set OR the email is in the configured
    allowlist. Self-heals: an allowlisted account gets is_admin persisted
    so every other is_admin check across the app also passes."""
    if not getattr(current_user, "is_authenticated", False):
        return False
    if getattr(current_user, "is_admin", False):
        return True
    allow = current_app.config.get("ADMIN_EMAILS", [])
    email = str(getattr(current_user, "email", "") or "").strip().lower()
    if email and email in allow:
        try:
            current_user.is_admin = True
            db.session.commit()
        except Exception:
            db.session.rollback()
        return True
    return False


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower()).strip("-")


# Fields the admin UI may edit. List fields accept an array or a
# comma-separated string. Everything else is treated as a scalar.
_EDITABLE_SCALARS = (
    "name", "description", "shortDescription", "tagline", "category",
    "subCategory", "pricing", "price", "link", "url", "website", "icon",
    "company", "difficulty", "bestFor", "affiliate_url",
    # ISO date (YYYY-MM-DD) of the last hand-test pass. Displayed as a
    # "Verified <Month Year>" chip on the tool card and detail page.
    "last_verified_at",
    # Admin-authored, Sponsored-tier-only description override — see
    # apply_editorial_blurb() in tool_cache.py. Never founder-editable.
    "editorial_blurb",
)
_EDITABLE_LISTS = ("features", "tags", "use_cases")
_EDITABLE_BOOLS = ("studentPerk", "student_perk", "hidden", "featured", "sponsored")


def _apply_payload(record: dict, payload: dict) -> dict:
    rec = dict(record)
    for key in _EDITABLE_SCALARS:
        if key in payload:
            rec[key] = str(payload.get(key) or "").strip()
    for key in _EDITABLE_LISTS:
        if key in payload:
            val = payload.get(key)
            if isinstance(val, str):
                val = [p.strip() for p in val.split(",") if p.strip()]
            rec[key] = [str(x).strip() for x in (val or []) if str(x).strip()]
    for key in _EDITABLE_BOOLS:
        if key in payload:
            rec[key] = bool(payload.get(key))
    return rec


def _refresh_catalog():
    from app.tool_cache import refresh_tools_cache
    refresh_tools_cache()


@api_bp.get("/admin/tools/<slug>")
@login_required
def admin_get_tool(slug):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    s = str(slug).strip().lower()
    tool = next(
        (t for t in (get_cached_tools() or [])
         if str(t.get("slug") or "").strip().lower() == s),
        None,
    )
    if tool is None:
        return jsonify({"error": "Tool not found"}), 404
    # Deliberately returns the RAW tool dict (real submitted description,
    # not apply_editorial_blurb()'s override) — this is what the edit form
    # loads and saves back, and baking the blurb in here would let an
    # unrelated field edit silently overwrite the submitter's own
    # description. sponsored_active tells the frontend whether to show the
    # editorial_blurb field at all (Sponsored-tier-only per Constraint 2).
    return jsonify({
        "success": True,
        "tool": tool,
        "sponsored_active": _sponsored_active(tool),
    })


@api_bp.put("/admin/tools/<slug>")
@csrf.exempt
@login_required
def update_tool(slug):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    from app.catalog_store import upsert_tool
    from app.tool_cache import _normalize_tool_record

    payload = request.get_json(silent=True) or {}
    s = str(slug).strip().lower()
    existing = next(
        (t for t in (get_cached_tools() or [])
         if str(t.get("slug") or "").strip().lower() == s),
        None,
    )
    if existing is None:
        return jsonify({"error": "Tool not found"}), 404

    merged = _apply_payload(existing, payload)
    merged["slug"] = s
    if not merged.get("name"):
        return jsonify({"error": "Name is required"}), 400

    record = _normalize_tool_record(merged)
    if not upsert_tool(record):
        return jsonify({"error": "Save failed"}), 500
    _refresh_catalog()
    return jsonify({"success": True, "tool": record})


@api_bp.post("/admin/tools")
@csrf.exempt
@login_required
def create_tool():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    from app.catalog_store import upsert_tool
    from app.tool_cache import _normalize_tool_record

    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400

    slug = _slugify(payload.get("slug") or name)
    if not slug:
        return jsonify({"error": "Could not derive a slug"}), 400

    if any(str(t.get("slug") or "").strip().lower() == slug
           for t in (get_cached_tools() or [])):
        return jsonify({"error": f"A tool with slug '{slug}' already exists"}), 409

    record = _normalize_tool_record(_apply_payload({"slug": slug}, payload))
    record["slug"] = slug
    if not upsert_tool(record):
        return jsonify({"error": "Create failed"}), 500
    _refresh_catalog()
    return jsonify({"success": True, "tool": record}), 201


@api_bp.post("/admin/tools/<slug>/hide")
@csrf.exempt
@login_required
def hide_tool(slug):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.catalog_store import set_fields
    payload = request.get_json(silent=True) or {}

    # delay_days is a manual override of the staggered-release gate (e.g.
    # "hold this specific tool back N more days") — distinct from the
    # permanent on/off `hidden` flag. Passing it implies hidden=False so
    # the tool relies on visible_at alone once the delay elapses, instead
    # of also needing a separate un-hide step.
    if "delay_days" in payload:
        from datetime import datetime, timezone, timedelta
        try:
            days = float(payload.get("delay_days"))
        except (TypeError, ValueError):
            return jsonify({"error": "delay_days must be a number"}), 400
        visible_at = datetime.now(timezone.utc) + timedelta(days=days)
        if not set_fields(slug, hidden=False, visible_at=visible_at):
            return jsonify({"error": "Tool not found"}), 404
        _refresh_catalog()
        return jsonify({"success": True, "hidden": False, "visible_at": visible_at.isoformat()})

    hidden = payload.get("hidden", True)
    if not set_fields(slug, hidden=bool(hidden)):
        return jsonify({"error": "Tool not found"}), 404
    _refresh_catalog()
    return jsonify({"success": True, "hidden": bool(hidden)})


@api_bp.put("/admin/tools/<slug>/affiliate")
@csrf.exempt
@login_required
def set_tool_affiliate(slug):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.catalog_store import set_fields
    url = str((request.get_json(silent=True) or {}).get("affiliate_url") or "").strip()
    if not set_fields(slug, affiliate_url=url):
        return jsonify({"error": "Tool not found"}), 404
    _refresh_catalog()
    return jsonify({"success": True, "affiliate_url": url})


@api_bp.delete("/admin/tools/<slug>")
@csrf.exempt
@login_required
def delete_tool(slug):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.catalog_store import delete_tool as _del
    if not _del(slug):
        return jsonify({"error": "Tool not found"}), 404
    _refresh_catalog()
    return jsonify({"success": True})


@api_bp.delete("/admin/reviews/<int:review_id>")
@login_required
def admin_delete_review(review_id):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    r = Review.query.get_or_404(review_id)
    db.session.delete(r)
    db.session.commit()
    return jsonify({"success": True})

@api_bp.delete("/admin/ratings/<int:rating_id>")
@login_required
def admin_delete_rating(rating_id):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    r = Rating.query.get_or_404(rating_id)
    db.session.delete(r)
    db.session.commit()
    return jsonify({"success": True})

@api_bp.get("/admin/reviews")
@login_required
def admin_get_reviews():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import Review
    reviews = Review.query.order_by(Review.created_at.desc()).limit(100).all()
    return jsonify({
        "reviews": [{
            "id": r.id,
            # User has display_name/email — full_name/username don't exist
            # and were raising AttributeError -> 500 (blank reviews tab).
            "user": ((r.user.display_name or r.user.email) if r.user else "Anonymous"),
            "tool_slug": r.tool_slug,
            "body": r.body,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "is_hidden": r.is_hidden,
        } for r in reviews]
    })


@csrf.exempt
@api_bp.post("/finder")
def finder():
    data = request.get_json(silent=True) or {}
    goals = _as_choice_list(data.get("goal"))
    budget = _normalize_text(data.get("budget"))
    platforms = _as_choice_list(data.get("platform"))
    level = _normalize_text(data.get("level"))
    # Accept use_case from form OR JSON for backward compat with the old POST
    # shape; new requests send JSON.
    use_case = request.form.get("use_case", "").strip() or _normalize_text(data.get("use_case"))

    current_app.logger.info(
        "[finder] selections goals=%s budget=%s platforms=%s level=%s use_case=%r",
        goals, budget, platforms, level, use_case,
    )

    # Primary path: full scoring (category veto, pricing matrix, platform,
    # level tags, rating). Returns 0-6 tools sorted by match_score.
    try:
        tools = _load_tools() or []
        results = _rank_finder_tools(
            tools,
            goal=goals,
            budget=budget,
            platform=platforms,
            level=level,
            use_case=use_case,
            limit=6,
        )
        if results:
            current_app.logger.info(
                "[finder] scored returning %d tools: %s",
                len(results), [t.get("name") for t in results],
            )
            return jsonify({"tools": results, "count": len(results)})
        # No results from scoring is also a signal — fall through to the
        # rating-only safety net so the wizard never returns an empty list.
        current_app.logger.info("[finder] scorer returned 0 results, falling back")
    except Exception:
        # Truly defensive: if scoring throws (e.g., catalog payload shape
        # changed), keep the wizard usable instead of bubbling a 500.
        current_app.logger.exception("[finder] scoring failed, falling back")

    # Safety-net fallback: pure rating + review-count sort within the goal's
    # allowed categories. Deliberately does NOT re-call _rank_finder_tools —
    # if the scorer just failed, calling it again with the same inputs will
    # fail the same way. This path is intentionally simple so it can't fail.
    tools = get_cached_tools(DATA_PATH) or []

    if goals:
        allowed = set()
        for g in goals:
            allowed.update(FINDER_GOAL_CATEGORY_MAP.get(g, []))
        if allowed:
            tools = [t for t in tools if _normalize_text(t.get("category")) in allowed]

    if budget == "free":
        free_only = [t for t in tools if _pricing_value(t) == "free"]
        # If "free" filter empties the result set, keep the wider list rather
        # than show nothing (the user's preference is a preference, not a hard
        # gate — same convention as the budget matrix in the main scorer).
        if free_only:
            tools = free_only

    tools.sort(
        key=lambda t: (_rating_value(t), float(t.get("review_count", 0) or 0)),
        reverse=True,
    )

    primary_goal = goals[0] if goals else "your workflow"
    results = [
        {
            **tool,
            "match_score": 0.0,
            "reason": _build_finder_reason(tool, use_case, _normalize_budget_choice(budget))
                      or f"Great tool for {primary_goal}",
        }
        for tool in tools[:6]
    ]

    current_app.logger.info(
        "[finder] fallback returning %d tools: %s",
        len(results), [t.get("name") for t in results],
    )
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
@api_bp.route("/profile/preferences", methods=["PUT"])
def update_profile_preferences():
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    interests = payload.get("interests") or []
    goals = payload.get("goals") or []
    skill_level = str(payload.get("skill_level") or "").strip()
    pricing_pref = str(payload.get("pricing_pref") or "").strip()

    if not isinstance(interests, list):
        interests = [interests] if interests else []
    if not isinstance(goals, list):
        goals = [goals] if goals else []

    interests = [str(x).strip() for x in interests if str(x).strip()]
    goals = [str(x).strip() for x in goals if str(x).strip()]

    # Validate categories to align with canonical categories
    valid_categories = {
        "Coding", "Writing & Chat", "Research", "Productivity",
        "Image Generation", "Video Generation", "Audio & Voice"
    }
    user_interests = []
    for category in interests:
        matched = next((c for c in valid_categories if c.lower() == category.lower()), None)
        if matched:
            user_interests.append(matched)
        else:
            user_interests.append(category)

    current_user.interests = ",".join(user_interests)
    current_user.goals = ",".join(goals)
    current_user.skill_level = skill_level
    current_user.pricing_pref = pricing_pref
    current_user.onboarding_completed = True

    # Synchronize preferences JSON column for backwards compatibility
    prefs = {}
    if current_user.preferences:
        try:
            prefs = json.loads(current_user.preferences)
        except Exception:
            pass
    if not isinstance(prefs, dict):
        prefs = {}

    prefs["interests"] = user_interests
    prefs["goals"] = goals
    prefs["skill_level"] = skill_level
    prefs["preferred_pricing"] = pricing_pref
    prefs["interest_tags"] = user_interests
    prefs["pricing_pref"] = pricing_pref
    current_user.preferences = json.dumps(prefs)

    # Invalidate Gemini recommendation cache
    from app.services.personalized_recommender import RECOMMENDATIONS_CACHE
    RECOMMENDATIONS_CACHE.pop(current_user.id, None)

    db.session.commit()

    return jsonify(_serialize_user(current_user))


STUDENT_EMAIL_REGEX = re.compile(r'@[a-zA-Z0-9.-]+\.(edu|ac\.[a-z]{2}|edu\.[a-z]{2})$', re.IGNORECASE)

@csrf.exempt
@api_bp.route("/profile/verify-student", methods=["POST"])
@login_required
def verify_student():
    payload = request.get_json(silent=True) or {}
    school_email = str(payload.get("school_email") or "").strip().lower()
    school_name = str(payload.get("school_name") or "").strip()
    grad_year = str(payload.get("grad_year") or "").strip()

    if not school_email or not school_name or not grad_year:
        return jsonify({"error": "All fields (email, school name, graduation year) are required."}), 400

    if not STUDENT_EMAIL_REGEX.search(school_email):
        return jsonify({"error": "Please enter a valid student email address (e.g., ending in .edu, .edu.in, .ac.uk)"}), 400

    # Load preferences
    prefs = {}
    if current_user.preferences:
        try:
            prefs = json.loads(current_user.preferences)
        except Exception:
            pass
    if not isinstance(prefs, dict):
        prefs = {}

    from datetime import datetime, timezone
    prefs["student_verification"] = {
        "school_name": school_name,
        "grad_year": grad_year,
        "school_email": school_email,
        "verified_at": datetime.now(timezone.utc).isoformat()
    }

    current_user.student_status = True
    current_user.preferences = json.dumps(prefs)
    db.session.commit()

    return jsonify(_serialize_user(current_user)), 200


@csrf.exempt
@api_bp.route("/profile/verify-student", methods=["DELETE"])
@login_required
def reset_student_verification():
    # Load preferences
    prefs = {}
    if current_user.preferences:
        try:
            prefs = json.loads(current_user.preferences)
        except Exception:
            pass
    if not isinstance(prefs, dict):
        prefs = {}

    prefs.pop("student_verification", None)
    current_user.student_status = False
    current_user.preferences = json.dumps(prefs)
    db.session.commit()

    return jsonify(_serialize_user(current_user)), 200



@api_bp.route("/profile/workflow-analytics", methods=["GET"])
@login_required
def get_workflow_analytics():
    from app.models import Favorite, SavedStack
    from app.tool_cache import get_visible_tools

    # 1. Fetch user activity
    favorites = Favorite.query.filter_by(user_id=current_user.id).all()
    stacks = SavedStack.query.filter_by(user_id=current_user.id).all()
    
    # Grab recently viewed slugs from request query params
    recent_slugs_raw = request.args.get("recent", "")
    recent_slugs = [s.strip().lower() for s in recent_slugs_raw.split(",") if s.strip()]

    # If no activity whatsoever, return error/tip message
    if not favorites and not stacks and not recent_slugs:
        return jsonify({
            "error": "No tools found in your favorites, toolkits, or history. Add or view some tools first to unlock your AI Persona!"
        }), 200

    all_tools = get_visible_tools()
    tool_by_slug = {str(t.get("slug") or "").strip().lower(): t for t in all_tools}

    # Resolve details
    fav_details = []
    stack_details = []
    recent_details = []

    user_categories = []

    for f in favorites:
        f_slug = str(f.tool_id or "").strip().lower()
        tool = tool_by_slug.get(f_slug)
        if tool:
            fav_details.append({
                "name": tool.get("name"),
                "category": tool.get("category"),
                "tagline": tool.get("tagline") or tool.get("shortDescription") or ""
            })
            user_categories.append(tool.get("category") or "General")

    for s in stacks:
        stack_tools = []
        if s.tools_json:
            try:
                stack_tools = json.loads(s.tools_json).get("tools", [])
            except Exception:
                pass
        for t_slug in stack_tools:
            t_slug = str(t_slug).strip().lower()
            tool = tool_by_slug.get(t_slug)
            if tool:
                stack_details.append({
                    "name": tool.get("name"),
                    "category": tool.get("category"),
                    "tagline": tool.get("tagline") or tool.get("shortDescription") or ""
                })
                user_categories.append(tool.get("category") or "General")

    for r_slug in recent_slugs:
        tool = tool_by_slug.get(r_slug)
        if tool:
            recent_details.append({
                "name": tool.get("name"),
                "category": tool.get("category"),
                "tagline": tool.get("tagline") or tool.get("shortDescription") or ""
            })
            user_categories.append(tool.get("category") or "General")

    # Load preferences
    interests = []
    goals = []
    if current_user.preferences:
        try:
            prefs = json.loads(current_user.preferences)
            interests = prefs.get("interests", [])
            goals = prefs.get("goals", [])
        except Exception:
            pass

    # 2. Local Fallback Generator Function
    def run_local_fallback():
        from collections import Counter
        counts = Counter(user_categories)
        total = sum(counts.values()) or 1
        
        # Calculate percentages
        dist = {}
        for cat, val in counts.items():
            dist[cat] = round((val / total) * 100)
            
        # Ensure it sums to exactly 100 if there's any distribution
        if dist:
            diff = 100 - sum(dist.values())
            if diff != 0:
                max_cat = max(dist, key=dist.get)
                dist[max_cat] += diff
        else:
            dist = {"General": 100}

        # Determine dominant category
        dom_cat = max(dist, key=dist.get) if dist else "General"
        
        if dom_cat == "Coding":
            persona = "Software Developer"
            desc = "Automates tasks, writes code, and deploys scalable systems."
            insights = "Your AI workflow is heavily optimized for coding. While this makes you super efficient at engineering, you might want to introduce Productivity tools or Writing & Chat assistants to write clear documentation and coordinate team tasks."
            gap_cat = "Productivity"
        elif dom_cat == "Research":
            persona = "Research Specialist"
            desc = "Focuses on literature reviews, citations, and summaries."
            insights = "You are a research power-user, gathering insights and citations efficiently. Adding Writing & Chat tools can help you transform these raw citations into polished essays or summaries much faster."
            gap_cat = "Writing & Chat"
        elif dom_cat == "Writing & Chat":
            persona = "Content Creator"
            desc = "Specializes in drafts, copywriting, and brainstorming."
            insights = "Your toolkit is built for generation and communication. To elevate your work, we recommend adding Research tools to back your claims with verified facts, or Productivity organizers to track your publishing schedule."
            gap_cat = "Research"
        elif dom_cat in ["Image Generation", "Video Generation", "Audio & Voice", "Design & Graphics"]:
            persona = "Creative Multimodal Designer"
            desc = "Crafts visuals, speech synthesis, and video assets."
            insights = "Your workflow is rich with multimedia generation. Adding Productivity tools will help you streamline project handoffs, while Writing & Chat assistants can help you script your video and audio narrations."
            gap_cat = "Productivity"
        else:
            persona = "Productivity Optimizer"
            desc = "Streamlines tasks, files, and personal workspace organization."
            insights = "You are focused on optimization and organization. Balancing your stack with specific specialized assistants (like Coding or Writing tools) can help you execute projects directly from your organized space."
            gap_cat = "Writing & Chat"

        # Recommendations for gaps
        fallback_recs = []
        # Find tools in gap_cat that are not already in their stack
        user_slugs = set([str(f.tool_id or "").strip().lower() for f in favorites] + 
                         [str(slug).strip().lower() for s in stacks for slug in json.loads(s.tools_json).get("tools", []) if s.tools_json] +
                         recent_slugs)
        
        gap_tools = [t for t in all_tools if str(t.get("category") or "").strip().lower() == gap_cat.lower() and str(t.get("slug") or "").strip().lower() not in user_slugs]
        
        # Sort by rating
        gap_tools = sorted(gap_tools, key=lambda t: float(t.get("rating") or 0.0), reverse=True)
        
        for gt in gap_tools[:2]:
            fallback_recs.append({
                "name": gt.get("name") or "AI Tool",
                "slug": gt.get("slug") or "",
                "category": gt.get("category") or gap_cat,
                "reason": f"Excellent {gap_cat} tool to round out your workflow and balance your dominant {dom_cat} tools."
            })
            
        # In case we couldn't find enough
        if len(fallback_recs) < 2:
            # Add static fallback tools
            static_tools = [
                {"name": "Notion", "slug": "notion", "category": "Productivity", "reason": "Organize your workflow notes in a single workspace."},
                {"name": "ChatGPT", "slug": "chatgpt", "category": "Writing & Chat", "reason": "All-purpose assistant to brainstorm and edit drafts."}
            ]
            for st in static_tools:
                if st["slug"] not in user_slugs and len(fallback_recs) < 2:
                    fallback_recs.append(st)

        return {
            "persona": persona,
            "persona_description": desc,
            "workflow_insights": insights,
            "distribution": dist,
            "recommendations": fallback_recs
        }

    # 3. Key Rotation & LLM Call
    keys = []
    env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
    if env_keys_str:
        keys.extend([k.strip() for k in re.split(r'[,\n\r]+', env_keys_str) if k.strip()])
    single_key = os.environ.get("GEMINI_API_KEY")
    if single_key and single_key not in keys:
        keys.append(single_key)

    prompt = f"""
    You are an expert AI productivity auditor. Analyze this user's current AI tool choices and generate a workflow audit JSON.
    
    User Activity Profile:
    - Favorited Tools: {json.dumps(fav_details)}
    - Saved Toolkits (Stacks): {json.dumps(stack_details)}
    - Recently Viewed Tools: {json.dumps(recent_details)}
    - Interests: {list(interests)}
    - Goals: {list(goals)}
    
    Your response must be a single, valid JSON object matching exactly this structure:
    {{
      "persona": "Name of AI Persona (e.g. Research Specialist, Content Writer, Software Developer)",
      "persona_description": "A short, descriptive subtitle summarizing their persona (under 120 chars)",
      "workflow_insights": "A short paragraph (2-3 sentences, under 300 chars) analyzing their toolkit's strengths, critical workflow gaps, and how they can optimize it.",
      "distribution": {{
        "CategoryName1": PercentageInteger1,
        "CategoryName2": PercentageInteger2,
        ...
      }},
      "recommendations": [
        {{
          "name": "Name of recommended tool",
          "slug": "slug-of-the-tool",
          "category": "Category of the tool",
          "reason": "1-sentence description (under 120 chars) explaining exactly how it fills their gap."
        }}
      ]
    }}
    
    Use only these exact categories in distribution and recommendations: Coding, Writing & Chat, Research, Productivity, Image Generation, Video Generation, Audio & Voice, Design & Graphics.
    The sum of percentages in distribution must be 100.
    Recommend 2-3 tools that are NOT already in their favorites or saved toolkits.
    Respond ONLY with the JSON block. Do not include markdown code block formatting (like ```json).
    """

    for i, key in enumerate(keys):
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "OBJECT",
                        "properties": {
                            "persona": {"type": "STRING"},
                            "persona_description": {"type": "STRING"},
                            "workflow_insights": {"type": "STRING"},
                            "distribution": {
                                "type": "OBJECT",
                                "additionalProperties": {"type": "INTEGER"}
                            },
                            "recommendations": {
                                "type": "ARRAY",
                                "items": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "name": {"type": "STRING"},
                                        "slug": {"type": "STRING"},
                                        "category": {"type": "STRING"},
                                        "reason": {"type": "STRING"}
                                    },
                                    "required": ["name", "slug", "category", "reason"]
                                }
                            }
                        },
                        "required": ["persona", "persona_description", "workflow_insights", "distribution", "recommendations"]
                    }
                }
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=12)
            if response.status_code == 429:
                print(f"[Workflow Analytics] Key {i+1} hit rate limits (429). Rotating...")
                continue
            elif response.status_code != 200:
                print(f"[Workflow Analytics] Key {i+1} failed with status {response.status_code}. Rotating...")
                continue
                
            res_data = response.json()
            content_text = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            if content_text.startswith("```json"):
                content_text = content_text[7:]
            elif content_text.startswith("```"):
                content_text = content_text[3:]
            if content_text.endswith("```"):
                content_text = content_text[:-3]
            parsed = json.loads(content_text.strip())
            
            # Simple integrity checks
            if not parsed.get("persona") or not parsed.get("distribution") or not parsed.get("recommendations"):
                print(f"[Workflow Analytics] Key {i+1} returned incomplete payload. Rotating...")
                continue
                
            return jsonify(parsed), 200
        except Exception as e:
            print(f"[Workflow Analytics] Gemini attempt with Key {i+1} failed: {str(e)}")
            continue

    groq_key = os.environ.get("GROQ_API_KEY")
    if groq_key:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {groq_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "llama3-8b-8192",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"}
            }
            response = requests.post(url, headers=headers, json=payload, timeout=12)
            if response.status_code == 200:
                res_data = response.json()
                content_text = res_data["choices"][0]["message"]["content"].strip()
                if content_text.startswith("```json"):
                    content_text = content_text[7:]
                elif content_text.startswith("```"):
                    content_text = content_text[3:]
                if content_text.endswith("```"):
                    content_text = content_text[:-3]
                parsed = json.loads(content_text.strip())
                if parsed.get("persona") and parsed.get("distribution") and parsed.get("recommendations"):
                    return jsonify(parsed), 200
            else:
                print(f"[Workflow Analytics] Groq failed with status {response.status_code}")
        except Exception as e:
            print(f"[Workflow Analytics] Groq attempt failed: {str(e)}")

    # Fallback to local analyzer if all keys fail
    print("[Workflow Analytics] All LLM attempts failed. Using local fallback engine.")
    return jsonify(run_local_fallback()), 200



@api_bp.route("/profile/security/info", methods=["GET"])
@login_required
def get_security_info():
    from app.models import LinkedAccount
    from flask import session

    # Auto-migrate legacy oauth_provider to LinkedAccount if missing
    if current_user.oauth_provider:
        existing = LinkedAccount.query.filter_by(user_id=current_user.id, provider=current_user.oauth_provider).first()
        if not existing:
            try:
                new_la = LinkedAccount(
                    user_id=current_user.id,
                    provider=current_user.oauth_provider,
                    oauth_picture_url=current_user.oauth_picture_url
                )
                db.session.add(new_la)
                db.session.commit()
            except Exception:
                db.session.rollback()

    from datetime import timezone

    linked = []
    for la in current_user.linked_accounts:
        created_at = la.created_at
        if created_at and created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        linked.append({
            "provider": la.provider,
            "picture": la.oauth_picture_url or "",
            "created_at": created_at.isoformat() if created_at else None
        })

    current_session_uuid = session.get('user_uuid')
    sessions_list = []
    for s in current_user.sessions:
        last_active = s.last_active_at
        if last_active and last_active.tzinfo is None:
            last_active = last_active.replace(tzinfo=timezone.utc)
        sessions_list.append({
            "session_uuid": s.session_uuid,
            "ip_address": s.ip_address or "Unknown IP",
            "user_agent": s.user_agent or "Unknown Device",
            "location": s.location or "Unknown Location",
            "last_active_at": last_active.isoformat() if last_active else None,
            "is_current": (s.session_uuid == current_session_uuid)
        })

    # Sort sessions so current is first, then by last active desc
    sessions_list.sort(key=lambda x: (not x["is_current"], x["last_active_at"] or ""), reverse=True)

    return jsonify({
        "has_password": bool(current_user.password_hash),
        "linked_accounts": linked,
        "sessions": sessions_list
    }), 200


@csrf.exempt
@api_bp.route("/profile/security/change-password", methods=["POST"])
@login_required
def change_password():
    payload = request.get_json(silent=True) or {}
    current_password = str(payload.get("current_password") or "")
    new_password = str(payload.get("new_password") or "")

    if current_user.password_hash:
        if not current_password:
            return jsonify({"error": "Current password is required."}), 400
        if not bcrypt.check_password_hash(current_user.password_hash, current_password):
            return jsonify({"error": "Incorrect current password."}), 400

    if not new_password or len(new_password) < 8:
        return jsonify({"error": "New password must be at least 8 characters long."}), 400

    try:
        current_user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to update password: {str(e)}"}), 500

    return jsonify({"message": "Password updated successfully."}), 200


@csrf.exempt
@api_bp.route("/profile/security/unlink/<provider>", methods=["POST"])
@login_required
def unlink_provider(provider):
    from app.models import LinkedAccount
    provider = provider.strip().lower()

    if provider not in ("google", "github", "linkedin"):
        return jsonify({"error": "Invalid provider."}), 400

    # Safety checks: must have a password OR at least one other oauth link
    linked_providers = [la.provider for la in current_user.linked_accounts]
    
    # ensure it exists
    la_to_delete = LinkedAccount.query.filter_by(user_id=current_user.id, provider=provider).first()
    if not la_to_delete and current_user.oauth_provider != provider:
        return jsonify({"error": "Provider is not linked."}), 400

    other_providers = [p for p in linked_providers if p != provider]
    
    if not current_user.password_hash and not other_providers:
        return jsonify({
            "error": "Cannot unlink your only login method. Please configure a password or link another provider first to prevent locking yourself out."
        }), 400

    try:
        if la_to_delete:
            db.session.delete(la_to_delete)
        
        # Sync user's primary oauth_provider field if it matches the unlinked provider
        if current_user.oauth_provider == provider:
            current_user.oauth_provider = other_providers[0] if other_providers else None
        
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to unlink provider: {str(e)}"}), 500

    return jsonify({"message": f"Successfully unlinked {provider.capitalize()}."}), 200


@csrf.exempt
@api_bp.route("/profile/security/sessions/<session_uuid>", methods=["DELETE"])
@login_required
def revoke_session(session_uuid):
    from app.models import UserSession
    from flask import session as flask_session

    sess = UserSession.query.filter_by(session_uuid=session_uuid, user_id=current_user.id).first()
    if not sess:
        return jsonify({"error": "Session not found."}), 404

    try:
        # If they are deleting their current session, log them out manually
        is_current = (sess.session_uuid == flask_session.get('user_uuid'))
        
        db.session.delete(sess)
        db.session.commit()

        if is_current:
            from flask_login import logout_user
            logout_user()
            flask_session.pop('user_uuid', None)
            return jsonify({"message": "Current session revoked. Logging out...", "logged_out": True}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to revoke session: {str(e)}"}), 500

    return jsonify({"message": "Session revoked successfully."}), 200


@api_bp.route("/exchange-rates", methods=["GET"])
def get_exchange_rates_route():
    from app.currency import get_exchange_rates
    return jsonify({
        "base": "USD",
        "rates": get_exchange_rates()
    }), 200


@api_bp.route("/profile/submissions", methods=["GET"])
@login_required
def get_profile_submissions():
    from app.models import Submission
    subs = Submission.query.filter_by(submitter_email=current_user.email).order_by(Submission.submitted_at.desc()).all()
    
    return jsonify({
        "submissions": [{
            "id": s.id,
            "name": s.name,
            "website": s.website,
            "category": s.category,
            "description": s.description,
            "status": s.status,
            "submitted_at": s.submitted_at.isoformat()
        } for s in subs]
    }), 200


@api_bp.route("/profile/public-settings", methods=["GET"])
@login_required
def get_public_settings():
    return jsonify({
        "is_profile_public": bool(current_user.is_profile_public),
        "public_username": current_user.public_username or "",
        "bio": current_user.bio or "",
        "github_username": current_user.github_username or "",
        "linkedin_username": current_user.linkedin_username or "",
        "twitter_username": current_user.twitter_username or ""
    }), 200


@csrf.exempt
@api_bp.route("/profile/public-settings", methods=["PUT"])
@login_required
def update_public_settings():
    payload = request.get_json(silent=True) or {}
    
    is_profile_public = payload.get("is_profile_public")
    public_username = payload.get("public_username")
    bio = payload.get("bio")
    github_username = payload.get("github_username")
    linkedin_username = payload.get("linkedin_username")
    twitter_username = payload.get("twitter_username")
    
    if is_profile_public is not None:
        current_user.is_profile_public = bool(is_profile_public)
        
    if public_username is not None:
        username_str = str(public_username).strip().lower()
        if not username_str:
            if current_user.is_profile_public:
                return jsonify({"error": "Public username is required if profile is public."}), 400
            current_user.public_username = None
        else:
            # Validate username format (alphanumeric and dashes, 3-30 chars)
            import re
            if not re.match(r"^[a-z0-9\-]{3,30}$", username_str):
                return jsonify({"error": "Username must be 3-30 characters long and contain only lowercase letters, numbers, and dashes."}), 400
            
            # Check uniqueness
            existing = User.query.filter(User.public_username == username_str).first()
            if existing and existing.id != current_user.id:
                return jsonify({"error": "Username is already taken by another user."}), 400
                
            current_user.public_username = username_str
            
    if bio is not None:
        bio_str = str(bio).strip()
        if len(bio_str) > 500:
            return jsonify({"error": "Bio cannot exceed 500 characters."}), 400
        current_user.bio = bio_str
        
    if github_username is not None:
        current_user.github_username = str(github_username).strip()
        
    if linkedin_username is not None:
        current_user.linkedin_username = str(linkedin_username).strip()
        
    if twitter_username is not None:
        current_user.twitter_username = str(twitter_username).strip()
        
    db.session.commit()
    
    return jsonify({
        "success": True,
        "message": "Public profile settings updated successfully.",
        "is_profile_public": current_user.is_profile_public,
        "public_username": current_user.public_username or "",
        "bio": current_user.bio or "",
        "github_username": current_user.github_username or "",
        "linkedin_username": current_user.linkedin_username or "",
        "twitter_username": current_user.twitter_username or ""
    }), 200


@api_bp.route("/users/profile/<username>", methods=["GET"])
def get_public_profile(username):
    from app.models import User, Favorite, SavedStack
    from app.tool_cache import get_visible_tools
    
    username_clean = str(username).strip().lower()
    user = User.query.filter(db.func.lower(User.public_username) == username_clean).first()
    
    if not user or not user.is_profile_public:
        return jsonify({"error": "Profile not found or is private."}), 404

    # Resolve favorites
    favorites = Favorite.query.filter_by(user_id=user.id).all()
    all_tools = get_visible_tools()
    tool_by_slug = {str(t.get("slug") or "").strip().lower(): t for t in all_tools}
    
    fav_details = []
    for f in favorites:
        f_slug = str(f.tool_id or "").strip().lower()
        tool = tool_by_slug.get(f_slug)
        if tool:
            fav_details.append({
                "name": tool.get("name"),
                "slug": tool.get("slug"),
                "category": tool.get("category"),
                "tagline": tool.get("tagline") or tool.get("shortDescription") or "",
                "logo": tool.get("icon") or ""
            })

    # Resolve public stacks
    stacks = SavedStack.query.filter_by(user_id=user.id).all()
    public_stacks = []
    for row in stacks:
        stack_data = {}
        if row.tools_json:
            try:
                stack_data = json.loads(row.tools_json)
            except Exception:
                pass
        
        if not bool(stack_data.get("is_private", False)):
            # Resolve tools inside the stack
            resolved_tools = []
            for t_slug in stack_data.get("tools", []):
                t_slug = str(t_slug).strip().lower()
                tool = tool_by_slug.get(t_slug)
                if tool:
                    resolved_tools.append({
                        "name": tool.get("name"),
                        "slug": tool.get("slug"),
                        "logo": tool.get("icon") or "",
                        "category": tool.get("category")
                    })
            
            public_stacks.append({
                "id": row.id,
                "name": row.name or "default",
                "goal": stack_data.get("goal", ""),
                "budget": stack_data.get("budget", ""),
                "platform": stack_data.get("platform", ""),
                "level": stack_data.get("level", ""),
                "tools": resolved_tools
            })
            
    return jsonify({
        "display_name": user.display_name or "Anonymous User",
        "avatar_url": user.oauth_picture_url or "",
        "bio": user.bio or "",
        "github_username": user.github_username or "",
        "linkedin_username": user.linkedin_username or "",
        "twitter_username": user.twitter_username or "",
        "favorites": fav_details,
        "stacks": public_stacks
    }), 200


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


        login_user(user, remember=True)
        # Attach Sentry user context if available
        try:
            import sentry_sdk as _sentry
            try:
                _sentry.set_user({"id": str(user.id), "email": user.email, "username": user.display_name})
            except Exception:
                pass
        except Exception:
            pass
        return jsonify(_serialize_user(user))
    except Exception as e:
        current_app.logger.exception("/auth/login failed: %s", e)
        return jsonify({"error": "Login temporarily unavailable"}), 500


@csrf.exempt
@api_bp.route("/auth/logout", methods=["POST"])
def auth_logout():
    """Explicit logout — clears the server session AND the Flask-Login
    remember cookie so the user stays logged out until they sign in again."""
    # Clear Sentry user context (best-effort) then logout
    try:
        import sentry_sdk as _sentry
        try:
            _sentry.set_user(None)
        except Exception:
            pass
    except Exception:
        pass

    try:
        logout_user()
    except Exception:
        pass
    return jsonify({"success": True})


@csrf.exempt
@api_bp.route("/auth/change-password", methods=["POST"])
@login_required
def auth_change_password():
    """Sets a new password for the current session's user. The one
    endpoint the must_change_password gate (see enforce_password_change_gate
    in app/__init__.py) always leaves reachable — this is how a founder
    clears it. Reuses the same length rule as auth_register()/reset_password()
    (Constraint 4: no new password rules) and the same bcrypt hashing already
    used everywhere else (Constraint 5).
    """
    payload = request.get_json(silent=True) or {}
    new_password = str(payload.get("new_password") or "")

    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    current_user.password_hash = bcrypt.generate_password_hash(new_password).decode("utf-8")
    current_user.must_change_password = False
    db.session.commit()

    return jsonify(_serialize_user(current_user))


@csrf.exempt
@api_bp.route("/auth/register", methods=["POST"])
def auth_register():
    try:
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
        user = User(email=email, password_hash=password_hash, display_name=name, is_verified=False)
        db.session.add(user)
        db.session.commit()

        # Send verification email via Resend
        try:
            from itsdangerous import URLSafeTimedSerializer
            from app.email_utils import send_email
            from app.auth import get_verification_email_html
            serializer = URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="email-verification-salt")
            token = serializer.dumps(email)
            verification_link = f"{request.url_root}api/auth/verify-email/{token}"
            subject = "AI Compass - Verify Email"
            html = get_verification_email_html(name, verification_link)
            send_email(email, subject, html)
        except Exception:
            current_app.logger.exception("Failed to send verification email")
            db.session.rollback()
            return jsonify({"error": "Unable to send verification email. Please try again later."}), 500

        return jsonify({"message": "Registration successful! Please check your email to verify your account."}), 201
    except Exception as exc:
        db.session.rollback()
        current_app.logger.exception("Registration failed due to server error: %s", exc)
        return jsonify({"error": "An unexpected error occurred. Please try again later."}), 500


def _get_favorites_folders(user):
    if not user.preferences:
        return {}
    try:
        prefs = json.loads(user.preferences)
        return prefs.get("favorites_folders", {})
    except Exception:
        return {}


def _save_favorites_folders(user, folders):
    prefs = {}
    if user.preferences:
        try:
            prefs = json.loads(user.preferences)
        except Exception:
            pass
    prefs["favorites_folders"] = folders
    user.preferences = json.dumps(prefs, ensure_ascii=False)


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
    
    # Automatically scrub from folders
    folders = _get_favorites_folders(current_user)
    updated = False
    for f_name, tools in list(folders.items()):
        if tool_id in tools:
            folders[f_name] = [t for t in tools if t != tool_id]
            updated = True
    if updated:
        _save_favorites_folders(current_user, folders)

    db.session.commit()
    return jsonify({"favorited": False})


@api_bp.get("/favorites")
@login_required
def list_favorites():
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


@api_bp.route("/profile/favorites/folders", methods=["GET"])
@login_required
def list_folders():
    folders = _get_favorites_folders(current_user)
    results = [{"name": k, "tools": v} for k, v in folders.items()]
    return jsonify(results), 200


@csrf.exempt
@api_bp.route("/profile/favorites/folders", methods=["POST"])
@login_required
def create_folder():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Folder name is required."}), 400

    folders = _get_favorites_folders(current_user)
    if name in folders:
        return jsonify({"error": "Folder already exists."}), 400

    folders[name] = []
    _save_favorites_folders(current_user, folders)
    db.session.commit()
    return jsonify({"name": name, "tools": []}), 201


@csrf.exempt
@api_bp.route("/profile/favorites/folders/<path:old_name>", methods=["PUT"])
@login_required
def rename_folder(old_name):
    payload = request.get_json(silent=True) or {}
    new_name = str(payload.get("name") or "").strip()
    if not new_name:
        return jsonify({"error": "New folder name is required."}), 400

    folders = _get_favorites_folders(current_user)
    if old_name not in folders:
        return jsonify({"error": "Folder not found."}), 404
    if new_name in folders and new_name != old_name:
        return jsonify({"error": "A folder with this name already exists."}), 400

    tools = folders.pop(old_name)
    folders[new_name] = tools
    _save_favorites_folders(current_user, folders)
    db.session.commit()
    return jsonify({"name": new_name, "tools": tools}), 200


@csrf.exempt
@api_bp.route("/profile/favorites/folders/<path:name>", methods=["DELETE"])
@login_required
def delete_folder(name):
    folders = _get_favorites_folders(current_user)
    if name not in folders:
        return jsonify({"error": "Folder not found."}), 404

    folders.pop(name)
    _save_favorites_folders(current_user, folders)
    db.session.commit()
    return jsonify({"message": "Folder deleted successfully"}), 200


@csrf.exempt
@api_bp.route("/profile/favorites/folders/<path:name>/tools", methods=["POST"])
@login_required
def add_tool_to_folder(name):
    payload = request.get_json(silent=True) or {}
    tool_id = str(payload.get("tool_id") or "").strip().lower()
    if not tool_id:
        return jsonify({"error": "Tool ID is required."}), 400

    folders = _get_favorites_folders(current_user)
    if name not in folders:
        return jsonify({"error": "Folder not found."}), 404

    favorite = Favorite.query.filter_by(user_id=current_user.id, tool_id=tool_id).first()
    if not favorite:
        return jsonify({"error": "Tool is not in your favorites."}), 400

    if tool_id not in folders[name]:
        folders[name].append(tool_id)
        _save_favorites_folders(current_user, folders)
        db.session.commit()

    return jsonify({"name": name, "tools": folders[name]}), 200


@csrf.exempt
@api_bp.route("/profile/favorites/folders/<path:name>/tools/<tool_slug>", methods=["DELETE"])
@login_required
def remove_tool_from_folder(name, tool_slug):
    tool_slug = str(tool_slug).strip().lower()
    folders = _get_favorites_folders(current_user)
    if name not in folders:
        return jsonify({"error": "Folder not found."}), 404

    if tool_slug in folders[name]:
        folders[name] = [t for t in folders[name] if t != tool_slug]
        _save_favorites_folders(current_user, folders)
        db.session.commit()

    return jsonify({"name": name, "tools": folders[name]}), 200


def _stack_user_id(data=None):
    if data and data.get('user_id'):
        return data.get('user_id')
    if current_user.is_authenticated:
        return current_user.id
    return None


@csrf.exempt
@api_bp.route('/stack', methods=['POST'])
def save_stack():
    """Upsert the user's stack into the DB. Was an ephemeral JSON file
    that Render wiped on every deploy — one row per user now."""
    from app.models import SavedStack

    data = request.get_json() or {}
    user_id = _stack_user_id(data)
    if not user_id:
        return jsonify({'error': 'Not logged in'}), 401

    stack_payload = {
        'goal': data.get('goal'),
        'budget': data.get('budget'),
        'platform': data.get('platform'),
        'level': data.get('level'),
        'tools': data.get('tools', []),
        'saved_at': datetime.now(timezone.utc).isoformat(),
    }
    try:
        name = str(data.get('name') or '').strip() or 'default'
        row = (
            SavedStack.query.filter_by(user_id=user_id, name=name)
            .order_by(SavedStack.id.desc())
            .first()
        )
        if row is None:
            row = SavedStack(user_id=user_id, name=name, tools_json='')
            db.session.add(row)
        
        # Preserve is_private when overwriting
        existing_private = False
        if row.tools_json:
            try:
                existing_private = bool(json.loads(row.tools_json).get('is_private', False))
            except Exception:
                pass
        stack_payload['is_private'] = existing_private

        row.tools_json = json.dumps(stack_payload, ensure_ascii=False)
        db.session.commit()
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("save_stack failed")
        return jsonify({'error': 'Could not save stack', 'detail': str(exc)}), 500

    return jsonify({'message': 'Stack saved!', 'stack': {'id': row.id, 'user_id': user_id, 'name': name, **stack_payload}}), 200


@api_bp.route('/stack', methods=['GET'])
def get_stack():
    # Force Flask-Login to reload the user from the current request's session
    import flask
    ctx = getattr(flask, '_request_ctx_stack', None)
    if ctx and ctx.top and hasattr(ctx.top, 'user'):
        try:
            delattr(ctx.top, 'user')
        except AttributeError:
            pass
    try:
        from flask.globals import request_ctx
        if request_ctx and hasattr(request_ctx, 'user'):
            delattr(request_ctx, 'user')
    except (ImportError, AttributeError):
        pass

    from app.models import SavedStack

    stack_id = request.args.get('stack_id')
    if stack_id:
        try:
            row = SavedStack.query.filter_by(id=int(stack_id)).first()
        except ValueError:
            return jsonify({'error': 'Invalid stack ID'}), 400
    else:
        user_id = request.args.get('user_id') or _stack_user_id()
        if not user_id:
            return jsonify({'stack': None}), 200
        row = (
            SavedStack.query.filter_by(user_id=user_id)
            .order_by(SavedStack.id.desc())
            .first()
        )

    if row is None or not row.tools_json:
        return jsonify({'stack': None}), 200
    try:
        stack = json.loads(row.tools_json)
        owner_id = row.user_id
        stack['user_id'] = owner_id
        stack['id'] = row.id
        stack['name'] = row.name or 'default'

        # Privacy Authorization check
        is_private = bool(stack.get('is_private', False))
        if is_private:
            if not current_user.is_authenticated or int(current_user.id) != int(owner_id):
                return jsonify({'error': 'This stack is private'}), 403

        from app.models import User
        owner = User.query.get(owner_id)
        if owner:
            stack['owner_name'] = owner.display_name or owner.email.split('@')[0]
        else:
            stack['owner_name'] = f"User {owner_id}"
    except (ValueError, TypeError):
        return jsonify({'stack': None}), 200
    return jsonify({'stack': stack}), 200


@csrf.exempt
@api_bp.route('/stack', methods=['DELETE'])
def delete_stack():
    from app.models import SavedStack

    user_id = request.args.get('user_id') or _stack_user_id(request.get_json(silent=True) or {})
    if not user_id:
        return jsonify({'error': 'Not logged in'}), 401
    try:
        SavedStack.query.filter_by(user_id=user_id).delete()
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        return jsonify({'error': 'Could not clear stack'}), 500
    return jsonify({'message': 'Stack cleared'}), 200


@api_bp.route('/profile/stacks', methods=['GET'])
def get_profile_stacks():
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    from app.models import SavedStack
    rows = SavedStack.query.filter_by(user_id=current_user.id).order_by(SavedStack.id.desc()).all()

    results = []
    for row in rows:
        stack_data = {}
        if row.tools_json:
            try:
                stack_data = json.loads(row.tools_json)
            except Exception:
                pass

        results.append({
            'id': row.id,
            'name': row.name or 'default',
            'created_at': row.created_at.isoformat() if row.created_at else None,
            'is_private': bool(stack_data.get('is_private', False)),
            'tools': stack_data.get('tools', []),
            'goal': stack_data.get('goal', ''),
            'budget': stack_data.get('budget', ''),
            'platform': stack_data.get('platform', ''),
            'level': stack_data.get('level', '')
        })

    return jsonify(results), 200


@csrf.exempt
@api_bp.route('/profile/stacks/<int:stack_id>', methods=['PUT'])
def update_profile_stack(stack_id):
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    from app.models import SavedStack
    row = SavedStack.query.filter_by(id=stack_id, user_id=current_user.id).first()
    if not row:
        return jsonify({'error': 'Stack not found'}), 404

    payload = request.get_json(silent=True) or {}
    name = payload.get('name')
    is_private = payload.get('is_private')

    stack_data = {}
    if row.tools_json:
        try:
            stack_data = json.loads(row.tools_json)
        except Exception:
            pass

    if name is not None:
        name_str = str(name).strip()
        if name_str:
            row.name = name_str

    if is_private is not None:
        stack_data['is_private'] = bool(is_private)

    tools = payload.get('tools')
    if tools is not None:
        if isinstance(tools, list):
            stack_data['tools'] = [str(t).strip().lower() for t in tools if t]

    row.tools_json = json.dumps(stack_data, ensure_ascii=False)
    db.session.commit()

    return jsonify({
        'id': row.id,
        'name': row.name,
        'created_at': row.created_at.isoformat() if row.created_at else None,
        'is_private': bool(stack_data.get('is_private', False)),
        'tools': stack_data.get('tools', []),
        'goal': stack_data.get('goal', ''),
        'budget': stack_data.get('budget', ''),
        'platform': stack_data.get('platform', ''),
        'level': stack_data.get('level', '')
    }), 200


@csrf.exempt
@api_bp.route('/profile/stacks/<int:stack_id>', methods=['DELETE'])
def delete_profile_stack(stack_id):
    if not current_user.is_authenticated:
        return jsonify({'error': 'Unauthorized'}), 401

    from app.models import SavedStack
    row = SavedStack.query.filter_by(id=stack_id, user_id=current_user.id).first()
    if not row:
        return jsonify({'error': 'Stack not found'}), 404

    db.session.delete(row)
    db.session.commit()

    return jsonify({'message': 'Stack deleted successfully'}), 200


@csrf.exempt
@api_bp.route('/model-advisor', methods=['POST'])
def model_advisor():
    data = request.get_json() or {}
    requirements = data.get('requirements', '').strip()
    prompt_tokens = data.get('promptTokens', 10000)
    response_tokens = data.get('responseTokens', 2000)
    requests_count = data.get('requestsCount', 1000)

    if not requirements:
        return jsonify({'error': 'Requirements are required'}), 400

    # 1. Gather all configured Gemini keys
    gemini_keys = []
    env_gemini_keys_str = os.environ.get("GEMINI_API_KEYS", "")
    if env_gemini_keys_str:
        import re
        gemini_keys.extend([k.strip() for k in re.split(r'[,\n\r]+', env_gemini_keys_str) if k.strip()])
    
    single_gemini_key = os.environ.get("GEMINI_API_KEY")
    if single_gemini_key and single_gemini_key not in gemini_keys:
        gemini_keys.append(single_gemini_key)

    # 2. Gather all configured Groq keys
    groq_keys = []
    env_groq_keys_str = os.environ.get("GROQ_API_KEYS", "")
    if env_groq_keys_str:
        import re
        groq_keys.extend([k.strip() for k in re.split(r'[,\n\r]+', env_groq_keys_str) if k.strip()])
    
    single_groq_key = os.environ.get("GROQ_API_KEY")
    if single_groq_key and single_groq_key not in groq_keys:
        groq_keys.append(single_groq_key)

    if not gemini_keys and not groq_keys:
        return jsonify({'error': 'AI Advisor keys are not configured in environment variables.'}), 500

    prompt_text = f"""
You are the AI Compass Advisor. Help a developer select the best LLM model for their specific project.
User Requirements: "{requirements}"
Project Prompt Tokens: {prompt_tokens}, Response Tokens: {response_tokens}, Requests: {requests_count}.

Here is the current catalog of models available on AI Compass:
- GPT-4o (OpenAI): Input: $2.50/M, Output: $10.00/M, Context: 128,000, Latency: Fast. Strengths: Flagship high-speed model, superb multimodal, logic, reasoning.
- GPT-4.5 (OpenAI): Input: $75.00/M, Output: $150.00/M, Context: 128,000, Latency: Moderate. Strengths: Ultra-premium frontier intelligence, deep world knowledge.
- o1 (OpenAI): Input: $15.00/M, Output: $60.00/M, Context: 200,000, Latency: Thinking. Strengths: Complex reasoning, science, math.
- o3-mini (OpenAI): Input: $1.10/M, Output: $4.40/M, Context: 200,000, Latency: Fast. Strengths: High-reasoning speed specialist, math, coding.
- Claude 3.7 Sonnet (Anthropic): Input: $3.00/M, Output: $15.00/M, Context: 200,000, Latency: Fast. Strengths: Nuanced programming, hybrid reasoning.
- Claude 4.7 Opus (Anthropic): Input: $15.00/M, Output: $75.00/M, Context: 200,000, Latency: Moderate. Strengths: Ultra-advanced analysis, executive logic.
- Claude Fable (Anthropic): Input: $0.25/M, Output: $1.25/M, Context: 200,000, Latency: Instant. Strengths: Ultra-fast semantic routing.
- Gemini 2.0 Pro (Google): Input: $1.25/M, Output: $5.00/M, Context: 2,097,152, Latency: Moderate. Strengths: Massive 2M context, deep reasoning.
- Gemini 2.0 Flash (Google): Input: $0.075/M, Output: $0.30/M, Context: 1,048,576, Latency: Instant. Strengths: Extremely affordable, fast, native audio/video.
- DeepSeek-V3 (DeepSeek): Input: $0.14/M, Output: $0.28/M, Context: 64,000, Latency: Fast. Strengths: Unbelievable cost-efficiency, excellent coding.
- DeepSeek-R1 (DeepSeek): Input: $0.55/M, Output: $2.19/M, Context: 128,000, Latency: Thinking. Strengths: Benchmark leader reasoning, math, coding.
- Llama 3.3 70B (Meta): Input: $0.35/M, Output: $0.40/M, Context: 128,000, Latency: Fast. Strengths: Top open-weights performer.
- Mistral Large 3 (Mistral): Input: $2.00/M, Output: $6.00/M, Context: 128,000, Latency: Moderate. Strengths: Multilingual, agentic function calling.

Based on the user's requirements:
1. Recommend the single best model from our catalog. Explain why it fits their context best.
2. Outline 1 secondary/alternative model as a fallback (e.g. for cost efficiency or higher context).
3. Mention the estimated cost for running their requests on both recommended models.
   CRITICAL: Make sure your cost calculations are mathematically correct. The catalog prices are per MILLION tokens (/M).
   Formula: Cost = (Prompt Tokens * Input Price + Response Tokens * Output Price) * Requests / 1,000,000.
   For example, 10,000 prompt tokens and 2,000 response tokens for 1,000 requests on o3-mini (Input: $1.10/M, Output: $4.40/M) is:
   Cost = (10,000 * $1.10 + 2,000 * $4.40) * 1,000 / 1,000,000 = (11,000 + 8,800) * 1,000 / 1,000,000 = $19.80 (NOT $19,800).
   Always perform the division by 1,000,000 to convert from the per-million rate. Double check that the final sum is accurate.
Be professional, structured, and keep your recommendation under 250 words. Do not use markdown headers larger than h3.
"""

    import urllib.request
    import urllib.error

    last_error_msg = None
    last_error_code = None

    # Try Gemini keys first
    for i, key in enumerate(gemini_keys):
        # Try gemini-2.0-flash
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}"
            req_data = json.dumps({
                "contents": [{"parts": [{"text": prompt_text}]}]
            }).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            )
            with urllib.request.urlopen(req, timeout=8) as response:
                resp_data = json.loads(response.read().decode('utf-8'))
                text = resp_data['candidates'][0]['content']['parts'][0]['text']
                return jsonify({'recommendation': text}), 200
        except urllib.error.HTTPError as e:
            last_error_code = e.code
            last_error_msg = e.read().decode('utf-8')
            print(f"[Model Advisor] Gemini Key {i+1} with gemini-2.0-flash failed: {e.code} - {last_error_msg}")
        except Exception as e:
            last_error_msg = str(e)
            print(f"[Model Advisor] Gemini Key {i+1} with gemini-2.0-flash failed: {e}")

        # Try gemini-1.5-flash on same key as fallback
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
            req_data = json.dumps({
                "contents": [{"parts": [{"text": prompt_text}]}]
            }).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            )
            with urllib.request.urlopen(req, timeout=8) as response:
                resp_data = json.loads(response.read().decode('utf-8'))
                text = resp_data['candidates'][0]['content']['parts'][0]['text']
                return jsonify({'recommendation': text}), 200
        except urllib.error.HTTPError as e:
            last_error_code = e.code
            last_error_msg = e.read().decode('utf-8')
            print(f"[Model Advisor] Gemini Key {i+1} with gemini-1.5-flash failed: {e.code} - {last_error_msg}")
        except Exception as e:
            last_error_msg = str(e)
            print(f"[Model Advisor] Gemini Key {i+1} with gemini-1.5-flash failed: {e}")

    # Try Groq keys if Gemini failed or was empty
    for i, key in enumerate(groq_keys):
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            req_data = json.dumps({
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt_text}]
            }).encode('utf-8')
            req = urllib.request.Request(
                url,
                data=req_data,
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {key}',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            )
            with urllib.request.urlopen(req, timeout=8) as response:
                resp_data = json.loads(response.read().decode('utf-8'))
                text = resp_data['choices'][0]['message']['content']
                return jsonify({'recommendation': text}), 200
        except urllib.error.HTTPError as e:
            last_error_code = e.code
            last_error_msg = e.read().decode('utf-8')
            print(f"[Model Advisor] Groq Key {i+1}/{len(groq_keys)} failed with code {e.code}: {last_error_msg}")
            continue
        except Exception as e:
            last_error_msg = str(e)
            print(f"[Model Advisor] Groq Key {i+1}/{len(groq_keys)} encountered error: {e}")
            continue

    def extract_error_message(raw_msg, default_reason):
        if not raw_msg:
            return default_reason
        try:
            import json
            data = json.loads(raw_msg)
            if isinstance(data, dict):
                if "error" in data:
                    err = data["error"]
                    if isinstance(err, dict) and "message" in err:
                        return err["message"]
                    elif isinstance(err, str):
                        return err
                if "message" in data:
                    return data["message"]
        except Exception:
            pass
        
        # Fallback: if raw_msg is short and doesn't look like HTML, return it
        cleaned = raw_msg.strip()
        if len(cleaned) < 200 and not ("<html" in cleaned.lower() or "<body" in cleaned.lower() or "<div" in cleaned.lower()):
            return cleaned
        return default_reason

    # If all configured keys failed
    if last_error_code:
        default_reason = "Too Many Requests" if last_error_code == 429 else f"API Error {last_error_code}"
        detailed_reason = extract_error_message(last_error_msg, default_reason)
        return jsonify({'error': f"All keys exhausted. Upstream API returned: {detailed_reason}"}), last_error_code

    
    return jsonify({'error': f"Failed to get recommendation: {last_error_msg or 'Unknown error'}"}), 502


# ── Backward-compat alias: /api/search → same logic as /api/v1/search ──────────
@compat_bp.get("/search")
def compat_search():
    raw_query   = request.args.get('q', '').strip()[:150]
    category    = request.args.get('category', 'All')
    pricing     = request.args.get('pricing', 'All')
    student     = request.args.get('student_only', 'false') == 'true'
    trending    = request.args.get('trending_only', 'false') == 'true'
    sort_by     = request.args.get('sort', 'Relevance')

    output = _search_catalog_tools(
        raw_query=raw_query,
        category=category,
        pricing=pricing,
        student_only=student,
        trending_only=trending,
        sort_by=sort_by,
    )
    if isinstance(output, dict) and isinstance(output.get("results"), list):
        output["results"] = [apply_editorial_blurb(t) for t in output["results"]]
    return jsonify(output)


@compat_bp.get("/tools")
@cache.cached(timeout=60, query_string=True)
def list_all_tools_compat():
    """Compat alias at /api/tools."""
    from app.tool_cache import get_cached_tools
    try:
        tools = [apply_editorial_blurb(t) for t in (get_cached_tools() or [])]
    except Exception:
        tools = []
    return jsonify({
        "results": tools,
        "total": len(tools),
        "fallback": not bool(tools)
    })


@api_bp.post("/admin/send-digest")
@csrf.exempt
def admin_send_digest():
    """Trigger the new-tools email digest.

    Auth: header  X-Digest-Secret: <DIGEST_SECRET env>  (so an external
    scheduler like cron-job.org can call it without a browser session).
    Query: ?dry_run=1 to preview counts, ?force=1 to send even if no new
    tools. Safe to call repeatedly — the DB snapshot prevents re-sends.
    """
    import hmac

    secret = os.environ.get("DIGEST_SECRET")
    provided = request.headers.get("X-Digest-Secret", "")
    if not secret or not hmac.compare_digest(secret, provided):
        return jsonify({"error": "unauthorized"}), 401

    from app.digest import run_digest

    dry_run = request.args.get("dry_run") in ("1", "true", "yes")
    force = request.args.get("force") in ("1", "true", "yes")
    try:
        result = run_digest(dry_run=dry_run, force=force)
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("send-digest failed")
        return jsonify({"error": "digest_failed", "detail": str(exc)}), 500


@api_bp.post("/admin/send-community-recap")
@csrf.exempt
def admin_send_community_recap():
    """Trigger the weekly community recap.

    Same auth and flags as send-digest so one external scheduler can drive
    both. Unlike the digest this only ever reaches members who posted,
    commented, or voted recently — see app/community_recap.py for why.
    Query: ?dry_run=1 previews the audience and content without sending,
    ?force=1 sends even in a week with no activity.
    """
    import hmac

    secret = os.environ.get("DIGEST_SECRET")
    provided = request.headers.get("X-Digest-Secret", "")
    if not secret or not hmac.compare_digest(secret, provided):
        return jsonify({"error": "unauthorized"}), 401

    from app.community_recap import run_recap

    dry_run = request.args.get("dry_run") in ("1", "true", "yes")
    force = request.args.get("force") in ("1", "true", "yes")
    try:
        return jsonify(run_recap(dry_run=dry_run, force=force))
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("send-community-recap failed")
        return jsonify({"error": "recap_failed", "detail": str(exc)}), 500


@api_bp.post("/admin/send-founder-reports")
@csrf.exempt
def admin_send_founder_reports():
    """Trigger the monthly listing report to paid founders.

    Same auth and flags as send-digest so one external scheduler can drive
    every mail path. ?dry_run=1 previews the audience and the numbers
    without sending; ?force=1 sends even to listings with nothing to report.
    """
    import hmac

    secret = os.environ.get("DIGEST_SECRET")
    provided = request.headers.get("X-Digest-Secret", "")
    if not secret or not hmac.compare_digest(secret, provided):
        return jsonify({"error": "unauthorized"}), 401

    from app.founder_report import run_reports

    dry_run = request.args.get("dry_run") in ("1", "true", "yes")
    force = request.args.get("force") in ("1", "true", "yes")
    try:
        return jsonify(run_reports(dry_run=dry_run, force=force))
    except Exception as exc:
        current_app.logger.exception("send-founder-reports failed")
        return jsonify({"error": "founder_report_failed", "detail": str(exc)}), 500


# ---------------------------------------------------------------------------
# Admin: digest controls (session-authed — for the admin panel UI)
# ---------------------------------------------------------------------------
@api_bp.post("/admin/digest")
@csrf.exempt
@login_required
def admin_digest():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.digest import run_digest
    dry_run = request.args.get("dry_run") in ("1", "true", "yes")
    force = request.args.get("force") in ("1", "true", "yes")
    try:
        return jsonify(run_digest(dry_run=dry_run, force=force))
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("admin digest failed")
        return jsonify({"error": "digest_failed", "detail": str(exc)}), 500


@api_bp.post("/admin/founder-reports")
@csrf.exempt
@login_required
def admin_founder_reports():
    """Session-authed twin of send-founder-reports, for the admin panel."""
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.founder_report import run_reports
    dry_run = request.args.get("dry_run") in ("1", "true", "yes")
    force = request.args.get("force") in ("1", "true", "yes")
    try:
        return jsonify(run_reports(dry_run=dry_run, force=force))
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("admin founder reports failed")
        return jsonify({"error": "founder_report_failed", "detail": str(exc)}), 500


@api_bp.post("/admin/recap")
@csrf.exempt
@login_required
def admin_recap():
    """Session-authed twin of send-community-recap, for the admin panel."""
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.community_recap import run_recap
    dry_run = request.args.get("dry_run") in ("1", "true", "yes")
    force = request.args.get("force") in ("1", "true", "yes")
    try:
        return jsonify(run_recap(dry_run=dry_run, force=force))
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("admin recap failed")
        return jsonify({"error": "recap_failed", "detail": str(exc)}), 500


@api_bp.post("/admin/recap/test")
@csrf.exempt
@login_required
def admin_recap_test():
    """Send ONE sample recap to the logged-in admin only.

    Same purpose as admin_digest_test: verify real inbox rendering and
    deliverability without mailing the active community. Builds from live
    data, so what lands is exactly what members would receive.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    from app.community_recap import (
        _render,
        _standing_for,
        build_summary,
        score_builders,
    )
    from app.email_utils import email_enabled, make_unsubscribe_token, send_email

    if not email_enabled():
        return jsonify({
            "status": "disabled",
            "message": "No email transport configured - set RESEND_API_KEY on the server.",
        }), 200

    to = (current_user.email or "").strip()
    if not to:
        return jsonify({"status": "error", "message": "Your admin account has no email address."}), 400

    try:
        summary = build_summary()
        standing = _standing_for(current_user.id, score_builders("week", limit=1000))
        unsub = f"https://ai-compass.in/unsubscribe?token={make_unsubscribe_token(to)}"
        subject, html, text = _render(current_user, summary, standing, unsub)
        ok = send_email(to, f"[TEST] {subject}", html, text)
        return jsonify({
            "status": "sent" if ok else "failed",
            "to": to,
            "subject": subject,
            "threads": len(summary["threads"]),
            "board": len(summary["board"]),
            "sponsors": len(summary["sponsors"]),
        })
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("admin recap test failed")
        return jsonify({"error": "recap_test_failed", "detail": str(exc)}), 500


@api_bp.post("/admin/digest/test")
@csrf.exempt
@login_required
def admin_digest_test():
    """Send ONE sample digest email to the logged-in admin only.

    Lets the operator verify real inbox delivery (Resend wiring, SPF/
    DKIM, spam placement) without emailing the whole subscriber list —
    e.g. when the only 'new' tool is a throwaway test entry.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    from app.digest import _email_html
    from app.email_utils import email_enabled, make_unsubscribe_token, send_email

    if not email_enabled():
        return jsonify({
            "status": "disabled",
            "message": "No email transport configured — set RESEND_API_KEY on the server.",
        }), 200

    to = (current_user.email or "").strip()
    if not to:
        return jsonify({"status": "error", "message": "Your admin account has no email address."}), 400

    # A representative sample so the test email looks like the real thing.
    tools = (get_cached_tools() or [])[:5]
    unsub = f"https://ai-compass.in/unsubscribe?token={make_unsubscribe_token(to)}"
    html, text = _email_html(tools, unsub)
    ok = send_email(to, "AI Compass — digest test email", html, text)
    return jsonify({
        "status": "sent" if ok else "failed",
        "to": to,
        "message": (
            f"Test email sent to {to} — check inbox & spam."
            if ok else
            "Send failed — check RESEND_API_KEY / RESEND_FROM and server logs."
        ),
    })


@api_bp.post("/admin/broadcast")
@csrf.exempt
@login_required
def admin_broadcast():
    """One-off announcement to all opted-in users. Body:
      {subject, body, mode}  mode = 'dry' | 'test' | 'send'
    'dry' counts recipients (no send), 'test' sends only to the logged-in
    admin, 'send' emails everyone. Each email carries an unsubscribe link.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    from app.broadcast import run_broadcast

    payload = request.get_json(silent=True) or {}
    subject = str(payload.get("subject") or "").strip()
    body = str(payload.get("body") or "").strip()
    mode = str(payload.get("mode") or "dry").strip().lower()

    try:
        if mode == "test":
            to = (current_user.email or "").strip()
            if not to:
                return jsonify({"status": "error", "message": "Your admin account has no email."}), 400
            return jsonify(run_broadcast(subject, body, test_to=to))
        if mode == "send":
            return jsonify(run_broadcast(subject, body))
        return jsonify(run_broadcast(subject, body, dry_run=True))
    except Exception as exc:  # noqa: BLE001
        current_app.logger.exception("broadcast failed")
        return jsonify({"status": "error", "message": str(exc)}), 500


# ---------------------------------------------------------------------------
# Admin: LinkedIn post drafts (turn newly-added tools into copy-paste content)
# ---------------------------------------------------------------------------
_LI_BASE = "https://ai-compass.in"


def _li_tagline(tool: dict, limit: int = 180) -> str:
    raw = (
        tool.get("tagline")
        or tool.get("shortDescription")
        or tool.get("description")
        or ""
    )
    raw = " ".join(str(raw).split())  # collapse whitespace/newlines
    if len(raw) > limit:
        raw = raw[: limit - 1].rstrip() + "…"
    return raw


def _li_category_tag(category: str) -> str:
    parts = "".join(
        c if c.isalnum() else " " for c in str(category or "")
    ).split()
    return "#" + "".join(p.capitalize() for p in parts) if parts else "#AItools"


def _li_roundup(tools: list[dict]) -> str:
    bullets = "\n".join(
        f"• {t['name']} — {t['tagline']}" if t["tagline"] else f"• {t['name']}"
        for t in tools
    )
    n = len(tools)
    return (
        f"🚀 Fresh on AI Compass — {n} new AI tool{'s' if n != 1 else ''}, "
        f"hand-tested for students\n\n"
        f"{bullets}\n\n"
        f"We try every tool before it goes in the directory. "
        f"Free to browse, no signup:\n{_LI_BASE}\n\n"
        f"#AItools #ArtificialIntelligence #StudentLife #Productivity #EdTech"
    )


def _li_spotlight(t: dict) -> str:
    tag = _li_category_tag(t.get("category"))
    best = t.get("bestFor") or (t.get("features") or [""])[0] or t.get("category") or ""
    best = " ".join(str(best).split())
    lines = [f"🔍 Tool spotlight: {t['name']}", ""]
    if t["tagline"]:
        lines += [t["tagline"], ""]
    if best:
        lines += [f"Best for: {best}", ""]
    lines += [
        "One of 400+ hand-tested AI tools for students on AI Compass:",
        f"{_LI_BASE}/tools/{t['slug']}",
        "",
        f"#AI #StudentTools {tag} #ArtificialIntelligence",
    ]
    return "\n".join(lines)


@api_bp.get("/admin/linkedin-drafts")
@csrf.exempt
@login_required
def admin_linkedin_drafts():
    """Ready-to-paste LinkedIn post drafts built from the most recently
    added/updated catalog tools. Same source data as the email digest —
    just formatted for the Company Page. No LinkedIn API needed; the
    operator copies the text and posts it (human in the loop)."""
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403

    from app.models import CatalogTool

    try:
        n = max(1, min(10, int(request.args.get("n", 5))))
    except (TypeError, ValueError):
        n = 5

    rows = (
        CatalogTool.query.filter_by(hidden=False)
        .order_by(CatalogTool.updated_at.desc())
        .limit(n)
        .all()
    )
    cache = {
        str(t.get("slug", "")).strip().lower(): t
        for t in (get_cached_tools() or [])
    }

    tools = []
    for r in rows:
        src = cache.get(r.slug.strip().lower())
        if src is None:
            try:
                src = json.loads(r.data)
            except (ValueError, TypeError):
                src = {}
        tools.append({
            "name": src.get("name") or r.name,
            "slug": r.slug,
            "tagline": _li_tagline(src),
            "category": src.get("category") or r.category or "",
            "bestFor": src.get("bestFor"),
            "features": src.get("features"),
        })

    if not tools:
        return jsonify({
            "count": 0,
            "roundup": "",
            "spotlight": "",
            "message": "No tools found to build a post from.",
        })

    return jsonify({
        "count": len(tools),
        "roundup": _li_roundup(tools),
        "spotlight": _li_spotlight(tools[0]),
        "tools": [t["name"] for t in tools],
    })


# ---------------------------------------------------------------------------
# Admin: feature flags
# ---------------------------------------------------------------------------
@api_bp.get("/admin/flags")
@login_required
def admin_list_flags():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import FeatureFlag
    flags = FeatureFlag.query.order_by(FeatureFlag.key).all()
    return jsonify([
        {"key": f.key, "enabled": f.enabled, "value": f.value}
        for f in flags
    ])


@api_bp.put("/admin/flags/<key>")
@csrf.exempt
@login_required
def admin_set_flag(key):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import FeatureFlag
    payload = request.get_json(silent=True) or {}
    flag = FeatureFlag.query.filter_by(key=key).first()
    if flag is None:
        flag = FeatureFlag(key=key)
        db.session.add(flag)
    if "enabled" in payload:
        flag.enabled = bool(payload["enabled"])
    if "value" in payload:
        flag.value = payload["value"]
    db.session.commit()
    return jsonify({"success": True, "key": flag.key, "enabled": flag.enabled, "value": flag.value})


# ---------------------------------------------------------------------------
# Admin: submissions (review user-submitted tools)
# ---------------------------------------------------------------------------
@api_bp.get("/admin/submissions")
@login_required
def admin_list_submissions():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from datetime import datetime, timezone

    from app import sponsorship
    from app.models import Submission
    status = request.args.get("status", "pending")
    q = Submission.query
    if status != "all":
        q = q.filter_by(status=status)
    # Verified-paid submissions (fast-track) surface first so the 24-hour
    # priority review promise is something the queue actually enforces,
    # not just an email subject line.
    subs = q.order_by(Submission.is_priority.desc(), Submission.submitted_at.desc()).limit(200).all()

    now = datetime.now(timezone.utc)

    def _perk_window(sub):
        """The live complimentary rail window, as the admin needs to see it.

        Surfaced here because the perk is time-boxed and nothing outside the
        founder's own dashboard reported it — so the one person who could
        notice a window running out had no view of it. Same predicate as the
        renderer and the dashboard (sponsorship.complimentary_window), which
        is the whole point: a third opinion about who is currently boosted is
        how the first two got to disagree.
        """
        window = sponsorship.complimentary_window(sub)
        if window is None:
            return None
        starts, ends = window
        return {
            "placement": "rail",
            "starts_at": starts.isoformat(),
            "ends_at": ends.isoformat(),
            # Rounded UP: truncation reports a window with four hours left
            # as "0 days", which reads as already over — the opposite of the
            # thing this display exists to warn about.
            "days_remaining": max(0, -((now - ends).days)),
        }

    return jsonify([
        {
            "id": s.id, "name": s.name, "website": s.website,
            "category": s.category, "description": s.description,
            "pricing_model": s.pricing_model, "tags": s.tags,
            "submitter_email": s.submitter_email, "status": s.status,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
            # Approval is what starts the clock on time-boxed paid perks
            # (see Submission.approved_at). Null on anything still pending,
            # and on rows approved before the column existed.
            "approved_at": s.approved_at.isoformat() if s.approved_at else None,
            # Whole days a still-pending row has waited. Review time no
            # longer eats the founder's perk window, but it does still delay
            # their listing going live, so the queue age stays worth seeing.
            "queue_age_days": (
                (now - sponsorship._aware(s.submitted_at)).days
                if s.status == "pending" and s.submitted_at else None
            ),
            "perk_window": _perk_window(s),
            "payment_status": s.payment_status, "is_priority": s.is_priority,
            # payment_note carries the failure reason AND the transaction
            # reference for anything unverified. A 'needs_manual_review' row
            # is useless without it — reconciling the charge in PayPal is
            # exactly what the admin has to do next.
            "payment_note": s.payment_note,
        }
        for s in subs
    ])


@api_bp.post("/admin/submissions/<int:sub_id>/approve")
@csrf.exempt
@login_required
def admin_approve_submission(sub_id):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.catalog_store import upsert_tool
    from app.models import Submission
    from app.tool_cache import _normalize_tool_record

    s = Submission.query.get_or_404(sub_id)
    slug = _slugify(s.name)
    if not slug:
        return jsonify({"error": "Bad submission name"}), 400
    if any(str(t.get("slug") or "").strip().lower() == slug
           for t in (get_cached_tools() or [])):
        return jsonify({"error": f"Slug '{slug}' already in catalog"}), 409

    # A verified payment is what buys placement — never the client's claim.
    # Every paid tier jumps the review queue via is_priority, but only the
    # placement tiers (Fast-Track, Reviewed — see SPONSORED_PERK_TIERS) buy
    # the catalog "sponsored" boost: above-free placement + badge. Asking
    # includes_sponsored_perks() rather than testing one tier name inline is
    # what keeps that distinction real as the ladder changes; the retired
    # Quick Review tier is the case that proves it, since it is paid and
    # priority but was never a placement tier.
    from app.pricing_tiers import (
        includes_sponsored_perks,
        tier_for_pricing_model,
        visibility_delay_days_for_tier,
    )
    tier_key = tier_for_pricing_model(s.pricing_model or "")
    is_sponsored = bool(includes_sponsored_perks(tier_key) and s.payment_status == "verified")

    # Deliberately NOT setting `featured` here, even for Fast-Track.
    #
    # `featured` is editorial curation — "we looked at this and picked it" —
    # and ~30 seeded tools carry it for free. Granting it on payment would
    # make an endorsement purchasable, which is the same line
    # community_leaderboard refuses to cross ("ranks are never for sale") and
    # sponsorship.py enforces by always rendering paid units as their own
    # labelled row.
    #
    # Nothing is lost by withholding it. Everything actually sold now runs
    # off `sponsored`: above-free placement (search_utils.search_tools), the
    # homepage strip (/tools/sponsored reads _sponsored_active, never
    # `featured`), and the disclosed "Sponsored" badge on every card
    # (Card.jsx). `featured` uniquely buys an ml_recommender nudge and a slot
    # in the directory's student picks — neither of which we sell, and the
    # second of which is exactly the endorsement that must stay unbought.
    #
    # The /pricing copy was corrected to match (pricingTiers.js). If you are
    # here to "fix" the missing badge, change the promise, not this line.

    # Staggered release: free listings wait out the full review window
    # before appearing publicly; paid tiers buy a shorter wait (see
    # pricing_tiers.TIERS). The row is created now (hidden=False) so admin
    # tooling can see/edit it immediately — visible_at is what actually
    # gates get_visible_tools() until the delay elapses.
    from datetime import datetime, timezone, timedelta
    delay_days = visibility_delay_days_for_tier(tier_key)
    visible_at = datetime.now(timezone.utc) + timedelta(days=delay_days)

    record = _normalize_tool_record({
        "slug": slug,
        "name": s.name,
        "link": s.website,
        "category": s.category,
        "description": s.description,
        "tagline": s.description,
        # Submission.pricing_model is OUR billing tier ('free',
        # 'sponsored_paypal:<txn>'), while a catalog record's "pricing" is the
        # TOOL's own pricing shown to visitors and used by the pricing filter
        # (Free / Freemium / Paid). Copying one into the other published
        # "sponsored_paypal:8AB12345" as a paid tool's price label and broke
        # the filter for it. Left unset here so an admin fills it in during
        # review, rather than guessing wrong on the tool's behalf.
        "tags": [t.strip() for t in (s.tags or "").split(",") if t.strip()],
        "sponsored": is_sponsored,
        "visible_at": visible_at.isoformat(),
    })
    if not upsert_tool(record):
        return jsonify({"error": "Could not add to catalog"}), 500

    from app.models import CatalogTool
    catalog_row = CatalogTool.query.filter_by(slug=slug).first()
    if catalog_row:
        catalog_row.submission_id = s.id

    s.status = "approved"
    # Starts the clock on time-boxed paid perks (the complimentary rail
    # window). Set once — a re-approval must not hand the founder a second
    # 30 days, and the slug-already-in-catalog 409 above is a guard against
    # the common path, not a guarantee.
    if s.approved_at is None:
        s.approved_at = datetime.now(timezone.utc)
    db.session.commit()
    _refresh_catalog()

    # Founder account creation/linking no longer happens here — it now fires
    # at payment verification time in submit_tool(), immediately instead of
    # waiting on (up to 72-hour-later) admin curation review. See
    # app/founder_accounts.py and the submit_tool() call site.
    return jsonify({"success": True, "tool": record})


@api_bp.post("/admin/submissions/<int:sub_id>/reject")
@csrf.exempt
@login_required
def admin_reject_submission(sub_id):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import Submission
    s = Submission.query.get_or_404(sub_id)
    s.status = "rejected"
    db.session.commit()
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Admin: analytics overview
# ---------------------------------------------------------------------------
@api_bp.get("/admin/analytics")
@login_required
def admin_analytics():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from sqlalchemy import func as _f

    from app.models import Favorite, OutboundClick, Submission, ToolView

    from datetime import timedelta
    since = datetime.now(timezone.utc) - timedelta(days=30)

    total_clicks = OutboundClick.query.count()
    affiliate_clicks = OutboundClick.query.filter_by(is_affiliate=True).count()
    clicks_30d = OutboundClick.query.filter(OutboundClick.created_at >= since).count()
    top_clicked = (
        db.session.query(OutboundClick.slug, _f.count().label("n"))
        .group_by(OutboundClick.slug)
        .order_by(_f.count().desc())
        .limit(10)
        .all()
    )
    top_viewed = (
        db.session.query(ToolView.tool_name, _f.count().label("n"))
        .group_by(ToolView.tool_name)
        .order_by(_f.count().desc())
        .limit(10)
        .all()
    )

    # Annotate each top-clicked tool with its affiliate status (registry
    # OR admin-set affiliate_url) and surface the monetisation gaps:
    # high-traffic tools with NO affiliate are where outbound clicks are
    # currently being given away for free — the priority signup list.
    from app.affiliates import affiliate_for
    from app.tool_cache import get_cached_tools

    cached = get_cached_tools() or []
    aff_url_by_slug = {
        str(t.get("slug", "")).strip().lower(): (
            str(t.get("affiliate_url") or "").strip() or None
        )
        for t in cached
    }
    name_by_slug = {
        str(t.get("slug", "")).strip().lower(): t.get("name")
        for t in cached
    }

    def _has_aff(slug):
        sl = (slug or "").strip().lower()
        return bool(affiliate_for(sl) or aff_url_by_slug.get(sl))

    top = [
        {
            "slug": s,
            "name": name_by_slug.get((s or "").strip().lower()) or s,
            "clicks": n,
            "has_affiliate": _has_aff(s),
        }
        for s, n in top_clicked
    ]
    monetization_gaps = [
        row for row in top if not row["has_affiliate"]
    ]

    return jsonify({
        "outbound": {
            "total": total_clicks,
            "affiliate": affiliate_clicks,
            "last_30d": clicks_30d,
            "top": top,
            # High-traffic tools with no affiliate link yet — sign up
            # for these programs first for the biggest revenue lift.
            "monetization_gaps": monetization_gaps,
        },
        "tool_views_top": [{"tool": t, "views": n} for t, n in top_viewed],
        "favorites_total": Favorite.query.count(),
        "submissions_pending": Submission.query.filter_by(status="pending").count(),
    })


def _submission_dashboard_daily_trend(slug, days=14):
    """[{"date": "YYYY-MM-DD", "clicks": N, "views": N}, ...] for the last
    `days` days (oldest first), zero-filled for days with no activity."""
    from sqlalchemy import func as _f

    from app.models import OutboundClick, ToolPageView

    since = datetime.now(timezone.utc) - timedelta(days=days)
    clicks = dict(
        db.session.query(_f.date(OutboundClick.created_at), _f.count())
        .filter(OutboundClick.slug == slug, OutboundClick.created_at >= since)
        .group_by(_f.date(OutboundClick.created_at))
        .all()
    )
    views = dict(
        db.session.query(_f.date(ToolPageView.created_at), _f.count())
        .filter(ToolPageView.slug == slug, ToolPageView.created_at >= since)
        .group_by(_f.date(ToolPageView.created_at))
        .all()
    )

    out = []
    for i in range(days, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).date()
        # SQLite returns date-typed group-by keys as strings, Postgres as
        # date objects — check both so the trend isn't silently all-zero
        # depending on backend.
        out.append({
            "date": d.isoformat(),
            "clicks": clicks.get(d, clicks.get(d.isoformat(), 0)),
            "views": views.get(d, views.get(d.isoformat(), 0)),
        })
    return out


def _submission_dashboard_category_benchmark(catalog_row, since_30d):
    """Fast-Track-only proof point: how this tool's last-30d clicks compare
    to the average for other approved tools in the same category."""
    from sqlalchemy import func as _f

    from app.models import CatalogTool, OutboundClick

    this_clicks = OutboundClick.query.filter(
        OutboundClick.slug == catalog_row.slug,
        OutboundClick.created_at >= since_30d,
    ).count()

    peers = CatalogTool.query.filter(
        CatalogTool.category == catalog_row.category,
        CatalogTool.hidden == False,  # noqa: E712 — SQLAlchemy comparison, not a boolean check
        CatalogTool.slug != catalog_row.slug,
    ).all()
    if not peers:
        return {"available": False}

    peer_slugs = [p.slug for p in peers]
    peer_counts = dict(
        db.session.query(OutboundClick.slug, _f.count())
        .filter(OutboundClick.slug.in_(peer_slugs), OutboundClick.created_at >= since_30d)
        .group_by(OutboundClick.slug)
        .all()
    )
    avg_peer_clicks = sum(peer_counts.get(s, 0) for s in peer_slugs) / len(peer_slugs)
    pct = (
        None if avg_peer_clicks <= 0
        else round(((this_clicks - avg_peer_clicks) / avg_peer_clicks) * 100, 1)
    )

    # Rank within category by 30d clicks — reuses the peer_counts already
    # fetched above, no extra query.
    all_counts = sorted(
        [this_clicks] + [peer_counts.get(s, 0) for s in peer_slugs],
        reverse=True,
    )
    your_rank = all_counts.index(this_clicks) + 1
    total_tools = len(peer_slugs) + 1

    return {
        "available": True,
        "category": catalog_row.category,
        "your_clicks_30d": this_clicks,
        "category_avg_clicks_30d": round(avg_peer_clicks, 1),
        "pct_vs_average": pct,
        "your_rank": your_rank,
        "total_tools_in_category": total_tools,
    }


def _launch_submission_for_request():
    """Resolve the submission a launch request is about, and prove the caller
    owns it. Accepts the same two credentials as the founder dashboard: the
    signed magic-link token from the invoice email, or a logged-in founder's
    own session scoped to a submission they own."""
    from itsdangerous import BadSignature, SignatureExpired

    from app.models import Submission
    from app.submission_dashboard import verify_dashboard_token

    token = request.args.get("token", "")
    submission_id = request.args.get("submission_id", "")

    if token:
        try:
            sub_id, _email = verify_dashboard_token(token)
        except SignatureExpired:
            return None, (jsonify({"error": "expired"}), 401)
        except BadSignature:
            return None, (jsonify({"error": "invalid"}), 401)
        return Submission.query.get(sub_id), None

    if submission_id:
        if not current_user.is_authenticated:
            return None, (jsonify({"error": "unauthorized"}), 401)
        try:
            sub_id = int(submission_id)
        except (TypeError, ValueError):
            return None, (jsonify({"error": "invalid"}), 400)
        owned = Submission.query.filter_by(
            id=sub_id, founder_user_id=current_user.id
        ).first()
        if not owned:
            return None, (jsonify({"error": "unauthorized"}), 403)
        return owned, None

    return None, (jsonify({"error": "invalid"}), 401)


@api_bp.get("/launch")
def get_launch():
    """This listing's Launch Day, and the dates still open."""
    submission, denied = _launch_submission_for_request()
    if denied:
        return denied
    if submission is None:
        return jsonify({"error": "not_found"}), 404

    from app import launch_day

    return jsonify({
        "launch": launch_day.status(submission),
        "availability": launch_day.availability(submission),
    })


@api_bp.post("/launch")
@csrf.exempt
def set_launch():
    """Book, move, or cancel a Launch Day.

    Sending no date cancels, returning the listing to the ordinary release
    schedule — a founder who cannot unbook is a founder who will not book.
    """
    submission, denied = _launch_submission_for_request()
    if denied:
        return denied
    if submission is None:
        return jsonify({"error": "not_found"}), 404

    from app import launch_day

    payload = request.get_json(silent=True) or {}
    when = str(payload.get("date") or "").strip()

    if not when:
        err = launch_day.cancel(submission)
        if err:
            return jsonify({"error": err}), 400
        return jsonify({"success": True, "launch": launch_day.status(submission)})

    _booked, err = launch_day.schedule(submission, when)
    if err:
        messages = {
            "tier_not_eligible": "Launch Day comes with Fast-Track and Reviewed listings.",
            "already_launched": "That launch has already happened — it can't be moved now.",
            "invalid_date": "That date could not be read. Use YYYY-MM-DD.",
            "too_early": "That is before your listing can go live. Pick a later date.",
            "too_far_out": "That is further out than we book. Email admin@ai-compass.in.",
            "date_taken": "Another tool is launching that day. We only run one at a time, "
                          "which is the point — pick another date.",
        }
        status_code = 500 if err == "launch_write_failed" else 400
        return jsonify({"error": messages.get(err, err), "reason": err}), status_code

    return jsonify({"success": True, "launch": launch_day.status(submission)})


@api_bp.get("/founder/tools")
@login_required
def founder_tools():
    """Growth Hub landing data: every Submission this session's user owns
    via founder_user_id (see app/founder_accounts.py) — the same FK Prompt 1
    added, no separate flag. The frontend uses the count to decide whether
    to jump straight into the one dashboard or show a picker list."""
    from app.models import CatalogTool, Submission
    from app.pricing_tiers import tier_for_pricing_model

    subs = Submission.query.filter_by(founder_user_id=current_user.id).order_by(
        Submission.submitted_at.desc()
    ).all()

    tools = []
    for s in subs:
        claimed_tier = tier_for_pricing_model(s.pricing_model or "") or "free"
        tier_key = claimed_tier if s.payment_status == "verified" else "free"
        catalog_row = CatalogTool.query.filter_by(submission_id=s.id).first() if s.status == "approved" else None
        tools.append({
            "submission_id": s.id,
            "name": s.name,
            "status": s.status,
            "tier": tier_key,
            "slug": catalog_row.slug if catalog_row else None,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        })

    return jsonify({"tools": tools})


@api_bp.get("/submissions/dashboard")
def submission_dashboard():
    """Token-gated per-submitter analytics (no login — Submission has no
    user_id). Response shape depends on tier:
      free (or unverified paid claim) -> status only
      any paid tier -> + click/view totals and a 14-day trend
      a placement tier (Fast-Track, Reviewed) -> + category benchmark and
        live perk confirmation; Reviewed also carries its review status
    """
    from itsdangerous import BadSignature, SignatureExpired

    from app.models import CatalogTool, OutboundClick, Submission, ToolPageView
    from app.pricing_tiers import includes_sponsored_perks, tier_for_pricing_model
    from app.submission_dashboard import verify_dashboard_token

    # Additive, not a replacement (Constraint 2 of the founder-accounts
    # work): the signed magic-link token remains the primary path — it's
    # what the welcome/invoice email links to, and keeps working for
    # someone opening it on a different device or without an account at
    # all. A logged-in founder's own session is now ALSO accepted, scoped
    # via ?submission_id= to the one submission that session's founder_user_id
    # actually owns — a session can never read a token by omission, and a
    # token still works with no session present.
    token = request.args.get("token", "")
    session_submission_id = request.args.get("submission_id", "")

    if token:
        try:
            submission_id, _token_email = verify_dashboard_token(token)
        except SignatureExpired:
            return jsonify({"error": "expired"}), 401
        except BadSignature:
            return jsonify({"error": "invalid"}), 401
    elif session_submission_id:
        if not current_user.is_authenticated:
            return jsonify({"error": "unauthorized"}), 401
        try:
            submission_id = int(session_submission_id)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid"}), 400
        owned = Submission.query.filter_by(
            id=submission_id, founder_user_id=current_user.id
        ).first()
        if not owned:
            return jsonify({"error": "unauthorized"}), 403
    else:
        return jsonify({"error": "invalid"}), 401

    s = Submission.query.get(submission_id)
    if not s:
        return jsonify({"error": "not_found"}), 404

    claimed_tier = tier_for_pricing_model(s.pricing_model or "") or "free"
    # Gate on verified payment, not the claimed tier string — an
    # unverified paid claim (payment_status == "unverified_review") falls
    # back to the free view, mirroring how admin_approve_submission already
    # gates the sponsored catalog perks on a verified payment_status.
    tier_key = claimed_tier if s.payment_status == "verified" else "free"

    resp = {
        "submission": {
            "name": s.name,
            "status": s.status,
            "tier": tier_key,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        },
        "tier": tier_key,
    }

    catalog_row = None
    if s.status == "approved":
        catalog_row = CatalogTool.query.filter_by(submission_id=s.id).first()
        if not catalog_row:
            # Pre-migration approvals have no submission_id set — fall
            # back to the slug admin_approve_submission would have used.
            catalog_row = CatalogTool.query.filter_by(slug=_slugify(s.name)).first()

    if catalog_row:
        resp["submission"]["slug"] = catalog_row.slug
        resp["submission"]["live_at"] = (
            catalog_row.visible_at.isoformat() if catalog_row.visible_at else None
        )
        # SQLite round-trips DateTime columns as naive even though every
        # write path (visibility_delay_days_for_tier's caller, etc.) stores
        # UTC — normalize before comparing or this raises on SQLite (works
        # by accident on Postgres, which preserves tzinfo).
        visible_at = catalog_row.visible_at
        if visible_at is not None and visible_at.tzinfo is None:
            visible_at = visible_at.replace(tzinfo=timezone.utc)
        resp["submission"]["is_live"] = bool(
            visible_at is None or visible_at <= datetime.now(timezone.utc)
        )

    if tier_key == "free" or not catalog_row:
        return jsonify(resp)

    slug = catalog_row.slug
    since_30d = datetime.now(timezone.utc) - timedelta(days=30)
    total_clicks = OutboundClick.query.filter_by(slug=slug).count()
    total_views = ToolPageView.query.filter_by(slug=slug).count()
    # Views→clicks conversion — the most actionable single number for a
    # submitter: it isolates "is my listing convincing" from "how much
    # traffic am I getting." None (not 0%) when there's no view data yet,
    # so the frontend can show "not enough data" instead of a misleading 0%.
    ctr = round((total_clicks / total_views) * 100, 1) if total_views > 0 else None

    from app.models import Favorite
    favorites_count = Favorite.query.filter_by(tool_id=slug).count()
    rating_avg, rating_count = _combined_rating_summary(slug)

    resp["analytics"] = {
        "total_clicks": total_clicks,
        "total_views": total_views,
        "clicks_30d": OutboundClick.query.filter(
            OutboundClick.slug == slug, OutboundClick.created_at >= since_30d
        ).count(),
        "views_30d": ToolPageView.query.filter(
            ToolPageView.slug == slug, ToolPageView.created_at >= since_30d
        ).count(),
        "ctr": ctr,
        "favorites": favorites_count,
        "rating": {"average": rating_avg, "count": rating_count},
        "daily_trend": _submission_dashboard_daily_trend(slug, days=14),
    }

    if includes_sponsored_perks(tier_key):
        resp["benchmark"] = _submission_dashboard_category_benchmark(catalog_row, since_30d)
        # Derived from the live catalog record, not asserted. These were
        # hardcoded True, so the dashboard kept promising perks after a
        # sponsorship lapsed — and claimed a "Featured badge" that approval
        # never granted at all.
        #
        # Renamed from resp["featured"]: `featured` is the editorial
        # curation flag and is NOT what a sponsor gets (see
        # admin_approve_submission). Calling the paid perk block "featured"
        # is what let the two quietly blur together.
        try:
            tool_record = json.loads(catalog_row.data or "{}")
        except (TypeError, ValueError):
            tool_record = {}
        placement_live = _sponsored_active(tool_record)
        resp["perks"] = {
            "sponsored_badge": placement_live,
            "homepage_strip": placement_live,
            "above_free_placement": placement_live,
        }

        # The pages the partner unit is currently on, by name. "Placement
        # above free listings" is true but unverifiable by the person paying
        # for it; a list of URLs they can open is the same perk stated as
        # something checkable. See app/partner_slots.py.
        try:
            from app import partner_slots

            resp["partner_surfaces"] = partner_slots.surfaces_for_tool(tool_record)
        except Exception:
            current_app.logger.exception("partner surfaces failed for %s", catalog_row.slug)
            resp["partner_surfaces"] = []

    # Community placement delivery. Attached for every paid tier (not just
    # sponsored) because a rail card is earned by any verified paid
    # submission, and the whole reason to report impressions is so a sponsor
    # can judge renewal on numbers rather than vibes. Failures here must
    # never take down the analytics the submitter came for.
    try:
        from app import sponsorship

        placements = [
            {
                "placement": slot.placement,
                "label": sponsorship.PLACEMENT_LABELS.get(slot.placement, slot.placement),
                "starts_at": sponsorship._aware(slot.starts_at).isoformat(),
                "ends_at": sponsorship._aware(slot.ends_at).isoformat(),
                "source": "slot",
            }
            for slot in sponsorship.active_slots()
            if str(slot.tool_slug or "").strip().lower() == slug
        ]
        # A Fast-Track submission earns a 30-day rail unit that is synthesised
        # at render time rather than stored as a SponsorSlot (so free boosts
        # cannot consume paid inventory — see complimentary_window). This list
        # only ever read SponsorSlot rows, so those founders saw "no
        # placements" on their dashboard while their card was live on the
        # community page: the perk was being delivered and reported as absent
        # at the same time, which reads as not delivered at all.
        if not placements:
            comp = sponsorship.complimentary_placement_for_slug(slug)
            if comp:
                placements.append(comp)
        report = sponsorship.delivery_report(slug, days=30)
        resp["sponsorship"] = {
            "placements": placements,
            "impressions": report["impressions"],
            "clicks": report["clicks"],
            "ctr": report["ctr"],
            "window_days": report["window_days"],
        }
    except Exception:
        current_app.logger.exception("submission dashboard: sponsorship section failed")

    return jsonify(resp)


@api_bp.post("/submissions/dashboard/resend")
@csrf.exempt
def resend_dashboard_link():
    """Lost-link recovery, keyed by email + tool name (not submission_id —
    a submitter has no reason to know their internal row id)."""
    from app.models import Submission
    from app.submission_dashboard import dashboard_url

    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email") or "").strip().lower()
    tool_name = str(payload.get("tool_name") or "").strip()
    if not email or not tool_name:
        return jsonify({"error": "email and tool_name are required"}), 400

    ip = _feedback_client_ip()
    if is_rate_limited(f"resend_dashboard:{ip}", limit=5, window_seconds=3600):
        return jsonify({"error": "Too many requests. Try again later."}), 429

    s = (
        Submission.query.filter(
            db.func.lower(Submission.submitter_email) == email,
            db.func.lower(Submission.name) == tool_name.lower(),
        )
        .order_by(Submission.submitted_at.desc())
        .first()
    )
    if s and s.submitter_email:
        try:
            from app.email_utils import send_email

            link = dashboard_url(s.id, s.submitter_email)
            send_email(
                to=s.submitter_email,
                subject="Your AI Compass dashboard link",
                html=f'<p>Here is your submission dashboard link:</p><p><a href="{link}">{link}</a></p>',
                text=f"Your submission dashboard link: {link}",
            )
        except Exception:
            current_app.logger.exception("resend_dashboard_link failed for tool_name=%s", tool_name)

    # Deliberately vague response either way, so this endpoint can't be
    # used to probe which email/tool-name pairs exist.
    return jsonify({"success": True, "message": "If that matches our records, a link has been sent."})


@api_bp.post("/parse-syllabus")
@csrf.exempt
def parse_syllabus():
    from app.services.syllabus_parser import process_syllabus_and_build_toolkit, process_syllabus_image_and_build_toolkit
    
    file = request.files.get("file")
    text = request.form.get("text", "").strip()
    
    if not file and not text:
        return jsonify({"error": "No file uploaded or syllabus text provided."}), 400
        
    filename = None
    
    if file:
        filename = file.filename
        # Limit syllabus upload size to 5MB
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        if size > 5 * 1024 * 1024:
            return jsonify({"error": "Syllabus file too large. Please upload a file under 5MB."}), 400
            
        ext = os.path.splitext(filename or "")[1].lower()
        is_image = ext in (".png", ".jpg", ".jpeg", ".webp") or (file.mimetype and file.mimetype.startswith("image/"))
        
        if is_image:
            image_bytes = file.read()
            mimetype = file.mimetype or "image/jpeg"
            try:
                toolkit = process_syllabus_image_and_build_toolkit(image_bytes, mimetype)
                if "error" in toolkit:
                    return jsonify(toolkit), 400
                return jsonify(toolkit), 200
            except Exception as e:
                current_app.logger.exception("Syllabus image parsing failed")
                return jsonify({"error": f"Syllabus image analysis failed: {str(e)}"}), 500
        else:
            from app.services.syllabus_parser import extract_text_from_file
            syllabus_text = extract_text_from_file(file, filename)
            if not syllabus_text or "[Error" in syllabus_text:
                return jsonify({"error": syllabus_text or "Could not extract text from file."}), 400
            try:
                toolkit = process_syllabus_and_build_toolkit(syllabus_text)
                return jsonify(toolkit), 200
            except Exception as e:
                current_app.logger.exception("Syllabus parsing failed")
                return jsonify({"error": f"Syllabus analysis failed: {str(e)}"}), 500
    else:
        if not text:
            return jsonify({"error": "No syllabus text provided."}), 400
        try:
            toolkit = process_syllabus_and_build_toolkit(text)
            return jsonify(toolkit), 200
        except Exception as e:
            current_app.logger.exception("Syllabus parsing failed")
            return jsonify({"error": f"Syllabus analysis failed: {str(e)}"}), 500


@api_bp.get("/shared-toolkit/<share_id>")
def get_shared_toolkit(share_id):
    from app.models import SyllabusStack
    import json
    
    stack = SyllabusStack.query.filter_by(share_id=share_id).first()
    if not stack:
        return jsonify({"error": "Shared toolkit not found."}), 404
        
    try:
        data = json.loads(stack.tools_json)
    except Exception:
        data = {}
        
    return jsonify({
        "share_id": stack.share_id,
        "course_name": stack.course_name,
        "subject_area": stack.subject_area,
        "is_llm": data.get("is_llm", False),
        "technologies": data.get("technologies", []),
        "recommendations": data.get("recommendations", [])
    }), 200


# --- User feedback (floating widget on every page) -----------------------
# Public POST for the widget submit; admin GETs to view + mark read.
# Submissions also fan-out to an email so the admin sees them in real time
# without having to check /admin -- the DB row is the authoritative record.

def _feedback_client_ip() -> str:
    forwarded = str(request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    return str(request.remote_addr or "unknown")


@api_bp.post("/feedback")
@csrf.exempt
def submit_feedback():
    """Public endpoint for the floating feedback widget.

    Spam defenses (cheap and effective for a low-volume target):
    * Honeypot field `website` — bots fill it, humans never see it.
    * Per-IP rate limit (5 per hour) using the existing in-memory limiter.
    * Minimum message length 5 chars so accidental empty clicks don't
      flood the DB.
    """
    from app.email_utils import send_email
    from app.models import Feedback

    payload = request.get_json(silent=True) or {}

    # Honeypot — if filled, return 200 OK so the bot thinks it worked,
    # but store nothing and send nothing. Bots don't retry on success.
    if str(payload.get("website") or "").strip():
        return jsonify({"success": True}), 200

    message = str(payload.get("message") or "").strip()
    if len(message) < 5:
        return jsonify({"error": "Message is too short."}), 400
    if len(message) > 5000:
        return jsonify({"error": "Message is too long (5000 chars max)."}), 400

    ip = _feedback_client_ip()
    if is_rate_limited(f"feedback:{ip}", limit=5, window_seconds=3600):
        return jsonify({"error": "Too many submissions — try again later."}), 429

    email = (str(payload.get("email") or "").strip() or None)
    if email and len(email) > 255:
        return jsonify({"error": "Email is too long."}), 400

    page_url = (str(payload.get("page_url") or "").strip() or None)
    if page_url and len(page_url) > 500:
        page_url = page_url[:500]
    user_agent = (str(request.headers.get("User-Agent") or "").strip() or None)
    if user_agent and len(user_agent) > 500:
        user_agent = user_agent[:500]

    user_id = current_user.id if getattr(current_user, "is_authenticated", False) else None

    row = Feedback(
        message=message,
        email=email,
        page_url=page_url,
        user_agent=user_agent,
        user_id=user_id,
    )
    db.session.add(row)
    db.session.commit()

    # Fire-and-forget email notify. Failure to send must not break the
    # submission flow — the DB row is the source of truth.
    try:
        notify_to = current_app.config.get("FEEDBACK_EMAIL")
        if notify_to:
            short = (message[:80] + "...") if len(message) > 80 else message
            html = (
                f"<p><strong>New feedback on AI Compass</strong></p>"
                f"<p style='white-space:pre-wrap'>{html_escape(message)}</p>"
                f"<hr>"
                f"<p style='font-size:13px;color:#666'>"
                f"From: {html_escape(email) if email else '(no email)'}<br>"
                f"Page: {html_escape(page_url) if page_url else '(unknown)'}<br>"
                f"User: {('logged in #' + str(user_id)) if user_id else 'anonymous'}<br>"
                f"IP: {html_escape(ip)}"
                f"</p>"
                f"<p style='font-size:13px;color:#666'>"
                f"View in admin: https://ai-compass.in/admin (Feedback tab)"
                f"</p>"
            )
            send_email(notify_to, f"AI Compass feedback: {short}", html)
    except Exception:  # noqa: BLE001 — email never breaks the request
        current_app.logger.exception("feedback notify email failed")

    return jsonify({"success": True}), 201


@api_bp.get("/admin/feedback")
@login_required
def admin_list_feedback():
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import Feedback

    rows = Feedback.query.order_by(Feedback.created_at.desc()).limit(500).all()
    return jsonify({
        "feedback": [
            {
                "id": r.id,
                "message": r.message,
                "email": r.email,
                "page_url": r.page_url,
                "user_agent": r.user_agent,
                "user_id": r.user_id,
                "user_email": (r.user.email if r.user else None),
                "is_read": r.is_read,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
        "unread": sum(1 for r in rows if not r.is_read),
    })


@api_bp.post("/admin/feedback/<int:fid>/read")
@csrf.exempt
@login_required
def admin_mark_feedback_read(fid: int):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import Feedback

    row = Feedback.query.get(fid)
    if row is None:
        return jsonify({"error": "Not found"}), 404
    row.is_read = True
    db.session.commit()
    return jsonify({"success": True})


@api_bp.delete("/admin/feedback/<int:fid>")
@csrf.exempt
@login_required
def admin_delete_feedback(fid: int):
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import Feedback

    row = Feedback.query.get(fid)
    if row is None:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


# --- Newsletter signup (homepage form) -----------------------------------
# Public endpoint for the homepage NewsletterCapture form. Single opt-in
# (no confirmation email) — the next digest send is the welcome. The
# unsubscribe link in every digest is one-click revocation, so the legal
# obligation we'd otherwise need a confirmation flow for is satisfied.

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@api_bp.post("/newsletter/subscribe")
@csrf.exempt
def newsletter_subscribe():
    """Public POST: persist an email to NewsletterSubscriber.

    Spam defenses mirror /feedback:
    * Honeypot field `website` — bots fill it, humans never see it.
    * Per-IP rate limit (10/hour) — more generous than feedback since
      a household may have multiple people signing up from one IP.
    * Email regex is intentionally permissive (anything@anything.tld) —
      we'd rather accept a typo and have a bounce than reject a real
      address. Hard-bounce cleanup is a separate concern.

    Idempotent: an already-subscribed address returns 200 so the UI just
    says 'you're in' without leaking whether we'd seen the address.
    """
    from app.models import NewsletterSubscriber

    payload = request.get_json(silent=True) or {}

    # Honeypot — return 200 so bots stop retrying, persist nothing.
    if str(payload.get("website") or "").strip():
        return jsonify({"success": True}), 200

    email = str(payload.get("email") or "").strip().lower()
    if not email or len(email) > 255 or not _EMAIL_RE.match(email):
        return jsonify({"error": "Please enter a valid email address."}), 400

    ip = _feedback_client_ip()
    if is_rate_limited(f"newsletter:{ip}", limit=10, window_seconds=3600):
        return jsonify({"error": "Too many requests — try again later."}), 429

    existing = NewsletterSubscriber.query.filter_by(email=email).one_or_none()
    if existing is None:
        try:
            db.session.add(NewsletterSubscriber(email=email))
            db.session.commit()
        except Exception:
            # Race with a concurrent subscribe of the same address — the
            # unique index rejected the second insert. Treat as success
            # so the UX is identical to the "already subscribed" path.
            db.session.rollback()

    return jsonify({"success": True}), 200


@api_bp.get("/admin/newsletter")
@login_required
def admin_newsletter_subscribers():
    """List all newsletter subscribers, newest first.

    Public newsletter signups (no account required) accumulate in
    NewsletterSubscriber but had no admin-visible surface — you'd have
    had to SSH into the DB to see who'd joined. This is the read view.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import NewsletterSubscriber

    rows = (
        NewsletterSubscriber.query
        .order_by(NewsletterSubscriber.created_at.desc())
        .all()
    )
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    new_today = sum(1 for r in rows if r.created_at and r.created_at >= today_start)
    new_this_week = sum(1 for r in rows if r.created_at and r.created_at >= week_start)
    return jsonify({
        "count": len(rows),
        "new_today": new_today,
        "new_this_week": new_this_week,
        "subscribers": [
            {
                "id": r.id,
                "email": r.email,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    })


@api_bp.delete("/admin/newsletter/<int:sub_id>")
@csrf.exempt
@login_required
def admin_delete_newsletter_subscriber(sub_id: int):
    """Hard-delete a subscriber by id.

    Equivalent to the user clicking unsubscribe in a digest email — same
    DB action (DELETE row), just initiated from the admin UI. Useful for
    cleaning up obvious spam-trap addresses or honoring out-of-band
    unsubscribe requests (e.g. someone emails you instead of using the
    link).
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import NewsletterSubscriber

    row = NewsletterSubscriber.query.get(sub_id)
    if row is None:
        return jsonify({"error": "Not found"}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({"success": True})


# --- Catalog sync (JSON <-> DB drift) -----------------------------------
# Background: tools.json is a one-time seed. After seed, catalog_tools
# (Postgres) is the source of truth. So when a tool is *removed* from
# tools.json, the DB still has it (Google Forms AI is the standing
# example). And when a tool is *added* to tools.json post-seed, the DB
# doesn't pick it up — seed only runs when the table is empty.
#
# This endpoint diffs the two and lets the admin act on the drift.

@api_bp.get("/admin/catalog-diff")
@login_required
def admin_catalog_diff():
    """Compute drift between tools.json and the catalog_tools DB table.

    Returns three buckets:
      * db_only       — slug exists in DB, not in JSON. Removed-from-JSON
                        but never cleaned from DB (Google Forms AI lives
                        here). Admin can hide or delete.
      * json_only     — slug exists in JSON, not in DB. New tools added
                        post-seed that never got into the source of truth.
                        Admin can import (upsert into DB).
      * matched_count — how many slugs are present in both, for context.

    DB rows include their `hidden` flag so the admin UI can show which
    drift rows are already hidden from the public catalog (a softer
    state than deleted; useful for keeping the row around with its
    affiliate / metadata while removing it from the directory).
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.models import CatalogTool
    from app.tool_cache import _load_tools_from_disk

    try:
        json_records = _load_tools_from_disk() or []
    except Exception as exc:
        return jsonify({"error": f"Failed to load tools.json: {exc}"}), 500

    json_by_slug = {
        str(t.get("slug") or "").strip().lower(): t
        for t in json_records
        if t.get("slug")
    }
    db_rows = CatalogTool.query.all()
    db_by_slug = {(r.slug or "").strip().lower(): r for r in db_rows}

    json_slugs = set(json_by_slug)
    db_slugs = set(db_by_slug)

    db_only = sorted(db_slugs - json_slugs)
    json_only = sorted(json_slugs - db_slugs)
    matched = json_slugs & db_slugs

    return jsonify({
        "db_only": [
            {
                "slug": s,
                "name": db_by_slug[s].name,
                "category": db_by_slug[s].category,
                "hidden": bool(db_by_slug[s].hidden),
                "updated_at": (
                    db_by_slug[s].updated_at.isoformat()
                    if db_by_slug[s].updated_at else None
                ),
            }
            for s in db_only
        ],
        "json_only": [
            {
                "slug": s,
                "name": str(json_by_slug[s].get("name") or s),
                "category": str(json_by_slug[s].get("category") or "") or None,
            }
            for s in json_only
        ],
        "matched_count": len(matched),
        "db_total": len(db_rows),
        "json_total": len(json_records),
    })


@api_bp.post("/admin/catalog-import/<slug>")
@csrf.exempt
@login_required
def admin_catalog_import_from_json(slug: str):
    """Import one tool from tools.json into the DB catalog_tools table.

    Use case: tools.json has a record that never made it into the DB
    (added to JSON after the initial seed; seed only runs on empty
    table). Idempotent upsert — calling twice is a no-op the second
    time except for refreshing the `data` blob.
    """
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.catalog_store import upsert_tool
    from app.tool_cache import _load_tools_from_disk, refresh_tools_cache

    slug_l = str(slug or "").strip().lower()
    if not slug_l:
        return jsonify({"error": "Slug is required"}), 400

    json_records = _load_tools_from_disk() or []
    record = next(
        (t for t in json_records if str(t.get("slug") or "").strip().lower() == slug_l),
        None,
    )
    if record is None:
        return jsonify({"error": f"slug {slug_l!r} not present in tools.json"}), 404

    ok = upsert_tool(record)
    if not ok:
        return jsonify({"error": "Import failed — check server logs"}), 500

    # Cache invalidate so the newly-imported tool shows up immediately
    # in the public catalog without a manual /admin/clear-cache click.
    # Must be refresh (not prime): prime no-ops on a warm cache, so the
    # imported tool wouldn't appear until the next process restart.
    refresh_tools_cache(DATA_PATH)
    return jsonify({"success": True, "slug": slug_l, "name": record.get("name")})


@api_bp.post("/admin/catalog-sync-all-updates")
@csrf.exempt
@login_required
def admin_catalog_sync_all_updates():
    """Bulk sync all tool details and pricing updates from tools.json to the DB."""
    if not _is_admin():
        return jsonify({"error": "Forbidden"}), 403
    from app.catalog_store import upsert_tool
    from app.tool_cache import _load_tools_from_disk, refresh_tools_cache

    try:
        json_records = _load_tools_from_disk() or []
    except Exception as exc:
        return jsonify({"error": f"Failed to load tools.json: {exc}"}), 500

    applied = 0
    failed = 0
    for record in json_records:
        if upsert_tool(record):
            applied += 1
        else:
            failed += 1

    db.session.commit()
    refresh_tools_cache(DATA_PATH)
    return jsonify({"success": True, "applied": applied, "failed": failed})





# ---------------------------------------------------------------------------
# Upstash Vector -- semantic tool recommendation
# ---------------------------------------------------------------------------
# Lazy import: the app remains bootable even if upstash-vector is not
# installed (CI / contributor environments that skip optional deps).
try:
    from upstash_vector import Index as _UpstashIndex
    _UPSTASH_AVAILABLE = True
except ImportError:
    _UpstashIndex = None
    _UPSTASH_AVAILABLE = False

_TRANSFORMERS_AVAILABLE = importlib.util.find_spec("sentence_transformers") is not None

def _get_semantic_embedding(text: str) -> list[float] | None:
    """
    Get 384-dimension embedding for text using Hugging Face Inference API
    to avoid loading massive PyTorch model in memory (preventing Render OOM).
    """
    url = "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2"
    headers = {}
    token = os.environ.get("HF_API_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
        
    try:
        response = requests.post(url, json={"inputs": text}, headers=headers, timeout=10)
        if response.status_code == 200:
            embedding = response.json()
            if isinstance(embedding, list) and len(embedding) > 0:
                if isinstance(embedding[0], list):
                    return embedding[0]
                return embedding
    except Exception as e:
        current_app.logger.error("Hugging Face embedding generation failed: %s", e)
    return None


_upstash_index = None  # module-level singleton
_transformer_model = None  # module-level model singleton


def _get_transformer_model():
    """
    Return a cached SentenceTransformer model instance.
    """
    global _transformer_model
    if _transformer_model is None:
        try:
            from sentence_transformers import SentenceTransformer as _SentenceTransformer
            _transformer_model = _SentenceTransformer("all-MiniLM-L6-v2")
        except ImportError:
            _transformer_model = None
    return _transformer_model


def _get_upstash_index():
    """
    Return a cached Upstash Vector Index connection.

    The Index is initialised lazily on the first call so that missing env
    variables only cause an error when the route is actually hit, not at
    import time.
    """
    global _upstash_index
    if _upstash_index is None:
        url = os.environ.get("UPSTASH_VECTOR_REST_URL")
        token = os.environ.get("UPSTASH_VECTOR_REST_TOKEN")
        if not url or not token:
            raise EnvironmentError(
                "UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN "
                "must be set to use /api/recommend."
            )
        _upstash_index = _UpstashIndex(url=url, token=token)
    return _upstash_index


@api_bp.route("/recommend", methods=["GET"])
def recommend_tools():
    """
    GET /api/recommend?q=<natural-language query>

    Perform a semantic similarity search over the Upstash Vector index and
    return the top-3 most relevant AI tools with their metadata and score.

    Query parameters
    ----------------
    q : str  (required)
        Natural-language description of what the user is looking for.

    Response (200)
    --------------
    {
        "query": "coding assistant for students",
        "results": [
            {
                "id": "cursor-ai",
                "name": "Cursor",
                "category": "Coding",
                "pricing": "Free tier available",
                "url": "https://cursor.sh",
                "score": 0.91
            },
            ...
        ]
    }

    Error responses
    ---------------
    400  - q parameter is missing or empty
    501  - upstash-vector package is not installed
    503  - Upstash index is unreachable or misconfigured
    """
    if not _UPSTASH_AVAILABLE or not _TRANSFORMERS_AVAILABLE:
        missing = []
        if not _UPSTASH_AVAILABLE:
            missing.append("upstash-vector")
        if not _TRANSFORMERS_AVAILABLE:
            missing.append("sentence-transformers")
        return (
            jsonify({
                "error": f"Required packages missing: {', '.join(missing)}",
                "hint": f"Run: pip install {' '.join(missing)}",
            }),
            501,
        )

    user_query = request.args.get("q", "").strip()
    if not user_query:
        return (
            jsonify({
                "error": "Missing required query parameter: q",
                "example": "/api/recommend?q=coding+assistant+for+students",
            }),
            400,
        )

    # Rate limiting: max 10 requests per minute per IP to protect Upstash free tier quota
    forwarded = str(request.headers.get("X-Forwarded-For") or "").strip()
    ip = forwarded.split(",")[0].strip() if forwarded else str(request.remote_addr or "unknown")
    if is_rate_limited(f"rate_limit:recommend:{ip}", limit=10, window_seconds=60):
        return jsonify({"error": "Too many requests. Please slow down."}), 429

    try:
        query_vector = _get_semantic_embedding(user_query)
        if not query_vector:
            model = _get_transformer_model()
            if model:
                query_vector = model.encode(user_query).tolist()
                
        if not query_vector:
            raise RuntimeError("Failed to compute embedding via Hugging Face API or local model fallback.")

        index = _get_upstash_index()
        matches = index.query(
            vector=query_vector,
            top_k=3,
            include_metadata=True,
        )
    except EnvironmentError as env_err:
        return jsonify({"error": str(env_err)}), 503
    except Exception as exc:
        current_app.logger.error("Upstash Vector query failed: %s", exc)
        return jsonify({"error": f"Upstash/Transformer Error: {str(exc)}"}), 503

    from app.tool_cache import get_visible_tools
    try:
        all_tools = get_visible_tools(DATA_PATH)
    except Exception:
        all_tools = []

    results = []
    for match in matches:
        # Find matching tool by slug or ID (case-insensitive) in our cache
        tool = next(
            (t for t in all_tools if str(t.get("slug", "")).lower() == str(match.id).lower() or str(t.get("id", "")).lower() == str(match.id).lower()),
            None
        )
        if tool:
            results.append({
                **tool,
                "_score": round(float(match.score), 4),
                "_match_type": "semantic"
            })
        else:
            meta = match.metadata or {}
            results.append({
                "id": match.id,
                "name": meta.get("name", match.id),
                "category": meta.get("category", ""),
                "pricing": meta.get("pricing", ""),
                "url": meta.get("url", ""),
                "_score": round(float(match.score), 4),
                "_match_type": "semantic"
            })

    return jsonify({"query": user_query, "results": results})
