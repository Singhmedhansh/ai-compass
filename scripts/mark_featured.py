import json

path = r"C:\Users\singh\New folder (2)\ai-compass\data\tools.json"
with open(path, "r", encoding="utf-8") as f:
    tools = json.load(f)

# Mark top 6 highest-rated tools as featured
sorted_tools = sorted(tools, key=lambda t: float(t.get("rating", 0)), reverse=True)
featured_ids = {t["id"] for t in sorted_tools[:6]}

for tool in tools:
    tool["featured"] = tool["id"] in featured_ids

with open(path, "w", encoding="utf-8") as f:
    json.dump(tools, f, indent=2, ensure_ascii=False)

featured = [t["name"] for t in tools if t.get("featured")]
print(f"Featured tools ({len(featured)}):", featured)
