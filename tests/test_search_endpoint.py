"""Tests for /api/v1/search with the TF-IDF semantic upgrade.

The endpoint wraps results as {"results": [...], "fallback": bool, "total": int}
so tests read data["results"], not data directly.
"""


def test_search_exact_name_match(client):
    response = client.get('/api/v1/search?q=ChatGPT')
    assert response.status_code == 200
    payload = response.get_json()
    results = payload.get('results', [])
    # ChatGPT should appear in top 3 regardless of whether semantic or keyword path won.
    assert any('chatgpt' in (t.get('slug', '').lower()) for t in results[:3])


def test_search_semantic_intent(client):
    response = client.get('/api/v1/search?q=tool+for+making+slides+quickly')
    assert response.status_code == 200
    payload = response.get_json()
    results = payload.get('results', [])
    assert len(results) > 0


def test_search_nonsense_query_doesnt_crash(client):
    response = client.get('/api/v1/search?q=xxxqqqzzzfffggghhh')
    assert response.status_code == 200
    payload = response.get_json()
    assert 'results' in payload
    assert isinstance(payload['results'], list)


def test_search_empty_query(client):
    response = client.get('/api/v1/search?q=')
    assert response.status_code in (200, 400)
