import pytest
from app import db
from app.models import User

def test_resend_verification_unverified(client):
    # Setup test user
    email = "resend_unverified@example.com"
    user = User(email=email, password_hash="dummyhash1234567890", display_name="Test Resend", is_verified=False)
    db.session.add(user)
    db.session.commit()

    resp = client.post("/api/auth/resend-verification", json={"email": email})
    assert resp.status_code == 200
    assert resp.get_json() == {"message": "Verification link has been resent."}

def test_resend_verification_already_verified(client):
    # Setup verified test user
    email = "resend_verified@example.com"
    user = User(email=email, password_hash="dummyhash1234567890", display_name="Test Resend Verified", is_verified=True)
    db.session.add(user)
    db.session.commit()

    resp = client.post("/api/auth/resend-verification", json={"email": email})
    assert resp.status_code == 200
    assert resp.get_json() == {"message": "Account is already verified."}

def test_resend_verification_nonexistent(client):
    client.post("/api/v1/auth/logout")
    resp = client.post("/api/auth/resend-verification", json={"email": "nonexistent_verification@example.com"})
    assert resp.status_code == 404
    assert resp.get_json() == {"error": "User not found."}

def test_resend_verification_missing_email(client):
    client.post("/api/v1/auth/logout")
    resp = client.post("/api/auth/resend-verification", json={})
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Email is required."}
