import json
import re


def _norm(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _safe_text(value):
    text = str(value or "")
    text = text.encode("utf-8", "ignore").decode("utf-8", "ignore")
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2026": "...",
        "\ufffd": "",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    if any(token in text for token in ("Ã", "â", "ðŸ")):
        try:
            repaired = text.encode("latin-1", "ignore").decode("utf-8", "ignore")
            if repaired:
                text = repaired
        except Exception:
            pass
    return text.encode("utf-8", "ignore").decode("utf-8", "ignore").strip()


def _tokenize(value):
    return [token for token in re.findall(r"[a-z0-9]+", _norm(value)) if token]


def _tool_tags(tool):
    value = tool.get("tags") or []
    if isinstance(value, list):
        return {_norm(item) for item in value if _norm(item)}
    if isinstance(value, str):
        return {_norm(item) for item in value.split(",") if _norm(item)}
    return set()


def _parse_csv_list(value):
    if isinstance(value, list):
        return [_norm(item) for item in value if _norm(item)]
    if isinstance(value, str):
        return [_norm(item) for item in value.split(",") if _norm(item)]
    return []


def _parse_user_preferences(user):
    raw = str(getattr(user, "preferences", "") or "").strip() if user else ""
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _collect_user_profile(user):
    pref_obj = _parse_user_preferences(user)
    interests = set(_parse_csv_list(pref_obj.get("interest_tags") or pref_obj.get("interests")))
    interests.update(_parse_csv_list(getattr(user, "interests", "") if user else ""))

    goals = set(_goal_tokens(pref_obj))
    goals.update(_parse_csv_list(getattr(user, "goals", "") if user else ""))

    skill_level = _norm(pref_obj.get("skill_level") or (getattr(user, "skill_level", "") if user else ""))
    preferred_pricing = _norm(pref_obj.get("preferred_pricing") or (getattr(user, "pricing_pref", "") if user else ""))
    preferred_category = _norm(pref_obj.get("most_viewed_category"))
    raw_interactions = pref_obj.get("interaction_counts") or {}
    interaction_counts = {}
    if isinstance(raw_interactions, dict):
        for key, payload in raw_interactions.items():
            tool_key = _norm(key)
            if not tool_key or not isinstance(payload, dict):
                continue
            interaction_counts[tool_key] = {
                "view": int(payload.get("view") or 0),
                "save": int(payload.get("save") or 0),
            }

    return {
        "pref_obj": pref_obj,
        "interests": {value for value in interests if value},
        "goals": {value for value in goals if value},
        "skill_level": skill_level,
        "preferred_pricing": preferred_pricing,
        "preferred_category": preferred_category,
        "interaction_counts": interaction_counts,
    }


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


def _goal_tokens(pref_obj):
    goals = pref_obj.get("goals") or []
    if isinstance(goals, str):
        goals = goals.split(",")
    return {_norm(item) for item in goals if _norm(item)}


def _rank_with_user_preferences(tools, user=None, student_mode=False):
    from app.services.recommendation_service import compute_tool_score
    scored = []
    for tool in tools:
        score = compute_tool_score(tool, user=user, student_mode=student_mode)
        scored.append((score, float(tool.get("rating") or 0), tool))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [tool for _, _, tool in scored]


def _with_reason(tool, user=None, query=None, student_mode=False):
    from app.services.recommendation_service import compute_tool_score, generate_reason
    item = dict(tool)
    item["ai_score"] = compute_tool_score(item, user=user, query=query, student_mode=student_mode)
    item["reason"] = generate_reason(item, user=user, query=query, student_mode=student_mode)
    return item


def _recommendation_score(tool, student_mode=False):
    from app.services.recommendation_service import _popularity_score
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
    from app.services.recommendation_service import generate_reason
    name = _safe_text(tool.get("name") or "This tool")
    reason = generate_reason(tool, user=user)
    return _safe_text(f"{name}: {reason}")
