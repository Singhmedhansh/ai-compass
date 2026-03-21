from collections import Counter
import json
import re


def _norm(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _tool_tags(tool):
    value = tool.get("tags") or []
    if isinstance(value, list):
        return {_norm(item) for item in value if _norm(item)}
    if isinstance(value, str):
        return {_norm(item) for item in value.split(",") if _norm(item)}
    return set()


def _parse_user_preferences(user):
    raw = str(getattr(user, "preferences", "") or "").strip() if user else ""
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _interest_categories(pref_obj):
    categories = set()
    primary = _norm(pref_obj.get("most_viewed_category"))
    if primary:
        categories.add(primary)
    for tag in pref_obj.get("interest_tags") or pref_obj.get("interests") or []:
        token = _norm(tag)
        if token:
            categories.add(token)
    return categories


def recommend_tools(all_tools, favorite_tools, limit=8, student_mode=False, user=None):
    if not all_tools:
        return []

    if not favorite_tools:
        base_ranked = sorted(all_tools, key=lambda tool: _recommendation_score(tool, student_mode=student_mode), reverse=True)
        return _rank_with_user_preferences(base_ranked, user=user, student_mode=student_mode)[:limit]

    favorite_ids = {
        str(tool.get("tool_key") or tool.get("id") or "")
        for tool in favorite_tools
    }
    category_weights = Counter(tool.get("category") for tool in favorite_tools if tool.get("category"))
    tag_weights = Counter(
        tag.lower()
        for tool in favorite_tools
        for tag in tool.get("tags", [])
        if isinstance(tag, str)
    )

    ranked = []
    for tool in all_tools:
        tool_id = str(tool.get("tool_key") or tool.get("id") or "")
        if tool_id in favorite_ids:
            continue

        score = _recommendation_score(tool, student_mode=student_mode)
        category = tool.get("category")
        if category in category_weights:
            score += category_weights[category] * 30

        tool_tags = [tag.lower() for tag in tool.get("tags", []) if isinstance(tag, str)]
        score += sum(tag_weights[tag] * 10 for tag in tool_tags)

        ranked.append((score, tool))

    ranked.sort(key=lambda item: item[0], reverse=True)
    base_ranked = [tool for _, tool in ranked]
    return _rank_with_user_preferences(base_ranked, user=user, student_mode=student_mode)[:limit]


def _rank_with_user_preferences(tools, user=None, student_mode=False):
    pref_obj = _parse_user_preferences(user)
    if not pref_obj:
        return list(tools)

    skill_level = _norm(pref_obj.get("skill_level"))
    preferred_pricing = _norm(pref_obj.get("preferred_pricing"))
    interest_categories = _interest_categories(pref_obj)
    interest_tags = {_norm(item) for item in pref_obj.get("interest_tags") or pref_obj.get("interests") or [] if _norm(item)}

    scored = []
    for tool in tools:
        score = _recommendation_score(tool, student_mode=student_mode)
        tool_category = _norm(tool.get("category"))
        tool_pricing = _norm(tool.get("price"))
        tags = _tool_tags(tool)

        if skill_level == "beginner" and ({"easy", "beginner"} & tags):
            score += 20

        if tool_category and tool_category in interest_categories:
            score += 50

        if interest_tags:
            score += len(interest_tags & tags) * 18

        if preferred_pricing and preferred_pricing == tool_pricing:
            score += 22

        scored.append((score, float(tool.get("rating") or 0), tool))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [tool for _, _, tool in scored]


def _popularity_score(tool):
    rating = float(tool.get("rating") or 0)
    weekly_users = _parse_weekly_users(tool.get("weeklyUsers"))
    return (weekly_users * 0.3) + (rating * 0.2)


def _recommendation_score(tool, student_mode=False):
    score = _popularity_score(tool)
    if not student_mode:
        return score

    model = str(tool.get("price") or "").strip().lower()
    if tool.get("studentPerk"):
        score += 0.5
    if model == "free":
        score += 0.3
    elif model == "freemium":
        score += 0.2

    score += float(tool.get("rating") or 0) * 0.2
    return score


def _parse_weekly_users(value):
    if value is None:
        return 0

    text = str(value).strip().upper().replace("+", "")
    if not text:
        return 0

    multiplier = 1
    if text.endswith("M"):
        multiplier = 1_000_000
        text = text[:-1]
    elif text.endswith("K"):
        multiplier = 1_000
        text = text[:-1]

    text = text.replace(",", "")
    try:
        return int(float(text) * multiplier)
    except ValueError:
        return 0


def enrich_tool_with_freshness(tool):
    return dict(tool)


def get_smart_recommendation_text(tool, user=None):
    name = str(tool.get("name") or "This tool")
    category = str(tool.get("category") or "AI")
    rating = float(tool.get("rating") or 0)
    tags = _tool_tags(tool)

    pref_obj = _parse_user_preferences(user)
    interests = [_norm(item) for item in pref_obj.get("interest_tags") or pref_obj.get("interests") or [] if _norm(item)]
    anchor = interests[0] if interests else _norm(pref_obj.get("most_viewed_category")) or category.lower()

    beginner_hint = " and beginner-friendly" if ({"easy", "beginner"} & tags) else ""
    rating_hint = "highly rated" if rating >= 4.4 else "popular"
    return f"Since you're exploring {anchor} tools, {name} is a great fit because it's {rating_hint}{beginner_hint}."
