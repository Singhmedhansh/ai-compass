import os
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from flask import Blueprint, Response, jsonify, redirect, send_from_directory
from sqlalchemy import text

from app import db
from app.tool_cache import TOOL_CACHE, get_cached_tools

main_bp = Blueprint('main', __name__)

DIST_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'static', 'dist'
)


@main_bp.route('/health', strict_slashes=False)
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


@main_bp.route('/sitemap.xml')
def sitemap():
    # Ensure cache is primed in case this route is hit before startup priming.
    get_cached_tools()

    base = 'https://ai-compass.in'
    urls = []
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    static = [
        ('/', '1.0', 'weekly', '2026-04-23'),
        ('/tools', '0.9', 'weekly', '2026-04-18'),
        ('/ai-tool-finder', '0.8', 'monthly', '2026-04-29'),
        ('/best-ai-tools-for-students', '0.9', 'weekly', '2026-04-19'),
        ('/best-free-ai-tools', '0.9', 'weekly', '2026-04-20'),
        ('/collections', '0.7', 'weekly', '2026-04-16'),
    ]
    for path, priority, freq, lastmod in static:
        safe_path = escape(str(path))
        safe_priority = escape(str(priority))
        safe_freq = escape(str(freq))
        safe_lastmod = escape(str(lastmod))
        urls.append(
            f'<url><loc>{base}{safe_path}</loc><lastmod>{safe_lastmod}</lastmod><changefreq>{safe_freq}</changefreq><priority>{safe_priority}</priority></url>'
        )

    for slug, _ in TOOL_CACHE.items():
        safe_slug = escape(str(slug))
        urls.append(
            f'<url><loc>{base}/tools/{safe_slug}</loc><lastmod>{today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>'
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(urls)
        + '\n</urlset>'
    )
    return Response(xml, mimetype='application/xml')


@main_bp.route('/robots.txt')
def robots():
    content = 'User-agent: *\nAllow: /\nSitemap: https://ai-compass.in/sitemap.xml'
    return Response(content, mimetype='text/plain')


@main_bp.route('/tool/<slug>')
def redirect_tool_singular(slug):
    return redirect(f'/tools/{slug}', code=301)


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
