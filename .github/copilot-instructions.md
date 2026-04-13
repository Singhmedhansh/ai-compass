# AI Compass — Complete Dev Log & Roadmap
**Project:** AI tool discovery and recommendation platform  
**Live URL:** https://ai-compass-1.onrender.com  
**GitHub:** https://github.com/Singhmedhansh/ai-compass  
**Stack:** Flask + React (Vite) + Tailwind CSS + SQLite/PostgreSQL  
**Built by:** Medhansh Pratap Singh · RVCE Engineering · 2026

---

## What AI Compass Is

A student-first AI tools discovery platform. Users find the best AI tools for writing, coding, research, image generation, video, audio, and productivity. It combines a curated directory of 500+ tools, an intent-aware search engine, a multi-step recommendation wizard, user auth, favorites, ratings, and admin moderation — all deployed on Render.

---

## Phase 1 — Foundation ✅ COMPLETE

### What was built
- Flask application factory (`create_app()`) with blueprints
- SQLAlchemy models: User, Favorite, Rating, NewsletterSubscriber
- Flask-Login auth with registration, login, logout
- Google OAuth + GitHub OAuth integration
- tools.json curated catalog (500 tools)
- Tool detail pages, collection pages, SEO landing pages
- Admin moderation dashboard
- Tool discovery crawler pipeline
- Deployment on Render with gunicorn + WhiteNoise
- UptimeRobot ping to prevent free tier sleep

### Key files
```
app/__init__.py        — app factory, blueprint registration
app/models.py          — User, Favorite, Rating models
app/auth.py            — login/register/logout routes
app/oauth.py           — Google + GitHub OAuth
app/routes.py          — main page routes
app/tool_cache.py      — tools.json loader + search index builder
data/tools.json        — 500 curated AI tools
```

---

## Phase 2 — Bug Fixes & Stability ✅ COMPLETE

### Issues found and fixed (static analysis + testing)

| Severity | File | Issue | Fix |
|----------|------|-------|-----|
| CRITICAL | app/api_routes.py | Unclosed parenthesis at line 370 | Fixed stray `}` |
| CRITICAL | app/__init__.py | flask_session import crash | Wrapped in try/except |
| CRITICAL | app/__init__.py | Blueprint imports crashing app boot | Added `_register_blueprints()` with per-blueprint error handling |
| CRITICAL | app/models.py | `db` not importable | Moved `db = SQLAlchemy()` to module level |
| CRITICAL | forms.py | marshmallow import error | Added marshmallow to requirements.txt |
| CRITICAL | ml_recommender.py | numpy unused import, global statement, broad exceptions | Removed unused imports, replaced global with `_state` dict |
| HIGH | app/search_utils.py | SyntaxError at line 37 (bare docstring outside function) | Fixed function structure |
| HIGH | requirements.txt | numpy defined twice, protobuf version conflict | Pinned `numpy>=2.0.0,<2.3.0` and `protobuf>=3.19.5,<5.0.0` |
| HIGH | data/tools.json | Missing fields: pricing, student_perk, company, strengths on 495/500 tools | Ran `scripts/fix_tools_schema.py` migration |

### Schema migration (fix_tools_schema.py)
Normalized all 500 tools to consistent field names:
- `price` / `pricing_tier` → `pricing` (values: free / freemium / paid)
- `studentPerk` / `student_friendly` → `student_perk` (boolean)
- `maker` → `company`
- `features` → `strengths` (first 4 items)
- Added `review_count`, `featured`, `logo_emoji` defaults
- Normalized categories: "Writing & Docs" → "Writing & Chat", "Image Gen" → "Image Generation", etc.

### Final verification (all passing)
```
python -m py_compile app/api_routes.py   ✅
python -m py_compile app/search_utils.py ✅
python -m py_compile app/forms.py        ✅
pip check                                 ✅ No broken requirements
python scripts/fix_tools_schema.py       ✅ 0 missing fields
APP BOOT                                  ✅ OK
MODELS                                    ✅ OK
FORMS                                     ✅ OK
RECOMMENDER                               ✅ OK
SEARCH                                    ✅ OK
```

---

## Phase 3 — Search Engine Overhaul ✅ COMPLETE

### Problem
Search was pure exact string match. Searching "free image tool" returned nothing useful. Searching "write essays" returned unrelated tools. Score: 60/100.

### Solution: app/search_utils.py (complete rewrite)

**Intent parsing** — `parse_intent(raw_query)`:
- Strips stopwords (for, a, the, tool, ai, app, etc.)
- Detects pricing intent: "free" → filter to free/freemium
- Detects category intent: "write" → Writing & Chat
- Detects audience boosts: "student" → +25 to student_perk tools

**Token scoring** — `score_token_against_tool(token, tool_index)`:
- Name exact match: +100
- Name starts with: +65
- Token in name: +45
- Category match: +35
- Tag exact: +30, partial: +18
- Use case match: +16
- Strengths match: +16
- Description: +10
- Company: +22

**Multi-word phrase bonus**: +40 if full phrase in name, +25 in description

**Quality boosters**: rating × 3, trending +6, featured +4

**Fallback**: zero results → returns top 6 by rating with `fallback: true`

**Pre-built search index** (in tool_cache.py at startup):
All fields pre-lowercased into `_name_lower`, `_tags_lower`, etc. so `.lower()` is never called inside the scoring loop.

### INTENT_MAP (partial)
```python
"free"    → filter pricing to [free, freemium]
"student" → boost student_perk tools by +25
"write"   → soft category hint: Writing & Chat
"code"    → soft category hint: Coding
"image"   → soft category hint: Image Generation
"video"   → soft category hint: Video Generation
"music"   → soft category hint: Audio & Voice
```

### Search test results
| Query | Expected | Result |
|-------|----------|--------|
| "chatgpt" | ChatGPT first | ✅ PASS |
| "free coding tool" | all free/freemium + Coding | ✅ PASS |
| "writing essays for students" | Writing & Chat, student_perk boosted | ✅ PASS |
| "xyznotreal999" | fallback: true | ✅ PASS |
| "" (empty) | all tools by rating | ✅ PASS |

---

## Phase 4 — ML Recommender Overhaul ✅ COMPLETE

### Problem
Wizard asked Goal / Budget / Platform / Experience but returned wrong-category tools. Score: 30/100.

### Root cause
No hard category gate — a "coding" goal could return image generation tools if they scored high on other signals.

### Solution: app/ml_recommender.py (complete rewrite)

**GOAL_CATEGORY_MAP** — hard gate:
```python
"coding"  → ["Coding"]           # ONLY Coding tools returned
"writing" → ["Writing & Chat"]
"image"   → ["Image Generation"]
"video"   → ["Video Generation"]
"audio"   → ["Audio & Voice"]
"music"   → ["Audio & Voice"]
"research"→ ["Research"]
```

Tools that don't match the allowed categories for the user's goal get `score = 0` immediately. This is what fixed the wrong-category problem.

**USE_CASE_TAG_MAP** — new wizard step:
```python
"debugging"     → ["coding", "debugging", "ide"]
"blog"          → ["writing", "content", "seo"]
"youtube"       → ["video", "editing", "content"]
"data science"  → ["coding", "data", "python"]
"podcast"       → ["audio", "transcription", "voice"]
```

**PRICING_SCORE_MAP** — budget signal:
```python
("free", "free")      → +40
("free", "freemium")  → +20
("free", "paid")      → -30  (strong penalty)
("paid", "paid")      → +20
```

**build_reason()** — generates human-readable explanation:
`"Best-fit Coding tool — top-rated (4.9★), free tier available, great for debugging"`

**Fallback**: if < 3 results with strict scoring, relaxes budget penalty and retries within the same category.

### New wizard step: use_case
Added after Goal, before Budget:
- Input: free text ("write essays", "build a web app", "edit YouTube videos")
- Skip button available
- Passed to `get_recommendations(use_case=use_case)`

### Recommender test results
| Input | Expected | Result |
|-------|----------|--------|
| goal=coding, budget=free, use_case=debugging | ALL Coding, ALL free/freemium | ✅ PASS |
| goal=writing, budget=paid, use_case=blog | ALL Writing & Chat | ✅ PASS |
| goal=image, budget=free | ALL Image Generation | ✅ PASS |
| goal=video, use_case=youtube | ALL Video Generation | ✅ PASS |

---

## Phase 5 — Frontend Wiring & Deployment ✅ COMPLETE (mostly)

### React frontend (frontend/src/)
- `DirectoryPage.jsx` — main directory, search, filters
- `ToolFinderPage.jsx` — multi-step recommendation wizard

### Changes made
- Added `VITE_API_URL` to `.env` and `.env.production`
- Wired search fetch to `/api/v1/search` with full filter params
- Added `isFallback` state + fallback message UI
- Added `resultCount` display ("X tools found")
- Added `_reason` display on wizard result cards
- Added use_case step to wizard JSX
- Fixed CSS injection (moved from dynamic JS to App.css)
- Added `.tool-reason`, `.reason-icon`, `.fallback-msg` CSS classes
- Code-split React bundle (vendor + app chunks)

### API endpoints (live)
| Endpoint | Status | Description |
|----------|--------|-------------|
| GET /api/v1/tools | ✅ 200 | All tools for directory |
| GET /api/v1/search?q= | ✅ 200 | Intent-aware search |
| GET /api/v1/suggestions?q= | ✅ 200 | Autocomplete suggestions |
| POST /api/v1/finder | ✅ 200 | Wizard recommendations |
| GET /api/v1/tools/:slug | ✅ 200 | Tool detail page |

### Active blocker
None — ready for mobile session.

---

## Current Scores (honest assessment)

| System | Before | After |
|--------|--------|-------|
| Search | 60/100 | 85/100 |
| ML Recommender | 30/100 | 80/100 |
| App stability | 40/100 | 90/100 |
| Dataset quality | 50/100 | 80/100 |
| Frontend polish | 60/100 | 70/100 |
| Mobile friendliness | 30/100 | ✅ 75/100 |

---

## Phase 6 — Roadmap (What To Do Next)

### 🔴 IMMEDIATE (fix before LinkedIn post)

#### 1. Fix /api/v1/tools 500 on Render ✅ COMPLETE
- Verify `data/tools.json` is committed to git (`git ls-files data/tools.json`)
- Fix path in `tool_cache.py` to use absolute path based on `__file__`
- Add startup log: `[STARTUP] Loaded X tools`
- Success: `GET /api/v1/tools` returns 200, total: 500

#### 2. Mobile responsiveness ✅ SESSION 2 COMPLETE

**What was built:**
- Tailwind responsive grid system: 3-col desktop → 2-col tablet → 1-col mobile
- Touch-safe input fields (font-size 16px to prevent iOS zoom)
- Mobile navbar with hamburger menu support (filters-row class)
- Responsive tool cards with full-width layout on phones
- Modal dialogs: full-width on mobile, centered on desktop
- Button touch targets: 44px minimum height for usability
- DirectoryPage + ToolFinderPage: full mobile hook integration
- App.css: complete mobile media queries (@media max-width: 1024px, 640px)

**Implementation checklist:**
- [x] App.css mobile media queries appended (1024px & 640px breakpoints)
- [x] DirectoryPage: tools-grid, filters-row, SearchInput style prop, isLoading fix
- [x] ToolFinderPage: step containers with width constraints, button text legibility
- [x] SearchInput component: accepts and applies style prop (font-size: 16px)
- [x] Local Vite preview: ✅ renders both /tools and /ai-tool-finder correctly on iPhone SE
- [x] Render live: /ai-tool-finder renders; /tools shows graceful fallback on slow API
- [x] HTTP caching: /api/v1/tools cached for 1 hour to reduce load time
- [x] Fetch timeout: graceful fallback when API > 15s, shows empty grid instead of infinite loading

**Known limitations:**
- Render's dyno has slow /api/v1/tools response (~3-5s for 890KB JSON) — needs pagination for production
- /tools on Render may show loading state longer due to network conditions; local preview works fine
- Next optimization: pagination or gzip compression on API responses

**Active next task:** Session 3 — OG meta tags & LinkedIn preview card
  .hero-title { font-size: 26px; }
#### 2. Mobile responsiveness ✅ SESSION 2 COMPLETE

**What was built:**
- Tailwind responsive grid system: 3-col desktop → 2-col tablet → 1-col mobile
- Touch-safe input fields (font-size 16px to prevent iOS zoom)
- Mobile navbar with hamburger menu support (filters-row class)
- Responsive tool cards with full-width layout on phones
- Modal dialogs: full-width on mobile, centered on desktop
- Button touch targets: 44px minimum height for usability
- DirectoryPage + ToolFinderPage: full mobile hook integration
- App.css: complete mobile media queries (@media max-width: 1024px, 640px)

**Implementation checklist:**
- [x] App.css mobile media queries appended (1024px & 640px breakpoints)
- [x] DirectoryPage: tools-grid, filters-row, SearchInput style prop, isLoading fix
- [x] ToolFinderPage: step containers with width constraints, button text legibility
- [x] SearchInput component: accepts and applies style prop (font-size: 16px)
- [x] Local Vite preview: ✅ renders both /tools and /ai-tool-finder correctly on iPhone SE
- [x] Render live: /ai-tool-finder renders; /tools shows graceful fallback on slow API
- [x] HTTP caching: /api/v1/tools cached for 1 hour to reduce load time
- [x] Fetch timeout: graceful fallback when API > 15s, shows empty grid instead of infinite loading

**Known limitations:**
- Render's dyno has slow /api/v1/tools response (~3-5s for 890KB JSON) — needs pagination for production
- /tools on Render may show loading state longer due to network conditions; local preview works fine
- Next optimization: pagination or gzip compression on API responses

**Active next task:** Session 3 — OG meta tags & LinkedIn preview card
**Wizard on mobile:**
- Each step takes full screen
- Input fields 48px tall minimum (touch targets)
- Skip / Next buttons full width

**Profile dropdown on mobile:**
- Render as bottom sheet instead of dropdown
- Full width, slides up from bottom

#### 3. SEO meta tags (needed for LinkedIn preview)
In `templates/base.html` or the React index.html:
```html
<meta name="description" content="Discover 500+ AI tools for writing, coding, research, and more. Free, curated, student-friendly." />
<meta property="og:title" content="AI Compass — Find the Right AI Tool" />
<meta property="og:description" content="500+ curated AI tools with ratings, reviews, and smart recommendations." />
<meta property="og:image" content="https://ai-compass-1.onrender.com/static/og-image.png" />
<meta property="og:url" content="https://ai-compass-1.onrender.com" />
<meta name="twitter:card" content="summary_large_image" />
```

#### 3. OG meta tags & LinkedIn preview card 🔵 SESSION 3 (NEXT)

Add Open Graph meta tags to `frontend/index.html` or Flask template:
```html
<meta property="og:title" content="AI Compass — Find Your Perfect AI Tool" />
<meta property="og:description" content="500+ curated AI tools with smart search & recommendation wizard. Perfect for students, creators, and developers." />
<meta property="og:image" content="https://ai-compass-1.onrender.com/static/og-image.png" />
<meta property="og:url" content="https://ai-compass-1.onrender.com" />
<meta name="twitter:card" content="summary_large_image" />
```

Create a 1200×630px OG image (can be a screenshot of the homepage, Figma, or Canva).

**Success criteria:**
- LinkedIn post with link shows rich preview (image + title + description)
- Twitter share also shows preview
- Image aspect ratio correct (1.91:1), under 5MB

Each tool card should link to `/tools/chatgpt` with:
- Full description, strengths, use cases
- Platform badges
- Star rating input (logged-in users)
- Review count
- "Try this tool" CTA button
- Related tools section (same category, similar tags)
- Share button

#### 5. User dashboard improvements
- Favorites grid (already partially built)
- Recently viewed tools (track in localStorage)
- Personalized recommendations based on favorites
- "Your AI stack" — saved combination of tools

#### 6. Review and rating system
- 1–5 star rating per tool (one per user)
- Short text review (optional, 280 chars)
- Aggregate rating displayed on cards
- Most helpful reviews surfaced first

#### 7. Collections / curated lists
- "Best free tools for students"
- "Top coding assistants 2026"
- "Complete YouTube creator stack"
- Each collection is a shareable page with its own URL

---

### 🟢 MEDIUM TERM (monetization + growth)

#### 8. Affiliate links
- Replace raw tool URLs with tracked affiliate links
- Add `?ref=aicompass` parameter to qualifying tools
- Track clicks in the database
- Revenue from ChatGPT Plus, Cursor, ElevenLabs, Midjourney referrals

#### 9. Pro tier ($5–8/month)
- Unlimited saved stacks
- AI-powered "build my stack" (describe workflow → get full recommended stack)
- Export your stack as a shareable page
- Early access to new tools
- Stripe integration

#### 10. Weekly newsletter
- "5 AI tools you should know this week"
- Trending tools, new additions, student deals
- Newsletter subscribers already in DB — just need the send pipeline
- Use Resend or Brevo (free tier)

#### 11. SEO content pages
Target these keywords with dedicated pages:
- "best free AI tools for students"
- "AI tools for coding 2026"  
- "ChatGPT alternatives"
- "best AI image generators"
- "free AI writing tools"

Each page: intro paragraph, tool grid filtered by topic, FAQ section.

---

### 🔵 LONG TERM (scale)

#### 12. Browser extension
- Highlight any AI tool name on any webpage
- Shows AI Compass rating + quick summary in tooltip
- "Add to my stack" button
- Built with Chrome Extension Manifest V3

#### 13. Public API
- `GET /public/v1/tools` — paginated tool list
- `GET /public/v1/search?q=` — search endpoint
- API key authentication
- Free tier: 100 req/day
- Paid tier: 10,000 req/day
- Use case: developers building AI tool comparison sites

#### 14. Community features
- User-submitted tools (moderation queue already built)
- Upvoting / downvoting tools
- Comments on tool pages
- "People also use" connections between tools

---

## LinkedIn Post Checklist (before posting)

```
[ ] /api/v1/tools returns 200 with 500 tools
[ ] Search works on live URL (test: ?q=chatgpt returns ChatGPT first)
[ ] Wizard works end to end (goal → use case → budget → results)
[ ] Homepage loads in under 3 seconds on mobile
[ ] All tool cards render correctly on iPhone-sized screen
[ ] No horizontal scroll on mobile
[ ] OG meta tags set (so LinkedIn shows a preview card)
[ ] OG image created (1200×630px screenshot or designed card)
[ ] "Login" and "Register" buttons work
[ ] At least 1 test account created and working
[ ] Footer has your name + GitHub link
[ ] No console errors on homepage load
```

### Suggested LinkedIn post copy
```
Built something I actually wanted to exist as an engineering student:

AI Compass — a curated directory of 500+ AI tools with 
smart search and a recommendation wizard.

Instead of googling "best AI tools for X" every time, 
you just describe what you need and it surfaces the 
right tools — filtered by pricing, platform, and use case.

Some things I built into it:
→ Intent-aware search (understands "free coding tool", not just exact matches)
→ Category-gated ML recommender (no more wrong results)
→ 500 tools with ratings, use cases, and student perks

Stack: Flask + React + Tailwind, deployed on Render

Try it: https://ai-compass-1.onrender.com

Still building — roadmap includes affiliate monetization, 
a Pro tier, and a browser extension.

#buildinpublic #ai #webdev #engineering #student
```

---

## Tech Debt to Clean Up (after LinkedIn post)

- Remove all `print()` debug statements added during fixes
- Remove `debug_patch.py` and `fix_api_routes.py` scripts from root
- Move `scripts/fix_tools_schema.py` to a `scripts/migrations/` folder
- Replace marshmallow Schema in forms.py with pure WTForms (or keep if used)
- Add proper logging (replace print with `app.logger.info`)
- Write at least 10 pytest unit tests for the search engine
- Set up GitHub Actions CI to run tests on every push
- Add `scikit-learn` to Render's build command if not auto-installed

---

## Deployment Reference

| Environment | Command |
|-------------|---------|
| Local dev | `python app.py` |
| Local with test DB | `$env:DATABASE_URL="sqlite:///:memory:"; python app.py` |
| Production | `gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120` |
| Frontend build | `cd frontend && npm run build` |
| Full deploy | `git add -A && git commit -m "..." && git push origin main` |

**Render environment variables required:**
```
SECRET_KEY=<strong random value>
DATABASE_URL=<postgresql connection string>
APP_ENV=production
ADMIN_EMAIL=<your email>
ADMIN_PASSWORD=<strong password>
```

---

*Last updated: April 2026 — Medhansh Pratap Singh*