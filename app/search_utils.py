import sys

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

def search_tools(raw_query, category_filter="All", pricing_filter_ui="All",
                 student_only=False, trending_only=False, sort_by="Relevance", limit=50):

    from app.tool_cache import SEARCH_INDEX

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
        # Return top 6 by rating as fallback
        fallback = sorted(SEARCH_INDEX,
                          key=lambda x: x["_raw"].get("rating", 0),
                          reverse=True)[:6]
        return {"results": [f["_raw"] for f in fallback], "fallback": True, "total": 0}

    # ── SORT ────────────────────────────────────────────────
    if sort_by == "Rating":
        results.sort(key=lambda x: float(x.get("rating", 0)), reverse=True)
    elif sort_by == "Reviews":
        results.sort(key=lambda x: int(x.get("review_count", 0)), reverse=True)
    elif sort_by == "Trending":
        results.sort(key=lambda x: (bool(x.get("trending", False)), float(x.get("rating", 0))), reverse=True)
    else:  # Relevance (default)
        results.sort(key=lambda x: x["_score"], reverse=True)

    return {"results": results[:limit], "fallback": False, "total": len(results)}
