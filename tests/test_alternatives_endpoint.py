"""Tests for the /api/v1/tools/<slug>/alternatives endpoint."""


def test_alternatives_returns_main_tool_and_list(client):
    response = client.get('/api/v1/tools/chatgpt/alternatives')
    assert response.status_code == 200
    data = response.get_json()
    assert 'tool' in data
    assert 'alternatives' in data
    assert 'count' in data
    assert data['tool']['slug'] == 'chatgpt'
    assert isinstance(data['alternatives'], list)
    assert len(data['alternatives']) > 0
    alt_slugs = {a.get('slug') for a in data['alternatives']}
    assert 'chatgpt' not in alt_slugs


def test_alternatives_returns_404_for_unknown_slug(client):
    response = client.get('/api/v1/tools/this-tool-does-not-exist-xyz/alternatives')
    assert response.status_code == 404
    data = response.get_json()
    assert 'error' in data


def test_alternatives_response_shape(client):
    response = client.get('/api/v1/tools/claude/alternatives')
    assert response.status_code == 200
    data = response.get_json()
    if data['alternatives']:
        first_alt = data['alternatives'][0]
        assert 'slug' in first_alt
        assert 'name' in first_alt
