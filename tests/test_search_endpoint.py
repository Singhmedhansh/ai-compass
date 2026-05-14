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


def test_search_homework_query_excludes_design_tools(client):
    """Regression for P-SEARCH-2: academic intent should keep Image Generation
    out of top 5. Without category re-ranking TF-IDF leaks design/image tools
    whose blurbs mention students or homework-adjacent vocab."""
    response = client.get('/api/v1/search?q=need+help+with+homework')
    assert response.status_code == 200
    results = response.get_json().get('results', [])
    top_5 = results[:5]
    top_5_categories = [t.get('category', '') for t in top_5]
    assert 'Image Generation' not in top_5_categories, (
        f"Image Generation tool returned for homework query: "
        f"{[t.get('name') for t in top_5]}"
    )


def test_search_design_query_excludes_audio_tools(client):
    """Design intent should penalize Audio & Voice."""
    response = client.get('/api/v1/search?q=design+a+landing+page')
    assert response.status_code == 200
    results = response.get_json().get('results', [])
    top_5_categories = [t.get('category', '') for t in results[:5]]
    assert 'Audio & Voice' not in top_5_categories


def test_search_transcribe_lectures_returns_relevant_tools(client):
    """Transcribe-lecture query should surface transcription tools (Otter.ai et al)
    in top 5. Catalog categorizes them as Productivity rather than Audio & Voice,
    so this checks for a known transcription tool by slug rather than category."""
    response = client.get('/api/v1/search?q=transcribe+my+lectures')
    assert response.status_code == 200
    results = response.get_json().get('results', [])
    top_5_slugs = {t.get('slug', '').lower() for t in results[:5]}
    expected_any = {'otter-ai', 'fireflies-ai', 'tldv', 'fathom', 'fathom-video',
                    'granola', 'microsoft-teams', 'zoom', 'notability'}
    assert top_5_slugs & expected_any, (
        f"No transcription tool in top 5: "
        f"{[(t.get('name'), t.get('category')) for t in results[:5]]}"
    )


def test_search_no_intent_query_unchanged(client):
    """Queries without recognizable intent flow through unchanged from P-SEARCH-1."""
    response = client.get('/api/v1/search?q=ChatGPT')
    assert response.status_code == 200
    results = response.get_json().get('results', [])
    assert any('chatgpt' in (t.get('slug', '').lower()) for t in results[:3])
