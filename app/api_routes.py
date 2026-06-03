import json
import os
import re
from difflib import SequenceMatcher
import subprocess
import sys
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
from app.ml_recommender import clear_model_cache, detect_intent, get_similar_tools, load_model, rerank_by_category
from app.models import Favorite, Rating, Review, ToolRating, User
from app.rate_limit import is_rate_limited
from app.search_utils import search_tools, weighted_search
from app.tool_cache import DEFAULT_TOOLS_PATH, TOOL_CACHE, get_cached_tools, get_visible_tools

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

    ranked.sort(
        key=lambda item: (item[0], _summary_score(item[1]), 1 if item[1].get("featured") else 0),
        reverse=True,
    )

    return [{**tool, "_score": round(score * 100, 2), "_match_type": "fuzzy"} for score, tool in ranked[:limit]]


def _search_catalog_tools(raw_query: str, category: str, pricing: str, student_only: bool, trending_only: bool, sort_by: str) -> dict:
    if not raw_query:
        return search_tools(
            raw_query=raw_query,
            category_filter=category,
            pricing_filter_ui=pricing,
            student_only=student_only,
            trending_only=trending_only,
            sort_by=sort_by,
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
        if trending_only and not tool.get("trending"):
            continue
        filtered_tools.append(tool)

    results = weighted_search(
        raw_query,
        filtered_tools,
    )

    if raw_query and not (selected_category or selected_pricing or student_only or trending_only) and _looks_like_question_intent(raw_query):
        fuzzy_results = _local_fuzzy_search(raw_query, limit=50, threshold=0.72)
        if fuzzy_results:
            intent_rule = detect_intent(raw_query)
            if intent_rule:
                fuzzy_results = rerank_by_category(fuzzy_results, intent_rule)
            if sort_by == "Rating":
                fuzzy_results.sort(key=lambda x: float(x.get("rating", 0)), reverse=True)
            elif sort_by == "Reviews":
                fuzzy_results.sort(key=lambda x: int(x.get("review_count", 0)), reverse=True)
            elif sort_by == "Trending":
                fuzzy_results.sort(key=lambda x: (bool(x.get("trending", False)), float(x.get("rating", 0))), reverse=True)
            else:
                fuzzy_results.sort(key=lambda x: x.get("_score", 0), reverse=True)

            return {
                "results": fuzzy_results,
                "fallback": False,
                "fuzzy_matched": True,
                "suggested_query": fuzzy_results[0].get("name"),
                "original_query": raw_query,
                "total": len(fuzzy_results),
            }

        return {
            "results": [],
            "fallback": False,
            "fuzzy_matched": False,
            "fallback_detected": True,
            "original_query": raw_query,
            "total": 0,
        }

    if not results and raw_query and not (selected_category or selected_pricing or student_only or trending_only):
        fuzzy_results = _local_fuzzy_search(raw_query, limit=50, threshold=0.72)
        if fuzzy_results:
            intent_rule = detect_intent(raw_query)
            if intent_rule:
                fuzzy_results = rerank_by_category(fuzzy_results, intent_rule)
            if sort_by == "Rating":
                fuzzy_results.sort(key=lambda x: float(x.get("rating", 0)), reverse=True)
            elif sort_by == "Reviews":
                fuzzy_results.sort(key=lambda x: int(x.get("review_count", 0)), reverse=True)
            elif sort_by == "Trending":
                fuzzy_results.sort(key=lambda x: (bool(x.get("trending", False)), float(x.get("rating", 0))), reverse=True)
            else:
                fuzzy_results.sort(key=lambda x: x.get("_score", 0), reverse=True)

            return {
                "results": fuzzy_results,
                "fallback": False,
                "fuzzy_matched": True,
                "suggested_query": fuzzy_results[0].get("name"),
                "original_query": raw_query,
                "total": len(fuzzy_results),
            }

    if sort_by == "Rating":
        results.sort(key=lambda x: float(x.get("rating", 0)), reverse=True)
    elif sort_by == "Reviews":
        results.sort(key=lambda x: int(x.get("review_count", 0)), reverse=True)
    elif sort_by == "Trending":
        results.sort(key=lambda x: (bool(x.get("trending", False)), float(x.get("rating", 0))), reverse=True)
    else:
        results.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)

    response = {
        "results": results,
        "fallback": False,
        "fuzzy_matched": False,
        "total": len(results),
    }
    if not results and not (selected_category or selected_pricing or student_only or trending_only):
        response["fallback_detected"] = True
        response["original_query"] = raw_query
    return response


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

    matched_tools.sort(
        key=lambda tool: (_summary_score(tool), 1 if tool.get("featured") else 0),
        reverse=True,
    )

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
    
    allow = current_app.config.get("ADMIN_EMAILS", [])
    is_admin = bool(getattr(user, "is_admin", False)) or (
        str(user.email or "").strip().lower() in allow
    )

    return {
        "id": user.id,
        "name": user.display_name or "",
        "email": user.email,
        "picture": user.oauth_picture_url or "",
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "member_since": member_since,
        "is_admin": is_admin,
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
    "learning": ["courses & tutorials", "research", "productivity"],
    "coding": ["coding"],
    "writing": ["writing & chat"],
    "research": ["research"],
    "creating": ["image generation", "video generation", "audio & voice", "design & graphics"],
    "productivity": ["productivity"],
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

    blob = " ".join(str(item).lower() for item in (*tags, *use_cases))
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


def _finder_tool_score(tool: dict, goal, budget: str, platform, level: str, use_case: str) -> float:
    goals = _as_choice_list(goal)
    platforms = _as_choice_list(platform)

    category = _normalize_text(tool.get("category"))
    allowed_categories = set()
    for g in goals:
        allowed_categories.update(FINDER_GOAL_CATEGORY_MAP.get(g, []))
    if allowed_categories and category not in allowed_categories:
        return 0.0

    if goals and not any(_tool_passes_category_keyword_veto(tool, g) for g in goals):
        return 0.0

    score = 35.0

    if category in allowed_categories:
        score += 45.0

    tool_text = " ".join(
        [
            str(tool.get("name") or ""),
            str(tool.get("description") or ""),
            " ".join(str(tag) for tag in (tool.get("tags") or [])),
            " ".join(str(item) for item in (tool.get("use_cases") or [])),
        ]
    ).lower()

    if use_case:
        use_case_tokens = [token for token in re.split(r"[^a-z0-9]+", use_case.lower()) if token]
        if use_case.lower() in tool_text:
            score += 28.0
        elif any(token in tool_text for token in use_case_tokens):
            score += 14.0

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
    score += pricing_bonus.get((normalized_budget, pricing), 0.0)

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
        else:
            # Penalize explicit platform mismatch so recommendations change per selection.
            score -= 14.0

    tool_tags = [str(tag).lower() for tag in (tool.get("tags") or [])]
    if level in ("beginner", "novice"):
        if any(tag in tool_tags for tag in ["beginner-friendly", "no-code", "easy"]):
            score += 18.0
    elif level in ("advanced", "expert"):
        if any(tag in tool_tags for tag in ["api", "open-source", "advanced", "developer"]):
            score += 18.0

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

    return score


def _rank_finder_tools(tools: list[dict], goal, budget: str, platform, level: str, use_case: str, limit: int = 6) -> list[dict]:
    normalized_budget = _normalize_budget_choice(budget)
    platforms = _as_choice_list(platform)
    scored = []

    for tool in tools:
        score = _finder_tool_score(tool, goal, budget, platform, level, use_case)
        if score > 0:
            scored.append((tool, score))

    scored.sort(key=lambda item: item[1], reverse=True)

    platform_matched = [item for item in scored if _tool_supports_platform(item[0], platforms)]
    if platforms and len(platform_matched) >= 3:
        leftovers = [item for item in scored if not _tool_supports_platform(item[0], platforms)]
        scored = platform_matched + leftovers

    results = []
    for tool, score in scored[:limit]:
        results.append(
            {
                **tool,
                "match_score": round(score, 2),
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
    "pricing", "pricingType", "pricing_type", "pricing_tier",
    "createdAt", "created_at", "publishedAt", "published_at",
    "logo", "emoji", "icon", "logo_url", "logoUrl", "logo_emoji",
    "url", "website", "link", "accent_color", "tagline",
    "featured", "student_friendly", "trending",
    "curation_score", "popularity_score",
)


def _card_projection(tool: dict) -> dict:
    out = {k: tool[k] for k in _CARD_FIELDS if k in tool}
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
    ordered = sorted(
        tools,
        key=lambda tool: (_summary_score(tool), 1 if tool.get("featured") else 0),
        reverse=True,
    )
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


@api_bp.get("/tools")
@cache.cached(timeout=60, query_string=True)
def list_tools():
    from flask import make_response
    try:
        tools = get_visible_tools(DATA_PATH)
    except Exception:
        tools = []
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
        tool_payload = dict(tool)
        tool_payload["similar_tools"] = get_similar_tools(slug_value, limit=4)
        current_app.logger.info(f"[PERF] after related tools: {time.time() - t0:.2f}s")

        # Aggregate live user ratings into the payload so the tool detail page
        # and its SoftwareApplication JSON-LD render real numbers instead of
        # the static rating: 0 / review_count: 0 from tools.json. Only overwrite
        # when at least one rating exists; the static fields stay otherwise
        # (no rating is honestly better than a fabricated "0 of 5").
        try:
            agg = (
                db.session.query(
                    func.avg(Rating.value).label("avg"),
                    func.count(Rating.id).label("count"),
                )
                .filter(Rating.tool_slug == slug_value)
                .first()
            )
            if agg and agg.count and int(agg.count) > 0:
                tool_payload["rating"] = round(float(agg.avg), 1)
                tool_payload["review_count"] = int(agg.count)
        except Exception:
            # Ratings table missing or unreachable — fall back to static fields.
            db.session.rollback()
        current_app.logger.info(f"[PERF] after rating aggregate: {time.time() - t0:.2f}s")
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


@api_bp.get("/tools/<slug>/alternatives")
def tool_alternatives(slug):
    tools = get_cached_tools(DATA_PATH)
    main_tool = next((t for t in tools if t.get('slug') == slug), None)
    if not main_tool:
        return jsonify({"error": "Tool not found"}), 404

    main_category = (main_tool.get('category') or '').strip().lower()
    main_slug = (main_tool.get('slug') or '').strip().lower()
    TARGET = 10

    # Step 1: pull recommender candidates. Limit 20 (vs. TARGET=10)
    # because the category filter below will cull out-of-category
    # matches and we want enough headroom that the recommender's
    # ranking still drives the top of the list.
    recommender_results: list[dict] = []
    try:
        similar = get_similar_tools(slug, limit=20)
        slug_lookup = {t['slug']: t for t in tools if t.get('slug')}
        # The pickled recommender was trained on an older schema and its tool dicts
        # lack a 'slug' field — re-key by name against the live catalog so the frontend
        # always receives slug-bearing dicts it can link to.
        name_lookup = {(t.get('name') or '').strip().lower(): t for t in tools if t.get('name')}
        if similar and isinstance(similar[0], str):
            recommender_results = [slug_lookup[s] for s in similar if s in slug_lookup]
        elif similar:
            for entry in similar:
                if entry.get('slug') and entry['slug'] in slug_lookup:
                    recommender_results.append(slug_lookup[entry['slug']])
                    continue
                name_key = (entry.get('name') or '').strip().lower()
                if name_key and name_key in name_lookup:
                    recommender_results.append(name_lookup[name_key])
    except Exception:
        # Recommender failures must not break the page — fall through to the
        # category-only fill below.
        recommender_results = []

    # Step 2: hard category gate. Without this, TF-IDF cosine surfaces
    # tools with description-word overlap regardless of category —
    # writing tools leak into Claude's alternatives, video tools leak
    # into design, etc. The recommender's value-add is RANKING within
    # category; category SELECTION belongs to a hard gate. Mirrors the
    # server-side SEO body in app/routes.py:_meta_for_request_path so
    # crawlers and users converge on the same alternatives set.
    if main_category:
        alternatives = [
            t for t in recommender_results
            if (t.get('category') or '').strip().lower() == main_category
            and (t.get('slug') or '').strip().lower() != main_slug
        ]

        # Step 3: top up from the catalog if the recommender didn't
        # produce enough in-category matches. Preserves recommender
        # ranking at the top, pads with catalog order (which tool_cache
        # already sorts by rating).
        if len(alternatives) < TARGET:
            seen = {(t.get('slug') or '').strip().lower() for t in alternatives}
            seen.add(main_slug)
            for t in tools:
                if len(alternatives) >= TARGET:
                    break
                if (t.get('category') or '').strip().lower() != main_category:
                    continue
                s = (t.get('slug') or '').strip().lower()
                if not s or s in seen:
                    continue
                alternatives.append(t)
                seen.add(s)
    else:
        # Degenerate case: main tool has no category. Fall back to raw
        # recommender output, just dedup'd against the main tool. This
        # almost never fires in practice — every catalog tool has a
        # category — but is here so an unkeyed admin edit doesn't 500.
        alternatives = [
            t for t in recommender_results
            if (t.get('slug') or '').strip().lower() != main_slug
        ]

    alternatives = alternatives[:TARGET]

    from flask import make_response
    response = make_response(jsonify({
        "tool": main_tool,
        "alternatives": alternatives,
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
            Review.query.options(joinedload(Review.user))
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
                "body": r.body,
                "created_at": r.created_at.isoformat(),
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


@api_bp.get("/tools/<slug>/ratings")
def get_tool_ratings(slug: str):
    slug_value = str(slug or "").strip().lower()
    t0 = time.time()
    current_app.logger.info(f"[PERF] ratings start: {slug_value}")
    result = (
        db.session.query(
            func.avg(Rating.value).label("avg"),
            func.count(Rating.id).label("count"),
        )
        .filter(Rating.tool_slug == slug_value)
        .first()
    )
    current_app.logger.info(f"[PERF] after ratings query: {time.time() - t0:.2f}s")

    avg = round(float(result.avg), 1) if result and result.avg is not None else 0
    count = int(result.count or 0) if result else 0

    user_rating = None
    if current_user.is_authenticated:
        rating = Rating.query.filter_by(user_id=current_user.id, tool_slug=slug_value).first()
        user_rating = rating.value if rating else None

    current_app.logger.info(f"[PERF] total ratings: {time.time() - t0:.2f}s")

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


@api_bp.post("/submit-tool")
@csrf.exempt
def submit_tool():
    # Receive a public tool-submission form. A Submission row is written to
    # the DB (the durable source of truth the admin review queue reads) and
    # a notification email is sent to SUBMIT_NOTIFY_EMAIL when configured.
    # Email is best-effort — a delivery failure does not fail the request.
    try:
        payload = request.get_json(silent=True) or {}

        name = str(payload.get("name") or "").strip()
        url = str(payload.get("url") or "").strip()
        category = str(payload.get("category") or "").strip()
        reason = str(payload.get("reason") or "").strip()

        if not name or not url or not category or not reason:
            return jsonify({"error": "Name, URL, category, and reason are all required."}), 400

        if len(name) > 200 or len(url) > 500 or len(category) > 100 or len(reason) > 2000:
            return jsonify({"error": "One or more fields exceed length limits."}), 400

        if not (url.startswith("http://") or url.startswith("https://")):
            return jsonify({"error": "URL must start with http:// or https://"}), 400

        submitted_at = datetime.now(timezone.utc).isoformat()
        submitter_email = current_user.email if current_user.is_authenticated else None

        # Durable record: a Submission row in the DB — this is the table the
        # admin review queue (/admin/submissions) and the approve/reject
        # flow read. The old code wrote an ephemeral JSON file that Render
        # wiped on every deploy, so the queue was permanently empty and no
        # submission could ever be reviewed. Email notify below stays
        # best-effort and is no longer the durable channel.
        try:
            from app.models import Submission
            db.session.add(Submission(
                name=name,
                website=url,
                category=category,
                description=reason,
                pricing_model="unknown",
                submitter_email=submitter_email,
                status="pending",
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()
            current_app.logger.exception("Failed to persist submission to DB")
            # Don't hard-fail the user — the notification email below is
            # the backup channel.

        notify_email = os.environ.get("SUBMIT_NOTIFY_EMAIL", "medhansh.builds@gmail.com")
        # Render's free/hobby tier blocks outbound SMTP (port 587 etc.) at the
        # network level — got "OSError: [Errno 101] Network is unreachable"
        # when the prior SMTP-based send tried to reach smtp.gmail.com. Switched
        # to Resend's HTTPS API (port 443, always reachable). The existing
        # requests dependency handles the call — no new package needed.
        resend_api_key = os.environ.get("RESEND_API_KEY")

        if resend_api_key:
            try:
                # 'from' must be either a verified domain sender or Resend's
                # shared onboarding@resend.dev (which only delivers back to
                # your own Resend account email — fine for founder-only
                # notifications). Override via RESEND_FROM env once the
                # ai-compass.in domain is verified in Resend.
                from_address = os.environ.get("RESEND_FROM") or "AI Compass <no-reply@ai-compass.in>"

                resend_response = requests.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": from_address,
                        "to": [notify_email],
                        "subject": f"[AI Compass] New tool submission: {name}",
                        "text": (
                            f"A new tool was submitted via ai-compass.in/submit:\n\n"
                            f"Name: {name}\n"
                            f"URL: {url}\n"
                            f"Category: {category}\n\n"
                            f"Why it's useful:\n{reason}\n\n"
                            f"Submitted by: {submitter_email or 'anonymous (not logged in)'}\n"
                            f"Submitted at: {submitted_at}\n"
                        ),
                    },
                    timeout=10,
                )
                if not resend_response.ok:
                    # Resend returns useful JSON error details — log them so the
                    # operator can see why a send was rejected (typical causes:
                    # unverified from address, invalid API key, rate limit).
                    current_app.logger.error(
                        "Resend rejected submission email (status %s): %s",
                        resend_response.status_code,
                        resend_response.text[:500],
                    )
            except Exception:
                current_app.logger.exception("Failed to send submission email via Resend — submission still recorded")
        else:
            current_app.logger.info("RESEND_API_KEY not set — submission saved to file only, no email sent")

        return jsonify({"success": True, "message": "Submission received. Thanks!"}), 201

    except Exception:
        current_app.logger.exception("Tool submission error")
        return jsonify({"error": "Unable to submit right now"}), 500


@api_bp.get("/search")
def api_search():
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
    return jsonify(output)


@api_bp.get("/recommendations")
@login_required
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
)
_EDITABLE_LISTS = ("features", "tags", "use_cases")
_EDITABLE_BOOLS = ("studentPerk", "student_perk", "hidden", "featured")


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
    return jsonify({"success": True, "tool": tool})


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
    hidden = (request.get_json(silent=True) or {}).get("hidden", True)
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

        if not user.is_verified:
            return jsonify({"error": "Please verify your email address before logging in."}), 401

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
            serializer = URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="email-verification-salt")
            token = serializer.dumps(email)
            verification_link = f"{request.url_root}api/auth/verify-email/{token}"
            subject = "AI Compass - Verify Email"
            html = f"""
            <p>Hello {name},</p>
            <p>Thank you for registering. Please click the link below to verify your email address:</p>
            <p><a href="{verification_link}">Verify Email</a></p>
            """
            send_email(email, subject, html)
        except Exception:
            current_app.logger.exception("Failed to send verification email")

        return jsonify({"message": "Registration successful! Please check your email to verify your account."}), 201
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
        row = (
            SavedStack.query.filter_by(user_id=user_id)
            .order_by(SavedStack.id.desc())
            .first()
        )
        if row is None:
            row = SavedStack(user_id=user_id, name='default', tools_json='')
            db.session.add(row)
        row.tools_json = json.dumps(stack_payload, ensure_ascii=False)
        db.session.commit()
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception("save_stack failed")
        return jsonify({'error': 'Could not save stack', 'detail': str(exc)}), 500

    return jsonify({'message': 'Stack saved!', 'stack': {'user_id': user_id, **stack_payload}}), 200


@api_bp.route('/stack', methods=['GET'])
def get_stack():
    from app.models import SavedStack

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
        stack['user_id'] = user_id
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
    return jsonify(output)


@compat_bp.get("/tools")
@cache.cached(timeout=60, query_string=True)
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
    from app.models import Submission
    status = request.args.get("status", "pending")
    q = Submission.query
    if status != "all":
        q = q.filter_by(status=status)
    subs = q.order_by(Submission.submitted_at.desc()).limit(200).all()
    return jsonify([
        {
            "id": s.id, "name": s.name, "website": s.website,
            "category": s.category, "description": s.description,
            "pricing_model": s.pricing_model, "tags": s.tags,
            "submitter_email": s.submitter_email, "status": s.status,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
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

    record = _normalize_tool_record({
        "slug": slug,
        "name": s.name,
        "link": s.website,
        "category": s.category,
        "description": s.description,
        "tagline": s.description,
        "pricing": s.pricing_model,
        "tags": [t.strip() for t in (s.tags or "").split(",") if t.strip()],
    })
    if not upsert_tool(record):
        return jsonify({"error": "Could not add to catalog"}), 500
    s.status = "approved"
    db.session.commit()
    _refresh_catalog()
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
