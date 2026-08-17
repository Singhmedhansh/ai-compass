# PostHog Self-driving Setup Report

**Project:** AI Compass (`ai-compass.in`) — PostHog project 405242  
**Date:** 2026-07-30  
**Inbox:** https://us.posthog.com/project/405242/inbox

## Summary

PostHog Self-driving is fully configured for AI Compass. Session Replay, Error Tracking, Support, GitHub Issues, and Health Checks signal sources are active; GitHub is connected and issues from `Singhmedhansh/ai-compass` are syncing into the warehouse; five scouts are running. Findings will start appearing in the [Self-driving inbox](https://us.posthog.com/project/405242/inbox) within approximately 30 minutes.

---

## AI Data Processing

Approved at the organization level (enforced by the wizard before this run started).

---

## GitHub

| Item | Status |
|---|---|
| GitHub App integration | Already connected (integration ID 194852, account: Singhmedhansh) |

---

## Products Enabled

The `products-enable` MCP tool was not available in this environment. All three products are confirmed active via server-side evidence. The `posthog.init` call in `frontend/index.html` has `capture_exceptions: true` and no `disable_session_recording` override — the server flips take effect cleanly.

| Product | Status | Notes |
|---|---|---|
| Session Replay | Already active | Recordings exist; no init override |
| Error Tracking | Already active | 16+ error issues exist; `capture_exceptions: true` in init |
| Support (Conversations) | Already active (source row present) | Tickets arrive only once an inbound channel is connected — see Follow-ups |

---

## Signal Sources

All sources were already enabled from a prior setup run. No new rows were created in this run.

| source_product | source_type | Action |
|---|---|---|
| `health_checks` | `health_issue` | Already enabled (ID `019fb3c1-0743-737d-a687-2257ec468c1e`) |
| `error_tracking` | `issue_created` | Already enabled (ID `019fb3c1-0b23-7adc-9b08-82527a7acb5f`) |
| `error_tracking` | `issue_reopened` | Already enabled (ID `019fb3c1-0eaa-76fe-b714-58587bbbee47`) |
| `error_tracking` | `issue_spiking` | Already enabled (ID `019fb3c1-139f-7bc0-9255-ae638903a399`) |
| `session_replay` | `session_analysis_cluster` | Already enabled (ID `019fb3c1-1902-7801-afef-8ed82ad1fdac`) |
| `conversations` | `ticket` | Already enabled (ID `019fb3c1-1d6e-759c-af50-6cd2b0d0e96a`) |
| `github` | `issue` | Already enabled (ID `019fb3c6-ecc5-76a2-b090-335261191abb`) |
| `signals_scout` | `cross_source_issue` | ON by default — no config row needed |

---

## Connected Tools

| Tool | Status |
|---|---|
| GitHub Issues (`Singhmedhansh/ai-compass`) | **Already connected** — warehouse source ID `019fb3c6-d64e-0000-6353-6558a72e5a30`, `issues` table syncing (incremental, status: Completed, 1 row). Additional tables (pull requests, reviews, etc.) can be enabled in PostHog → Data Management → Sources. |
| Sentry | Not used — not picked in connected-tools step |
| Linear | Not used — not picked |
| Jira | Not used — not picked |
| Zendesk | Not used — not picked |

---

## Scout Troop

**Budget:** 100 runs/day (early access), 3 used today, 97 remaining. Max 3 runs per tick.  
**Banner:** "Scouts are in early access. Each project gets up to 100 scout runs a day. Contact team-self-driving@posthog.com if you need more."

### Changes made in this run

| Scout | Action | Reason |
|---|---|---|
| `signals-scout-surveys` | **Disabled** | No evidence of PostHog surveys in use (profile unavailable, no surveys probed) |
| `signals-scout-observability-gaps` | **Enabled** | Growing product with many routes and events; surfaces significant event volumes with no insight/dashboard/alert coverage |

### Enabled (5 scouts)

| Scout | Reason |
|---|---|
| `signals-scout-general` | Always on — sweeps cross-product correlations and uncovered surfaces |
| `signals-scout-product-analytics` | Active custom events (`onboarding_completed`, `onboarding_skipped`, `wizard_completed_survey_trigger`, `tool_card_clicked`) track core user journeys |
| `signals-scout-web-analytics` | High-traffic AI directory with heavy SEO focus; session volume and landing-page health are critical |
| `signals-scout-web-vitals` | SEO-critical student-facing site — Core Web Vitals directly affect search ranking |
| `signals-scout-observability-gaps` | 400+ tools, many routes, growing event taxonomy — surfaces events with no insight coverage |

### Disabled (22 scouts)

| Scout | Reason |
|---|---|
| `signals-scout-error-tracking` | Covered by native `error_tracking` sources (intentional — not a re-enable candidate) |
| `signals-scout-session-replay` | Covered by native `session_replay` source (intentional — not a re-enable candidate) |
| `signals-scout-surveys` | No confirmed survey usage |
| `signals-scout-ai-observability` | No `$ai_*` events or LLM SDK instrumented yet |
| `signals-scout-anomaly-detection` | Not in top surfaces |
| `signals-scout-apm` | No distributed tracing / OpenTelemetry configured |
| `signals-scout-conversations` | Support not yet connected to an inbound channel |
| `signals-scout-csp-violations` | No CSP reporting configured |
| `signals-scout-customer-analytics` | No B2B group/accounts analytics |
| `signals-scout-data-pipelines` | No CDP destinations or batch exports |
| `signals-scout-data-warehouse` | One source (GitHub Issues) just connected; general scout surfaces warehouse gaps |
| `signals-scout-experiments` | No active A/B experiments |
| `signals-scout-feature-flags` | No confirmed heavy PostHog feature flag usage |
| `signals-scout-health-checks` | Covered by native `health_checks` / `health_issue` source |
| `signals-scout-inbox-validation` | Fresh setup — no shipped fixes to validate yet |
| `signals-scout-insight-alerts` | Not in top surfaces |
| `signals-scout-logs` | PostHog logs product not in use |
| `signals-scout-mcp-tool-calls` | Not relevant to product monitoring |
| `signals-scout-replay-vision` | No Replay Vision scanners configured |
| `signals-scout-revenue-analytics` | No payment SDK or revenue data |
| `signals-scout-skills-store` | Not relevant to product monitoring |
| `signals-scout-tasks` | Not in top surfaces |

To re-enable a scout later, go to [PostHog → Self-driving inbox](https://us.posthog.com/project/405242/inbox) and toggle its config. To switch a noisy scout to dry-run (runs but writes nothing), set `emit: false` on its config.

---

## Custom Scouts

Two scouts were proposed based on confirmed event evidence in this repo:

- **AI Tool Finder engagement** — watch the ratio of `tool_card_clicked` to `wizard_completed_survey_trigger` for drops indicating the finder is returning bad results or breaking. Discriminator: clicks-per-completion vs 7-day rolling average.
- **Onboarding health** — watch `onboarding_completed` vs `onboarding_skipped` (with `at_step` breakdown) for rising skip rates. Discriminator: 7-day completion rate vs prior period.

Both were **declined** — the built-in troop covers this project for now.

Surfaces considered and ruled out:
- **Compare feature** (`ComparePage`/`CompareTray`): no confirmed PostHog capture events found
- **Auth flow** (`LoginPage`/`RegisterPage`): Clerk-managed auth, no confirmed PostHog event names beyond `identify` calls
- **Tool submission** (`/submit`): no confirmed capture events in source
- **Sentry backend errors**: a warehouse source connection follow-up, not a custom scout surface

To add custom scouts later: use the `authoring-scouts` skill in your PostHog skills store, or re-run this setup.

---

## Follow-ups

- [ ] **Verify products in PostHog settings** — the `products-enable` tool was unavailable. Session Replay and Error Tracking appear active from evidence; confirm they are ON in Settings if needed. Enable Support/Conversations via the product sidebar if not already enabled.
- [ ] **Connect a support inbound channel** — go to PostHog → Support to connect an email, inbox, or Slack channel. The Conversations responder is enabled and will route tickets to the inbox automatically once a channel is connected. Then re-enable `signals-scout-conversations`.
- [ ] **Connect Sentry for backend errors** — `sentry-sdk==2.55.0` is in `requirements.txt` (Python/Flask backend). Connect it at [New data warehouse source](https://us.posthog.com/project/405242/pipeline/new/source) so Python exceptions reach Self-driving alongside frontend errors.
- [ ] **Enable more GitHub Issues tables** — only the `issues` table is syncing. Add pull requests, reviews, or comments in [PostHog → Data Management → Sources](https://us.posthog.com/project/405242/data-management/sources).
- [ ] **Enable `signals-scout-feature-flags`** if you start using PostHog feature flags actively.
- [ ] **Enable `signals-scout-experiments`** if you run A/B experiments.
- [ ] **Enable `signals-scout-ai-observability`** if you add `$ai_*` event tracking — this project uses vector search and ML on the backend, so this may become relevant soon.
- [ ] **Enable `signals-scout-surveys`** if you start using PostHog surveys.
- [ ] **Enable `signals-scout-logs`** if you start using the PostHog logs product.

---

## What Happens Next

The scout coordinator picks up fresh configs within ~30 minutes; scout runs draw from the project's daily budget (100 runs/day during early access). Findings cluster into reports in the inbox at https://us.posthog.com/project/405242/inbox — immediately-actionable ones can automatically start coding tasks against this repo (`Singhmedhansh/ai-compass` is connected via GitHub).

To request more scout runs: team-self-driving@posthog.com.
