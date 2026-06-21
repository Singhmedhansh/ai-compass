import json
import os

tools_path = os.path.join("data", "tools.json")
with open(tools_path, "r", encoding="utf-8") as f:
    tools = json.load(f)

for t in tools:
    icon = t.get("icon") or ""
    link = t.get("link") or ""
    if "github" in icon.lower() or "github" in link.lower():
        print(f"Slug: {t.get('slug')} | Name: {t.get('name')} | Link: {link} | Icon: {icon}")
