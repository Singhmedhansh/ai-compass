from datetime import datetime, timedelta, timezone
from app.tool_cache import get_cached_tools
from app.repositories.tool_repository import (
    get_tool_view_counts,
    get_views_per_day,
    create_tool_view,
    get_views_since,
    get_favorite_counts,
    get_rating_metrics,
    get_all_tools_query
)

def fetch_views_per_day(days=7):
    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    rows = get_views_per_day(since)

    by_day = {str(day): int(count) for day, count in rows}

    timeline = []
    for offset in range(days):
        day = (since + timedelta(days=offset)).date().isoformat()
        timeline.append({"date": day, "views": by_day.get(day, 0)})

    return timeline

def insert_tool_view(tool_key, user_id=None):
    create_tool_view(
        tool_name=str(tool_key),
        user_id=user_id,
        timestamp=datetime.now(timezone.utc)
    )

def fetch_recent_click_map(hours=72):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = get_views_since(since)
    return {str(tool_name): int(count) for tool_name, count in rows}

def fetch_weekly_view_map(days=7):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = get_views_since(since)
    return {str(tool_name): int(count) for tool_name, count in rows}

def fetch_favorite_count_map():
    rows = get_favorite_counts()
    return {str(tool_id): int(count) for tool_id, count in rows}

def fetch_rating_metrics_map():
    rows = get_rating_metrics()
    metrics = {}
    for tool_name, avg_rating, count in rows:
        metrics[str(tool_name)] = {
            "avg": round(float(avg_rating or 0), 2),
            "count": int(count or 0),
        }

    return metrics
def get_all_tools():
    return get_all_tools_query()

def fetch_tools_data(fast_route_mode: bool, data_path: str):
    if fast_route_mode:
        return []
    return get_cached_tools(data_path)

def fetch_tool_view_counts():
    rows = get_tool_view_counts()
    return {str(tool_name): int(count) for tool_name, count in rows}
