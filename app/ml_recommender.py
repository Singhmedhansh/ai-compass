import os
import pickle
import heapq
from functools import lru_cache
from typing import TYPE_CHECKING


# Use a module-level state dict instead of global
_state = {"model": None}


def clear_model_cache():
    _state["model"] = None
    get_similar_tools.cache_clear()

GOAL_CATEGORY_MAP = {
    "writing":     ["Writing & Chat"],
    "coding":      ["Coding"],
    "image":       ["Image Generation"],
    "video":       ["Video Generation"],
    "audio":       ["Audio & Voice"],
    "music":       ["Audio & Voice"],
    "research":    ["Research"],
    "study":       ["Research"],
    "productivity":["Productivity"],
    "design":      ["Image Generation"],
    "education":   ["Research", "Productivity"],
    "data":        ["Research", "Coding"],
    "chat":        ["Writing & Chat"],
}

USE_CASE_TAG_MAP = {
    "essay":           ["writing", "academic", "summarization"],
    "blog":            ["writing", "content", "seo"],
    "email":           ["writing", "productivity", "communication"],
    "resume":          ["writing", "career"],
    "creative writing":["writing", "creative", "storytelling"],
    "report":          ["writing", "research", "summarization"],
    "web app":         ["coding", "fullstack", "deployment"],
    "frontend":        ["coding", "ui", "react"],
    "debugging":       ["coding", "debugging", "ide"],
    "data science":    ["coding", "data", "python"],
    "automation":      ["coding", "scripting"],
    "mobile app":      ["coding", "mobile"],
    "research paper":  ["research", "citations", "academic"],
    "fact checking":   ["research", "search", "citations"],
    "youtube":         ["video", "editing", "content"],
    "social media":    ["image", "video", "content"],
    "podcast":         ["audio", "transcription", "voice"],
    "logo":            ["design", "image", "branding"],
    "photo editing":   ["image", "photography", "editing"],
    "music":           ["music", "audio", "creative"],
    "meetings":        ["productivity", "transcription", "notes"],
    "notes":           ["productivity", "notes", "organization"],
    "presentation":    ["productivity", "design", "slides"],
    "exam prep":       ["education", "academic", "quiz"],
    "study":           ["education", "academic", "summarization"],
    "language":        ["education", "translation"],
    "summarize":       ["summarization", "research"],
    "translation":     ["translation", "language"],
}

PRICING_SCORE_MAP = {
    # (user_budget, tool_pricing) -> score delta
    ("free",      "free"):      40,
    ("free",      "freemium"):  20,
    ("free",      "paid"):     -30,
    ("freemium",  "free"):      30,
    ("freemium",  "freemium"):  30,
    ("freemium",  "paid"):     -10,
    ("paid",      "free"):      10,
    ("paid",      "freemium"):  15,
    ("paid",      "paid"):      20,
}

def load_model():
    if _state["model"] is not None:
        return _state["model"]
    path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'data', 'recommendation_model.pkl'
    )
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'rb') as f:
            _state["model"] = pickle.load(f)
        return _state["model"]
    except (OSError, pickle.UnpicklingError):
        return None

GOAL_MAP = {
    'studying': 'study homework exam research academic learn',
    'coding': 'code programming developer software engineering debug',
    'writing': 'write essay content blog creative grammar',
    'research': 'research papers analysis academic citations scholar',
    'creating': 'image video design creative art generation visual',
    'productivity': 'productivity organize automate workflow focus task'
}

LEVEL_MAP = {
    'beginner': 'beginner easy simple intuitive no-code',
    'intermediate': 'intermediate moderate some experience',
    'advanced': 'advanced professional developer api technical'
}

def score_tool(tool, goal, budget, platform, experience_level, use_case):
    """
    Returns an integer score for a tool given user inputs.
    Returns 0 if the tool fails the category hard gate.
    """
    # ── HARD GATE: category must match goal ─────────────────
    allowed = GOAL_CATEGORY_MAP.get(goal.lower().strip(), [])
    if allowed and tool.get("category") not in allowed:
        return 0

    score = 50  # base score for passing the gate

    # ── USE CASE TAG MATCH ───────────────────────────────────
    if use_case:
        uc_lower = use_case.lower().strip()
        matched_tags = []
        for key, tags in USE_CASE_TAG_MAP.items():
            if key in uc_lower or uc_lower in key:
                matched_tags.extend(tags)

        tool_tags = [t.lower() for t in tool.get("tags", [])]
        for tag in matched_tags:
            if tag in tool_tags:
                score += 20
            elif any(tag in t for t in tool_tags):
                score += 8

        tool_uses = [u.lower() for u in tool.get("use_cases", [])]
        for uc in tool_uses:
            if uc_lower in uc or any(w in uc for w in uc_lower.split()):
                score += 15

    # ── BUDGET MATCH ─────────────────────────────────────────
    tool_pricing = tool.get("pricing", "freemium").lower()
    user_budget  = budget.lower().strip()
    score += PRICING_SCORE_MAP.get((user_budget, tool_pricing), 0)

    # ── PLATFORM MATCH ───────────────────────────────────────
    tool_platforms = [p.lower() for p in tool.get("platforms", [])]
    platform_lower = platform.lower().strip()
    platform_hits = {
        "web":     ["web"],
        "mobile":  ["ios", "android"],
        "desktop": ["windows", "mac", "linux"],
        "api":     ["api"],
    }
    for p in platform_hits.get(platform_lower, [platform_lower]):
        if p in tool_platforms:
            score += 20
            break

    # ── EXPERIENCE LEVEL ─────────────────────────────────────
    tool_tags_lower = [t.lower() for t in tool.get("tags", [])]
    if experience_level in ("beginner", "novice"):
        if any(t in tool_tags_lower for t in ["beginner-friendly", "no-code", "easy"]):
            score += 25
        if tool_pricing in ("free", "freemium"):
            score += 8
    elif experience_level in ("advanced", "expert"):
        tool_platforms_lower = [p.lower() for p in tool.get("platforms", [])]
        if "api" in tool_platforms_lower:
            score += 20
        if any(t in tool_tags_lower for t in ["open-source", "advanced", "api"]):
            score += 15

    # ── STUDENT PERK ─────────────────────────────────────────
    if tool.get("student_perk") or tool.get("studentPerk"):
        score += 10

    # ── QUALITY SIGNALS ──────────────────────────────────────
    rating = float(tool.get("rating", 3.0))
    score += rating * 5
    if tool.get("trending"):
        score += 8
    if tool.get("featured"):
        score += 5
    reviews = int(tool.get("review_count", 0))
    if reviews > 10000:
        score += 8
    elif reviews > 1000:
        score += 4

    return max(score, 0)

def build_reason(tool, goal, budget, use_case):
    """Human-readable explanation for why this tool was recommended."""
    parts = []
    rating = tool.get("rating", 0)
    if rating >= 4.7:
        parts.append(f"top-rated ({rating}★)")
    pricing = tool.get("pricing", "")
    if pricing == "free":
        parts.append("completely free")
    elif pricing == "freemium":
        parts.append("free tier available")
    if tool.get("student_perk") or tool.get("studentPerk"):
        parts.append("student discount")
    if tool.get("trending"):
        parts.append("trending this week")
    if use_case:
        parts.append(f"great for {use_case}")
    category = tool.get("category", goal)
    base = f"Best-fit {category} tool"
    return (base + " — " + ", ".join(parts)) if parts else base

def get_recommendations(goal=None, budget=None, platform=None, level=None, use_case="", limit=6):
    """
    Returns a list of recommended tools with scores and reasons.
    Guaranteed to return only tools matching the correct category for goal.
    """
    from app.tool_cache import get_cached_tools
    import os
    data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "tools.json")
    tools = get_cached_tools(data_path)

    scored = []
    # Note: Using 'level' mapping to 'experience_level' and mapping default args
    goal = goal or ""
    budget = budget or "freemium"
    platform = platform or "web"
    experience_level = level or "intermediate"

    for tool in tools:
        s = score_tool(tool, goal, budget, platform, experience_level, use_case)
        if s > 0:
            scored.append((tool, s))

    scored.sort(key=lambda x: x[1], reverse=True)

    # Fallback: if fewer than 3 results, relax budget penalty and retry
    if len(scored) < 3:
        scored = []
        for tool in tools:
            allowed = GOAL_CATEGORY_MAP.get(goal.lower().strip(), [])
            if allowed and tool.get("category") not in allowed:
                continue
            # Simplified score without budget penalty
            s = float(tool.get("rating", 3.0)) * 10
            if tool.get("trending"):
                s += 8
            if tool.get("featured"):
                s += 5
            scored.append((tool, s))
        scored.sort(key=lambda x: x[1], reverse=True)

    results = []
    for tool, s in scored[:limit]:
        results.append({
            **tool,
            "_score":  round(s, 2),
            "_reason": build_reason(tool, goal, budget, use_case),
        })

    return results

@lru_cache(maxsize=2048)
def get_similar_tools(slug, limit=4):
    slug = str(slug or "").strip().lower()
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 4
    if limit <= 0:
        return []

    model = load_model()
    if not model:
        return []

    tool_index = model['tool_index']
    similarity_matrix = model['similarity_matrix']
    tools = model['tools']

    if slug not in tool_index:
        name_slug = slug.lower().replace('-', ' ')
        for key in tool_index:
            if key.lower().replace('-', ' ') == name_slug:
                slug = key
                break

    if slug not in tool_index:
        return []

    idx = tool_index[slug]
    row = similarity_matrix[idx]

    # Fast path for numpy arrays (common for sklearn cosine matrices).
    try:
        import numpy as np  # local import avoids hard dependency during startup
        arr = np.asarray(row)
        if arr.ndim == 1 and arr.size > 0:
            if idx < arr.size:
                arr[idx] = -1.0
            top_k = min(limit, arr.size)
            if top_k <= 0:
                return []
            candidate_idx = np.argpartition(arr, -top_k)[-top_k:]
            ranked_idx = candidate_idx[np.argsort(arr[candidate_idx])[::-1]]
            return [tools[int(i)] for i in ranked_idx if 0 <= int(i) < len(tools)]
    except Exception:
        pass

    # Fallback for non-numpy sequence types.
    sim_scores = heapq.nlargest(limit + 1, enumerate(row), key=lambda x: x[1])
    return [tools[i] for i, _ in sim_scores[1:limit + 1]]

def semantic_search(query, limit=50):
    """Return tools ranked by TF-IDF cosine similarity to a free-form query.

    Reuses the vectorizer trained for tool-to-tool similarity so query strings
    land in the same vector space as tool descriptions. Each returned dict
    carries a `_score` float in [0, 1] for the caller's threshold check.

    Returns [] on any failure so callers can fall back to keyword search
    without surfacing an error to the user.
    """
    if not query or not str(query).strip():
        return []

    try:
        model = load_model()
        if not model:
            return []

        vectorizer = model.get('vectorizer')
        tfidf_matrix = model.get('tfidf_matrix')
        model_tools = model.get('tools')
        if vectorizer is None or tfidf_matrix is None or not model_tools:
            return []

        import numpy as np
        from sklearn.metrics.pairwise import cosine_similarity

        query_vec = vectorizer.transform([str(query).strip()])
        similarities = cosine_similarity(query_vec, tfidf_matrix)[0]

        top_k = min(int(limit) if limit else 50, similarities.size)
        if top_k <= 0:
            return []

        top_indices = np.argpartition(similarities, -top_k)[-top_k:]
        ranked_indices = top_indices[np.argsort(similarities[top_indices])[::-1]]

        results = []
        for idx in ranked_indices:
            score = float(similarities[idx])
            if score <= 0:
                continue
            tool = dict(model_tools[int(idx)])
            tool['_score'] = score
            results.append(tool)
        return results
    except Exception:
        # Any vectorizer/matrix/import failure must degrade to keyword search,
        # not error out to the user.
        return []


# Short intent queries with stopwords ("homework", "make slides") confuse TF-IDF
# because word co-occurrence in tool descriptions leaks unrelated tools (e.g. a
# design tool whose blurb mentions "students" scores for "homework" queries).
# detect_intent + rerank_by_category run AFTER semantic_search to push category
# matches up and mismatches down. First matching rule wins.
INTENT_RULES = [
    {
        'name': 'academic',
        'keywords': {'homework', 'essay', 'study', 'studying', 'exam', 'exams',
                     'paper', 'papers', 'class', 'classes', 'lecture', 'lectures',
                     'course', 'courses', 'assignment', 'assignments', 'tutor',
                     'tutoring', 'math', 'physics', 'chemistry', 'biology',
                     'thesis', 'dissertation', 'phd', 'mba', 'undergrad',
                     'graduate', 'coursework'},
        'boost': {'Research', 'Productivity', 'Writing & Chat'},
        'penalize': {'Image Generation', 'Video Generation', 'Audio & Voice'},
    },
    {
        'name': 'coding',
        'keywords': {'code', 'coding', 'programming', 'developer', 'debug',
                     'debugging', 'refactor', 'compiler', 'ide', 'function',
                     'api', 'backend', 'frontend', 'database', 'sql',
                     'javascript', 'python', 'react', 'typescript'},
        'boost': {'Coding'},
        'penalize': {'Image Generation', 'Video Generation', 'Audio & Voice',
                     'Writing & Chat'},
    },
    {
        'name': 'design',
        'keywords': {'design', 'mockup', 'mockups', 'wireframe', 'wireframes',
                     'illustration', 'illustrations', 'logo', 'logos', 'poster',
                     'posters', 'ui', 'ux', 'figma', 'visual'},
        # Coding is boosted alongside Image Generation so design-to-code tools
        # (v0, Stitch, Subframe) rank for "design a landing page" style queries.
        'boost': {'Image Generation', 'Coding'},
        'penalize': {'Audio & Voice', 'Video Generation'},
    },
    {
        'name': 'writing',
        # 'edit'/'editing' deliberately omitted — they collide with the video rule
        # ("edit my video" should hit video intent, not writing).
        'keywords': {'write', 'writing', 'essay', 'essays', 'blog', 'article',
                     'articles', 'content', 'copywriting', 'grammar', 'rewrite',
                     'paraphrase'},
        'boost': {'Writing & Chat', 'Research'},
        'penalize': {'Image Generation', 'Video Generation', 'Audio & Voice'},
    },
    {
        'name': 'video',
        'keywords': {'video', 'videos', 'edit', 'editing', 'animation',
                     'animate', 'recording', 'screencast', 'film'},
        'boost': {'Video Generation'},
        'penalize': {'Writing & Chat', 'Research'},
    },
    {
        'name': 'audio',
        'keywords': {'audio', 'voice', 'voices', 'podcast', 'podcasts',
                     'speech', 'transcribe', 'transcription', 'transcript',
                     'music', 'tts', 'narration'},
        'boost': {'Audio & Voice'},
        'penalize': {'Image Generation', 'Video Generation'},
    },
    {
        'name': 'research',
        'keywords': {'research', 'citation', 'citations', 'literature',
                     'scholar', 'academic', 'journal', 'journals', 'review'},
        'boost': {'Research'},
        'penalize': {'Image Generation', 'Video Generation', 'Audio & Voice'},
    },
    {
        'name': 'productivity',
        'keywords': {'task', 'tasks', 'todo', 'todos', 'note', 'notes',
                     'calendar', 'schedule', 'meeting', 'meetings', 'organize',
                     'organization', 'project', 'projects', 'planning'},
        'boost': {'Productivity', 'Writing & Chat'},
        'penalize': {'Image Generation', 'Video Generation', 'Audio & Voice'},
    },
]


def detect_intent(query):
    """Return the first matched intent rule, or None if no intent detected."""
    if not query:
        return None
    import re
    tokens = set(re.findall(r'[a-z0-9]+', str(query).lower()))
    if not tokens:
        return None
    for rule in INTENT_RULES:
        if tokens & rule['keywords']:
            return rule
    return None


def rerank_by_category(results, intent_rule, boost_factor=1.5, penalize_factor=0.4):
    """Re-rank semantic_search results by category match against intent.

    Pure transform — never mutates input. Multiplies each result's _score by
    boost_factor when category is in the rule's boost set, by penalize_factor
    when in penalize, leaves untouched otherwise. Re-sorts descending.
    """
    if not intent_rule or not results:
        return list(results) if results else []

    boost = intent_rule.get('boost', set())
    penalize = intent_rule.get('penalize', set())

    adjusted = []
    for r in results:
        score = float(r.get('_score', 0))
        category = (r.get('category') or '').strip()
        if category in boost:
            score *= boost_factor
        elif category in penalize:
            score *= penalize_factor
        adjusted.append({**r, '_score': score})

    return sorted(adjusted, key=lambda x: x.get('_score', 0), reverse=True)


def _reason(tool, goal, budget, level):
    parts = []
    pricing = tool.get('pricing_tier', tool.get('pricing', '')).lower()
    if budget == 'free' and pricing == 'free':
        parts.append("completely free")
    if tool.get('student_friendly'):
        parts.append("student friendly")
    try:
        rating = float(tool.get('rating', 0))
        if rating >= 4.5:
            parts.append(f"highly rated {rating:.1f} stars")
    except (TypeError, ValueError):
        pass
    if goal:
        parts.append(f"matches your {goal} goal")
    if not parts:
        parts.append("matches your preferences")
    return "This tool is " + ", ".join(parts)


def get_top_rated_tools(limit=6):
    if TYPE_CHECKING:
        from app.tool_cache import get_cached_tools
    try:
        from app.tool_cache import get_cached_tools
        tools = get_cached_tools() or []
        return sorted(tools, key=lambda t: float(t.get('rating', 0) or 0), reverse=True)[:limit]
    except Exception:
        # This must be broad because tool cache can fail for many reasons (IO, import, etc.)
        return []