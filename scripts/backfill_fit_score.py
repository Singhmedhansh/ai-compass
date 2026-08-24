"""Computes fit_score for existing OutreachCandidate rows.

Default mode is a read-only dry run: fetches each candidate's homepage fresh
(to classify the pricing signal — historical rows never had the original
discovery-time HTML saved), computes fit_score in Python, and prints a
distribution + top/bottom-20 sample. Nothing is written to the database.

Historical rows have no stored PH-votes/HN-points (that data lived only in
the transient `launch` dict at discovery time and was never persisted for
existing rows), so the traction term is always a no-op here — same as any
candidate whose source didn't carry a traction score.

Usage:
    python scripts/backfill_fit_score.py               # dry run, prints report
    python scripts/backfill_fit_score.py --commit       # also writes fit_score to DB

Run against whatever DATABASE_URL is configured in the environment/.env —
check that before using --commit.
"""
import argparse
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, ".")

from app import create_app, db
from app.models import OutreachCandidate
from app.outreach import compute_fit_score, classify_pricing_signal


def _score_one(c):
    pricing_signal = classify_pricing_signal(c.website_url) if c.website_url else "unknown"
    score = compute_fit_score(
        email_source=c.email_source,
        pricing_signal=pricing_signal,
        traction_score=None,   # not capturable for historical rows, see module docstring
        traction_source=None,
    )
    return c.id, score, pricing_signal


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit", action="store_true", help="Write fit_score to the DB instead of a dry run")
    args = parser.parse_args()

    # TESTING=True skips the app warmup thread (flask_migrate.upgrade() +
    # ALTER TABLE fallbacks) — this script only needs a read (and optionally
    # a plain UPDATE), never a schema migration.
    app = create_app({"TESTING": True})
    with app.app_context():
        # Column list explicit and fit_score omitted: the migration hasn't
        # been deployed yet, so `SELECT *` (what OutreachCandidate.query.all()
        # generates once the model has a fit_score attribute) 500s against a
        # DB that doesn't have the column yet. This keeps the dry run truly
        # read-only / zero schema impact.
        cols = (
            OutreachCandidate.id, OutreachCandidate.product_name, OutreachCandidate.website_url,
            OutreachCandidate.email_source, OutreachCandidate.confidence_score,
        )
        rows = db.session.query(*cols).all()

        class _Cand:
            def __init__(self, id, product_name, website_url, email_source, confidence_score):
                self.id = id
                self.product_name = product_name
                self.website_url = website_url
                self.email_source = email_source
                self.confidence_score = confidence_score

        candidates = [_Cand(*r) for r in rows]
        print(f"Loaded {len(candidates)} candidates.")

        with ThreadPoolExecutor(max_workers=8) as ex:
            results = list(ex.map(_score_one, candidates))

        by_id = {cid: (score, pricing_signal) for cid, score, pricing_signal in results}
        cand_by_id = {c.id: c for c in candidates}

        scores = [score for _, score, _ in results]
        dist = {}
        for s in scores:
            dist[s] = dist.get(s, 0) + 1

        print("\n=== Score distribution ===")
        for s in sorted(dist):
            print(f"  {s:+d}: {dist[s]}")

        ranked = sorted(results, key=lambda r: r[1], reverse=True)

        print("\n=== Top 20 ===")
        for cid, score, pricing_signal in ranked[:20]:
            c = cand_by_id[cid]
            print(f"  [{score:+d}] {c.product_name!r} src={c.email_source} pricing={pricing_signal} url={c.website_url}")

        print("\n=== Bottom 20 ===")
        for cid, score, pricing_signal in ranked[-20:]:
            c = cand_by_id[cid]
            print(f"  [{score:+d}] {c.product_name!r} src={c.email_source} pricing={pricing_signal} url={c.website_url}")

        if args.commit:
            print("\n--commit passed: writing fit_score to DB...")
            from sqlalchemy import text
            for c in candidates:
                score, _ = by_id[c.id]
                db.session.execute(
                    text("UPDATE outreach_candidates SET fit_score = :score WHERE id = :id"),
                    {"score": score, "id": c.id},
                )
            db.session.commit()
            print("Done.")
        else:
            print("\nDry run only — nothing written. Pass --commit to persist.")


if __name__ == "__main__":
    main()
