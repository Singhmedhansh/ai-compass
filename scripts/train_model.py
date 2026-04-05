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
    parts = [
        tool.get('name', ''),
        tool.get('description', ''),
        tool.get('category', ''),
        ' '.join(tool.get('tags', [])),
        ' '.join(tool.get('use_cases', [])),
        tool.get('difficulty', ''),
        tool.get('pricing_tier', tool.get('pricing', '')),
    ]
    return ' '.join(str(p) for p in parts if p)

feature_texts = [build_feature_text(t) for t in tools]

vectorizer = TfidfVectorizer(
    max_features=500,
    stop_words='english',
    ngram_range=(1, 2)
)
tfidf_matrix = vectorizer.fit_transform(feature_texts)
similarity_matrix = cosine_similarity(tfidf_matrix)

model_data = {
    'tools': tools,
    'vectorizer': vectorizer,
    'tfidf_matrix': tfidf_matrix,
    'similarity_matrix': similarity_matrix,
    'tool_index': {
        t.get('slug', t.get('name', '').lower().replace(' ', '-')): i
        for i, t in enumerate(tools)
    }
}

out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'recommendation_model.pkl')
with open(out_path, 'wb') as f:
    pickle.dump(model_data, f)

print(f"Vocabulary size: {len(vectorizer.vocabulary_)}")
print(f"Saved to data/recommendation_model.pkl")
print("Done!")