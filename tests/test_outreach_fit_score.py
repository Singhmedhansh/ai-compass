from app.outreach import compute_fit_score, classify_pricing_text


def test_freemium_scores_positive():
    assert compute_fit_score(pricing_signal="freemium") == 2


def test_enterprise_only_scores_negative():
    assert compute_fit_score(pricing_signal="enterprise_only") == -3


def test_unknown_pricing_is_neutral():
    assert compute_fit_score(pricing_signal="unknown") == 0


def test_founder_attributable_profile_adds_one():
    assert compute_fit_score(email_source="github_profile", pricing_signal="unknown") == 1
    assert compute_fit_score(email_source="github_commit", pricing_signal="unknown") == 1
    assert compute_fit_score(email_source="hn_profile", pricing_signal="unknown") == 1


def test_scraper_or_hunter_source_does_not_count_as_profile():
    assert compute_fit_score(email_source="web_scraper", pricing_signal="unknown") == 0
    assert compute_fit_score(email_source="hunter_io", pricing_signal="unknown") == 0
    assert compute_fit_score(email_source="pattern_guess", pricing_signal="unknown") == 0


def test_high_ph_votes_penalized():
    assert compute_fit_score(pricing_signal="unknown", traction_score=301, traction_source="ph") == -2
    assert compute_fit_score(pricing_signal="unknown", traction_score=300, traction_source="ph") == 0


def test_high_hn_points_penalized():
    assert compute_fit_score(pricing_signal="unknown", traction_score=151, traction_source="hn") == -2
    assert compute_fit_score(pricing_signal="unknown", traction_score=150, traction_source="hn") == 0


def test_traction_score_without_source_is_ignored():
    # Can't judge a bare number against either threshold without knowing
    # which scale it's on.
    assert compute_fit_score(pricing_signal="unknown", traction_score=1000, traction_source=None) == 0


def test_combined_signals_stack():
    score = compute_fit_score(
        email_source="github_profile",
        pricing_signal="freemium",
        traction_score=500,
        traction_source="ph",
    )
    assert score == 2 + 1 - 2


def test_classify_pricing_text_freemium():
    assert classify_pricing_text("start your free trial today, no credit card required") == "freemium"


def test_classify_pricing_text_enterprise_only():
    assert classify_pricing_text("contact sales for a custom demo and pricing") == "enterprise_only"


def test_classify_pricing_text_contact_sales_with_selfserve_price_is_unknown():
    # "contact sales" alongside a real self-serve monthly price means it's
    # not actually enterprise-gated (e.g. a bigger enterprise tier next to
    # a normal self-serve plan).
    assert classify_pricing_text("contact sales for enterprise, or self-serve at $29/mo billed monthly") == "unknown"


def test_classify_pricing_text_no_signals_is_unknown():
    assert classify_pricing_text("welcome to our homepage about our mission") == "unknown"
