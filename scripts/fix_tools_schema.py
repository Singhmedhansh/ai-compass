import json, re

with open("data/tools.json", "r", encoding="utf-8") as f:
    tools = json.load(f)

CATEGORY_MAP = {
    "Writing & Docs":  "Writing & Chat",
    "Image Gen":       "Image Generation",
    "Video Gen":       "Video Generation",
    "Study Tools":     "Research",
    "Design":          "Image Generation",
    "Data Analysis":   "Research",
    # leave "Coding", "Research", "Productivity" unchanged
}

PRICING_MAP = {
    "free":      "free",
    "freemium":  "freemium",
    "paid":      "paid",
    "Free":      "free",
    "Freemium":  "freemium",
    "Paid":      "paid",
}

for tool in tools:

    # 1. Normalize category
    old_cat = tool.get("category", "")
    tool["category"] = CATEGORY_MAP.get(old_cat, old_cat)

    # 2. Add pricing field from pricing_tier or price string
    if "pricing" not in tool:
        raw = tool.get("pricing_tier", tool.get("price", "")).lower().strip()
        tool["pricing"] = PRICING_MAP.get(raw, "freemium")

    # 3. Add student_perk from studentPerk or student_friendly
    if "student_perk" not in tool:
        tool["student_perk"] = bool(
            tool.get("studentPerk") or tool.get("student_friendly")
        )

    # 4. Add company from maker if missing
    if not tool.get("company"):
        tool["company"] = tool.get("maker", "Unknown")

    # 5. Add review_count default if missing
    if "review_count" not in tool:
        tool["review_count"] = 0

    # 6. Add featured default if missing
    if "featured" not in tool:
        tool["featured"] = False

    # 7. Add logo_emoji default if missing
    if not tool.get("logo_emoji"):
        tool["logo_emoji"] = "🤖"

    # 8. Add strengths from features if missing
    if not tool.get("strengths"):
        tool["strengths"] = tool.get("features", [])[:4]

with open("data/tools.json", "w", encoding="utf-8") as f:
    json.dump(tools, f, indent=2, ensure_ascii=False)

print("Done. Verifying...")
categories = set(t["category"] for t in tools)
pricings   = set(t["pricing"]  for t in tools)
missing_pricing      = sum(1 for t in tools if not t.get("pricing"))
missing_student_perk = sum(1 for t in tools if "student_perk" not in t)
missing_company      = sum(1 for t in tools if not t.get("company"))
missing_strengths    = sum(1 for t in tools if not t.get("strengths"))

print("Categories:", categories)
print("Pricings:", pricings)
print("Missing pricing:", missing_pricing)
print("Missing student_perk:", missing_student_perk)
print("Missing company:", missing_company)
print("Missing strengths:", missing_strengths)
