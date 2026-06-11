from app import create_app, db
from app.models import User, UserSession
import flask
from flask import session
from flask_login import current_user
import uuid

app = create_app({
    "TESTING": True,
    "SECRET_KEY": "test-secret-key",
    "SQLALCHEMY_DATABASE_URI": "sqlite:///test.db",
    "SQLALCHEMY_TRACK_MODIFICATIONS": False,
    "WTF_CSRF_ENABLED": False,
})

with app.app_context():
    db.drop_all()
    db.create_all()

client = app.test_client()

# Test 1: User 1
print("=== START TEST 1 ===")
with app.app_context():
    u1 = User(email="u1@example.com", display_name="User 1", is_verified=True)
    db.session.add(u1)
    db.session.commit()
    u1_id = u1.id

client._cookies.clear()
with client.session_transaction() as sess:
    sess["_user_id"] = str(u1_id)
    sess["_fresh"] = True

# First request
resp = client.get("/api/v1/profile/security/info")
print("TEST 1 - Resp 1 Status:", resp.status_code)

# Revoke session in DB
with app.app_context():
    s = UserSession.query.filter_by(user_id=u1_id).first()
    print("TEST 1 - Session UUID to revoke:", s.session_uuid)
    db.session.delete(s)
    db.session.commit()

# Second request (revoked)
resp = client.get("/api/v1/profile/security/info")
print("TEST 1 - Resp 2 Status:", resp.status_code)
print("TEST 1 - Resp 2 Data:", resp.get_data(as_text=True))

# Test 2: User 2
print("=== START TEST 2 ===")
with app.app_context():
    u2 = User(email="u2@example.com", display_name="User 2", is_verified=True)
    db.session.add(u2)
    db.session.commit()
    u2_id = u2.id

client._cookies.clear()
with client.session_transaction() as sess:
    sess["_user_id"] = str(u2_id)
    sess["_fresh"] = True

# Request as User 2
resp = client.post("/api/v1/profile/security/unlink/google")
print("TEST 2 - Resp Status:", resp.status_code)
print("TEST 2 - Resp Data:", resp.get_data(as_text=True))

