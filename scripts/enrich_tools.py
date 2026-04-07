"""
Bulk enriches data/tools.json by filling in missing fields for all 470 tools
that lack: use_cases, difficulty, student_friendly, pricing_tier.
Also normalizes category names to the approved list.
"""
import json
import re

VALID_CATEGORIES = {
    "Coding", "Writing & Docs", "Research", "Productivity",
    "Image Gen", "Video Gen", "Study Tools", "Design",
    "Data Analysis", "Audio", "Video", "Marketing"
}

CATEGORY_NORM = {
    "writing & docs": "Writing & Docs",
    "writing": "Writing & Docs",
    "image generation": "Image Gen",
    "image gen": "Image Gen",
    "video generation": "Video Gen",
    "video gen": "Video Gen",
    "study tools": "Study Tools",
    "study": "Study Tools",
    "data analysis": "Data Analysis",
    "coding": "Coding",
    "research": "Research",
    "productivity": "Productivity",
    "design": "Design",
    "audio": "Audio",
    "video": "Video",
    "marketing": "Marketing",
    "presentation": "Design",         # closest match
    "audio generation": "Audio",
    "audio & music": "Audio",
    "music": "Audio",
    "communication": "Productivity",
    "seo": "Marketing",
    "social media": "Marketing",
    "hr & recruiting": "Productivity",
    "finance": "Data Analysis",
    "legal": "Productivity",
    "healthcare": "Research",
    "customer support": "Productivity",
    "sales": "Marketing",
    "analytics": "Data Analysis",
    "education": "Study Tools",
    "language learning": "Study Tools",
    "no-code": "Productivity",
    "automation": "Productivity",
    "security": "Coding",
    "3d": "Design",
    "3d & vr": "Design",
    "gaming": "Design",
    "translation": "Writing & Docs",
    "voice": "Audio",
    "chatbot": "Productivity",
    "ai assistant": "Productivity",
    "search": "Research",
    "document": "Writing & Docs",
    "spreadsheet": "Data Analysis",
    "database": "Data Analysis",
    "project management": "Productivity",
    "meeting": "Productivity",
    "email": "Productivity",
    "summarization": "Writing & Docs",
    "note-taking": "Study Tools",
    "notes": "Study Tools",
}

# Category -> typical use cases
CATEGORY_USE_CASES = {
    "Coding": [
        "Writing and completing code faster",
        "Debugging and fixing errors",
        "Learning new programming languages",
        "Reviewing and refactoring code",
        "Generating boilerplate and project scaffolding"
    ],
    "Writing & Docs": [
        "Drafting essays and reports",
        "Proofreading and editing documents",
        "Summarizing long texts",
        "Generating blog posts and content",
        "Creating professional emails and communications"
    ],
    "Research": [
        "Finding and summarizing academic papers",
        "Conducting literature reviews",
        "Fact-checking and source verification",
        "Discovering related research and citations",
        "Synthesizing findings from multiple sources"
    ],
    "Productivity": [
        "Automating repetitive tasks",
        "Organizing notes and to-do lists",
        "Managing schedules and workflows",
        "Summarizing meetings and calls",
        "Reducing time on manual administrative work"
    ],
    "Image Gen": [
        "Creating original artwork and illustrations",
        "Generating images for presentations and blogs",
        "Designing social media visuals",
        "Producing concept art and mockups",
        "Personalizing visual content at scale"
    ],
    "Video Gen": [
        "Creating short-form videos and reels",
        "Generating explainer or marketing videos",
        "Animating scripts and storyboards",
        "Producing educational video content",
        "Repurposing long-form content into clips"
    ],
    "Study Tools": [
        "Creating flashcards and quizzes from notes",
        "Summarizing textbook chapters",
        "Practicing exam-style questions",
        "Organizing study schedules",
        "Getting step-by-step explanations of concepts"
    ],
    "Design": [
        "Creating UI mockups and wireframes",
        "Generating graphics and visual assets",
        "Building presentations and pitch decks",
        "Designing logos and brand materials",
        "Collaborating on visual projects with teams"
    ],
    "Data Analysis": [
        "Running statistical analysis on datasets",
        "Visualizing data with charts and graphs",
        "Cleaning and preprocessing raw data",
        "Generating insights from research data",
        "Building interactive dashboards and reports"
    ],
    "Audio": [
        "Generating voiceovers and narrations",
        "Transcribing recordings to text",
        "Creating music and soundscapes",
        "Editing audio for podcasts",
        "Cloning or transforming voices"
    ],
    "Video": [
        "Editing and trimming video footage",
        "Adding captions and subtitles automatically",
        "Repurposing long videos into short clips",
        "Generating video summaries",
        "Enhancing and upscaling video quality"
    ],
    "Marketing": [
        "Writing ad copy and campaign content",
        "Generating SEO-optimized blog posts",
        "Creating social media posts at scale",
        "Analyzing competitor content",
        "Running A/B tests for marketing messages"
    ],
}

# Category -> typical difficulty
CATEGORY_DIFFICULTY = {
    "Coding": "intermediate",
    "Writing & Docs": "beginner",
    "Research": "intermediate",
    "Productivity": "beginner",
    "Image Gen": "beginner",
    "Video Gen": "beginner",
    "Study Tools": "beginner",
    "Design": "beginner",
    "Data Analysis": "advanced",
    "Audio": "beginner",
    "Video": "beginner",
    "Marketing": "beginner",
}

# Category -> student friendly default
CATEGORY_STUDENT_FRIENDLY = {
    "Coding": True,
    "Writing & Docs": True,
    "Research": True,
    "Productivity": True,
    "Image Gen": False,
    "Video Gen": False,
    "Study Tools": True,
    "Design": False,
    "Data Analysis": False,
    "Audio": False,
    "Video": False,
    "Marketing": False,
}

# Overrides for specific tools known to be student-friendly or not
STUDENT_FRIENDLY_OVERRIDES = {
    # Tools with free plans and popular with students
    "chatgpt": True, "claude": True, "grammarly": True, "notion ai": True,
    "quillbot": True, "github copilot": True, "replit ai": True, "codeium": True,
    "perplexity ai": True, "elicit": True, "semantic scholar": True,
    "anki": True, "wolfram alpha": True, "photomath": True, "khanmigo": True,
    "khan academy": True, "duolingo": True, "desmos": True, "geogebra": True,
    "zotero": True, "mendeley": True,
    # Professional / expensive tools
    "adobe": False, "figma": True, "miro": True,
}

# Pricing tier inference from price field
def infer_pricing_tier(tool):
    existing = tool.get('pricing_tier')
    if existing:
        return existing.lower().strip()

    price_str = str(tool.get('price', '') or '').lower().strip()
    pricing_str = str(tool.get('pricing', '') or '').lower().strip()
    pricing_detail = str(tool.get('pricingDetail', '') or '').lower()
    tags_str = ' '.join(tool.get('tags', [])).lower()

    combined = price_str + ' ' + pricing_str + ' ' + pricing_detail

    if 'free' in tags_str and 'paid' not in price_str:
        if 'freemium' in combined or 'pro' in combined or 'premium' in combined or 'plus' in combined:
            return 'freemium'
        return 'free'

    if price_str in ('free', 'always free', 'open source'):
        return 'free'
    if price_str in ('freemium', 'free trial') or 'freemium' in combined:
        return 'freemium'
    if price_str in ('paid', 'subscription', 'premium'):
        return 'paid'
    if 'free' in combined and ('plan' in combined or 'tier' in combined or 'month' in combined):
        if 'pro' in combined or 'premium' in combined or 'plus' in combined or 'paid' in combined:
            return 'freemium'
        return 'freemium'
    if 'free' in combined:
        return 'freemium'
    if combined.strip():
        return 'paid'

    # Last resort from category
    cat = str(tool.get('category', '')).lower()
    if cat in ('data analysis',):
        return 'paid'
    return 'freemium'


def normalize_category(tool):
    cat = str(tool.get('category', '') or '').strip()
    lower = cat.lower()
    if cat in VALID_CATEGORIES:
        return cat
    return CATEGORY_NORM.get(lower, cat if cat else 'Productivity')


def infer_difficulty(tool, norm_cat):
    existing = tool.get('difficulty')
    if existing:
        return existing

    # Check tags/description for hints
    tags = [t.lower() for t in (tool.get('tags') or [])]
    desc = str(tool.get('description', '') or '').lower()
    name = str(tool.get('name', '') or '').lower()

    if any(k in tags for k in ['beginner', 'no-code', 'easy', 'simple', 'intuitive']):
        return 'beginner'
    if any(k in tags for k in ['advanced', 'api', 'developer', 'technical', 'professional']):
        return 'advanced'
    if any(k in desc for k in ['no coding', 'no-code', 'intuitive', 'easy to use', 'drag and drop', 'simple']):
        return 'beginner'
    if any(k in desc for k in ['api access', 'command line', 'script', 'technical expertise', 'developer']):
        return 'advanced'
    if 'api' in tags:
        return 'intermediate'
    if norm_cat == 'Data Analysis' and any(k in desc for k in ['spss', 'stata', 'r ', 'matlab', 'sas ']):
        return 'advanced'

    return CATEGORY_DIFFICULTY.get(norm_cat, 'beginner')


def infer_student_friendly(tool, norm_cat):
    existing = tool.get('student_friendly')
    if existing is not None:
        return existing

    name_lower = str(tool.get('name', '') or '').lower()
    for key, val in STUDENT_FRIENDLY_OVERRIDES.items():
        if key in name_lower:
            return val

    # Use studentPerk field if available
    if tool.get('studentPerk'):
        return True

    pricing_tier = tool.get('pricing_tier', '')
    if pricing_tier == 'free':
        return True

    tags = [t.lower() for t in (tool.get('tags') or [])]
    desc = str(tool.get('description', '') or '').lower()

    if any(k in tags for k in ['student', 'education', 'academic', 'learning', 'study', 'free']):
        return True
    if any(k in desc for k in ['student', 'university', 'academic', 'free plan', 'education']):
        return True

    return CATEGORY_STUDENT_FRIENDLY.get(norm_cat, False)


def enrich_use_cases(tool, norm_cat):
    existing = tool.get('use_cases')
    if existing and isinstance(existing, list) and len(existing) >= 3:
        return existing

    # Start with category defaults
    defaults = list(CATEGORY_USE_CASES.get(norm_cat, [
        "Automating repetitive tasks",
        "Increasing personal productivity",
        "Creating content faster"
    ]))

    # Enrich based on specific tags/features
    tags = [t.lower() for t in (tool.get('tags') or [])]
    features = [str(f).lower() for f in (tool.get('features') or [])]
    name_lower = str(tool.get('name', '') or '').lower()
    desc = str(tool.get('description', '') or '').lower()

    extra = []
    if 'summariz' in desc or 'summary' in ' '.join(tags):
        extra.append("Summarizing long documents and articles")
    if 'translat' in ' '.join(tags) or 'translat' in desc:
        extra.append("Translating content across languages")
    if 'transcri' in ' '.join(features) or 'transcri' in desc:
        extra.append("Transcribing audio and video to text")
    if 'collaborat' in desc or 'collaborat' in ' '.join(features):
        extra.append("Collaborating with teammates in real time")
    if 'presentation' in ' '.join(tags) or 'slide' in desc:
        extra.append("Building presentations and slide decks")
    if 'citation' in ' '.join(tags) or 'citation' in desc:
        extra.append("Generating and managing citations")

    # Build final use_cases list (3-5 items)
    combined = defaults + extra
    seen = set()
    result = []
    for uc in combined:
        key = uc.lower()
        if key not in seen:
            seen.add(key)
            result.append(uc)
        if len(result) >= 5:
            break

    # Ensure at least 3
    while len(result) < 3:
        result.append("Improving overall workflow efficiency")

    return result[:5]


def enrich_tags(tool):
    existing = tool.get('tags')
    if existing and isinstance(existing, list) and len(existing) >= 5:
        return existing

    tags = list(existing) if existing else []
    cat = str(tool.get('category', '') or '').lower()
    desc = str(tool.get('description', '') or '').lower()
    name = str(tool.get('name', '') or '').lower()
    features = [str(f).lower() for f in (tool.get('features') or [])]
    feature_text = ' '.join(features)

    additions = []

    # Add category-based tags
    cat_tags = {
        'coding': ['coding', 'programming', 'development'],
        'writing & docs': ['writing', 'content', 'documents'],
        'research': ['research', 'academic', 'papers'],
        'productivity': ['productivity', 'workflow', 'automation'],
        'image gen': ['image generation', 'ai art', 'visual'],
        'video gen': ['video generation', 'video creation', 'ai video'],
        'study tools': ['studying', 'learning', 'education'],
        'design': ['design', 'visual', 'creative'],
        'data analysis': ['data analysis', 'statistics', 'analytics'],
        'audio': ['audio', 'voice', 'sound'],
        'video': ['video editing', 'video', 'media'],
        'marketing': ['marketing', 'seo', 'content marketing'],
    }
    for k, v in cat_tags.items():
        if k in cat:
            additions.extend(v)

    # Add feature-based tags
    if 'api' in feature_text or 'api' in desc:
        additions.append('api')
    if 'free' in desc and 'free' not in ' '.join(tags).lower():
        additions.append('free')
    if 'collaboration' in feature_text or 'team' in desc:
        additions.append('collaboration')
    if 'browser extension' in feature_text or 'extension' in desc:
        additions.append('browser extension')
    if 'mobile' in desc or 'ios' in desc or 'android' in desc:
        additions.append('mobile')
    if 'open source' in desc:
        additions.append('open-source')
    if 'student' in desc or 'education' in desc:
        additions.append('student-friendly')
    if 'no-code' in desc or 'no code' in desc or 'drag' in desc:
        additions.append('no-code')
    if 'real-time' in desc or 'real time' in desc:
        additions.append('real-time')

    seen = set(t.lower() for t in tags)
    result = list(tags)
    for a in additions:
        if a.lower() not in seen and len(result) < 8:
            seen.add(a.lower())
            result.append(a)

    return result if result else ['ai', 'tool', 'productivity']


# ── Main enrichment ───────────────────────────────────────────────────────────
data_path = 'data/tools.json'
with open(data_path, 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

tools = data if isinstance(data, list) else data.get('tools', [])
print(f"Loaded {len(tools)} tools")

enriched = 0
for tool in tools:
    changed = False

    # 1. Normalize category
    norm_cat = normalize_category(tool)
    if tool.get('category') != norm_cat:
        tool['category'] = norm_cat
        changed = True

    # 2. Enrich tags (ensure 5-8)
    new_tags = enrich_tags(tool)
    if new_tags != tool.get('tags'):
        tool['tags'] = new_tags
        changed = True

    # 3. Pricing tier
    pt = infer_pricing_tier(tool)
    if not tool.get('pricing_tier'):
        tool['pricing_tier'] = pt
        changed = True

    # 4. Difficulty
    diff = infer_difficulty(tool, norm_cat)
    if not tool.get('difficulty'):
        tool['difficulty'] = diff
        changed = True

    # 5. Student friendly
    sf = infer_student_friendly(tool, norm_cat)
    if tool.get('student_friendly') is None:
        tool['student_friendly'] = sf
        changed = True

    # 6. Use cases
    uc = enrich_use_cases(tool, norm_cat)
    if not tool.get('use_cases') or len(tool.get('use_cases', [])) < 3:
        tool['use_cases'] = uc
        changed = True

    if changed:
        enriched += 1

print(f"Enriched {enriched} tools")

# Validate stats
from collections import Counter
cats = Counter(t.get('category', '') for t in tools)
pricing = Counter(t.get('pricing_tier', '') for t in tools)
diff_c = Counter(t.get('difficulty', '') for t in tools)
missing_sf = sum(1 for t in tools if t.get('student_friendly') is None)
missing_uc = sum(1 for t in tools if not t.get('use_cases') or len(t.get('use_cases', [])) < 3)
missing_pt = sum(1 for t in tools if not t.get('pricing_tier'))

print(f"Categories: {dict(cats.most_common(15))}")
print(f"Pricing tiers: {dict(pricing)}")
print(f"Difficulty: {dict(diff_c)}")
print(f"Missing student_friendly: {missing_sf}")
print(f"Missing use_cases (<3): {missing_uc}")
print(f"Missing pricing_tier: {missing_pt}")

# Write back
if isinstance(data, list):
    out = tools
else:
    data['tools'] = tools
    out = data

with open(data_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, indent=2, ensure_ascii=False)

print("Saved data/tools.json")
