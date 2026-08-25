"""Sponsored-tier tie-break boost in "similar tools" results.

See _apply_sponsor_tiebreak() / get_similar_tools() in app/ml_recommender.py.

The one requirement that matters more than any other here: a sponsored tool
must NEVER appear in another tool's similar-tools results unless it would
already have qualified on real relevance grounds alone. Every test below
that touches that requirement builds its own small, deterministic TF-IDF-
similarity model (via a plain numpy array standing in for sklearn's cosine
matrix) rather than depending on the trained data/recommendation_model.pkl,
so the assertions are exact and don't drift if the real catalog/model
changes.
"""
import numpy as np
import pytest

from app import ml_recommender as mlr


def _tool(slug, *, sponsored=False, sponsored_until=None):
    t = {"slug": slug, "name": slug, "category": "Productivity", "sponsored": sponsored}
    if sponsored_until:
        t["sponsored_until"] = sponsored_until
    return t


def _install_model(monkeypatch, tools, matrix_row_for_seed):
    """tools[0] is the query tool ("seed"); matrix_row_for_seed gives its
    similarity to every tool in `tools` (including itself, ignored)."""
    n = len(tools)
    matrix = np.zeros((n, n), dtype=float)
    matrix[0, :] = matrix_row_for_seed
    tool_index = {t["slug"]: i for i, t in enumerate(tools)}
    model = {
        "tools": tools,
        "tool_index": tool_index,
        "similarity_matrix": matrix,
    }
    monkeypatch.setattr(mlr, "_state", {"model": model})
    mlr.get_similar_tools.cache_clear()
    # Live catalog lookup inside _apply_sponsor_tiebreak() — keep it in sync
    # with the model snapshot for these tests (staleness itself is covered
    # separately below).
    monkeypatch.setattr("app.tool_cache.get_cached_tools", lambda *a, **k: tools)


@pytest.fixture(autouse=True)
def _clear_cache_after():
    yield
    mlr.get_similar_tools.cache_clear()


# --- The critical regression guard -------------------------------------


def test_genuinely_irrelevant_sponsored_tool_never_appears_no_matter_the_boost(monkeypatch):
    """A sponsored tool with near-zero similarity to the seed tool, ranked
    well outside the relevance-qualified pool, must never appear in results
    — even with the boost factor cranked absurdly high. This is the one
    test that has to hold for the feature to be safe to ship at all."""
    tools = [_tool("seed")]
    # 8 genuinely-similar, non-sponsored distractors fill the pool
    # (limit=4 + POOL_MARGIN=4 == 8) ahead of the irrelevant sponsored tool.
    distractor_scores = [0.45, 0.40, 0.38, 0.35, 0.30, 0.25, 0.20, 0.15]
    for i, s in enumerate(distractor_scores):
        tools.append(_tool(f"distractor-{i}"))
    tools.append(_tool("irrelevant-sponsored", sponsored=True))
    row = [1.0] + distractor_scores + [0.01]  # irrelevant tool: sim = 0.01

    _install_model(monkeypatch, tools, row)
    monkeypatch.setattr(mlr, "SPONSORED_TIEBREAK_FACTOR", 1_000_000)  # absurd boost

    results = mlr.get_similar_tools("seed", limit=4)
    slugs = [t["slug"] for t in results]

    assert "irrelevant-sponsored" not in slugs, slugs
    assert len(slugs) == 4
    assert set(slugs) == {"distractor-0", "distractor-1", "distractor-2", "distractor-3"}


def test_below_relevance_threshold_sponsored_tool_gets_no_boost_even_inside_pool(monkeypatch):
    """A sponsored tool that happens to land inside the widened pool but
    whose raw similarity is below SIMILAR_TOOLS_RELEVANCE_THRESHOLD (0.10)
    must not be boosted — eligibility requires clearing the relevance floor,
    not merely being in the pool."""
    tools = [
        _tool("seed"),
        _tool("just-above-floor"),                              # 0.09 non-sponsored
        _tool("below-floor-sponsored", sponsored=True),          # 0.08 sponsored
    ]
    row = [1.0, 0.09, 0.08]
    _install_model(monkeypatch, tools, row)

    results = mlr.get_similar_tools("seed", limit=2)
    slugs = [t["slug"] for t in results]
    # Unboosted raw order preserved: 0.09 still outranks 0.08.
    assert slugs == ["just-above-floor", "below-floor-sponsored"]


# --- The intended effect -------------------------------------------------


def test_sponsored_tool_close_in_score_sorts_above_nonsponsored_competitor(monkeypatch):
    tools = [
        _tool("seed"),
        _tool("close-nonsponsored"),                      # 0.50
        _tool("close-sponsored", sponsored=True),          # 0.48 -> *1.05 = 0.504
    ]
    row = [1.0, 0.50, 0.48]
    _install_model(monkeypatch, tools, row)

    results = mlr.get_similar_tools("seed", limit=2)
    slugs = [t["slug"] for t in results]
    assert slugs == ["close-sponsored", "close-nonsponsored"]


def test_boost_does_not_leapfrog_meaningfully_more_relevant_result(monkeypatch):
    tools = [
        _tool("seed"),
        _tool("clearly-more-relevant"),                    # 0.50
        _tool("far-lower-sponsored", sponsored=True),       # 0.20 -> *1.05 = 0.21, still << 0.50
    ]
    row = [1.0, 0.50, 0.20]
    _install_model(monkeypatch, tools, row)

    results = mlr.get_similar_tools("seed", limit=2)
    slugs = [t["slug"] for t in results]
    assert slugs == ["clearly-more-relevant", "far-lower-sponsored"]


def test_nonsponsored_ordering_completely_unaffected(monkeypatch):
    tools = [
        _tool("seed"),
        _tool("a"),
        _tool("b"),
        _tool("c"),
    ]
    row = [1.0, 0.40, 0.30, 0.20]
    _install_model(monkeypatch, tools, row)

    results = mlr.get_similar_tools("seed", limit=3)
    slugs = [t["slug"] for t in results]
    assert slugs == ["a", "b", "c"]


# --- Lapsed sponsorship: must check CURRENT status, not the model snapshot -


def test_lapsed_sponsorship_at_query_time_is_not_boosted_even_if_model_snapshot_says_sponsored(monkeypatch):
    """The pickled model is a frozen snapshot from training time. A tool
    whose sponsorship has since lapsed must not get the boost — current
    catalog state (get_cached_tools()) governs, not the snapshot."""
    from datetime import datetime, timedelta, timezone
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    snapshot_tools = [
        _tool("seed"),
        _tool("competitor"),                                              # 0.50
        _tool("lapsed-sponsored", sponsored=True, sponsored_until=past),   # 0.48, stale in snapshot
    ]
    row = [1.0, 0.50, 0.48]
    n = len(snapshot_tools)
    matrix = np.zeros((n, n), dtype=float)
    matrix[0, :] = row
    model = {
        "tools": snapshot_tools,
        "tool_index": {t["slug"]: i for i, t in enumerate(snapshot_tools)},
        "similarity_matrix": matrix,
    }
    monkeypatch.setattr(mlr, "_state", {"model": model})
    mlr.get_similar_tools.cache_clear()
    # Live catalog agrees the sponsorship lapsed (redundant here since the
    # snapshot already encodes sponsored_until in the past, but this is the
    # function actually consulted for eligibility).
    monkeypatch.setattr("app.tool_cache.get_cached_tools", lambda *a, **k: snapshot_tools)

    results = mlr.get_similar_tools("seed", limit=2)
    slugs = [t["slug"] for t in results]
    # No boost applied -> raw order (0.50 > 0.48) preserved.
    assert slugs == ["competitor", "lapsed-sponsored"]
