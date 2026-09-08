"""A FREE submission must claim its founder too.

founder_user_id used to be written only on the payment-verified path in
submit_tool(). Since that column is the only input to `is_founder`, which
gates the Growth Hub entry in the navbar, a founder who submitted a free
listing — even while logged in — had no way into the dashboard that
/founder/tools already serves free tiers.

What each test protects:

  * A free submission links to the account matching submitter_email, so the
    Growth Hub entry appears. This is the whole bug.
  * Linking never CREATES an account. The paid path may mint one because a
    payer is owed a login; a free listing quietly creating a User with a
    password nobody was told about is not a signup.
  * The typed email wins over the session. Submitting on someone else's
    behalf hands the dashboard to that founder, not to whoever was signed in.
  * An already-linked submission is never re-pointed at someone else.
"""
import os
import tempfile

import pytest

from app import create_app, db
from app.models import Submission, User
from app.founder_accounts import link_existing_founder_account


@pytest.fixture()
def app():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    application = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "WTF_CSRF_ENABLED": False,
    })
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_user(email):
    user = User(email=email)
    db.session.add(user)
    db.session.commit()
    return user


def _make_free_submission(email):
    sub = Submission(
        name="Free Tool",
        website="https://freetool.example.com",
        category="Productivity",
        description="A free listing.",
        pricing_model="free",
        submitter_email=email,
        status="pending",
        payment_status="none",
    )
    db.session.add(sub)
    db.session.commit()
    return sub


def _login(client, user_id):
    with client.session_transaction() as sess:
        sess["_user_id"] = str(user_id)
        sess["_fresh"] = True


def test_free_submission_links_to_matching_account(app, client):
    with app.app_context():
        user = _make_user("free@founder.example.com")
        user_id = user.id
    _login(client, user_id)

    res = client.post("/api/v1/submit-tool", json={
        "name": "Free Tool",
        "url": "https://freetool.example.com",
        "category": "Productivity",
        "reason": "Because it is genuinely useful to builders.",
        "submitter_email": "free@founder.example.com",
    })
    assert res.status_code in (200, 201), res.data

    with app.app_context():
        sub = Submission.query.filter_by(website="https://freetool.example.com").first()
        assert sub is not None
        assert sub.founder_user_id == user_id

    # The flag the navbar reads.
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.get_json()["is_founder"] is True


def test_link_never_creates_an_account(app):
    with app.app_context():
        sub = _make_free_submission("nobody@nowhere.example.com")
        before = User.query.count()

        assert link_existing_founder_account(sub.id, email="nobody@nowhere.example.com") is None

        assert User.query.count() == before
        assert Submission.query.get(sub.id).founder_user_id is None


def test_typed_email_wins_over_the_session(app):
    with app.app_context():
        signed_in = _make_user("agency@example.com")
        real_founder = _make_user("founder@theirtool.example.com")
        sub = _make_free_submission("founder@theirtool.example.com")

        link_existing_founder_account(sub.id, email=sub.submitter_email, user=signed_in)

        assert Submission.query.get(sub.id).founder_user_id == real_founder.id


def test_already_linked_submission_is_not_repointed(app):
    with app.app_context():
        owner = _make_user("owner@example.com")
        other = _make_user("other@example.com")
        sub = _make_free_submission("other@example.com")
        sub.founder_user_id = owner.id
        db.session.commit()

        assert link_existing_founder_account(sub.id, email="other@example.com") is None
        assert Submission.query.get(sub.id).founder_user_id == owner.id
        assert other.id != owner.id
