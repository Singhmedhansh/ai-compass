"""The preferred name a new user chooses in the onboarding wizard.

The wizard's welcome step asks "what should we call you?" and PUTs the answer
to /api/v1/profile as `preferred_name`. It lands in User.display_name, which
is the single name _serialize_user() hands to every screen and that
community_leaderboard.display_name() / the transactional email templates read
— so setting it once really does change the name everywhere in the account.
"""
from app import bcrypt, db
from app.models import User


def _signed_in(app, **kwargs):
    client = app.test_client()
    client._cookies.clear()
    with app.app_context():
        user = User(
            email=kwargs.pop("email", "prefname@example.com"),
            password_hash=bcrypt.generate_password_hash("password123").decode("utf-8"),
            is_verified=True,
            **kwargs,
        )
        db.session.add(user)
        db.session.commit()
        user_id = user.id

    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True
    return client, user_id


def test_preferred_name_becomes_the_account_name(app):
    client, user_id = _signed_in(app, display_name="Given Byprovider")

    resp = client.put("/api/v1/profile", json={"preferred_name": "  Medhansh  "})

    assert resp.status_code == 200
    # Trimmed, and echoed straight back so the wizard can merge it into
    # localStorage without a second round-trip.
    assert resp.get_json()["name"] == "Medhansh"

    with app.app_context():
        assert db.session.get(User, user_id).display_name == "Medhansh"


def test_profile_editor_name_field_still_works(app):
    """The profile editor has always sent `name`; both keys hit one column."""
    client, user_id = _signed_in(app, email="legacy@example.com", display_name="Old")

    resp = client.put("/api/v1/profile", json={"name": "New Name"})

    assert resp.status_code == 200
    with app.app_context():
        assert db.session.get(User, user_id).display_name == "New Name"


def test_blank_preferred_name_is_rejected(app):
    client, user_id = _signed_in(app, email="blank@example.com", display_name="Keep Me")

    resp = client.put("/api/v1/profile", json={"preferred_name": "   "})

    assert resp.status_code == 400
    with app.app_context():
        assert db.session.get(User, user_id).display_name == "Keep Me"


def test_overlong_preferred_name_is_rejected_not_truncated(app):
    """display_name is String(255) and Postgres errors rather than truncates,
    so the cap has to be enforced before the commit."""
    client, user_id = _signed_in(app, email="long@example.com", display_name="Keep Me")

    resp = client.put("/api/v1/profile", json={"preferred_name": "x" * 61})

    assert resp.status_code == 400
    with app.app_context():
        assert db.session.get(User, user_id).display_name == "Keep Me"


def test_preferred_name_reaches_the_community_leaderboard(app):
    """One of the "everywhere" surfaces that does not go through
    _serialize_user — proof the name is not just a profile-page label."""
    from app.community_leaderboard import display_name

    client, user_id = _signed_in(app, email="board@example.com", display_name="Provider Name")
    assert client.put("/api/v1/profile", json={"preferred_name": "Medhansh"}).status_code == 200

    with app.app_context():
        assert display_name(db.session.get(User, user_id)) == "Medhansh"
