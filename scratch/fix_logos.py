from app import create_app, db
from app.models import CatalogTool
import json
import os

# Define the new logo URLs
NEW_LOGOS = {
    "stable-diffusion-webui": "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/stability-color.svg",
    "comfyui": "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/comfyui.svg",
    "docling": "https://raw.githubusercontent.com/DS4SD/docling/main/docs/assets/logo.png",
    "marker": "https://github.com/datalab-to.png",
    "tideflow": "https://github.com/tideflow-io.png",
    "roo-code": "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/src/assets/icons/icon.png",
}

tools_path = os.path.join("data", "tools.json")

# 1. Update tools.json on disk
print("Updating data/tools.json...")
try:
    with open(tools_path, "r", encoding="utf-8") as f:
        tools = json.load(f)
except Exception as e:
    print(f"Error loading tools.json: {e}")
    tools = []

updated_json_count = 0
for t in tools:
    slug = t.get("slug")
    if slug in NEW_LOGOS:
        old_icon = t.get("icon")
        t["icon"] = NEW_LOGOS[slug]
        print(f"  [JSON] Updated logo for {slug}: {old_icon} -> {t['icon']}")
        updated_json_count += 1

if updated_json_count > 0:
    try:
        with open(tools_path, "w", encoding="utf-8") as f:
            json.dump(tools, f, indent=2, ensure_ascii=False)
        print(f"Successfully saved {updated_json_count} updates to data/tools.json")
    except Exception as e:
        print(f"Error saving tools.json: {e}")
else:
    print("No matching tools found in data/tools.json to update.")

# 2. Update database
print("\nUpdating database...")
app = create_app()
updated_db_count = 0
with app.app_context():
    for slug, new_url in NEW_LOGOS.items():
        db_tool = CatalogTool.query.filter_by(slug=slug).first()
        if db_tool:
            tool_data = json.loads(db_tool.data)
            old_icon = tool_data.get("icon")
            tool_data["icon"] = new_url
            db_tool.data = json.dumps(tool_data)
            print(f"  [DB] Updated logo for {slug}: {old_icon} -> {new_url}")
            updated_db_count += 1
        else:
            print(f"  [DB] Warning: Tool with slug '{slug}' not found in DB")
    db.session.commit()
    print(f"Successfully saved {updated_db_count} updates to the database.")
