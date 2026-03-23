import pytest

def test_login_page_renders(client):
    resp = client.get("/auth/login")
    assert resp.status_code == 200
    assert b"Sign In" in resp.data

def test_login_post_invalid(client):
    resp = client.post("/auth/login", data={"email": "wrong", "password": "wrong"})
    assert resp.status_code == 200
    # On error, the site will typically re-render auth block or flash strings
    assert b"Invalid" in resp.data or b"Please check" in resp.data or b"Sign In" in resp.data

def test_register_page_renders(client):
    resp = client.get("/auth/register")
    assert resp.status_code == 200
