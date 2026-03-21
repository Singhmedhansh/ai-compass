import re
from typing import Iterable, List


QUERY_SYNONYMS = {
    "editing": ["writing", "video editing", "design", "editor"],
    "coding": ["developer", "programming", "code", "developer tools"],
    "study": ["notes", "flashcards", "learning", "study tools"],
}


def _normalize(text: str) -> str:
    value = str(text or "").strip().lower()
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
        expanded.extend(QUERY_SYNONYMS.get(token, []))
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


def search_tools(tools, query: str):
    tokens = _expanded_query_tokens(query)
    if not tokens:
        return []

    scored = []
    for tool in tools:
        score = _search_score(tool, tokens)
        if score > 0:
            scored.append((score, float(tool.get("rating") or 0), tool))

    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [tool for _, _, tool in scored]


def smart_search_fallback(tools, query: str, results_limit: int = 20):
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

    ranked = search_tools(candidates, query)
    if ranked:
        return ranked[:results_limit]
    return candidates[:results_limit]


def limit_results(items, limit: int = 20):
    try:
        limit_value = max(1, int(limit))
    except (TypeError, ValueError):
        limit_value = 20
    return list(items or [])[:limit_value]
