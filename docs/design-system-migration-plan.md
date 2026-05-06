# Design System Migration — Saturday Execution Plan

**Branch:** `feature/design-system-port`  
**Created:** 2026-05-06 Wed  
**Execute:** Sat 2026-05-09  
**Target merge to main:** before May 14

## Status as of today

- ✅ Foundation tokens added to `index.css` and `tailwind.config.js` (commit `17d8e1e`)
- ✅ Dark mode reconciled to `data-theme` attribute strategy (commit `cac1f48`)
- ✅ Flash-of-wrong-theme prevention script in `index.html`
- ✅ OS dark mode auto-detect on first visit
- ✅ Verified: dark mode toggle works, persists across reload, no visual regression
- ✅ Footer component built and added globally (commit `[FILL IN AFTER COMMIT]`)

## What Saturday's session does

Migrate every component and page to consume the new tokens. The visual outcome 
is the entire app shifting from indigo+grays to the teal-green+warm-paper 
palette from the saved design.

## Build order (small to large, low risk to higher risk)

### Phase 1 — Migrate Navbar (1.5 hours)
Visual color migration only — DO NOT restructure Navbar.
- Replace `bg-white dark:bg-gray-950` with `bg-bg` everywhere
- Replace indigo references with `bg-accent` / `text-accent-ink`
- Add mobile hamburger menu (current navbar has none) — see saved design 
  HTML for the hamburger pattern; theme already wires through `data-theme`
- Test: theme toggle still works, all dropdowns work, search input works, 
  auth section (Login/Register or profile dropdown) works
- Test on every page (each page renders the navbar)

### Phase 2 — Migrate utility components (~1 hour)
- `Card.jsx` — used by ToolDetailPage, DashboardPage, DirectoryPage, 
  CollectionPage. Migrate carefully — multiple consumers.
- `SkeletonCard.jsx` — used in same places
- `Badge.jsx`, `Button.jsx`, `RatingWidget.jsx` — migrate as needed
- `LoadingSpinner.jsx` — color tweaks
- `ToolLogo.jsx` — verify
- `ParticleBackground.jsx` — DELETE (no longer used; new homepage doesn't have starfield)
- `GuidesSection.jsx` — migrate, but ALSO remove from HomePage (homepage redesign drops it)

### Phase 3 — Build new HomePage components (2 hours)
- DELETE the old `HomePage.jsx` content (Featured Tools, Browse by Category, 
  How it works sections all go)
- Create `frontend/src/components/home/` folder
- Build: `Hero.jsx`, `WizardDemo.jsx`, `CurationDiscipline.jsx`, `SunoStory.jsx`, `FinalCTA.jsx`
- Replace HomePage.jsx body with the 5 new components in sequence
- Update Helmet meta:
  - Title: "AI Compass — Hand-curated AI tools for students"
  - Description: "Hand-curated AI tool finder for students. Answer 4 questions, get 5–6 tools picked for your situation, each with a reason. Free, no login required."
- Note: WizardDemo is HARDCODED — static illustration, not connected to backend

### Phase 4 — Migrate remaining pages (1.5 hours)
For each, replace `bg-gray-*`, `text-gray-*`, `border-gray-*`, `bg-indigo-*`, 
`text-indigo-*` with new tokens:
- `ToolFinderPage.jsx`
- `ToolDetailPage.jsx`
- `DirectoryPage.jsx`
- `CollectionPage.jsx`
- `DashboardPage.jsx`
- `ProfilePage.jsx`
- `SubmitPage.jsx`
- `Login.jsx`, `Register.jsx`
- Listicle pages: `BestAIToolsForStudents.jsx`, `BestFreeAITools.jsx`

### Phase 5 — Cleanup (30 min)
- Update Toaster styling in `main.jsx` (currently hardcoded indigo)
- Remove the stale `--accent` references in `App.css` if it's truly unused
- Run `npx eslint .` to catch any unused imports from deletions

## Test checklist (before merge to main)

- [ ] Dev server runs without errors
- [ ] Every page renders in light mode without console errors
- [ ] Every page renders in dark mode without console errors
- [ ] Theme toggle works on every page
- [ ] Mobile (380px width) renders correctly on every page
- [ ] Mobile hamburger opens, all links work, theme toggle accessible
- [ ] All routes click through correctly from new homepage
- [ ] No flash of wrong theme on reload
- [ ] OS dark mode honored on fresh visit
- [ ] Test on actual phone via local IP (not just DevTools)
- [ ] Wizard flow still works end-to-end (the actual /ai-tool-finder page)
- [ ] Auth flow still works (login, register, dashboard, logout)

## Things explicitly NOT doing in Saturday's session

- No new framer-motion animations on new homepage components
- No connecting WizardDemo to live backend
- No creating Privacy/Terms/Team/Contact stub pages (separate task next week)
- No removing the unused `brand-*` tokens from tailwind.config.js (they're harmless)
- No backend changes
- No SEO changes beyond Helmet copy update
- No analytics changes
- No anything else not on this list

## Risks I know about

- **Adaptive max-width tokens** in index.css use `--adaptive-max-*` — these 
  override Tailwind's `max-w-*` utilities. New design's spacing might want 
  different containers. If layout looks weird on portrait viewports, suspect 
  these.
- **dist/ staleness** — repo has built `dist/` at root. Always test against 
  `npm run dev` not the static prod build.
- **Stale --accent references in App.css** — App.css is dead code (not imported 
  anywhere) but if it ever gets imported, it'll consume the new accent variable. 
  Either delete App.css or make sure it stays unused.
- **react-helmet-async wrapper** — confirmed working in main.jsx. New pages 
  using `<Helmet>` should just work.

## If running out of time on Saturday

If at any point Saturday it becomes clear all 5 phases won't fit:
1. Phase 1 (Navbar) must complete — every page depends on it
2. Phase 2 (utility components) — second priority
3. Phase 3 (new homepage) is the headline win — third priority
4. Phase 4 (remaining pages) can defer to Sunday if Saturday runs long
5. Phase 5 (cleanup) is genuinely optional — can defer to next week

DO NOT merge to main with phases incomplete. The branch can sit half-done; 
it's the merge that's the commitment.

## Open questions for Sunday review

- [ ] Did mobile hamburger work correctly in the wild?
- [ ] Did the new homepage move wizard click rate? (Check PostHog Tuesday)
- [ ] Anything in Saturday that taught me something — write it here.