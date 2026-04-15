import json

with open("data/tools.json", "r", encoding="utf-8-sig") as f:
    tools = json.load(f)

seen = {}
dupes = []
for t in tools:
    slug = t.get("slug", "").strip().lower()
    if slug in seen:
        dupes.append(slug)
    else:
        seen[slug] = t

clean = list(seen.values())
print(f"Before: {len(tools)} tools")
print(f"After:  {len(clean)} tools")
print(f"Removed duplicates: {dupes}")

with open("data/tools.json", "w", encoding="utf-8") as f:
    json.dump(clean, f, indent=2, ensure_ascii=False)
