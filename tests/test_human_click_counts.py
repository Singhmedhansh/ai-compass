"""Reading the bot flag back out.

app/click_quality.py records a verdict per click; these pin what the readers
are allowed to do with it. The property that matters is asymmetric: a figure
quoted to an outsider must never count an unjudged row as human, while a
founder's own trend must not lose its history the day bot-flagging shipped.
"""

from datetime import datetime, timedelta, timezone

from app import db
from app.click_quality import (
    bot_flagging_started_at,
    human_click_condition,
    trend_click_condition,
)
from app.models import OutboundClick


def _click(slug, is_bot, created_at, ip_hash=None):
    return OutboundClick(
        slug=slug,
        is_affiliate=False,
        is_bot=is_bot,
        ip_hash=ip_hash,
        created_at=created_at,
    )


def test_unjudged_rows_never_count_as_human_by_default(app):
    """No cutover: the strict reading, for anything quoted as human traffic."""
    now = datetime.now(timezone.utc)
    with app.app_context():
        db.session.add_all([
            _click("t", False, now),           # human
            _click("t", True, now),            # bot
            _click("t", None, now - timedelta(days=90)),  # legacy, unknown
        ])
        db.session.commit()

        counted = OutboundClick.query.filter(
            OutboundClick.slug == "t",
            human_click_condition(OutboundClick),
        ).count()
        assert counted == 1, "only the explicitly-human row may count"


def test_cutover_keeps_history_but_not_new_unjudged_rows(app):
    """With a cutover, legacy rows survive and post-cutover NULLs do not.

    A NULL written after flagging began is a failed write, not a historical
    artefact, so the two cases must not be treated alike.
    """
    now = datetime.now(timezone.utc)
    cutover = now - timedelta(days=30)
    with app.app_context():
        db.session.add_all([
            _click("c", None, cutover - timedelta(days=10)),  # before flagging
            _click("c", None, cutover + timedelta(days=1)),   # after: failed write
            _click("c", False, now),                          # human
            _click("c", True, now),                           # bot
        ])
        db.session.commit()

        counted = OutboundClick.query.filter(
            OutboundClick.slug == "c",
            trend_click_condition(OutboundClick, cutover),
        ).count()
        assert counted == 2, "legacy row + human row, not the bot or the failed write"


def test_cutover_is_derived_from_the_data(app):
    """The cutover is the oldest judged row, so it stays right per environment."""
    now = datetime.now(timezone.utc)
    first_judged = now - timedelta(days=5)
    with app.app_context():
        db.session.add_all([
            _click("d", None, now - timedelta(days=40)),
            _click("d", False, first_judged),
            _click("d", True, now),
        ])
        db.session.commit()

        found = bot_flagging_started_at(OutboundClick, db.session)
        assert found is not None
        # stored naive in SQLite; compare on the wall clock, not tzinfo
        assert abs((found.replace(tzinfo=None) - first_judged.replace(tzinfo=None)).total_seconds()) < 2


def test_a_trend_still_reports_before_any_click_is_judged(app):
    """Nothing judged yet means flagging has not started, so everything counts.

    This is the regression that broke the founder dashboard: with no flagged
    click in the table, bot_flagging_started_at returns None, and treating
    that as "be strict" excluded every unjudged row — so a paying founder's
    chart read zero until the first flagged click arrived. Nothing about
    their traffic had changed.

    bot_flagging_started_at asks about the table as a whole, so this needs a
    table with nothing judged in it. The `app` fixture is session-scoped and
    its sqlite file is shared by every test module, so the emptying happens
    inside a nested transaction that is rolled back — deleting for real would
    pull rows out from under whatever runs next.
    """
    now = datetime.now(timezone.utc)
    with app.app_context():
        nested = db.session.begin_nested()
        try:
            OutboundClick.query.delete()
            db.session.add_all([
                _click("e", None, now - timedelta(days=2)),
                _click("e", None, now - timedelta(days=1)),
            ])
            db.session.flush()

            assert bot_flagging_started_at(OutboundClick, db.session) is None
            counted = OutboundClick.query.filter(
                OutboundClick.slug == "e",
                trend_click_condition(OutboundClick, None),
            ).count()
            assert counted == 2, "pre-flagging rows are history, not suspects"

            # The strict condition is still strict — it is what gets quoted
            # outside, where unknown must never round up to human.
            quoted = OutboundClick.query.filter(
                OutboundClick.slug == "e",
                human_click_condition(OutboundClick),
            ).count()
            assert quoted == 0
        finally:
            nested.rollback()


def test_a_trend_still_drops_flagged_bots_before_any_cutover(app):
    """Counting unjudged rows must not also let through a known bot."""
    now = datetime.now(timezone.utc)
    with app.app_context():
        nested = db.session.begin_nested()
        try:
            OutboundClick.query.delete()
            db.session.add_all([
                _click("f", None, now - timedelta(days=2)),
                _click("f", True, now - timedelta(days=1)),
            ])
            db.session.flush()

            counted = OutboundClick.query.filter(
                OutboundClick.slug == "f",
                trend_click_condition(OutboundClick, None),
            ).count()
            assert counted == 1
        finally:
            nested.rollback()


def test_helped_counts_distinct_clients_not_clicks(app):
    """One enthusiastic visitor is one person helped, not five."""
    from sqlalchemy import distinct, func

    now = datetime.now(timezone.utc)
    with app.app_context():
        db.session.add_all([
            _click("h", False, now, ip_hash="aaa"),
            _click("h", False, now, ip_hash="aaa"),
            _click("h", False, now, ip_hash="aaa"),
            _click("h", False, now, ip_hash="bbb"),
            _click("h", True, now, ip_hash="ccc"),   # bot, excluded
            _click("h", False, now, ip_hash=None),   # pre-ip_hash, skipped
        ])
        db.session.commit()

        helped = (
            db.session.query(func.count(distinct(OutboundClick.ip_hash)))
            .filter(
                OutboundClick.slug == "h",
                OutboundClick.ip_hash.isnot(None),
                human_click_condition(OutboundClick),
            )
            .scalar()
        )
        assert helped == 2
