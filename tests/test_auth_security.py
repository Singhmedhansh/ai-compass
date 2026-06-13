from app import db, bcrypt
from app.models import User, UserSession, LinkedAccount

def test_session_lifecycle_and_enforcement(app):
    """Verify that UserSession is created automatically and enforces logouts when deleted."""
    client = app.test_client()
    client._cookies.clear()
    with app.app_context():
        # 1. Create a test user
        user = User(
            email="sess_test@example.com",
            display_name="Session User",
            password_hash=bcrypt.generate_password_hash("password123").decode("utf-8"),
            is_verified=True
        )
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    # 2. Log in using flask-login session
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True

    # 3. Call security info (should trigger before_request and generate user_uuid)
    resp = client.get("/api/v1/profile/security/info")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["has_password"] is True
    assert len(data["sessions"]) == 1
    
    current_session = data["sessions"][0]
    assert current_session["is_current"] is True
    session_uuid = current_session["session_uuid"]

    # Verify database record exists
    with app.app_context():
        db_sess = UserSession.query.filter_by(session_uuid=session_uuid).first()
        assert db_sess is not None
        assert db_sess.user_id == user_id

        # 4. Revoke/delete the session in the database manually to simulate session revocation
        db.session.delete(db_sess)
        db.session.commit()

    # 5. Call endpoint again, should return 401 because session is revoked
    resp = client.get("/api/v1/profile/security/info")
    assert resp.status_code == 401
    assert resp.get_json()["error"] == "Session revoked"


def test_unlink_provider_lockout_safety(app):
    """Verify that a user cannot unlink their only login method (prevent lockout)."""
    client = app.test_client()
    client._cookies.clear()
    with app.app_context():
        # User with Google linked but no password
        user = User(
            email="google_only@example.com",
            display_name="Google Only User",
            oauth_provider="google",
            is_verified=True
        )
        db.session.add(user)
        db.session.commit()
        user_id = user.id

        la = LinkedAccount(user_id=user_id, provider="google")
        db.session.add(la)
        db.session.commit()

    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True

    # Try to unlink google -> should fail since no password is set and it is the only provider
    resp = client.post("/api/v1/profile/security/unlink/google")
    assert resp.status_code == 400
    assert "configure a password or link another provider" in resp.get_json()["error"]

    # Now add password via security/change-password (since they don't have one, current_password isn't checked)
    resp = client.post("/api/v1/profile/security/change-password", json={
        "new_password": "securepassword123"
    })
    assert resp.status_code == 200

    # Try unlinking google again -> should succeed now that they have a password
    resp = client.post("/api/v1/profile/security/unlink/google")
    assert resp.status_code == 200
    assert "Successfully unlinked Google" in resp.get_json()["message"]

    # Verify in DB
    with app.app_context():
        db_user = User.query.get(user_id)
        assert db_user.oauth_provider is None
        assert len(db_user.linked_accounts) == 0


def test_change_password_mechanics(app):
    """Verify that updating current password and checking validation rules works."""
    client = app.test_client()
    client._cookies.clear()
    with app.app_context():
        user = User(
            email="pwd_test@example.com",
            display_name="Password Test",
            password_hash=bcrypt.generate_password_hash("oldpassword123").decode("utf-8"),
            is_verified=True
        )
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True

    # 1. Invalid current password
    resp = client.post("/api/v1/profile/security/change-password", json={
        "current_password": "wrongpassword",
        "new_password": "newpassword123"
    })
    assert resp.status_code == 400
    assert "Incorrect current password" in resp.get_json()["error"]

    # 2. Too short password
    resp = client.post("/api/v1/profile/security/change-password", json={
        "current_password": "oldpassword123",
        "new_password": "short"
    })
    assert resp.status_code == 400
    assert "at least 8 characters" in resp.get_json()["error"]

    # 3. Successful change
    resp = client.post("/api/v1/profile/security/change-password", json={
        "current_password": "oldpassword123",
        "new_password": "newpassword123"
    })
    assert resp.status_code == 200
    assert "Password updated successfully" in resp.get_json()["message"]


def test_session_revocation_endpoint(app):
    """Verify that user sessions can be revoked via the API, and current session revokes log out the client."""
    client = app.test_client()
    client._cookies.clear()
    with app.app_context():
        user = User(
            email="revoke_test@example.com",
            display_name="Revoke User",
            password_hash=bcrypt.generate_password_hash("password123").decode("utf-8"),
            is_verified=True
        )
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True

    # Generate session record
    resp = client.get("/api/v1/profile/security/info")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["sessions"]) == 1
    session_uuid = data["sessions"][0]["session_uuid"]

    # Revoke current session
    resp = client.delete(f"/api/v1/profile/security/sessions/{session_uuid}")
    assert resp.status_code == 200
    assert resp.get_json()["logged_out"] is True

    # Call endpoint again -> should be logged out (401)
    resp = client.get("/api/v1/profile/security/info")
    assert resp.status_code == 401



