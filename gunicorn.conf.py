import os

# ---------------------------------------------------------------------------
# Port — Render injects $PORT (usually 10000). Fall back to 10000 so the
# config works even when the env var is absent (local dev, Docker).
# ---------------------------------------------------------------------------
try:
    _port = int(os.environ.get("PORT") or 10000)
except (TypeError, ValueError):
    _port = 10000

bind = f"0.0.0.0:{_port}"

# Workers — 1 worker with 2 threads is optimal for Render's 512 MB free tier.
# gthread allows concurrent thread execution so Render health checks (/healthz)
# respond instantly even while background warmup or DB operations run.
workers = 1
worker_class = "gthread"
threads = 2

# Timeouts
timeout = 120
graceful_timeout = 30
keepalive = 5

# Logging — forward to stdout so Render captures it in the dashboard.
accesslog = "-"
errorlog = "-"
loglevel = "info"

# Preload the application before forking workers.
# Set to False so Gunicorn binds to the port immediately at startup (before
# loading any application code). The single worker then boots, loads the app,
# and runs the background warmup thread safely inside its own process context.
preload_app = False

# Print a clear marker once gunicorn has bound — useful for debugging
# port-scan failures in Render logs.
def on_starting(server):
    print(f"[gunicorn] starting — will bind on {bind}", flush=True)

def when_ready(server):
    print(f"[gunicorn] ready and listening on {bind}", flush=True)

def post_fork(server, worker):
    """Dispose the DB connection pool inherited from the master process.

    With preload_app=True, the master loads the app (and potentially opens DB
    connections during warmup) before forking workers. The forked worker
    inherits copies of those file descriptors. If the master closes a
    connection the worker is still 'holding', subsequent DB calls in the worker
    silently fail. Calling engine.dispose() in post_fork gives each worker a
    fresh, private pool — no shared file descriptors.
    """
    if preload_app:
        try:
            from app import db
            db.engine.dispose()
            print(f"[gunicorn] worker {worker.pid}: DB engine disposed after fork", flush=True)
        except Exception as exc:
            print(f"[gunicorn] worker {worker.pid}: post_fork engine.dispose() skipped: {exc}", flush=True)
    else:
        print(f"[gunicorn] worker {worker.pid}: post_fork db engine dispose skipped (preload_app is False)", flush=True)
