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

    if path.startswith('auth/') and path != 'auth/callback':
        from flask import abort
        abort(404)

    file_path = os.path.join(DIST_DIR, path)
    if path and os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(DIST_DIR, path)

    index_path = os.path.join(DIST_DIR, 'index.html')
    if os.path.exists(index_path):
        return send_from_directory(DIST_DIR, 'index.html')

    return '<h2>Run: cd frontend && npm run build</h2>', 404
