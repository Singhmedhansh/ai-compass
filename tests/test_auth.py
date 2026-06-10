from app.models import User
from app import db

def test_login_page_renders(client):
    resp = client.get("/login")
    assert resp.status_code in (200, 302, 401)

def test_register_page_renders(client):
    resp = client.get("/register")
    assert resp.status_code in (200, 302, 401)

def test_authenticated_login_preserves_query_string(client, app):
    with app.app_context():
        User.query.filter_by(email="authenticated_login_test@example.com").delete()
        db.session.commit()

        user = User(email="authenticated_login_test@example.com", display_name="Test User")
        db.session.add(user)
        db.session.commit()
        user_id = user.id

        with client.session_transaction() as sess:
            sess["_user_id"] = str(user_id)
            sess["_fresh"] = True

        resp = client.get("/login?verified=true")
        assert resp.status_code == 302
        assert resp.headers["location"].endswith("/dashboard?verified=true")

