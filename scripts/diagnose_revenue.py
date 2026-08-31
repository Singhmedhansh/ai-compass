"""Phase 1 revenue diagnostic — READ ONLY.

Deliberately does NOT import app/__init__.py (create_app() runs
flask_migrate.upgrade()/db.create_all() on warmup — see app/__init__.py:714-728
and CLAUDE.md's production-DB warning). Instead connects directly with
SQLAlchemy and starts every session in `SET TRANSACTION READ ONLY` so an
accidental write raises instead of landing.

Usage: .venv/Scripts/python.exe scripts/diagnose_revenue.py
"""
import json
import os
from collections import Counter, defaultdict
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

db_url = os.environ.get("DATABASE_URL", "").strip()
if not db_url:
    raise SystemExit("DATABASE_URL not set")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(db_url)


def q(conn, sql, **params):
    return conn.execute(text(sql), params).mappings().all()


def section(title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


with engine.connect() as conn:
    conn.execute(text("SET TRANSACTION READ ONLY"))

    # ---------------------------------------------------------------
    section("1A. Submission funnel — payment_status x tier")
    rows = q(conn, "SELECT id, pricing_model, payment_status, payment_note, submitted_at FROM submissions ORDER BY submitted_at")
    print(f"Total submissions: {len(rows)}")

    def tier_of(pricing_model):
        pm = pricing_model or ""
        if pm.startswith("sponsored"):
            return "sponsored"
        if pm.startswith("quick"):
            return "quick"
        if pm.startswith("free"):
            return "free"
        return f"UNRECOGNIZED({pm[:20]})"

    status_tier = Counter()
    for r in rows:
        status_tier[(r["payment_status"], tier_of(r["pricing_model"]))] += 1
    for (status, tier), cnt in sorted(status_tier.items()):
        print(f"  {status:20s} {tier:15s} {cnt}")

    section("1A. unverified_review rows — full diagnosis")
    unv = [r for r in rows if r["payment_status"] == "unverified_review"]
    print(f"Count: {len(unv)}")
    note_counter = Counter()
    for r in unv:
        note_counter[r["payment_note"]] += 1
        print(f"  id={r['id']:4d} tier={tier_of(r['pricing_model']):10s} note={r['payment_note']!s:35s} at={r['submitted_at']}")
    print("\nFailure-mode breakdown:")
    for note, cnt in note_counter.most_common():
        print(f"  {note!s:35s} {cnt}")

    section("1A. Weekly time series — free vs paid-attempted")
    weekly = defaultdict(lambda: Counter())
    for r in rows:
        dt = r["submitted_at"]
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        week = dt.strftime("%Y-W%W")
        t = tier_of(r["pricing_model"])
        bucket = "free" if t == "free" else "paid_attempted"
        weekly[week][bucket] += 1
    for week in sorted(weekly):
        c = weekly[week]
        print(f"  {week}  free={c['free']:3d}  paid_attempted={c['paid_attempted']:3d}")

    # ---------------------------------------------------------------
    section("1B. /submit page traffic (ToolPageView is per-tool-slug only)")
    tpv_slugs = q(conn, "SELECT slug, COUNT(*) c FROM tool_page_views GROUP BY slug ORDER BY c DESC LIMIT 5")
    print("Sample ToolPageView slugs (proves this table tracks TOOL DETAIL pages, not /submit):")
    for r in tpv_slugs:
        print(f"  {r['slug']!s:30s} {r['c']}")
    submit_rows = q(conn, "SELECT COUNT(*) c FROM tool_page_views WHERE slug ILIKE '%submit%'")
    print(f"ToolPageView rows with slug LIKE '%submit%': {submit_rows[0]['c']}  (expect 0 — /submit is not instrumented)")

    # ---------------------------------------------------------------
    section("1C. Outreach candidate status breakdown")
    oc = q(conn, "SELECT status, COUNT(*) c FROM outreach_candidates GROUP BY status ORDER BY c DESC")
    total_candidates = 0
    for r in oc:
        print(f"  {r['status']:20s} {r['c']}")
        total_candidates += r["c"]
    print(f"Total candidates: {total_candidates}")

    section("1C. Outreach email log volume")
    log_summary = q(conn, "SELECT status, COUNT(*) c, MIN(sent_at) first, MAX(sent_at) last FROM outreach_email_logs GROUP BY status")
    total_sent = 0
    for r in log_summary:
        print(f"  status={r['status']:10s} count={r['c']:5d} first={r['first']} last={r['last']}")
        total_sent += r["c"]
    print(f"Total email log rows: {total_sent}")

    section("1C. Outreach -> Submission attribution (domain match)")
    cands = q(conn, "SELECT id, website_url, email FROM outreach_candidates WHERE website_url IS NOT NULL")
    subs_web = q(conn, "SELECT id, website, submitted_at FROM submissions")

    def domain_of(url):
        if not url:
            return None
        u = url.lower().replace("https://", "").replace("http://", "").split("/")[0]
        return u.replace("www.", "")

    cand_domains = {domain_of(c["website_url"]) for c in cands if domain_of(c["website_url"])}
    matched = [s for s in subs_web if domain_of(s["website"]) in cand_domains]
    print(f"Outreach candidates with a domain: {len(cand_domains)}")
    print(f"Submissions whose domain matches an outreach candidate: {len(matched)}")
    for m in matched:
        print(f"  submission id={m['id']} website={m['website']} at={m['submitted_at']}")

    if total_sent:
        print(f"\nSanity check: {total_sent} emails sent -> {len(matched)} attributable submissions "
              f"= {(len(matched) / total_sent * 100):.3f}% observed conversion")

    # ---------------------------------------------------------------
    section("1D. Catalog health")
    cat_total = q(conn, "SELECT COUNT(*) c FROM catalog_tools")[0]["c"]
    cat_visible = q(conn, "SELECT COUNT(*) c FROM catalog_tools WHERE hidden = false AND (visible_at IS NULL OR visible_at <= now())")[0]["c"]
    cat_hidden = q(conn, "SELECT COUNT(*) c FROM catalog_tools WHERE hidden = true")[0]["c"]
    cat_pending_delay = q(conn, "SELECT COUNT(*) c FROM catalog_tools WHERE hidden = false AND visible_at > now()")[0]["c"]
    print(f"CatalogTool total rows: {cat_total}")
    print(f"  visible now: {cat_visible}")
    print(f"  hidden: {cat_hidden}")
    print(f"  hidden=false but visible_at in future (staggered release): {cat_pending_delay}")

    try:
        with open("data/tools.json", encoding="utf-8") as f:
            tools_json_count = len(json.load(f))
        print(f"data/tools.json count: {tools_json_count}")
    except Exception as e:
        print(f"data/tools.json read failed: {e}")

    section("1D. OutboundClick volume (30d / 90d)")
    clicks = q(conn, """
        SELECT
          COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') as d30,
          COUNT(*) FILTER (WHERE created_at >= now() - interval '90 days') as d90,
          COUNT(*) as total
        FROM outbound_clicks
    """)[0]
    print(f"  last 30d: {clicks['d30']}  last 90d: {clicks['d90']}  all-time: {clicks['total']}")

    section("1D. Community activity (30d)")
    posts30 = q(conn, "SELECT COUNT(*) c FROM community_posts WHERE created_at >= now() - interval '30 days'")[0]["c"]
    comments30 = q(conn, "SELECT COUNT(*) c FROM community_comments WHERE created_at >= now() - interval '30 days'")[0]["c"]
    votes30 = q(conn, "SELECT COUNT(*) c FROM post_votes WHERE created_at >= now() - interval '30 days'")[0]["c"]
    users_total = q(conn, "SELECT COUNT(*) c FROM users")[0]["c"]
    users_active30 = q(conn, "SELECT COUNT(DISTINCT user_id) c FROM community_posts WHERE created_at >= now() - interval '30 days'")[0]["c"]
    print(f"  posts(30d)={posts30} comments(30d)={comments30} post_votes(30d)={votes30}")
    print(f"  registered users total={users_total}  users who posted in last 30d={users_active30}")

    section("1D. SponsorSlot / SponsorImpression")
    slots = q(conn, "SELECT placement, tier, amount_paid, payment_ref, contact_email, starts_at, ends_at, is_active FROM sponsor_slots ORDER BY starts_at")
    print(f"Total sponsor_slots rows: {len(slots)}")
    for s in slots:
        comp = " (COMPLIMENTARY/$0)" if not s["amount_paid"] else ""
        print(f"  placement={s['placement']:6s} tier={s['tier']:10s} paid={s['amount_paid']}{comp} ref={s['payment_ref']} active={s['is_active']} {s['starts_at']}..{s['ends_at']}")
    impressions_total = q(conn, "SELECT COUNT(*) c FROM sponsor_impressions")[0]["c"]
    impressions_30 = q(conn, "SELECT COUNT(*) c FROM sponsor_impressions WHERE created_at >= now() - interval '30 days'")[0]["c"]
    print(f"SponsorImpression total={impressions_total} last30d={impressions_30}")

    # ---------------------------------------------------------------
    section("1E. Verify pitch claims vs in-app analytics")
    tpv_total = q(conn, "SELECT COUNT(*) c FROM tool_page_views")[0]["c"]
    tpv_30 = q(conn, "SELECT COUNT(*) c FROM tool_page_views WHERE created_at >= now() - interval '30 days'")[0]["c"]
    tv_total = q(conn, "SELECT COUNT(*) c FROM tool_view_events")[0]["c"]
    tv_30 = q(conn, "SELECT COUNT(*) c FROM tool_view_events WHERE timestamp >= now() - interval '30 days'")[0]["c"]
    print(f"ToolPageView: total={tpv_total} last30d={tpv_30}")
    print(f"ToolView(tool_view_events): total={tv_total} last30d={tv_30}")
    print("Hardcoded outreach pitch claims: '4,000+ MAU / 110K+ impressions' (app/outreach.py ~1469,1579)")
    print(f"  -> compare against measured 30d activity above. Distinct users active 30d proxy: users_active30={users_active30}, tpv_30={tpv_30}")

    # ---------------------------------------------------------------
    section("Env credential truthiness (no values printed)")
    for k in ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_MODE",
              "PAYPAL_SPONSOR_CLIENT_ID", "PAYPAL_SPONSOR_CLIENT_SECRET", "PAYPAL_SPONSOR_MODE"]:
        v = os.environ.get(k)
        print(f"  {k:30s} {'SET' if v else 'UNSET'}")

print("\nDone.")
