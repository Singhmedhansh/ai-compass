import os
from flask import Blueprint, send_from_directory

main_bp = Blueprint('main', __name__)

DIST_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'static', 'dist'
)

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
