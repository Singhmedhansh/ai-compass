def test_login_page_renders(client):
    # /login is a React SPA route (frontend/src/App.jsx) — the server just
    # serves index.html and React Router renders LoginPage client-side.
    resp = client.get("/login")
    assert resp.status_code == 200

def test_register_page_renders(client):
    resp = client.get("/register")
    assert resp.status_code == 200

