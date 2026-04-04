from collections import Counter
from app.recommendations import (
    _norm,
    _safe_text,
    _tokenize,
    _tool_tags,
    _collect_user_profile,
    _recommendation_score,
    _parse_weekly_users
)

def recommend_tools(all_tools, favorite_tools, limit=8, student_mode=False, user=None):
    if not all_tools:
        return []

    if not favorite_tools:
        scored = []
        for tool in all_tools:
            score = compute_tool_score(tool, user=user, student_mode=student_mode)
            scored.append((score, float(tool.get("rating") or 0), tool))
        scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
        from app.recommendations import _with_reason
        return [_with_reason(tool, user=user, student_mode=student_mode) for _, _, tool in scored[:limit]]

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

        score = compute_tool_score(tool, user=user, student_mode=student_mode)
        category = tool.get("category")
        if category in category_weights:
            score += category_weights[category] * 30

        tool_tags = [tag.lower() for tag in tool.get("tags", []) if isinstance(tag, str)]
        score += sum(tag_weights[tag] * 10 for tag in tool_tags)

        ranked.append((score, tool))

    ranked.sort(key=lambda item: item[0], reverse=True)
    base_ranked = [tool for _, tool in ranked[:limit]]
    from app.recommendations import _with_reason
    return [_with_reason(tool, user=user, student_mode=student_mode) for tool in base_ranked]

def compute_tool_score(tool, user=None, query=None, student_mode=False):
    profile = _collect_user_profile(user)
    interests = profile["interests"]
    goals = profile["goals"]

    score = _recommendation_score(tool, student_mode=student_mode)
    tool_category = _norm(tool.get("category"))
    tool_pricing = _norm(tool.get("pricing") or tool.get("price"))
    tags = _tool_tags(tool)
    description = _norm(tool.get("description") or tool.get("tagline"))
    name = _norm(tool.get("name"))

    if profile["skill_level"] == "beginner" and ({"easy", "beginner", "simple"} & tags):
        score += 22

    if tool_category and tool_category == profile["preferred_category"]:
        score += 28

    if interests:
        score += len(interests & tags) * 18
        score += sum(7 for item in interests if item and item in description)

    if goals:
        score += len(goals & tags) * 15
        score += sum(8 for item in goals if item and item in description)

    if profile["preferred_pricing"] and profile["preferred_pricing"] == tool_pricing:
        score += 20

    if student_mode and tool.get("studentPerk"):
        score += 18

    if tool.get("trending") or tool.get("trending_this_week"):
        score += 6

    query_tokens = _tokenize(query)
    if query_tokens:
        name_blob = _norm(name)
        tags_blob = " ".join(sorted(tags))
        category_blob = tool_category
        for token in query_tokens:
            if token in name_blob:
                score += 22
            if token in tags_blob:
                score += 14
            if token in category_blob:
                score += 10
            if token in description:
                score += 8

    tool_key = _norm(tool.get("tool_key") or tool.get("id") or tool.get("name"))
    interaction_counts = profile.get("interaction_counts") or {}
    interaction = interaction_counts.get(tool_key) or {}
    if interaction:
        # Slightly reward tools a user already interacted with.
        score += min(14, (float(interaction.get("view") or 0) * 1.5) + (float(interaction.get("save") or 0) * 4.0))

    return float(score)

def generate_reason(tool, user=None, query=None, student_mode=False):
    profile = _collect_user_profile(user)
    tags = _tool_tags(tool)
    category = _norm(tool.get("category"))
    pricing = _norm(tool.get("pricing") or tool.get("price"))
    description = _norm(tool.get("description") or tool.get("tagline"))
    rating = float(tool.get("rating") or 0)

    parts = []

    query_tokens = _tokenize(query)
    if query_tokens:
        matched = [token for token in query_tokens if token in category or token in description or token in tags]
        if matched:
            parts.append(f"matches your search for {'/'.join(matched[:2])}")

    if profile["interests"]:
        interest_match = sorted(profile["interests"] & tags)
        if interest_match:
            parts.append(f"aligned with your interest in {interest_match[0]}")

    if profile["goals"]:
        goal_match = sorted(profile["goals"] & tags)
        if goal_match:
            parts.append(f"supports your goal of {goal_match[0]}")

    if profile["preferred_pricing"] and pricing and profile["preferred_pricing"] == pricing:
        parts.append(f"fits your {pricing} pricing preference")

    if profile["skill_level"] == "beginner" and ({"easy", "beginner", "simple"} & tags):
        parts.append("beginner friendly")

    if student_mode and tool.get("studentPerk"):
        parts.append("offers student perks")

    if not parts:
        if rating >= 4.4:
            parts.append("highly rated by users")
        elif tool.get("trending") or tool.get("trending_this_week"):
            parts.append("trending right now")
        else:
            parts.append("a strong all-around fit")

    return _safe_text(f"Recommended because it is {parts[0]}.")

def _popularity_score(tool):
    rating = float(tool.get("rating") or 0)
    weekly_users = _parse_weekly_users(tool.get("weeklyUsers"))
    return (weekly_users * 0.3) + (rating * 0.2)
