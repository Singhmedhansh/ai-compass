import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, send_from_directory
from sqlalchemy import text

from app import db
from app.tool_cache import get_cached_tools

main_bp = Blueprint('main', __name__)

DIST_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'static', 'dist'
)


@main_bp.route('/health')
def health_check():
    database_status = 'ok'
    tools_cache_status = 'ok'

    try:
        db.session.execute(text('SELECT 1'))
    except Exception:
        database_status = 'error'

    try:
        get_cached_tools()
    except Exception:
        tools_cache_status = 'error'

    status = 'ok' if database_status == 'ok' and tools_cache_status == 'ok' else 'degraded'
    return jsonify({
        'status': status,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'checks': {
            'database': database_status,
            'tools_cache': tools_cache_status,
        },
    })

@main_bp.route('/', defaults={'path': ''})
@main_bp.route('/<path:path>')
def serve_react(path):
    if path.startswith('api/'):
        from flask import abort
        abort(404)

    server_auth_routes = ['auth/google', 'auth/google/callback', 'login/google', 'login/github']
    if any(path == route or path.startswith(f"{route}/") for route in server_auth_routes):
        from flask import abort
        abort(404)

    # /auth/callback is a React route; let it fall through to index.html.

    file_path = os.path.join(DIST_DIR, path)
    if path and os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(DIST_DIR, path)

    index_path = os.path.join(DIST_DIR, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(DIST_DIR, 'index.html')

    return '<h2>Run: cd frontend && npm run build</h2>', 404
