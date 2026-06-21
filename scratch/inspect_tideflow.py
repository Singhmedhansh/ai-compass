from app import create_app, db
from app.models import CatalogTool
import json

app = create_app()
with app.app_context():
    t = CatalogTool.query.filter_by(name="Tideflow").first()
    if t:
        print("Tideflow details:")
        print(f"ID: {t.id}")
        print(f"Slug: {t.slug}")
        print(f"Hidden: {t.hidden}")
        print(f"Data: {t.data[:600]}")
    else:
        print("Tideflow not found")
