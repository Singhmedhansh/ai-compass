from app import create_app, db
from app.models import CatalogTool
import json
import os

# Define the new logo URLs for the 4 tools
REMAINING_LOGOS = {
    "github-copilot": "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/copilot-color.svg",
    "github-student-developer-pack": "https://github.com/githubeducation.png",
    "marker": "https://raw.githubusercontent.com/datalab-to/marker/master/data/images/datalab-logo.png",
    "tideflow": "https://raw.githubusercontent.com/tideflow-io/tideflow/master/public/images/logo.png"
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
    if slug in REMAINING_LOGOS:
        old_icon = t.get("icon")
        t["icon"] = REMAINING_LOGOS[slug]
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
    for slug, new_url in REMAINING_LOGOS.items():
        db_tool = CatalogTool.query.filter_by(slug=slug).first()
        if db_tool:
            tool_data = json.loads(db_tool.data)
            old_icon = tool_data.get("icon")
            
            # Update the custom icon in the JSON data field
            tool_data["icon"] = new_url
            db_tool.data = json.dumps(tool_data)
            
            # Also update the icon column in the DB model directly if it exists
            if hasattr(db_tool, 'icon'):
                db_tool.icon = new_url
                
            print(f"  [DB] Updated logo for {slug}: {old_icon} -> {new_url}")
            updated_db_count += 1
        else:
            print(f"  [DB] Warning: Tool with slug '{slug}' not found in DB")
    db.session.commit()
    print(f"Successfully saved {updated_db_count} updates to the database.")
