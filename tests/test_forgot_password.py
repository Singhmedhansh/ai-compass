from app import db
from app.models import User

def test_forgot_password_success(client):
    # Setup test user
    email = "test_forgot@example.com"
    user = User(email=email, password_hash="dummyhash1234567890")
    db.session.add(user)
    db.session.commit()

    resp = client.post("/api/auth/forgot-password", json={"email": email})
    assert resp.status_code == 200
    assert resp.get_json() == {"message": "If the account exists, a recovery email has been sent."}

def test_forgot_password_nonexistent(client):
    resp = client.post("/api/auth/forgot-password", json={"email": "nonexistent@example.com"})
    assert resp.status_code == 200
    assert resp.get_json() == {"message": "If the account exists, a recovery email has been sent."}

def test_forgot_password_empty_email(client):
    resp = client.post("/api/auth/forgot-password", json={"email": ""})
    assert resp.status_code == 400
    assert "error" in resp.get_json()
