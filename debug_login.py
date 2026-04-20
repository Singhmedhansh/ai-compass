import sys
import os

from app import create_app, db
from app.models import User
from app.auth import _sync_admin_flag, _requires_onboarding

app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"})

with app.app_context():
    db.create_all()
    print("App created")
    try:
        user = User.query.filter_by(email="test@example.com").first()
        print("User query passed")
        if user:
            print("User properties:")
            print(user.id, user.email, user.is_admin)
            _sync_admin_flag(user)
            print("_sync_admin_flag passed")
            _requires_onboarding(user)
            print("_requires_onboarding passed")
        else:
            print("User not found, trying to create one")
            # Let's create a dummy user
            try:
                u = User(email="test@example.com", is_admin=False)
                db.session.add(u)
                db.session.commit()
                print("Created dummy user")
                
                # now let's query again
                user = User.query.filter_by(email="test@example.com").first()
                print("Dummy user fetched:", user.email)
                
                _sync_admin_flag(user)
                _requires_onboarding(user)
                print("All functions passed")
                db.session.delete(u)
                db.session.commit()
            except Exception as e:
                import traceback
                traceback.print_exc()

    except Exception as e:
        import traceback
        traceback.print_exc()

