# What counts as success

Written 2026-09-12, from the 30-day funnel that prompted workstreams A–E.

## The numbers that started this

| Stage | Users | % of visitors |
|---|---|---|
| Visitors | 7,081 | 100% |
| Started the wizard | 450 | 6.4% |
| Completed the wizard | 194 | 2.7% |
| Clicked a tool card | 250 | 3.5% |
| Submitted the feedback survey | 5 | 0.07% |
| Rage-clicked | 65 | 0.9% |

Two things in that table are easy to read wrongly.

**Tool clicks (250) exceed wizard completions (194).** The wizard is *a* path
to value, not the definition of it. Someone who reads `/best-free-ai-tools`,
finds a tool and clicks through was helped, and no wizard was involved.
Treating completion as the only success metric writes off the majority of the
people the site already works for.

**The survey is not a weak signal, it is a broken instrument.** Five responses
cannot support a decision about 7,081 people. It has been retired as a
success measure — see Workstream D. Do not reinstate it by quoting the
response count as evidence of anything.

## The two goals

Two metrics, deliberately, because one would force the wrong trade-off.

**Assisted discovery** — a visitor clicked through to a tool.
Baseline 3.5%, target 8%.
The broad measure: did this person leave with something?

**Deep engagement** — a visitor completed the wizard.
Baseline 2.7%, target 5%.
The narrow measure: did the guided path work for those who chose it?

A change that lifts completion by making the site harder to use without the
wizard has not succeeded. Both numbers move, or the trade is refused.

## Where each number comes from

| Metric | Source | Notes |
|---|---|---|
| Visitors | PostHog `$pageview` | denominator for both rates |
| Wizard starts | PostHog `wizard_started` | carries `source`; `deeplink` means the answer came from an SEO page, not a cold start |
| Wizard completions | PostHog `wizard_completed` | same `source` split |
| Where people stop | PostHog `wizard_abandoned` | `last_step_number`, `answered_count`, `seconds_on_step` |
| Inline SEO answers | PostHog `seo_inline_wizard_answer` | Workstream B, split by `source` page |
| Tool clicks | PostHog `tool_click` | explicit event, **not** autocapture — see below |
| People helped | `outbound_clicks`, admin analytics `helped_last_30d` | distinct bot-filtered clients |

### Two traps

**Do not measure tool clicks with autocapture.** The original 250 came from
PostHog matching the DOM, which stops matching the moment a card is restyled —
the metric would fall to zero and look like a product regression. `tool_click`
is emitted by a delegated listener on every `/go/` link
(`utils/toolClickTracking.js`), so restyling cannot break it.

**Do not compare `tool_click` and `helped_last_30d` as if they measure the
same thing.** The browser event counts clicks including bots; the server
figure counts distinct clients and excludes flagged bots. A persistent gap
that suddenly widens usually means clicks firing that the `/go/` redirect
never logged, which is worth investigating on its own.

**Never quote a raw `outbound_clicks` count to anyone outside the project.**
`is_bot` is NULL on rows written before flagging existed, and NULL means
unknown, not human. Use the `human_*` figures. The admin overview shows raw
and filtered side by side precisely so the gap stays visible.

## Reading the workstreams against this

A and B target assisted discovery — they attack the 93.6% who never engage.
C targets deep engagement — the 57% who start the wizard and stop.
D fixed how both are measured.

Judge each on the metric it aimed at. In particular, the `source: 'deeplink'`
split exists so A cannot flatter the completion rate: an arrival that was
already three-quarters answered on an SEO page is not the same event as
someone working through the wizard cold, and the two must not be pooled when
deciding whether C worked.
