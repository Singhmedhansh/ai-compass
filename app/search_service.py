import re

def _tokenize_query(query):
    return [token for token in re.findall(r"[a-z0-9]+", str(query or "").lower()) if token]

def _search_score(tool, query_tokens):
    if not query_tokens:
        return 0

    name = str(tool.get("name") or "").lower()
    category = str(tool.get("category") or "").lower()
    description = str(tool.get("description") or "").lower()
    tags = " ".join(str(tag).lower() for tag in (tool.get("tags") or []))

    score = 0
    for token in query_tokens:
        if token in name:
            score += 70
            if name.startswith(token):
                score += 20
        if token in tags:
            score += 40
        if token in category:
            score += 25
        if token in description:
            score += 10

    if all(token in name for token in query_tokens):
        score += 30

    return score
