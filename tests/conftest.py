import os
import pytest
from app import create_app, db
from app.models import *  # ensure models are registered


@pytest.fixture(scope="session")
def app():
    db_path = "test.db"

    # remove old test DB if exists
    if os.path.exists(db_path):
        os.remove(db_path)

    app = create_app({
        "TESTING": True,
        "SECRET_KEY": "test-secret-key",  # ✅ FIX: required for Flask sessions
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{db_path}",
        "SQLALCHEMY_TRACK_MODIFICATIONS": False,
        "WTF_CSRF_ENABLED": False,  # ✅ FIX: disable CSRF for tests
    })

    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()

    # cleanup after tests
    if os.path.exists(db_path):
        os.remove(db_path)


@pytest.fixture
def client(app):
    return app.test_client()