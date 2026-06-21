from app import create_app, db
from app.models import AppSetting

app = create_app()
with app.app_context():
    row = db.session.query(AppSetting).filter_by(key='linkedin_debug_last').first()
    print("VALUE:", row.value if row else "None")
