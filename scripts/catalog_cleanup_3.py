"""Final perfection pass: remove misfits/dupes/defunct, fix placeholder
metadata, fix miscategorizations, normalize pricing casing.
Run from repo root.
"""
from __future__ import annotations

import json
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "data" / "tools.json"
data = json.loads(TOOLS.read_text(encoding="utf-8"))
byid = {t["id"]: t for t in data}
print(f"Loaded {len(data)} tools")

# --- 1. REMOVE clear misfits / dupes / defunct -----------------------------
REMOVE = {
    539, 534, 179, 199, 304, 305, 408, 89, 106, 107,   # not AI
    496, 486, 262, 266, 271,                             # enterprise-ops
    335,                                                 # Sci-Hub (legal risk)
    43, 531,                                             # defunct/superseded
    432, 509, 402,                                       # true duplicates
    313,                                                 # YouTube channel, not a tool
}
removed = [(i, byid[i]["name"]) for i in REMOVE if i in byid]
data = [t for t in data if t["id"] not in REMOVE]
print(f"Removed {len(removed)} -> {len(data)}")
for i, n in sorted(removed):
    print(f"  - id{i} {n}")

# --- 2. FIX placeholder metadata (maker / subCategory / tagline) -----------
META = {
    520: ("Google", "AI Design to Code", "Design and code UI from text prompts"),
    521: ("Google", "AI Development", "Prototype with Gemini and Google AI models"),
    522: ("Uizard", "AI UI Design", "AI design tool for non-designers"),
    523: ("Visily", "AI Wireframing", "AI wireframe and mockup tool"),
    524: ("Magic Patterns", "AI UI Generation", "Generate React UI patterns from text"),
    525: ("Subframe", "AI Design to Code", "AI design and code editor in one"),
    526: ("Anima", "Design to Code", "Convert Figma designs to React/Vue/HTML code"),
    527: ("Builder.io", "Visual Development", "Visual development with AI (Visual Copilot)"),
    528: ("Polymet", "AI UI Design", "AI UI design from text or reference images"),
    529: ("Amazon", "AI Coding Assistant", "AWS-integrated AI coding assistant"),
    530: ("Roo Code", "AI Coding Agent", "Autonomous AI coding agent for VS Code"),
    532: ("Tempo", "AI Design to Code", "AI design tool that writes real React code"),
    535: ("Google", "AI Coding Assistant", "Google Gemini models in your terminal"),
    536: ("OpenAI", "AI Coding Agent", "AI coding agent for your codebase"),
    538: ("Rocket", "AI App Builder", "Build full apps from a prompt"),
    540: ("Amazon", "AI Coding Assistant", "Agentic AI IDE for spec-driven development"),
    541: ("Emergent", "AI App Builder", "Turn product ideas into web apps with AI"),
    543: ("Hostinger", "AI Website Builder", "AI website and app builder for quick projects"),
    544: ("Anthropic", "AI Coding Agent", "Anthropic's agentic coding tool for the terminal"),
}
fixed_meta = 0
for tid, (maker, sub, tagline) in META.items():
    t = next((x for x in data if x["id"] == tid), None)
    if not t:
        continue
    t["maker"] = maker
    t["company"] = maker
    t["subCategory"] = sub
    if not t.get("tagline") or t.get("tagline") == "None":
        t["tagline"] = tagline
    fixed_meta += 1
print(f"Fixed placeholder metadata on {fixed_meta} records")

# --- 3. FIX miscategorizations ---------------------------------------------
RECAT = {
    22: "Courses & Tutorials",   # Socratic by Google
    191: "Courses & Tutorials",  # Formative
    192: "Courses & Tutorials",  # Numerade
    71: "Courses & Tutorials",   # Panopto
    18: "Courses & Tutorials",   # Quizlet
    73: "Coding",                # Orange Data Mining (ML)
    265: "Coding",               # Lightly AI (computer vision)
    37: "Design & Graphics",     # Gamma (deck generator)
    446: "Research",             # Mathpix (equation OCR)
    472: "Productivity",         # Mapify (mind-mapping)
    359: "Productivity",         # Popai.pro (doc/chat AI)
}
recat = 0
for tid, cat in RECAT.items():
    t = next((x for x in data if x["id"] == tid), None)
    if t and t.get("category") != cat:
        print(f"  recat id{tid} '{t['name']}': {t.get('category')} -> {cat}")
        t["category"] = cat
        recat += 1
print(f"Recategorized {recat} tools")

# --- 4. Normalize pricing casing globally ----------------------------------
PRICE_MAP = {
    "free": "Free", "freemium": "Freemium", "paid": "Paid",
    "free + paid": "Freemium", "free+paid": "Freemium",
    "enterprise": "Enterprise", "contact": "Enterprise",
    "open source": "Open Source", "open-source": "Open Source",
    "subscription": "Paid", "one-time": "Paid", "trial": "Freemium",
}
norm = 0
for t in data:
    for fld in ("price", "pricing", "pricing_tier", "pricingDetail"):
        v = t.get(fld)
        if isinstance(v, str):
            key = v.strip().lower()
            if key in PRICE_MAP and v != PRICE_MAP[key]:
                t[fld] = PRICE_MAP[key]
                norm += 1
print(f"Normalized {norm} pricing field values")

TOOLS.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"WROTE {len(data)} tools")

# Sanity
ids = [t["id"] for t in data]
slugs = [t["slug"] for t in data]
none_makers = sum(1 for t in data if t.get("maker") in (None, "None", ""))
print(f"unique ids: {len(set(ids)) == len(ids)} | unique slugs: {len(set(slugs)) == len(slugs)}")
print(f"records still maker=None: {none_makers}")
cat = Counter(t.get("category") for t in data)
print("Category distribution:")
for c, n in sorted(cat.items(), key=lambda x: -x[1]):
    print(f"  {c}: {n}")
