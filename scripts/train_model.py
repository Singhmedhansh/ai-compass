import json
import pickle
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'tools.json')

with open(data_path, 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

tools = data if isinstance(data, list) else data.get('tools', [])
print(f"Loaded {len(tools)} tools")


def build_feature_text(tool):
    """
    Build the text representation of a tool for TF-IDF vectorization.

    Weighting rationale:
    - tags repeated 3x  → tag keywords dominate similarity scores
    - use_cases repeated 2x → use-case keywords have moderate boosted weight
    - name, description, category, difficulty, pricing_tier appear once each
    """
    tags = tool.get('tags') or []
    use_cases = tool.get('use_cases') or []
    return ' '.join([
        tool.get('name', ''),
        tool.get('description', ''),
        tool.get('category', ''),
        ' '.join(tags) * 3,          # repeat tags for higher TF-IDF weight
        ' '.join(use_cases) * 2,     # repeat use_cases for moderate boost
        tool.get('difficulty', ''),
        str(tool.get('pricing_tier') or tool.get('pricing') or ''),
    ])


feature_texts = [build_feature_text(t) for t in tools]

vectorizer = TfidfVectorizer(
    max_features=1000,       # expanded from 500 to cover the full 500-tool corpus
    stop_words='english',
    ngram_range=(1, 2),
    sublinear_tf=True,       # apply log normalization to term frequency
)
tfidf_matrix = vectorizer.fit_transform(feature_texts)
similarity_matrix = cosine_similarity(tfidf_matrix)

model_data = {
    'tools': tools,
    'vectorizer': vectorizer,
    'tfidf_matrix': tfidf_matrix,
    'similarity_matrix': similarity_matrix,
    'tool_index': {
        str(t.get('slug') or t.get('name', '').lower().replace(' ', '-')): i
        for i, t in enumerate(tools)
    },
}

out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'recommendation_model.pkl')
with open(out_path, 'wb') as f:
    pickle.dump(model_data, f)

print(f"Vocabulary size: {len(vectorizer.vocabulary_)}")
print(f"Matrix shape: {tfidf_matrix.shape}")
print(f"Saved to data/recommendation_model.pkl")
print("Done!")