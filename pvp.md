# AI Compass — Agent Context File (pvp.md)
> Read this file at the start of every session before touching any code.

---

## Project Identity
- **Name:** AI Compass
- **Live URL:** https://ai-compass-1.onrender.com
- **GitHub:** https://github.com/Singhmedhansh/ai-compass
- **Purpose:** Student-first AI tools discovery & recommendation platform
- **Catalog:** 435 curated tools

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Flask, SQLAlchemy, Flask-Login, Flask-Migrate, marshmallow, scikit-learn, gunicorn |
| Frontend | React (Vite) + Tailwind CSS, built into `static/dist/` |
| Database | PostgreSQL on Render free tier (**expires May 5 2026** → migrate to Supabase or Neon.tech before then) |
| Deployment | Render free tier, auto-deploys from `main` branch |
| Data source | `data/tools.json` — **this is the source of truth, NOT the DB** |

---

## Absolute Rules (Never Break These)

1. **Read `.github/copilot-instructions.md` first** in every Copilot session.
2. **Run `python -m py_compile`** on every changed `.py` file before pushing.
3. **Run `npm run build`** inside `frontend/` before every push — never push if build fails.
4. **Never `git add -A` and push blindly** — always check `git diff --cached --stat` first to ensure no `__pycache__/`, `*.pyc`, or `node_modules/` are included.
5. **`tools.json` is source of truth** — never query the DB for tool counts or tool lists.
6. **Search: never hard-filter by category** — only soft boost. Hard category gate is only in the wizard recommender.
7. **`SEARCH_INDEX` is built once at startup** — never rebuild per request.
8. **One focused task per session** — never combine unrelated features.

---

## Architecture Notes

### Backend
- `app/__init__.py` — `create_app()` runs `flask db upgrade` then `db.create_all()` on every deploy (no Render shell needed for migrations on free tier).
- `app/tool_cache.py` — builds `SEARCH_INDEX` and `TOOL_CACHE` at startup from `tools.json`.
- `app/api_routes.py` — all API endpoints, imports `Review` model (critical — missing import causes 500 on reviews routes).
- `app/models.py` — `User`, `Favorite`, `Rating` (unique per user+tool), `Review` (unique per user+tool).
- `app/ml_recommender.py` — ML recommendation engine.

### Frontend
- Entry: `frontend/src/`
- Key pages: `HomePage.jsx`, `DirectoryPage.jsx`, `ToolDetailPage.jsx`, `ToolFinderPage.jsx` (wizard), `AdminPage.jsx`
- Key components: `RatingWidget.jsx`, `ReviewsSection.jsx`
- Build output: `static/dist/` (committed to repo, served by Flask)

### Database Tables (confirmed in production)
`users`, `favorites`, `ratings`, `reviews`

---

## Current Feature Status

| Feature | Status | Score |
|---------|--------|-------|
| Search quality | ✅ Working | 85/100 |
| ML Recommender | ✅ Working | 80/100 |
| Ratings & Reviews | ✅ Working, persisting to PostgreSQL | 90/100 |
| Auth (login/register/delete account) | ✅ Working | — |
| Favorites (auth-gated) | ✅ Working | — |
| AI Stack page (auth-gated) | ✅ Working | — |
| Admin panel (stats, users, retrain) | ✅ Working | 70/100 |
| Frontend polish | 🟡 In progress | 75/100 |
| Mobile | 🟡 Partial | 75/100 |
| **Logos (emoji rendering)** | 🟢 **RESOLVED** | 90/100 |

---

## 🟢 RESOLVED: Broken Logos

**Symptom:** All tool logos previously showed as `ðŸ¤–` mojibake instead of correct emojis.

**Root cause:** Flask serializing emoji as escaped ASCII in JSON responses and source logo data carrying mojibake.

**Four-part fix:**

### Fix 1 — `app/__init__.py`
After `app = Flask(...)` in `create_app()`, add:
```python
app.config["JSON_AS_ASCII"] = False
```

### Fix 2 — `app/tool_cache.py`
Every `open()` call reading `tools.json` must have `encoding="utf-8"`:
```python
open("data/tools.json", encoding="utf-8")
```

### Fix 3 — `app/api_routes.py`
Same as Fix 2 — add `encoding="utf-8"` to every `open()` reading `tools.json`.

### Fix 4 — Create `frontend/src/components/ui/ToolLogo.jsx`
- Primary: Google favicon service (`https://www.google.com/s2/favicons?domain=<domain>&sz=64`)
- Secondary: DuckDuckGo icon service (`https://icons.duckduckgo.com/ip3/<domain>.ico`)
- Tertiary: First letter of tool name in a styled div
- Import and use `<ToolLogo>` in: `HomePage.jsx`, `DirectoryPage.jsx`, `ToolDetailPage.jsx`, `ToolFinderPage.jsx`

**Implementation note:** Logos: Google favicon service via ToolLogo.jsx component

**Commit message:** `fix: utf8 emoji logos and clearbit logo component`

---

## 🟡 Medium Priority Issues

### 1. Admin Panel — Missing Reviews/Ratings Management
- Add `GET /api/v1/admin/reviews` route
- Add `DELETE /api/v1/admin/reviews/<id>` route
- Add `DELETE /api/v1/admin/ratings/<id>` route
- Add Reviews tab to `AdminPage.jsx` with delete buttons

### 2. Wizard "Why this?" Button Inconsistency
- Some cards show "Hide", some show "Why this?" — should always be "Why this?" toggling explanation inline
- Fix in `frontend/src/pages/ToolFinderPage.jsx`

### 3. Wizard Tool Cards — No Navigation
- Clicking tool name/logo should navigate to `/tools/:slug`
- "Open Tool" button should open external URL in new tab
- Fix: add `onClick={() => navigate('/tools/${tool.slug}')}` to card header

### 4. Related Tools Always Empty
- "No related tools found" shown for all tools
- Fix: find tools with matching tags or same category in `GET /api/v1/tools/<slug>` in `api_routes.py`

---

## 🟢 Lower Priority (Post-LinkedIn Post)

- Claude logo wrong on featured tools (homepage)
- Admin category breakdown shows old category names
- Collections "Top Rated" — use real DB ratings, not `tools.json` rating field
- Full SEO pages per tool
- Email newsletters (Resend integration)
- Affiliate links with UTM/tracking params
- Pro tier (Stripe)
- Browser extension
- Migrate PostgreSQL from Render to Supabase (before May 5 2026)

---

## Product Roadmap (4 Phases)

| Phase | Focus |
|-------|-------|
| 1 | Polish + SEO |
| 2 | Traffic + Community |
| 3 | Monetization (affiliate links, Pro tier) |
| 4 | Scale (public API, browser extension) |

---

## Deployment Info
- Render free tier spins down after inactivity — **UptimeRobot ping** keeps it alive
- Auto-deploy on push to `main`
- No Render shell access on free tier — all DB migrations handled via `create_app()` startup

---

## Workflow for Every Session
```
1. Read .github/copilot-instructions.md
2. Identify ONE task only
3. Make changes
4. python -m py_compile <all changed .py files>
5. cd frontend && npm run build && cd ..
6. git diff --cached --stat  (verify no junk files)
7. git commit -m "<type>: <description>"
8. git push origin main
```
