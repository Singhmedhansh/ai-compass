from collections import Counter


def recommend_tools(all_tools, favorite_tools, limit=8, student_mode=False):
    if not all_tools:
        return []

    if not favorite_tools:
        return sorted(all_tools, key=lambda tool: _recommendation_score(tool, student_mode=student_mode), reverse=True)[:limit]

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
    return [tool for _, tool in ranked[:limit]]


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
