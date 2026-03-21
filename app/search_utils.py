from collections import defaultdict
import re


SYNONYMS = {
    "editing": ["editor", "writing", "content", "image editing", "video editing"],
    "code": ["coding", "programming", "developer"],
    "coding": ["code", "programming", "developer"],
    "study": ["learning", "education"],
}


def _to_text(value):
    return str(value or "").strip().lower()


def _to_tags_text(tool):
    tags = tool.get("tags", [])
    if isinstance(tags, list):
        return " ".join(_to_text(tag) for tag in tags)
    return _to_text(tags)


def _safe_rating(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _tokenize(value):
    return [token for token in re.findall(r"[a-z0-9]+", _to_text(value)) if token]


def expand_search_query(query):
    query_text = _to_text(query)
    if not query_text:
        return []

    expanded = [query_text]
    if query_text in SYNONYMS:
        expanded.extend(SYNONYMS[query_text])

    # Expand each token so multi-word intents can still map to synonyms.
    for token in _tokenize(query_text):
        if token in SYNONYMS:
            expanded.extend(SYNONYMS[token])

    # Preserve order while removing duplicates.
    seen = set()
    ordered = []
    for term in expanded:
        key = _to_text(term)
        if not key or key in seen:
            continue
        seen.add(key)
        ordered.append(key)
    return ordered


def search_tools(tools, query):
    if not query:
        return list(tools)

    query_text = _to_text(query)
    expanded_terms = expand_search_query(query_text)
    query_tokens = _tokenize(query_text)

    # Keep direct term and token hits from double-counting too aggressively.
    scored = []

    for tool in tools:
        score = 0

        name = _to_text(tool.get("name"))
        description = _to_text(tool.get("description"))
        category = _to_text(tool.get("category"))
        tags = _to_tags_text(tool)

        for term in expanded_terms:
            if term in name:
                score += 100
            if term in tags:
                score += 120
            if term in category:
                score += 60
            if term in description:
                score += 30

        # Bonus for exact phrase in high-value fields.
        if query_text and query_text in name:
            score += 80
        if query_text and query_text in tags:
            score += 90

        # Token-level intent support for multi-word queries.
        for token in query_tokens:
            if token in name:
                score += 25
            if token in tags:
                score += 35
            if token in category:
                score += 15
            if token in description:
                score += 8

        if tool.get("is_verified") or tool.get("verified"):
            score += 20

        if _safe_rating(tool.get("rating")) >= 4.5:
            score += 10

        if score > 0:
            scored.append((score, tool))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [tool for score, tool in scored]


def smart_search_fallback(tools, query, results_limit=5):
    query_text = _to_text(query)
    if not query_text:
        return list(tools)[:results_limit]

    category_matches = [
        tool
        for tool in tools
        if query_text in _to_text(tool.get("category"))
    ]
    if category_matches:
        return category_matches[:results_limit]

    trending = sorted(
        list(tools),
        key=lambda tool: (
            bool(tool.get("trending") or tool.get("trending_this_week")),
            _safe_rating(tool.get("rating")),
            int(tool.get("popularity") or 0),
        ),
        reverse=True,
    )
    return trending[:results_limit]


def limit_results(items, limit=5):
    if limit is None:
        return list(items)
    return list(items)[: max(0, int(limit))]
