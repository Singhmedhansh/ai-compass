import os
import pytest
from app import create_app, db
from app.models import User, Tool, Category

@pytest.fixture
def app():
    os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
    os.environ['FLASK_ENV'] = 'testing'
    os.environ['SECRET_KEY'] = 'test-secret-key-12345'
    os.environ['WTF_CSRF_ENABLED'] = 'False'
    
    app = create_app()
    app.config.update({
        "TESTING": True,
        "WTF_CSRF_ENABLED": False,
        "LOGIN_DISABLED": False,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"
    })
    
    with app.app_context():
        db.create_all()
        # Seed basic user
        user = User(email="test@example.com", is_admin=False)
        user.password_hash = "$2b$12$e0X7s.oM5/s9qLw0q.q.q.q.q.q.q.q.q.q.q.q.q.q.q.q.q"
        db.session.add(user)
        # Seed admin
        admin = User(email="admin@example.com", is_admin=True)
        admin.password_hash = "$2b$12$e0X7s.oM5/s9qLw0q.q.q.q.q.q.q.q.q.q.q.q.q.q.q.q.q"
        db.session.add(admin)
        
        # Seed catalog
        cat = Category(slug="test-category", name="Test Category")
        db.session.add(cat)
        db.session.flush()
        
        tool = Tool(slug="test-tool", name="Test Tool", category_id=cat.id, is_active=True, rating=4.5)
        db.session.add(tool)
        db.session.commit()
        
        yield app
        
        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def runner(app):
    return app.test_cli_runner()
