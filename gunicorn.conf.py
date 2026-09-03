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

# ---------------------------------------------------------------------------
# Workers
# 1 worker + N threads — gthread lets the single process handle multiple
# concurrent requests (health checks, API calls) without needing extra RAM.
# Render free tier gives 512 MB; 1 gthread worker sits at ~120-150 MB.
#
# 8 threads, not 4. A single page load fires ~12 hashed asset requests plus
# several API calls, and with nothing cached at the edge they all land here.
# At 4 threads the page queues against itself: measured against production,
# 8 concurrent requests for the 2-byte /healthz response went from 0.51s
# solo to a 1.39s tail. These threads are almost entirely blocked on socket
# writes and Postgres round-trips rather than holding the GIL, so the extra
# four cost stack space and little else. Raise further only alongside
# SQLALCHEMY_ENGINE_OPTIONS pool_size/max_overflow (currently 3+5 = 8) —
# more threads than pool slots just moves the queue into pool_timeout.
# ---------------------------------------------------------------------------
workers = 1
worker_class = "gthread"
threads = 8

# ---------------------------------------------------------------------------
# Timeouts
# ---------------------------------------------------------------------------
timeout = 120          # Worker silent timeout before kill
graceful_timeout = 30  # Time for in-flight requests to finish on shutdown
keepalive = 5

# ---------------------------------------------------------------------------
# Worker recycling — Render free tier caps RAM at 512 MB. scikit-learn /
# numpy cosine matrices and per-request allocation spikes are never fully
# returned to the OS, so a long-lived worker only grows. Recycling the
# worker every ~400 requests releases that bloat before it OOM-kills the
# instance. The jitter staggers the restart so it never happens mid-burst
# for every request at once. gthread keeps in-flight requests draining
# during the graceful restart, so this is transparent to users.
# ---------------------------------------------------------------------------
max_requests = 400
max_requests_jitter = 50

# ---------------------------------------------------------------------------
# Preload — CRITICAL for Render port binding.
#
# preload_app = False means gunicorn's MASTER process binds to the port
# socket BEFORE forking workers. The port is open within milliseconds of
# startup, so Render's port scanner always succeeds.
#
# preload_app = True means the master loads the Flask app, forks a worker,
# and only THEN the worker binds — which takes several seconds (DB init,
# migrations, warmup threads). Render's scanner fires during this window
# and reports 'No open ports detected'.
# ---------------------------------------------------------------------------
preload_app = False

# ---------------------------------------------------------------------------
# Logging — forward everything to stdout for Render's dashboard.
# ---------------------------------------------------------------------------
accesslog = "-"
errorlog  = "-"
loglevel  = "info"

# ---------------------------------------------------------------------------
# Server hooks — print clear markers for debugging in Render logs.
# ---------------------------------------------------------------------------
def on_starting(server):
    """Called just before the master process binds to the socket."""
    print(f"[gunicorn] starting — will bind on {bind}", flush=True)

def when_ready(server):
    """Called after the master has bound and is ready to receive connections."""
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

def worker_abort(worker):
    """Log worker crashes clearly so they show up in Render logs."""
    print(f"[gunicorn] worker {worker.pid} aborted — check for OOM or timeout", flush=True)
