# Outreach campaign: what to look out for next

Written 2026-09-15, the day the q3_qualified_b2b budget jam was fixed and the
first revenue-asking emails went out. For whoever runs this campaign next —
including a future session picking it up cold.

## Where things stand

| | |
|---|---|
| Companies contacted | 44 of a 90 budget |
| Emails sent | 89 (44 first touches + 45 follow-ups) |
| Approved, waiting to send | 27 |
| In draft_ready, not yet reviewed | 54 |
| Rejected at the gate | 138 |
| Verified revenue since 09-03 | **$0** |
| Deadline | 2026-09-25 |

The campaign spent 09-10 to 09-15 unable to send, because the budget counted
emails instead of companies (see `campaign_sends_used`). That is fixed. At
14:25 on 09-15 the cron sent 10 initial emails, inbound pool first — Execlave,
Doc Translator, CodexGuide, HtmlSlides, LoupeKit, SummarizeVideoToText,
Kuberns. Those seven are the **first emails this campaign has ever sent that
ask anyone to pay**, and nothing is yet known about whether they work.

## 1. Did the seven upgrade pitches convert?

This is the only question that matters. Everything else in this document is
plumbing.

Of 89 emails sent before 09-15, **zero** mentioned money — the cold email is
forbidden from stating a price (HARD CONSTRAINTS in the Gemini prompt), so the
inbound pool's upgrade pitch is the entire revenue mechanism. It has now been
tried seven times and never before that. A $0 result so far is therefore not
evidence that the pitch fails; it is evidence that it had not been sent.

Watch verified payments and `converted_submissions` in the campaign status
endpoint. If seven upgrade pitches produce nothing, that is the first real
signal about the offer itself, and it is worth more than another 50 cold sends.

## 2. Do not read the reply meter as a measurement

`OutreachCandidate.status == 'replied'` is set **by hand in the console**.
Nothing parses inbound mail. A campaign nobody has triaged reports zero replies
no matter what actually happened — on 09-15 it read 0/79 while two contacted
founders had already come back and submitted.

`replied_is_manual: true` is in the status payload so the console can say which
it is. `converted_submissions` is the measured number; it matches on email and
only counts submissions made *after* first contact, so it is a deliberate
floor, never a flattering one.

## 3. Does the approved queue actually drain?

27 approved, 20/day, so it should be empty by ~09-17 and `companies_contacted`
should climb 44 → ~71. If it stalls instead, the cause is a gate, not a
mystery: `can_send_candidate()` returns a reason string for every refusal, and
the Rejected-at-gate view groups them. The usual suspects are a stale
`draft_template_version`, an inbound listing that will not resolve, and the
15-day upgrade ripen gate below.

## 4. The budget will bind again, on purpose

90 is a ceiling, not a target. 44 contacted + 27 approved = 71. Approving
roughly nineteen of the 54 draft_ready rows reaches it again.

When it does, that is the cap working. Raise it as a decision — how many
companies are we willing to approach — not as a reflex to unblock a queue.
`OUTREACH_CAMPAIGN_SEND_BUDGET`.

## 5. Deliverability is now the live risk, not throughput

Daily pace went 10 → 20 on 09-15. This From address has sent ~99 emails since
09-03 and peaked at 21 in a day, so 20 is about one doubling of known-good
volume. It was deliberately not set to 37+ — that is ~4x peak on a domain
twelve days into sending, and the thing it would put behind a spam filter is
the upgrade pitch, the only email here that earns.

If bounces or complaints climb, lower `OUTREACH_CAMPAIGN_DAILY_MAX`. It is an
env var; no deploy needed. The shared Resend budget leaves ~40/day after the
digest's 50, so 20 is not near that ceiling.

## 6. The ripen gate strands the leads this campaign wins

`UPGRADE_MIN_DAYS_LIVE` is 15 days. A founder who submits *because of* a cold
email cannot be sent an upgrade pitch for a fortnight. Statable and CampfireSMS
were both won in the first window and ripen 09-29 and 09-28 — **after the
09-25 deadline**.

So the campaign can win free listings and still be structurally unable to
monetize them inside its own window. Extending the deadline does not fix this;
it moves it. The real options are a shorter gate or a longer window, and the
gate's reasoning is sound (do not ask someone to pay for traffic they cannot
judge yet), so this is a judgement about how long a founder actually needs —
not a counter to fix. **Still undecided.**

## 7. Two counters, and they must stay different

- `campaign_sends_used()` counts **distinct companies**. It backs the lifetime
  budget, which is a budget on reach. A follow-up reaches nobody new.
- `campaign_sends_today()` counts **every email**, follow-ups included. It
  backs the daily pacing cap, which protects sender reputation — and a
  follow-up burns that exactly as hard as a first touch.

Unifying these looks like cleanup and is the original bug. Counting rows in the
budget is what produced 79/45, jammed the campaign for five days, and blocked
every upgrade pitch that ripened in that window. There are regression tests
named after it; if one starts failing, read it before changing it.

Related: follow-ups must keep checking `campaign_daily_remaining()`. They
counted against that cap without checking it, so they could only overrun it —
21 went out against a cap of 10 on 09-12, which then refused that day's initial
sends.

## 8. Initial sends run before follow-ups

In the cron's `send` phase. Both halves draw on the same bounded daily cap, so
whichever runs first gets the day. Ordered the other way, a third touch to a
cold lead that ignored two outranks a first touch to a warm lead that asked to
be listed. There is a test asserting the order.

## 9. Two things about this repo, not the campaign

**`SECURITY_AUDIT.md` is untracked but NOT in `.gitignore`.** The repo is
public. It has stayed out of four commits only because each one was staged by
name. One `git add -A` publishes it.

**More than one agent pushes to `main`.** During the 09-15 session a commit
(`f2880a5a`, category pages + a dist build) landed from another session
mid-task. Nothing collided, but check `git log` before assuming the tree is
yours.

## Deploy note

`build.sh` does not build the frontend. A change under `frontend/` needs
`npm run build` and a committed `static/dist` to actually reach production.
