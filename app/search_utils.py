import re
from typing import Iterable, List
from app.recommendations import compute_tool_score, generate_reason


QUERY_SYNONYMS = {
    "editing": ["writing", "grammar", "proofreading"],
    "coding": ["development", "programming"],
    "design": ["ui", "ux", "graphics"],
    "developer": ["coding", "development", "programming"],
    "study": ["notes", "flashcards", "learning", "study tools"],
    "research": ["analysis", "papers", "citations", "insights"],
    "image": ["image generation", "art", "design", "visual"],
    "video": ["video generation", "editing", "creator", "shorts"],
}


def _safe_text(value) -> str:
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
    return text.encode("utf-8", "ignore").decode("utf-8", "ignore")


def _normalize(text: str) -> str:
    value = _safe_text(text).strip().lower()
    value = re.sub(r"\s+", " ", value)
    return value


def _compact(text: str) -> str:
    return _normalize(text).replace(" ", "")


def _tags(tool) -> List[str]:
    value = tool.get("tags") or []
    if isinstance(value, list):
        return [str(item).strip().lower() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [token.strip().lower() for token in value.split(",") if token.strip()]
    return []


def _expanded_query_tokens(query: str) -> List[str]:
    base = [token for token in re.findall(r"[a-z0-9]+", _normalize(query)) if token]
    expanded = list(base)
    for token in base:
        for synonym in QUERY_SYNONYMS.get(token, []):
            expanded.extend(re.findall(r"[a-z0-9]+", _normalize(synonym)))
    # stable unique order
    seen = set()
    ordered = []
    for token in expanded:
        key = _normalize(token)
        if not key or key in seen:
            continue
        seen.add(key)
        ordered.append(key)
    return ordered


def _search_score(tool, tokens: Iterable[str]) -> int:
    name = _normalize(tool.get("name"))
    description = _normalize(tool.get("description") or tool.get("tagline"))
    category = _normalize(tool.get("category"))
    tags = " ".join(_tags(tool))

    name_c = _compact(name)
    description_c = _compact(description)
    category_c = _compact(category)
    tags_c = _compact(tags)

    score = 0
    for token in tokens:
        token_n = _normalize(token)
        token_c = _compact(token_n)
        if not token_n:
            continue

        if token_n in name or token_c in name_c:
            score += 80
            if name.startswith(token_n):
                score += 15
        if token_n in tags or token_c in tags_c:
            score += 60
        if token_n in category or token_c in category_c:
            score += 45
        if token_n in description or token_c in description_c:
            score += 20

    return score


def search_tools(tools, query: str, user=None, student_mode: bool = False):
    tokens = _expanded_query_tokens(query)
    if not tokens:
        return []

    scored = []
    for tool in tools:
        text_score = _search_score(tool, tokens)
        if text_score <= 0:
            continue

        personal_score = compute_tool_score(
            tool,
            user=user,
            query=query,
            student_mode=student_mode,
        )
        final_score = text_score + personal_score

        item = dict(tool)
        item["ai_score"] = round(final_score, 2)
        item["reason"] = generate_reason(item, user=user, query=query, student_mode=student_mode)
        scored.append((final_score, float(tool.get("rating") or 0), item))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [tool for _, _, tool in scored]


def smart_search_fallback(tools, query: str, results_limit: int = 20, user=None, student_mode: bool = False):
    # Fallback to best-rated and most popular tools when strict matches are unavailable.
    candidates = sorted(
        tools,
        key=lambda item: (
            float(item.get("rating") or 0),
            str(item.get("weeklyUsers") or ""),
            bool(item.get("trending") or item.get("trending_this_week")),
        ),
        reverse=True,
    )

    ranked = search_tools(candidates, query, user=user, student_mode=student_mode)
    if ranked:
        return ranked[:results_limit]

    scored = []
    for tool in candidates:
        personal_score = compute_tool_score(tool, user=user, student_mode=student_mode)
        item = dict(tool)
        item["ai_score"] = round(personal_score, 2)
        item["reason"] = generate_reason(item, user=user, student_mode=student_mode)
        scored.append((personal_score, float(tool.get("rating") or 0), item))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [tool for _, _, tool in scored[:results_limit]]


def limit_results(items, limit: int = 20):
    try:
        limit_value = max(1, int(limit))
    except (TypeError, ValueError):
        limit_value = 20
    return list(items or [])[:limit_value]
