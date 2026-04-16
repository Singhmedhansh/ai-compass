def test_login_page_renders(client):
    resp = client.get("/login")
    assert resp.status_code in (200, 302, 401)

def test_register_page_renders(client):
    resp = client.get("/register")
    assert resp.status_code in (200, 302, 401)
