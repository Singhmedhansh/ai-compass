import os
import pickle
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

_model = None

def load_model():
    global _model
    if _model is not None:
        return _model
    path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        'data', 'recommendation_model.pkl'
    )
    if not os.path.exists(path):
        return None
    with open(path, 'rb') as f:
        _model = pickle.load(f)
    return _model

GOAL_MAP = {
    'studying': 'study homework exam research academic learn',
    'coding': 'code programming developer software engineering debug',
    'writing': 'write essay content blog creative grammar',
    'research': 'research papers analysis academic citations scholar',
    'creating': 'image video design creative art generation visual',
    'productivity': 'productivity organize automate workflow focus task'
}

LEVEL_MAP = {
    'beginner': 'beginner easy simple intuitive no-code',
    'intermediate': 'intermediate moderate some experience',
    'advanced': 'advanced professional developer api technical'
}

def get_recommendations(goal=None, budget=None, platform=None, level=None, limit=6):
    model = load_model()
    if not model:
        return _fallback(limit)

    tools = model['tools']
    vectorizer = model['vectorizer']
    tfidf_matrix = model['tfidf_matrix']

    query_parts = []
    if goal:
        query_parts.append(GOAL_MAP.get(goal, goal))
    if level:
        query_parts.append(LEVEL_MAP.get(level, level))
    if platform and platform != 'any':
        query_parts.append(platform)
    if budget and budget != 'any':
        query_parts.append(budget)

    query = ' '.join(query_parts) or 'popular ai tool'
    query_vec = vectorizer.transform([query])
    scores = cosine_similarity(query_vec, tfidf_matrix)[0]

    final_scores = []
    for i, tool in enumerate(tools):
        score = float(scores[i])

        pricing = tool.get('pricing_tier', tool.get('pricing', '')).lower()
        if budget == 'free' and pricing == 'free':
            score += 0.25
        elif budget == 'freemium' and pricing in ['free', 'freemium']:
            score += 0.15

        if tool.get('student_friendly'):
            score += 0.1

        try:
            score += (float(tool.get('rating', 0)) / 5.0) * 0.15
        except:
            pass

        try:
            score += float(tool.get('popularity_score', 0.5)) * 0.1
        except:
            pass

        final_scores.append((i, score))

    final_scores.sort(key=lambda x: x[1], reverse=True)

    results = []
    seen_names = set()
    for i, score in final_scores:
        tool = tools[i]
        name = tool.get('name', '')
        if name in seen_names:
            continue
        seen_names.add(name)
        t = tool.copy()
        t['match_score'] = round(score, 3)
        t['reason'] = _reason(tool, goal, budget, level)
        results.append(t)
        if len(results) >= limit:
            break

    return results

def get_similar_tools(slug, limit=4):
    model = load_model()
    if not model:
        return []

    tool_index = model['tool_index']
    similarity_matrix = model['similarity_matrix']
    tools = model['tools']

    if slug not in tool_index:
        name_slug = slug.lower().replace('-', ' ')
        for key in tool_index:
            if key.lower().replace('-', ' ') == name_slug:
                slug = key
                break

    if slug not in tool_index:
        return []

    idx = tool_index[slug]
    sim_scores = list(enumerate(similarity_matrix[idx]))
    sim_scores.sort(key=lambda x: x[1], reverse=True)

    return [tools[i] for i, _ in sim_scores[1:limit+1]]

def _reason(tool, goal, budget, level):
    parts = []
    pricing = tool.get('pricing_tier', tool.get('pricing', '')).lower()
    if budget == 'free' and pricing == 'free':
        parts.append("completely free")
    if tool.get('student_friendly'):
        parts.append("student friendly")
    try:
        rating = float(tool.get('rating', 0))
        if rating >= 4.5:
            parts.append(f"highly rated {rating:.1f} stars")
    except:
        pass
    if goal:
        parts.append(f"matches your {goal} goal")
    if not parts:
        parts.append("matches your preferences")
    return "This tool is " + ", ".join(parts)

def _fallback(limit=6):
    try:
        from app.tool_cache import get_cached_tools
        tools = get_cached_tools() or []
        return sorted(tools, key=lambda t: float(t.get('rating', 0)), reverse=True)[:limit]
    except:
        return []