import json

path = r"C:\Users\singh\New folder (2)\ai-compass\data\tools.json"

# These are the 6 tools that should be featured
FEATURED_NAMES = [
    "ChatGPT",
    "Claude",
    "Cursor",
    "Midjourney",
    "Perplexity AI",
    "GitHub Copilot",
]

with open(path, "r", encoding="utf-8") as f:
    tools = json.load(f)

# Track which featured names we've already marked
marked = set()

for tool in tools:
    name = tool.get("name")
    # Mark as featured only if it's in the list AND we haven't marked it yet
    if name in FEATURED_NAMES and name not in marked:
        tool["featured"] = True
        marked.add(name)
    else:
        tool["featured"] = False

with open(path, "w", encoding="utf-8") as f:
    json.dump(tools, f, indent=2, ensure_ascii=False)

featured = [t["name"] for t in tools if t.get("featured")]
print(f"Featured ({len(featured)}):", featured)
assert len(featured) == 6, f"Expected 6, got {len(featured)}"
print("PASS")
