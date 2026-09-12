# Affiliate programs — enrolled, verified-open, and verified-closed

**All statuses below were checked against each program's own page on 2026-09-12.**
Nothing is listed on reputation or on an affiliate-directory site's say-so: those
directories keep dead programs listed for years, which is how Notion — closed to
new applicants — ends up recommended everywhere. Re-verify before a batch of
applications; a quarter is long enough for a program to close quietly.

**Interactive board:** <https://claude.ai/code/artifact/9d049683-9638-448b-b1d7-9eb2f796e66c>
— the same shortlist grouped by which affiliate network we already hold a
login on, with a per-program applied/approved tick that the page remembers.
Use the board to work through applications; keep this file as the record of
what actually landed.

Two rules this whole file sits under:

1. **An affiliate link never changes a ranking.** The registry is read at
   redirect time only. Nothing in `_placement_rank()` or the curation score
   can see it, and it must stay that way.
2. **A listed coupon must be a code the program actually issued us.** A dead
   code typed at a checkout costs the reader's trust at the worst possible
   moment. Remove an entry the day the program retires it.

## Enrolled now — 7 programs, 8 slugs

| Tool | Network | Terms | Coupon |
|---|---|---|---|
| Sudowrite | in-house | — | — |
| ElevenLabs | PartnerStack | — | — |
| Screenpipe | Dub | 25% of first paid transaction | — |
| Jenni AI | Rewardful | 30% of payments in first 6 months | — |
| SciSpace / Typeset | Rewardful | 10% of first payment (1 month window) | — |
| Taskade | FirstPromoter | 20% recurring | — |
| Paperpal | LinkMink | 30% of every sale | `PAP20` — 20% off |

Source of truth is `app/affiliates.py`. The count and the live roster also
render on **Admin → Analytics → Affiliate programs**, which flags any link
that exists only on a catalog row (`catalog-only`) so it can be moved into
the registry where it is visible to whoever reads the code next.

## Verified open — apply to these

Every tool here is already in `data/tools.json` with no affiliate link, so the
clicks it earns today are being given away for free.

### Tier 1 — verified open, and the same audience our best pages already serve

| Tool | Network | Terms (as published) | Why it's an easy yes |
|---|---|---|---|
| [QuillBot](https://quillbot.com/affiliates) | PartnerStack | 10% monthly / 15% semi-annual / 20% annual, 30-day cookie | Self-serve signup; paraphrasing is the exact Jenni/Paperpal audience |
| [Grammarly](https://www.grammarly.com/affiliates) | Impact | $20 per premium sale, $0.20 per free reg, 90-day cookie | Our Impact account is already verified (the meta tag is landed); 1–5 business day review |
| [Gamma](https://help.gamma.app/en/articles/11048092-how-do-i-join-the-gamma-affiliate-program) | PartnerStack | **30% recurring for 12 months, 90-day cookie** | Actively recruiting; the 90-day cookie is the best on this list |
| [Otter.ai](https://openaffiliate.dev/programs/otter-ai) | Impact | 15–20% of first year, 30-day cookie | Same Impact account; needs a productivity/education presence, which we are |
| [Synthesia](https://synthesia.getrewardful.com/signup) | Rewardful | 25% for 12 months (Starter/Creator), 60-day cookie | Same network as Jenni and SciSpace — one existing login |
| [beehiiv](https://partners.dub.co/beehiiv) | **Dub** | 50% for 12 months, tiering to 60%, 60-day cookie | Same network as Screenpipe, so the account already exists. Highest rate on this list |

### Tier 2 — verified open, softer fit or smaller payout

| Tool | Network | Terms | Note |
|---|---|---|---|
| [Canva](https://www.canva.com/affiliates) | Impact | Up to $36/annual sale; 80% of first 2 months monthly | Now the "Empower Canvassador" program; 2–5 day review |
| [Coursera](https://getlasso.co/affiliate/coursera) | Impact | 20% on courses, up to 45% on Plus/Specializations | Courses category; same Impact account |
| [n8n](https://n8n.io/affiliates/) | in-house | 30% of cloud referrals for 12 months | Self-serve. **No paid ads allowed** — breaking that removes you |
| [Opus Clip](https://www.opus.pro/affiliate) | in-house | 25% recurring for 12 months, 60-day cookie | 1-minute application form |
| [Submagic](https://www.submagic.co/affiliate) | in-house | 30% recurring, lifetime | Creator audience |
| [HeyGen](https://www.heygen.com/en-in/affiliate-program) | Rewardful | 35% first 3 months (published rate; some sources say 20%/12mo) | Terms vary by source — confirm the rate in the dashboard before quoting it |
| [Writesonic](https://www.rewardful.com/saas-affiliate-programs/writesonic) | FirstPromoter | 30% lifetime recurring, $50 min payout | Same network as Taskade |
| [Descript](https://www.descript.com/affiliate) | in-house | $25 flat per new subscriber | ~1 week review; flat fee, not recurring |
| [Miro](https://www.way2earning.com/2026/08/miro-affiliate-program/) | PartnerStack | $10–$40 per qualified signup | Same network as ElevenLabs |
| [Cursor](https://openaffiliate.dev/programs/cursor) | in-house | 20% recurring, 60-day cookie | Highest-value coding tool in the catalog that has any program at all |

## Verified CLOSED or non-existent — do not apply

Checked on 2026-09-12. These are the ones affiliate directories will keep
recommending anyway.

| Tool | Finding |
|---|---|
| **Notion** | **Closed.** notion.com/affiliates: "⚠️ Program is currently not accepting new affiliates." Applications are auto-declined; they keep your details for a possible relaunch. No timeline. |
| **Leonardo.ai** | **Closed 2026-04-07.** Their help centre: "The Affiliate Program closed on April 7 2026 and no new applications are being accepted." |
| **DeepL** | No public affiliate program. The "partner program" is a B2B reseller form, not commission-based. |
| **Scribbr** | No affiliate program found. Search results for it return **Scribendi** and **Scribd**, which are different companies — an easy and costly mix-up. |
| **ChatPDF** | No program found on their own site; only third-party directories claim one. Treat as non-existent until they publish terms. |
| **Ideogram, CapCut, Flux** | No published affiliate program as of this check. |
| **Midjourney, Turnitin, Zotero, Elicit, Consensus, Research Rabbit** | No program, or free/academic-licensed with nothing to commission. |
| **Figma, Framer, Replit** | No public affiliate program found. Do not wait on these. |

## Enrolling a program (the whole checklist)

1. Add the slug → URL to `AFFILIATES` in `app/affiliates.py`, with a comment
   naming the network, the join date and the commission terms.
2. Mirror the URL onto the catalog row's `affiliate_url` in `data/tools.json`
   as a belt-and-braces fallback.
3. If the program issued a reader discount, add it to `COUPONS` in the same
   file. It renders under the "Visit Tool" button with the commission
   disclosure — no migration, no catalog field.
4. Rebuild the frontend (`cd frontend && npm run build`) and commit
   `static/dist` — `build.sh` does not build it for you.
5. Check **Admin → Analytics → Affiliate programs** after deploy: the count
   should have gone up by one and the tool should show its coupon chip.
6. Move the row from "Verified open" to "Enrolled now" in this file.
