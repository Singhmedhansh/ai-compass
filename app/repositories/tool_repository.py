from app import db
from app.models import ToolView, Tool, Favorite, ToolRating

def get_tool_view_counts():
    """Fetch tool view counts from the database."""
    return (
        db.session.query(ToolView.tool_name, db.func.count(ToolView.id))
        .filter(ToolView.tool_name.isnot(None))
        .group_by(ToolView.tool_name)
        .all()
    )

def get_views_per_day(since):
    return (
        db.session.query(db.func.date(ToolView.timestamp), db.func.count(ToolView.id))
        .filter(ToolView.timestamp >= since)
        .group_by(db.func.date(ToolView.timestamp))
        .all()
    )

def create_tool_view(tool_name, user_id, timestamp):
    row = ToolView(
        tool_name=tool_name,
        user_id=user_id,
        timestamp=timestamp,
    )
    db.session.add(row)
    db.session.commit()

def get_views_since(since):
    return (
        db.session.query(ToolView.tool_name, db.func.count(ToolView.id))
        .filter(ToolView.tool_name.isnot(None))
        .filter(ToolView.timestamp >= since)
        .group_by(ToolView.tool_name)
        .all()
    )

def get_favorite_counts():
    return (
        db.session.query(Favorite.tool_id, db.func.count(Favorite.id))
        .filter(Favorite.tool_id.isnot(None))
        .group_by(Favorite.tool_id)
        .all()
    )

def get_rating_metrics():
    return (
        db.session.query(
            ToolRating.tool_name,
            db.func.avg(ToolRating.rating),
            db.func.count(ToolRating.id),
        )
        .filter(ToolRating.tool_name.isnot(None))
        .group_by(ToolRating.tool_name)
        .all()
    )

def get_all_tools_query():
    return Tool.query.all()
