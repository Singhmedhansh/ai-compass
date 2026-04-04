
import pytest
import pytest

@pytest.mark.parametrize("login_data,expected_status", [
    ({'email': 'test@example.com', 'password': 'testpass'}, (200, 302, 401)),
    ({'email': 'test@example.com', 'password': 'wrongpass'}, (200, 302, 401)),
])
def test_login_flow(client, login_data, expected_status):
    response = client.post('/login', data=login_data, follow_redirects=True)
    assert response.status_code in expected_status
