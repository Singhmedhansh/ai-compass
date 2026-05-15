"""One-shot catalog cleanup: ratings honesty, dedupe, recategorize,
field reconciliation, and add missing student tools.

Run from repo root:  python scripts/catalog_cleanup.py
Writes data/tools.json in place. A timestamped .bak was made beforehand.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "data" / "tools.json"

report: list[str] = []


def log(msg: str) -> None:
    report.append(msg)
    print(msg)


def registrable_domain(url: str) -> str:
    if not url:
        return ""
    try:
        netloc = urlparse(url if "://" in url else f"https://{url}").netloc.lower()
    except Exception:
        return ""
    netloc = netloc.split(":")[0]
    if netloc.startswith("www."):
        netloc = netloc[4:]
    parts = netloc.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return netloc


def norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def completeness(tool: dict) -> int:
    return sum(1 for v in tool.values() if v not in (None, "", [], {}))


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s or "tool"


data = json.loads(TOOLS.read_text(encoding="utf-8"))
log(f"Loaded {len(data)} tools")

# ---------------------------------------------------------------------------
# FIX 1 — Ratings honesty + internal curation_score
# ---------------------------------------------------------------------------
USER_BUCKET = {
    "100K+": 30, "200K+": 35, "300K+": 38, "500K+": 45, "800K+": 50,
    "1M+": 60, "2M+": 65, "5M+": 72, "10M+": 80, "50M+": 88, "100M+": 95,
}


def curation_score(t: dict) -> float:
    score = 40.0
    if t.get("featured") is True:
        score += 22
    if t.get("trending") is True:
        score += 14
    wu = str(t.get("weeklyUsers") or "")
    score += USER_BUCKET.get(wu, 0) * 0.25
    ly = t.get("launchYear")
    if isinstance(ly, int) and ly >= 2023:
        score += 6
    if t.get("studentPerk") is True or t.get("student_perk") is True or t.get("student_friendly") is True:
        score += 5
    if t.get("apiAvailable") is True:
        score += 2
    return round(min(score, 100.0), 1)


zeroed = 0
for t in data:
    if t.get("rating", 0) or t.get("review_count", 0):
        zeroed += 1
    t["curation_score"] = curation_score(t)
    t["rating"] = 0
    t["review_count"] = 0
log(f"FIX1 ratings: zeroed fabricated rating/review_count on {zeroed} tools; "
    f"added curation_score to all {len(data)}")

# ---------------------------------------------------------------------------
# FIX 2 — Dedupe
# ---------------------------------------------------------------------------
# Known variant-spam domains (collapse all entries to one canonical).
CLUSTER_DOMAINS = {
    "gamma.app", "runwayml.com", "poe.com", "julius.ai", "figma.com",
    "wandb.ai", "otter.ai", "beautiful.ai", "fireflies.ai", "bolt.new",
    "canva.com", "notion.so", "perplexity.ai", "replit.com", "framer.com",
    "loom.com",
}

by_norm_name: dict[str, list[int]] = defaultdict(list)
by_domain: dict[str, list[int]] = defaultdict(list)
for i, t in enumerate(data):
    by_norm_name[norm_name(t.get("name", ""))].append(i)
    dom = registrable_domain(t.get("link") or t.get("url") or "")
    if dom:
        by_domain[dom].append(i)

drop: set[int] = set()


def pick_canonical(indices: list[int]) -> int:
    # Prefer: has id, shortest name (most canonical), highest completeness.
    def key(i: int):
        t = data[i]
        return (
            0 if t.get("id") is not None else 1,
            len(t.get("name", "")),
            -completeness(t),
        )
    return sorted(indices, key=key)[0]


# Exact-name duplicates
for nm, idxs in by_norm_name.items():
    if nm and len(idxs) > 1:
        keep = pick_canonical(idxs)
        for i in idxs:
            if i != keep:
                drop.add(i)
        log(f"  dedupe name '{data[keep]['name']}': kept idx {keep}, "
            f"dropped {[i for i in idxs if i != keep]}")

# Domain variant-spam clusters
for dom, idxs in by_domain.items():
    live = [i for i in idxs if i not in drop]
    if dom in CLUSTER_DOMAINS and len(live) > 1:
        keep = pick_canonical(live)
        for i in live:
            if i != keep:
                drop.add(i)
        log(f"  dedupe domain {dom}: kept '{data[keep]['name']}' (idx {keep}), "
            f"dropped {len(live) - 1} variants")

data = [t for i, t in enumerate(data) if i not in drop]
log(f"FIX2 dedupe: removed {len(drop)} duplicate/variant entries -> {len(data)} tools")

# ---------------------------------------------------------------------------
# FIX 3 — Recategorize flagged tools + merge orphan category
# ---------------------------------------------------------------------------
NAME_CATEGORY = {
    "chatgpt": "Writing & Chat",
    "claude": "Writing & Chat",
    "pictory": "Video Generation",
    "uizard": "Design & Graphics",
    "visily": "Design & Graphics",
    "galileo ai": "Design & Graphics",
    "adobe lightroom ai": "Image Generation",
    "tactiq": "Audio & Voice",
}
recat = 0
for t in data:
    nm = (t.get("name") or "").strip().lower()
    if nm in NAME_CATEGORY and t.get("category") != NAME_CATEGORY[nm]:
        log(f"  recat '{t['name']}': {t.get('category')} -> {NAME_CATEGORY[nm]}")
        t["category"] = NAME_CATEGORY[nm]
        recat += 1
    # Merge orphan single-tool category.
    if t.get("category") == "Video & Audio":
        t["category"] = "Video Generation"
        recat += 1
log(f"FIX3 recategorize: updated {recat} category assignments")

# ---------------------------------------------------------------------------
# FIX 4 — Field reconciliation (canonical student_friendly + pricing)
# ---------------------------------------------------------------------------
fixed_student = 0
fixed_pricing = 0
for t in data:
    variants = [
        t.get("student_friendly"), t.get("studentPerk"),
        t.get("student_perk"), t.get("studentFriendly"),
    ]
    canonical = any(v is True for v in variants)
    if (t.get("student_friendly") != canonical
            or t.get("studentPerk") != canonical
            or t.get("student_perk") != canonical):
        fixed_student += 1
    t["student_friendly"] = canonical
    t["studentPerk"] = canonical
    t["student_perk"] = canonical
    t.pop("studentFriendly", None)

    # pricing canonical (frontend Card reads tool.pricing)
    pricing = (t.get("pricing") or t.get("price") or t.get("pricing_tier") or "Free")
    pricing = str(pricing).strip() or "Free"
    if t.get("pricing") != pricing:
        fixed_pricing += 1
    t["pricing"] = pricing
    if not t.get("price"):
        t["price"] = pricing
log(f"FIX4 fields: reconciled student flags on {fixed_student}, "
    f"pricing on {fixed_pricing}; removed stray studentFriendly")

# Backfill missing id / slug so the schema fork can't render blanks.
existing_ids = [t.get("id") for t in data if isinstance(t.get("id"), int)]
next_id = (max(existing_ids) if existing_ids else 0) + 1
backfilled = 0
seen_slugs: set[str] = set()
for t in data:
    if not isinstance(t.get("id"), int):
        t["id"] = next_id
        next_id += 1
        backfilled += 1
    slug = t.get("slug") or slugify(t.get("name", ""))
    base = slug
    n = 2
    while slug in seen_slugs:
        slug = f"{base}-{n}"
        n += 1
    seen_slugs.add(slug)
    t["slug"] = slug
    if not t.get("link") and t.get("url"):
        t["link"] = t["url"]
log(f"FIX4 schema: backfilled id on {backfilled} tools; ensured unique slug + link")

# ---------------------------------------------------------------------------
# FIX 5 — Add missing high-value student tools
# ---------------------------------------------------------------------------
def make_tool(name, maker, tagline, category, sub, pricing, best_for,
              tags, link, desc, features, student=True):
    global next_id
    t = {
        "id": next_id,
        "name": name,
        "icon": "/static/icons/default.png",
        "maker": maker,
        "tagline": tagline,
        "category": category,
        "subCategory": sub,
        "price": pricing,
        "pricingDetail": pricing,
        "bestFor": best_for,
        "tags": tags,
        "trending": False,
        "featured": False,
        "rating": 0,
        "review_count": 0,
        "weeklyUsers": "",
        "link": link,
        "apiAvailable": False,
        "openSource": False,
        "studentPerk": student,
        "student_perk": student,
        "student_friendly": student,
        "uniHack": "",
        "features": features,
        "platforms": ["Web"],
        "languages": "English",
        "launchYear": 2024,
        "description": desc,
        "use_cases": tags,
        "difficulty": "Beginner",
        "review_count_display": "",
        "company": maker,
        "logo_emoji": "",
        "pricing_tier": pricing,
        "popularity_score": 0,
        "pricing": pricing,
        "strengths": features,
        "slug": slugify(name),
        "curation_score": 55.0,
    }
    next_id += 1
    return t


NEW = [
    # Citation & Referencing
    make_tool("Scribbr", "Scribbr", "Free citation generator + plagiarism & AI checks",
              "Research", "Citation & Referencing", "Freemium",
              "APA/MLA/Harvard citations and proofreading for essays",
              ["citation", "referencing", "apa", "mla", "plagiarism", "student-friendly"],
              "https://www.scribbr.com/citation/generator/",
              "Scribbr offers a free citation generator supporting APA, MLA, Harvard and Chicago styles, plus paid proofreading, plagiarism and AI-detection services widely used by students for essays and theses.",
              ["Citation generator", "Reference manager", "Plagiarism checker", "AI detector"]),
    make_tool("Mendeley", "Elsevier", "Reference manager and academic PDF organizer",
              "Research", "Citation & Referencing", "Free",
              "Organizing research papers and auto-generating bibliographies",
              ["citation", "reference-manager", "pdf", "research", "student-friendly"],
              "https://www.mendeley.com/",
              "Mendeley is a free reference manager that stores, organizes and annotates research PDFs and inserts citations and bibliographies directly into Word and LibreOffice.",
              ["PDF library", "Cite in Word", "Annotation", "Sync across devices"]),
    make_tool("BibGuru", "Paperpile", "Fast, accurate citation generator for students",
              "Research", "Citation & Referencing", "Free",
              "Quick accurate citations in 9000+ styles",
              ["citation", "bibliography", "referencing", "free", "student-friendly"],
              "https://www.bibguru.com/",
              "BibGuru is a free, ad-light citation generator built for students, supporting thousands of citation styles with accurate, up-to-date formatting and citation project folders.",
              ["9000+ styles", "Citation projects", "No ads", "Browser extension"]),
    make_tool("EndNote", "Clarivate", "Professional reference and bibliography manager",
              "Research", "Citation & Referencing", "Paid",
              "Large literature reviews and dissertations",
              ["citation", "reference-manager", "research", "thesis"],
              "https://endnote.com/",
              "EndNote is a professional reference manager for organizing large libraries of references, finding full-text PDFs and formatting citations for dissertations and journal submissions.",
              ["Reference library", "Find full text", "Cite while you write", "Collaboration"],
              student=False),
    # Plagiarism & AI Detection
    make_tool("GPTZero", "GPTZero", "AI content detector for students and educators",
              "Research", "Plagiarism & AI Detection", "Freemium",
              "Self-checking essays for accidental AI-detection flags",
              ["ai-detection", "plagiarism", "writing", "student-friendly"],
              "https://gptzero.me/",
              "GPTZero detects AI-generated text and helps students self-check their work before submission so genuine writing is not falsely flagged by university detectors.",
              ["AI detection", "Sentence highlighting", "Plagiarism scan", "Writing report"]),
    make_tool("Copyleaks", "Copyleaks", "AI and plagiarism detection platform",
              "Research", "Plagiarism & AI Detection", "Freemium",
              "Plagiarism and AI checks before submitting assignments",
              ["plagiarism", "ai-detection", "academic-integrity", "student-friendly"],
              "https://copyleaks.com/",
              "Copyleaks provides plagiarism and AI-content detection across 100+ languages, used by students and institutions to verify originality before submission.",
              ["Plagiarism check", "AI detection", "100+ languages", "Source matching"]),
    make_tool("Originality.ai", "Originality.AI", "AI detection and plagiarism for serious writers",
              "Research", "Plagiarism & AI Detection", "Paid",
              "Verifying originality of long-form academic writing",
              ["ai-detection", "plagiarism", "writing"],
              "https://originality.ai/",
              "Originality.AI scans content for AI generation and plagiarism with detailed reporting, popular for verifying originality of long-form academic and research writing.",
              ["AI detection", "Plagiarism scan", "Team sharing", "Scan history"],
              student=False),
    # Exam & Study Prep
    make_tool("Knowt", "Knowt", "Free AI flashcards and notes from any material",
              "Productivity", "Exam & Study Prep", "Freemium",
              "Turning notes and PDFs into flashcards and practice tests",
              ["flashcards", "notes", "exam-prep", "spaced-repetition", "student-friendly"],
              "https://knowt.com/",
              "Knowt turns lecture notes, PDFs and videos into AI-generated flashcards, practice tests and study guides, a free alternative to paid flashcard apps for exam prep.",
              ["AI flashcards", "Practice tests", "Note import", "Spaced repetition"]),
    make_tool("Quizgecko", "Quizgecko", "AI quiz and test generator from any content",
              "Productivity", "Exam & Study Prep", "Freemium",
              "Generating practice quizzes from notes and textbooks",
              ["quiz", "exam-prep", "test-generator", "student-friendly"],
              "https://quizgecko.com/",
              "Quizgecko generates quizzes, tests and flashcards from any text, URL or document, helping students create realistic practice exams for revision.",
              ["Quiz generation", "Multiple question types", "Auto-grading", "Export"]),
    make_tool("StuDocu", "StuDocu", "Shared study notes and past exam papers",
              "Courses & Tutorials", "Exam & Study Prep", "Freemium",
              "Finding course-specific notes and past papers",
              ["study-notes", "past-papers", "exam-prep", "student-friendly"],
              "https://www.studocu.com/",
              "StuDocu is a study platform where students share lecture notes, summaries and past exam papers organized by university and course for targeted revision.",
              ["Course documents", "Past papers", "AI study assistant", "Summaries"]),
    make_tool("Studyfetch", "StudyFetch", "AI tutor that turns materials into a study set",
              "Courses & Tutorials", "Exam & Study Prep", "Freemium",
              "An all-in-one AI tutor from your own course materials",
              ["ai-tutor", "exam-prep", "flashcards", "student-friendly"],
              "https://www.studyfetch.com/",
              "StudyFetch turns lecture slides, notes and PDFs into flashcards, tests, and a personalized AI tutor (Spark.E) that answers questions about your own materials.",
              ["AI tutor", "Flashcards", "Practice tests", "Lecture upload"]),
    # Thesis / academic writing
    make_tool("Jenni AI", "Jenni AI", "AI writing assistant for essays and research papers",
              "Writing & Chat", "Academic Writing", "Freemium",
              "Drafting and citing academic essays and theses",
              ["academic-writing", "essays", "citation", "research", "student-friendly"],
              "https://jenni.ai/",
              "Jenni AI helps students draft, autocomplete and cite academic essays, literature reviews and theses with in-text citations and paraphrasing aimed at academic writing.",
              ["AI autocomplete", "In-text citations", "Paraphrasing", "PDF chat"]),
    make_tool("Paperpal", "Cactus Communications", "Academic writing and language assistant",
              "Writing & Chat", "Academic Writing", "Freemium",
              "Polishing academic English for papers and theses",
              ["academic-writing", "grammar", "research", "student-friendly"],
              "https://paperpal.com/",
              "Paperpal provides real-time academic language and grammar suggestions tuned for research writing, helping students improve manuscripts and theses for submission.",
              ["Academic grammar", "Rewrite", "Plagiarism check", "Journal-ready edits"]),
    make_tool("Trinka AI", "Trinka", "Grammar and language correction for academic writing",
              "Writing & Chat", "Academic Writing", "Freemium",
              "Technical and academic grammar correction",
              ["academic-writing", "grammar", "proofreading", "student-friendly"],
              "https://www.trinka.ai/",
              "Trinka AI is a grammar and style checker built for academic and technical writing, correcting subject-specific usage and improving clarity for papers and theses.",
              ["Academic grammar", "Technical phrasing", "Consistency check", "Word add-in"]),
    # STEM / language
    make_tool("Smodin", "Smodin", "AI writer, rewriter and homework solver",
              "Writing & Chat", "Academic Writing", "Freemium",
              "Multilingual essay help and homework solving",
              ["essays", "homework", "rewriter", "student-friendly"],
              "https://smodin.io/",
              "Smodin offers an AI essay writer, rewriter, plagiarism checker and homework-help tools across many languages, used by students for drafting and paraphrasing.",
              ["Essay writer", "Rewriter", "Plagiarism check", "Multi-language"]),
    make_tool("Speak", "Speak", "AI conversation tutor for language learning",
              "Courses & Tutorials", "Language Learning", "Freemium",
              "Practicing spoken languages with an AI tutor",
              ["language-learning", "speaking", "ai-tutor", "student-friendly"],
              "https://www.speak.com/",
              "Speak is an AI-powered language tutor focused on speaking practice, giving real-time pronunciation and fluency feedback through open-ended conversation.",
              ["Speaking practice", "Pronunciation feedback", "AI roleplay", "Lessons"]),
]
data.extend(NEW)
log(f"FIX5 add: appended {len(NEW)} curated student tools "
    f"(citation, AI-detection, exam-prep, academic writing, language)")

# ---------------------------------------------------------------------------
TOOLS.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
log(f"WROTE {len(data)} tools to {TOOLS}")

# Category distribution after
dist: dict[str, int] = defaultdict(int)
for t in data:
    dist[t.get("category", "?")] += 1
log("Category distribution after cleanup:")
for c, n in sorted(dist.items(), key=lambda x: -x[1]):
    log(f"  {c}: {n}")
