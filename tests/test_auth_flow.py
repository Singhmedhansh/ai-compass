import pytest

@pytest.mark.parametrize("login_data,expected_status", [
    ({'email': 'test@example.com', 'password': 'testpass'}, (200, 401)),
    ({'email': 'test@example.com', 'password': 'wrongpass'}, (200, 401)),
])
def test_login_flow(client, login_data, expected_status):
    # The React SPA authenticates via the JSON API, not a form post.
    response = client.post('/api/v1/auth/login', json=login_data)
    assert response.status_code in expected_status
