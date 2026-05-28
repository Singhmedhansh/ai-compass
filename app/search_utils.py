import sys
import re

# WHY: semantic path only kicks in for relevance-sorted queries with this much
# cosine confidence; below this we treat the model as having no opinion and let
# the keyword scorer run as before.
SEMANTIC_CONFIDENCE_THRESHOLD = 0.10

# When semantic's top score is below this, the match is "plausible but weak" —
# typo queries like "gogle ai studio" land here because they hit a partial
# word ("studio") rather than the actual target. We consult fuzzy as a
# tiebreaker and prefer it if it's confidently matching a real tool name.
SEMANTIC_STRONG_THRESHOLD = 0.30
FUZZY_OVERRIDE_THRESHOLD = 85  # fuzz.ratio score (0-100) needed to override weak semantic

STOPWORDS = {
    "for", "a", "an", "the", "to", "and", "or", "with", "that",
    "is", "in", "of", "my", "me", "i", "on", "best", "good",
    "top", "tool", "tools", "ai", "app", "need", "want", "use",
    "using", "help", "make", "build", "create", "get", "find",
}

INTENT_MAP = {
    # Pricing intent
    "free":         {"pricing": ["free", "freemium"]},
    "cheap":        {"pricing": ["free", "freemium"]},
    "paid":         {"pricing": ["paid"]},
    "premium":      {"pricing": ["paid"]},
    "open source":  {"pricing": ["free"]},
    "opensource":   {"pricing": ["free"]},

    # Audience intent
    "student":      {"boost_field": "student_perk", "boost": 25},
    "students":     {"boost_field": "student_perk", "boost": 25},
    "beginner":     {"boost_tag": "beginner-friendly", "boost": 20},

    # Category intent
    "write":        {"category": "Writing & Chat"},
    "writing":      {"category": "Writing & Chat"},
    "essay":        {"category": "Writing & Chat"},
    "blog":         {"category": "Writing & Chat"},
    "email":        {"category": "Writing & Chat"},
    "code":         {"category": "Coding"},
    "coding":       {"category": "Coding"},
    "programming":  {"category": "Coding"},
    "debug":        {"category": "Coding"},
    "image":        {"category": "Image Generation"},
    "photo":        {"category": "Image Generation"},
    "picture":      {"category": "Image Generation"},
    "art":          {"category": "Image Generation"},
    "draw":         {"category": "Image Generation"},
    "design":       {"category": "Image Generation"},
    "video":        {"category": "Video Generation"},
    "film":         {"category": "Video Generation"},
    "edit video":   {"category": "Video Generation"},
    "music":        {"category": "Audio & Voice"},
    "audio":        {"category": "Audio & Voice"},
    "voice":        {"category": "Audio & Voice"},
    "song":         {"category": "Audio & Voice"},
    "podcast":      {"category": "Audio & Voice"},
    "research":     {"category": "Research"},
    "study":        {"category": "Research"},
    "notes":        {"category": "Productivity"},
    "productivity": {"category": "Productivity"},
    "meeting":      {"category": "Productivity"},
}

TOOL_CONTEXT_BOOSTS = {
    "claude": ["coding", "analysis", "research", "writing"],
    "chatgpt": ["coding", "writing", "research", "chat"],
    "cursor": ["coding", "ide", "debugging", "autocomplete"],
    "copilot": ["coding", "github", "ide", "autocomplete"],
    "midjourney": ["image", "art", "design", "creative"],
    "perplexity": ["research", "search", "citations", "facts"],
    "grammarly": ["writing", "grammar", "editing", "email"],
    "notion": ["notes", "productivity", "writing", "organization"],
    "runway": ["video", "editing", "creative", "film"],
    "elevenlabs": ["voice", "audio", "tts", "podcast"],
}

WEIGHTED_SEARCH_STOPWORDS = {
    "a", "an", "the", "for", "and", "or", "to", "in", "of", "is",
    "with", "that", "it", "me", "my", "i", "can", "how", "do",
    "make", "create", "build", "use", "using", "get",
}

def parse_intent(raw_query):
    """
    Tokenizes query, strips stopwords, resolves pricing/category/boost intents.
    Returns: (tokens, pricing_filter, category_hint, boosts)
    """
    q = raw_query.lower().strip()
    tokens = [w for w in q.split() if w not in STOPWORDS and len(w) > 1]

    pricing_filter = None
    category_hint  = None
    boosts         = {}

    # Check multi-word phrases first
    for phrase, intent in INTENT_MAP.items():
        if phrase in q:
            if "pricing"      in intent and not pricing_filter:
                pricing_filter = intent["pricing"]
            if "category"     in intent and not category_hint:
                category_hint  = intent["category"]
            if "boost_field"  in intent:
                boosts[intent["boost_field"]] = intent["boost"]
            if "boost_tag"    in intent:
                boosts["_tag_" + intent["boost_tag"]] = intent["boost"]

    return tokens, pricing_filter, category_hint, boosts


def _weighted_search_tokens(raw_query):
    query = (raw_query or "").lower()
    return [
        token
        for token in re.split(r"[\W_]+", query)
        if token and token not in WEIGHTED_SEARCH_STOPWORDS
    ]


def _tool_slug_value(tool):
    slug = str(tool.get("slug") or "").strip().lower()
    if slug:
        return slug
    name = str(tool.get("name") or "").strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def _normalized_list_field(value):
    if isinstance(value, list):
        return [str(item).strip().lower() for item in value if str(item).strip()]
    text = str(value or "").strip().lower()
    return [text] if text else []

def score_token_against_tool(token, tool_index):
    """Score a single token against a pre-built tool index entry."""
    score = 0.0
    name = tool_index["_name_lower"]

    if name == token:
        score += 100
    elif name.startswith(token):
        score += 65
    elif token in name:
        score += 45

    if token in tool_index["_category_lower"]:
        score += 35

    for tag in tool_index["_tags_lower"]:
        if token == tag:
            score += 30
        elif token in tag:
            score += 18
        elif tag in token:
            score += 12

    for uc in tool_index["_uses_lower"]:
        if token in uc:
            score += 16

    for s in tool_index["_strengths_lower"]:
        if token in s:
            score += 16

    if token in tool_index["_desc_lower"]:
        score += 10

    if token in tool_index["_longdesc_lower"]:
        score += 5

    if token in tool_index["_company_lower"]:
        score += 22

    tool_name_lower = tool_index["_name_lower"]
    for tool_key, contexts in TOOL_CONTEXT_BOOSTS.items():
        if tool_key in tool_name_lower and token in contexts:
            score += 30

    return score


def weighted_search(query: str, tools: list) -> list:
    STOPWORDS = {
        'a','an','the','for','and','or','to','in','of',
        'is','with','that','it','me','my','i','can','how',
        'do','make','create','build','use','using','get',
        'need','want','help','some','any','best','good',
        'new','free','tool','tools','ai'
    }

    tokens = [
        t.lower().strip('.,!?')
        for t in re.split(r'[\s\-_/]+', query)
        if t.lower().strip('.,!?') not in STOPWORDS
        and len(t) > 1
    ]

    if not tokens:
        return tools

    scored = []
    for tool in tools:
        score = 0
        name = (tool.get('name') or '').lower()
        category = (tool.get('category') or '').lower()
        description = (tool.get('description') or '').lower()
        tags = [t.lower() for t in (tool.get('tags') or [])]
        use_cases = [u.lower() for u in (tool.get('use_cases') or [])]

        for token in tokens:
            if token in category:
                score += 100

            for tag in tags:
                if token in tag:
                    score += 50

            for uc in use_cases:
                if token in uc:
                    score += 20

            if token in name:
                score += 30

            if token in description:
                score += 1

        full_query = query.lower().strip()
        if full_query in name:
            score += 80
        if any(full_query in tag for tag in tags):
            score += 60

        if score > 0:
            scored.append({**tool, 'relevance_score': score})

    scored.sort(key=lambda x: x['relevance_score'], reverse=True)
    return scored

def search_tools(raw_query, category_filter="All", pricing_filter_ui="All",
                 student_only=False, trending_only=False, sort_by="Relevance", limit=50):

    from app.tool_cache import SEARCH_INDEX, get_cached_tools

    # Lazy-prime in case search is the first endpoint hit (e.g. under TESTING where
    # startup-time cache priming is skipped) — get_cached_tools rebuilds SEARCH_INDEX.
    if not SEARCH_INDEX:
        get_cached_tools()
        from app.tool_cache import SEARCH_INDEX  # rebind to populated list

    print(f"[SEARCH] query='{raw_query}' index_size={len(SEARCH_INDEX)}", file=sys.stderr)

    tokens, pricing_intent, category_hint, boosts = parse_intent(raw_query)

    # Resolve effective pricing — UI filter wins over intent
    effective_pricing = None
    if pricing_filter_ui not in ("All", "", None):
        effective_pricing = [pricing_filter_ui.lower()]
    elif pricing_intent:
        effective_pricing = pricing_intent

    # Resolve explicit category (UI-selected only) and hint category (intent only)
    selected_category = None
    if category_filter not in ("All", "", None):
        selected_category = category_filter

    # ── SEMANTIC FAST PATH ──────────────────────────────────
    # Try TF-IDF semantic ranking before keyword scoring. Only fires for
    # relevance-sorted queries where the user actually typed something — other
    # sort modes (Rating/Reviews/Trending) bypass relevance entirely, and a
    # bare filter query has no text to vectorize.
    if (
        sort_by == "Relevance"
        and raw_query
        and tokens
    ):
        try:
            from app.ml_recommender import semantic_search
            semantic_pool = semantic_search(raw_query, limit=max(limit * 3, 60))
        except Exception:
            semantic_pool = []

        if semantic_pool and semantic_pool[0].get("_score", 0) >= SEMANTIC_CONFIDENCE_THRESHOLD:
            # The pickled model's tool dicts predate the slug field; rekey by name
            # against the live SEARCH_INDEX so frontend links resolve correctly.
            name_to_entry = {entry["_name_lower"]: entry for entry in SEARCH_INDEX}
            seen_slugs = set()
            semantic_results = []
            # Build the full filtered candidate set before re-ranking — the rerank
            # step uses LIVE catalog categories (not the model snapshot's), so the
            # mapping has to happen first. Slice to `limit` only after re-rank.
            for hit in semantic_pool:
                name_key = (hit.get("name") or "").strip().lower()
                entry = name_to_entry.get(name_key)
                if entry is None:
                    continue
                tool = entry["_raw"]
                if tool.get("hidden"):
                    continue
                tool_pricing = tool.get("pricing", "freemium").lower()
                if effective_pricing and tool_pricing not in effective_pricing:
                    continue
                if selected_category and tool.get("category") != selected_category:
                    continue
                if student_only and not (tool.get("student_perk") or tool.get("studentPerk")):
                    continue
                if trending_only and not tool.get("trending"):
                    continue
                slug_key = tool.get("slug")
                if slug_key and slug_key in seen_slugs:
                    continue
                if slug_key:
                    seen_slugs.add(slug_key)
                semantic_results.append({**tool, "_score": hit["_score"]})

            if semantic_results:
                from app.ml_recommender import detect_intent, rerank_by_category, fuzzy_search_tools
                intent_rule = detect_intent(raw_query)
                if intent_rule:
                    semantic_results = rerank_by_category(semantic_results, intent_rule)

                # Weak-semantic override: when TF-IDF was only marginally above
                # the floor (e.g. typo queries that partially overlap one word
                # with an unrelated tool), check whether fuzzy matches the user's
                # intended tool name more confidently and prefer it if so.
                top_semantic_score = semantic_pool[0].get("_score", 0)
                if top_semantic_score < SEMANTIC_STRONG_THRESHOLD and not (
                    effective_pricing or selected_category or student_only or trending_only
                ):
                    fuzzy_results = fuzzy_search_tools(raw_query, threshold=FUZZY_OVERRIDE_THRESHOLD, limit=limit)
                    if fuzzy_results:
                        if intent_rule:
                            fuzzy_results = rerank_by_category(fuzzy_results, intent_rule)
                        return {
                            "results": fuzzy_results,
                            "fallback": False,
                            "fuzzy_matched": True,
                            "suggested_query": fuzzy_results[0].get("name"),
                            "original_query": raw_query,
                            "total": len(fuzzy_results),
                        }

                semantic_results = semantic_results[:limit]
                return {
                    "results": semantic_results,
                    "fallback": False,
                    "fuzzy_matched": False,
                    "total": len(semantic_results),
                }

    results = []

    for entry in SEARCH_INDEX:
        tool = entry["_raw"]

        if tool.get("hidden"):
            continue

        # ── HARD FILTERS ────────────────────────────────────
        tool_pricing = tool.get("pricing", "freemium").lower()
        if effective_pricing and tool_pricing not in effective_pricing:
            continue
        if selected_category and tool.get("category") != selected_category:
            continue
        if student_only and not (tool.get("student_perk") or tool.get("studentPerk")):
            continue
        if trending_only and not tool.get("trending"):
            continue

        # ── SCORING ─────────────────────────────────────────
        if not tokens:
            score = (float(tool.get("rating", 3.0)) * 8
                     + (15 if tool.get("trending") else 0)
                     + (10 if tool.get("featured")  else 0))
        else:
            score = sum(score_token_against_tool(t, entry) for t in tokens)

            # Only apply bonuses and quality multipliers if there's actual relevance
            if score > 0:
                # Phrase bonus
                phrase = " ".join(tokens)
                if phrase in entry["_name_lower"]:
                    score += 40
                if phrase in entry["_desc_lower"]:
                    score += 25
                if phrase in " ".join(entry["_tags_lower"]):
                    score += 20

                # Category hint soft boost
                if category_hint and tool.get("category") == category_hint:
                    score += 20

                # Extra boost when explicit category filter matches
                if selected_category and tool.get("category") == selected_category:
                    score += 30

                # Apply boosts from intent
                for boost_key, bonus in boosts.items():
                    if boost_key == "student_perk":
                        if tool.get("student_perk") or tool.get("studentPerk"):
                            score += bonus
                    elif boost_key.startswith("_tag_"):
                        tag = boost_key[5:]
                        if tag in entry["_tags_lower"]:
                            score += bonus

                # Quality multiplier — better tools rank higher when scores are close
                score += float(tool.get("rating", 0)) * 3
                if tool.get("trending"):
                    score += 6
                if tool.get("featured"):
                    score += 4

        if score > 0:
            results.append({**tool, "_score": score})

    # ── FALLBACK ────────────────────────────────────────────
    if not results and tokens:
        # Typo-tolerance tier: try fuzzy matching on tool names + slugs before
        # falling back to trending. Catches "stich" -> Stitch, "anti0gravity" ->
        # Antigravity, etc. Skipped when explicit filters narrow the set, since
        # fuzzy_search_tools doesn't apply category/pricing/student filters.
        if not (effective_pricing or selected_category or student_only or trending_only):
            from app.ml_recommender import fuzzy_search_tools, detect_intent, rerank_by_category
            fuzzy_results = fuzzy_search_tools(raw_query, threshold=75, limit=limit)
            if fuzzy_results:
                intent_rule = detect_intent(raw_query)
                if intent_rule:
                    fuzzy_results = rerank_by_category(fuzzy_results, intent_rule)
                return {
                    "results": fuzzy_results,
                    "fallback": False,
                    "fuzzy_matched": True,
                    "suggested_query": fuzzy_results[0].get("name"),
                    "original_query": raw_query,
                    "total": len(fuzzy_results),
                }

        # Final fallback — top 6 by rating so the page isn't empty.
        fallback = sorted(SEARCH_INDEX,
                          key=lambda x: x["_raw"].get("rating", 0),
                          reverse=True)[:6]
        return {
            "results": [f["_raw"] for f in fallback],
            "fallback": True,
            "fuzzy_matched": False,
            "original_query": raw_query,
            "total": 0,
        }

    # ── SORT ────────────────────────────────────────────────
    if sort_by == "Rating":
        results.sort(key=lambda x: float(x.get("rating", 0)), reverse=True)
    elif sort_by == "Reviews":
        results.sort(key=lambda x: int(x.get("review_count", 0)), reverse=True)
    elif sort_by == "Trending":
        results.sort(key=lambda x: (bool(x.get("trending", False)), float(x.get("rating", 0))), reverse=True)
    else:  # Relevance (default)
        results.sort(key=lambda x: x["_score"], reverse=True)

    return {
        "results": results[:limit],
        "fallback": False,
        "fuzzy_matched": False,
        "total": len(results),
    }
