import os

# Bind — read PORT from Render's injected env var; fall back to 10000
# (Render's default) so the literal string "$PORT" never gets passed
# if the shell substitution somehow fails.
_port = os.environ.get("PORT", "10000")
try:
    _port = int(_port)
except (TypeError, ValueError):
    _port = 10000

bind = f"0.0.0.0:{_port}"

# Workers — 1 worker is the ONLY safe choice on Render's 512 MB free-tier.
# Two workers × ~250 MB each = 500+ MB → OOM kill before the first request
# is ever served. A single gthread worker with 4 threads still handles
# concurrent requests; the added parallelism just lives in OS threads
# instead of OS processes, costing zero extra RSS.
workers = 1

# Worker class — gthread allows concurrent thread execution (essential to prevent startup freezes)
worker_class = "gthread"
threads = 4

# Timeouts
# graceful_timeout: how long gunicorn waits for in-flight requests to
# finish before hard-killing a worker during a rolling restart.
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
    try:
        from app import db
        db.engine.dispose()
        print(f"[gunicorn] worker {worker.pid}: DB engine disposed after fork", flush=True)
    except Exception as exc:
        print(f"[gunicorn] worker {worker.pid}: post_fork engine.dispose() skipped: {exc}", flush=True)
