"""Second careful catalog pass: remove verified near-duplicates and add
high-value student tools with strict per-tool dedup. Run from repo root.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "data" / "tools.json"

data = json.loads(TOOLS.read_text(encoding="utf-8"))
print(f"Loaded {len(data)} tools")


def norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def dom(url: str) -> str:
    if not url:
        return ""
    try:
        n = urlparse(url if "://" in url else f"https://{url}").netloc.lower()
    except Exception:
        return ""
    n = n.split(":")[0]
    if n.startswith("www."):
        n = n[4:]
    p = n.split(".")
    return ".".join(p[-2:]) if len(p) >= 2 else n


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or "tool"


# --- Phase 1: remove verified duplicates -----------------------------------
DROP_IDS = {537, 494, 533, 512, 217, 105, 145, 320, 314, 301}
before = len(data)
dropped = [(t["id"], t["name"]) for t in data if t.get("id") in DROP_IDS]
data = [t for t in data if t.get("id") not in DROP_IDS]
print(f"Phase 1 dedupe: removed {before - len(data)} -> {len(data)}")
for i, n in dropped:
    print(f"  dropped id{i} '{n}'")

# Fix Murf AI miscategory (its Audio twin id512 was the duplicate we removed).
for t in data:
    if t.get("id") == 216 and t.get("name") == "Murf AI":
        if t.get("category") != "Audio & Voice":
            print(f"  recat 'Murf AI': {t.get('category')} -> Audio & Voice")
            t["category"] = "Audio & Voice"

# --- Phase 2: add new tools with strict pre-insert dedup -------------------
existing_names = {norm_name(t.get("name", "")) for t in data}
existing_domains = {dom(t.get("link") or t.get("url") or "") for t in data}
existing_slugs = {t.get("slug") for t in data if t.get("slug")}
next_id = max((t["id"] for t in data if isinstance(t.get("id"), int)), default=0) + 1


def make(name, maker, tagline, category, sub, pricing, best_for, tags, link,
         desc, features, student=True, ai_native=True):
    return dict(
        name=name, maker=maker, tagline=tagline, category=category,
        subCategory=sub, price=pricing, pricingDetail=pricing, pricing=pricing,
        pricing_tier=pricing, bestFor=best_for, tags=tags, link=link,
        description=desc, use_cases=tags, features=features, strengths=features,
        company=maker, difficulty="Beginner", platforms=["Web"],
        languages="English", launchYear=2024, trending=False, featured=False,
        rating=0, review_count=0, weeklyUsers="", apiAvailable=False,
        openSource=False, studentPerk=student, student_perk=student,
        student_friendly=student, is_ai_native=ai_native, uniHack="",
        logo_emoji="", popularity_score=0, curation_score=55.0,
        icon="/static/icons/default.png",
    )


CANDIDATES = [
    # Accessibility / neurodivergent (biggest gap)
    make("Tiimo", "Tiimo", "Visual AI day planner for ADHD and autistic students",
         "Productivity", "Accessibility & Focus", "Freemium",
         "Visual time-blocking and AI task breakdown for neurodivergent students",
         ["adhd", "accessibility", "planner", "focus", "student-friendly"],
         "https://www.tiimoapp.com/",
         "Tiimo is a visual planner built for ADHD and autistic students that uses AI to break tasks into manageable steps and turn to-dos into a clear, time-blocked day.",
         ["AI task breakdown", "Visual schedule", "Focus timers", "Reminders"]),
    make("Saner.ai", "Saner.ai", "ADHD-friendly AI assistant for notes and tasks",
         "Productivity", "Accessibility & Focus", "Freemium",
         "An AI second brain designed around how ADHD students think",
         ["adhd", "accessibility", "notes", "tasks", "student-friendly"],
         "https://saner.ai/",
         "Saner.ai is an AI personal assistant designed for ADHD users that captures messy notes, surfaces what matters, and turns scattered thoughts into organized tasks.",
         ["AI notes", "Smart reminders", "Task surfacing", "Email triage"]),
    make("Focus Bear", "Focus Bear", "AI routine and focus app built for ADHD",
         "Productivity", "Accessibility & Focus", "Paid",
         "Building study routines and blocking distractions for ADHD students",
         ["adhd", "focus", "accessibility", "habits", "student-friendly"],
         "https://www.focusbear.io/",
         "Focus Bear is a focus and routine app designed with ADHD users that guides morning/study routines and uses smart distraction-blocking to protect deep-study time.",
         ["Routine guidance", "Distraction blocking", "Habit tracking", "Focus mode"]),
    make("Voice Dream Reader", "Voice Dream", "AI text-to-speech reader for dyslexic students",
         "Audio & Voice", "Accessibility & Focus", "Paid",
         "Reading textbooks and PDFs aloud for dyslexia and low vision",
         ["accessibility", "dyslexia", "text-to-speech", "reading", "student-friendly"],
         "https://www.voicedream.com/",
         "Voice Dream Reader uses natural AI voices to read PDFs, articles, and textbooks aloud with synchronized highlighting, widely used by dyslexic and low-vision students.",
         ["AI voices", "Synced highlighting", "PDF/EPUB support", "Reading speed control"]),
    # Voice notes / dictation (missing category)
    make("AudioPen", "AudioPen", "Turn rambling voice notes into clean text",
         "Productivity", "Voice Notes", "Freemium",
         "Speaking messy thoughts and getting structured notes or essay drafts",
         ["voice-notes", "dictation", "writing", "student-friendly"],
         "https://audiopen.ai/",
         "AudioPen records spoken thoughts and uses AI to transform rambling speech into clean, structured notes, summaries, and first essay drafts.",
         ["Voice to structured text", "Auto summary", "Rewrite styles", "Export"]),
    make("Wispr Flow", "Wispr", "AI voice dictation that works in every app",
         "Productivity", "Voice Notes", "Freemium",
         "Dictating notes and essays faster than typing",
         ["dictation", "voice", "accessibility", "writing", "student-friendly"],
         "https://wisprflow.ai/",
         "Wispr Flow is an AI dictation tool that turns natural speech into polished text in any app, an accessibility and speed win for note-taking and essay drafting.",
         ["System-wide dictation", "Auto punctuation", "Tone cleanup", "Fast"]),
    make("TurboLearn AI", "TurboLearn", "Record a lecture, get notes, flashcards and quizzes",
         "Courses & Tutorials", "Lecture Capture", "Freemium",
         "Turning recorded lectures into study material automatically",
         ["lecture", "notes", "flashcards", "exam-prep", "student-friendly"],
         "https://turbolearn.ai/",
         "TurboLearn AI records or ingests lectures and automatically generates structured notes, flashcards, and practice quizzes so students can revise without re-watching.",
         ["Lecture to notes", "Auto flashcards", "Quiz generation", "Audio/PDF input"]),
    make("Coconote", "Coconote", "AI notes from audio, PDFs and YouTube",
         "Courses & Tutorials", "Lecture Capture", "Freemium",
         "Converting any lecture source into notes and flashcards",
         ["notes", "lecture", "flashcards", "student-friendly"],
         "https://coconote.app/",
         "Coconote turns recorded audio, PDFs, slides and YouTube videos into organized AI notes, summaries and flashcards for fast revision.",
         ["Multi-source input", "AI notes", "Flashcards", "Summaries"]),
    # Homework solvers
    make("Gauthmath", "Gauth", "Photo-solve math and STEM with step-by-step AI",
         "Research", "Homework Help", "Freemium",
         "Snapping a math or science problem and getting worked steps",
         ["math", "stem", "homework", "solver", "student-friendly"],
         "https://www.gauthmath.com/",
         "Gauthmath lets students photograph math and STEM problems and returns step-by-step AI solutions and explanations across arithmetic to calculus.",
         ["Photo solve", "Step-by-step", "Multi-subject", "Calculator"]),
    make("Question.AI", "Question.AI", "Snap and solve any homework question",
         "Research", "Homework Help", "Freemium",
         "Instant AI help across any subject from a photo",
         ["homework", "solver", "ai-tutor", "student-friendly"],
         "https://www.questionai.com/",
         "Question.AI is a mobile-first AI homework assistant that solves and explains questions across math, science, and humanities from a photo or typed prompt.",
         ["Photo solve", "All subjects", "Explanations", "Essay help"]),
    make("Studdy", "Studdy", "Multimodal AI tutor across subjects",
         "Courses & Tutorials", "AI Tutoring", "Freemium",
         "A patient AI tutor that explains problems step by step",
         ["ai-tutor", "homework", "stem", "student-friendly"],
         "https://www.studdy.ai/",
         "Studdy is a multimodal AI tutor (Studdy Buddy) that walks students through math, science and other problems with guided, step-by-step explanations.",
         ["AI tutor", "Step guidance", "Photo input", "Multi-subject"]),
    # AI detection (honest self-check, NOT humanizers)
    make("ZeroGPT", "ZeroGPT", "Free AI-text detector for students",
         "Research", "Plagiarism & AI Detection", "Freemium",
         "Self-checking work before submission to avoid false AI flags",
         ["ai-detection", "plagiarism", "academic-integrity", "student-friendly"],
         "https://www.zerogpt.com/",
         "ZeroGPT is a free AI content detector students use to self-check essays before submission so genuine writing is not falsely flagged by university tools.",
         ["AI detection", "Highlighted sentences", "Free tier", "Multi-language"]),
    make("Winston AI", "Winston AI", "Academic-grade AI and plagiarism detector",
         "Research", "Plagiarism & AI Detection", "Freemium",
         "Verifying originality before handing in academic work",
         ["ai-detection", "plagiarism", "academic-integrity", "student-friendly"],
         "https://gowinston.ai/",
         "Winston AI combines AI-content detection and plagiarism scanning with detailed reports, used to verify originality of academic writing before submission.",
         ["AI detection", "Plagiarism scan", "Readability", "PDF reports"]),
    # Academic / thesis writing
    make("Writefull", "Writefull", "AI language feedback trained on academic papers",
         "Writing & Chat", "Academic Writing", "Freemium",
         "Improving academic English in papers and theses",
         ["academic-writing", "grammar", "research", "student-friendly"],
         "https://www.writefull.com/",
         "Writefull gives AI language feedback trained specifically on published academic papers, improving phrasing, grammar and academic tone in theses and manuscripts.",
         ["Academic language model", "Paraphrasing", "Title/abstract help", "Word add-in"]),
    make("Yomu AI", "Yomu", "AI academic essay and thesis writer with citations",
         "Writing & Chat", "Academic Writing", "Freemium",
         "Drafting and citing academic essays and dissertations",
         ["academic-writing", "essays", "citation", "thesis", "student-friendly"],
         "https://www.yomu.ai/",
         "Yomu AI is an academic writing assistant that helps students draft, paraphrase and add in-text citations to essays, literature reviews and dissertations.",
         ["AI autocomplete", "In-text citations", "Paraphrase", "Plagiarism check"]),
    # Flashcards / SRS
    make("Wisdolia", "Wisdolia", "Auto-generate flashcards from any page or PDF",
         "Productivity", "Exam & Study Prep", "Freemium",
         "Creating flashcards from articles, PDFs and videos instantly",
         ["flashcards", "spaced-repetition", "exam-prep", "student-friendly"],
         "https://www.wisdolia.com/",
         "Wisdolia is a browser extension that uses AI to auto-generate question-and-answer flashcards from any web page, PDF or YouTube video and syncs them to Anki.",
         ["Auto flashcards", "Any source", "Anki export", "Spaced repetition"]),
    # Study planning
    make("Sunsama", "Sunsama", "AI daily planner that unifies tasks and calendar",
         "Productivity", "Study Planning", "Paid",
         "A guided daily planning ritual for busy students",
         ["planning", "calendar", "productivity", "student-friendly"],
         "https://www.sunsama.com/",
         "Sunsama is a guided daily planner that uses AI to help students plan a realistic day by pulling tasks from calendars and tools into one intentional schedule.",
         ["Daily planning", "Calendar sync", "Task pull-in", "Time-boxing"]),
    # Language learning
    make("TalkPal", "TalkPal", "AI conversation tutor for language learning",
         "Courses & Tutorials", "Language Learning", "Freemium",
         "Practising real conversations in a new language with AI",
         ["language-learning", "speaking", "ai-tutor", "student-friendly"],
         "https://talkpal.ai/",
         "TalkPal is an AI language tutor that holds open-ended voice and text conversations, giving real-time feedback on grammar and pronunciation across many languages.",
         ["AI conversation", "Pronunciation feedback", "Roleplay", "Many languages"]),
    make("Memrise", "Memrise", "AI language learning with native-speaker video",
         "Courses & Tutorials", "Language Learning", "Freemium",
         "Building vocabulary with AI spaced repetition and real speakers",
         ["language-learning", "spaced-repetition", "vocabulary", "student-friendly"],
         "https://www.memrise.com/",
         "Memrise pairs AI-driven spaced repetition with thousands of native-speaker video clips and an AI chat tutor (MemBot) to build practical language vocabulary.",
         ["AI spaced repetition", "Native video", "AI chat tutor", "Courses"]),
    # Coding interview / practice (no AI-native ones present)
    make("interviewing.io", "interviewing.io", "AI and live mock technical interviews",
         "Coding", "Interview Prep", "Freemium",
         "Practising coding interviews for internships and new-grad roles",
         ["interview-prep", "coding", "career", "student-friendly"],
         "https://interviewing.io/",
         "interviewing.io offers AI-driven and anonymous live mock technical interviews with feedback, helping CS students prepare for internship and new-grad coding interviews.",
         ["AI mock interviews", "Live practice", "Feedback", "Question bank"]),
    make("Exercism", "Exercism", "Free coding practice with AI mentoring",
         "Coding", "Interview Prep", "Free",
         "Practising programming with feedback across 70+ languages",
         ["coding", "practice", "learning", "free", "student-friendly"],
         "https://exercism.org/",
         "Exercism is a free platform with 70+ language tracks where students solve coding exercises and get AI-assisted feedback and mentoring to build fluency.",
         ["70+ languages", "AI feedback", "Mentoring", "Free forever"]),
    # Visual / spatial notes (missing)
    make("Heptabase", "Heptabase", "Visual whiteboard notes for research and thesis",
         "Productivity", "Visual Notes", "Paid",
         "Spatially organizing research, readings and thesis ideas",
         ["notes", "research", "visual", "thesis", "student-friendly"],
         "https://heptabase.com/",
         "Heptabase is a visual note-taking tool that lets students lay out cards, PDFs and notes on infinite whiteboards with AI assistance to synthesize research and thesis material.",
         ["Whiteboard notes", "PDF annotation", "AI summarize", "Card linking"]),
]

added = []
skipped = []
for c in CANDIDATES:
    nn = norm_name(c["name"])
    dd = dom(c.get("link", ""))
    if nn in existing_names or (dd and dd in existing_domains):
        skipped.append(c["name"])
        continue
    c["id"] = next_id
    next_id += 1
    s = slugify(c["name"])
    base, n = s, 2
    while s in existing_slugs:
        s = f"{base}-{n}"
        n += 1
    c["slug"] = s
    existing_slugs.add(s)
    existing_names.add(nn)
    if dd:
        existing_domains.add(dd)
    data.append(c)
    added.append(c["name"])

print(f"Phase 2 add: added {len(added)} -> {len(data)} tools")
for a in added:
    print(f"  + {a}")
if skipped:
    print(f"SKIPPED as already present: {skipped}")

TOOLS.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"WROTE {len(data)} tools")
