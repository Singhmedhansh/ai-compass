# Ops runbook

Short, opinionated notes for keeping ai-compass.in alive without
having to remember anything next month.

## 1. Health endpoints

| URL | What it checks | Use it for |
| --- | --- | --- |
| `https://ai-compass.in/healthz` | Process is up, replies 200 | Cheap liveness probes (every 1 min) |
| `https://ai-compass.in/health`  | DB reachable + tools cache populated | Deeper checks (every 5 min) — use this for UptimeRobot |

`/health` returns JSON: `{"status":"ok","checks":{"database":"ok","tools_cache":"ok"},"timestamp":"…"}`. UptimeRobot can be told to treat any response that does *not* contain the string `"status":"ok"` as DOWN, even if the HTTP status is 200 — that catches degraded states (DB up, but cache empty) the way a plain status-code monitor wouldn't.

## 2. Uptime monitoring (UptimeRobot free tier)

UptimeRobot's free plan covers 50 monitors at 5-minute intervals with email alerts to up to 10 addresses. More than enough for one site.

**One-time setup (~5 min):**

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (Google sign-in works).
2. Dashboard → **+ New Monitor**.
3. Configure:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `ai-compass.in production`
   - **URL:** `https://ai-compass.in/health`
   - **Monitoring Interval:** 5 minutes (the free-tier minimum)
   - **Monitor Timeout:** 30 seconds (Render free tier cold-starts can take ~25s; anything less will alert spuriously after Render scales the dyno down)
4. Expand **Advanced settings**:
   - **HTTP Method:** GET
   - **Response Type:** Keyword Monitoring
   - **Keyword Type:** "not exists" alert
   - **Keyword Value:** `"status":"ok"`
   - Effect: alert fires if the response body does NOT contain `"status":"ok"`, catching both HTTP failures and degraded states.
5. **Alert Contacts:** add your email (it's added by default). Verify the confirmation email.
6. Click **Create Monitor.**

**Optional — quieter alerting:**

By default UptimeRobot will email you the moment a check fails. With Render's free tier the app sometimes cold-starts for a single check after idling. To avoid 3am false alarms:

- Edit the monitor → **Advanced settings** → set **Send notification when down for** to `1` check (default) but **also** set **Alert Threshold** to `2` consecutive failures (UptimeRobot Pro feature, or use a second monitor with a longer interval as a confirmation).
- Or just live with the occasional false alarm — for a free tier site it's the right trade.

## 3. Database backups

Automated weekly snapshot via GitHub Actions: see [.github/workflows/backup-db.yml](../.github/workflows/backup-db.yml).

**One-time setup:**

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.
2. Name: `DATABASE_URL`.
3. Value: your Render Postgres connection string with `?sslmode=require` on the end. Looks like:
   ```
   postgresql://aicompass_user:***@dpg-cxxxxxxxxxxxx-a.singapore-postgres.render.com/aicompass?sslmode=require
   ```
4. Save.

**Schedule:** runs every Sunday at 03:30 UTC (09:00 IST). Cron line is `30 3 * * 0`; edit the workflow if you want a different time.

**Manual run:** GitHub repo → **Actions** tab → **Weekly DB backup** → **Run workflow**. Useful right before a risky migration or a bulk admin edit.

**Retention:** 90 days as GitHub Actions artifacts (free-tier default). That's ~12 weekly snapshots before the oldest expires. To extend, swap the `actions/upload-artifact` step for an `aws-actions/configure-aws-credentials` + `aws s3 cp` step targeting Backblaze B2 (10 GB free) or any S3-compatible store.

**Restore:**

```bash
# 1. Download the artifact from the failed-run page (or the latest healthy one)
#    Actions tab → click the run → "Artifacts" section at the bottom → download the .zip,
#    unzip it, you'll have a single .sql.gz inside.

# 2. Restore against a fresh Render database (create a new one in the
#    Render console to avoid clobbering the current state).
gunzip -c ai-compass-2026-MM-DDTHH-MM-SSZ.sql.gz \
  | psql "postgresql://<user>:<pass>@<host>/<new-db>?sslmode=require"

# 3. Once you're happy, point Render's DATABASE_URL env var at the new
#    database, then deploy. The cutover is just a Render env-var change.
```

**What's NOT backed up:**

- `flask_session/` directory on disk (Render container) — ephemeral by design, contains session cookies only. Losing it just logs everyone out.
- `instance/ai_compass.db` SQLite — that's the local dev database, not used in production.
- Static assets, code — those live in git.

If those things ever start mattering (e.g., you move session storage to disk-backed), update this doc.

## 4. Render deploy quirks worth remembering

- **Port-scan timeout (~30s):** Render kills the container if `gunicorn` doesn't bind a port within ~30 seconds of boot. Anything slow at boot (catalog priming, ML model load, etc.) MUST run in a background thread — see the `_warm_up` thread in `app/__init__.py`. If you ever add another slow startup step, the same pattern applies or you'll get a SIGTERM loop on deploy.
- **Free-tier idle:** the dyno spins down after ~15 min of no traffic. First request after spin-down takes ~25s. UptimeRobot pings keep it warm during US daytime but not at 3am IST.
- **Build cache:** Render caches `node_modules/` and `pip` deps but invalidates on `package-lock.json` / `requirements.txt` changes. If a deploy fails mysteriously after a deps bump, "Clear build cache & deploy" from the Render dashboard usually fixes it.

## 5. Things to consider doing later

These aren't urgent but worth a line so future-you remembers.

- **Off-site backups** to Backblaze B2 (free 10 GB) instead of GitHub artifacts, for retention beyond 90 days.
- **Backup verification** — a follow-up cron that downloads the latest dump, restores into a throwaway Postgres instance, and asserts the catalog row count is sane.
- **Sentry or PostHog `captureException`** wired into the Flask side as well as the React side — right now backend stack traces only live in Render's logs.
- **Per-tool rate limit** on `/api/v1/feedback` is in place (5/hour) but every other public endpoint relies on Cloudflare for DDoS protection. If we ever leave Cloudflare, add `flask-limiter` properly.
