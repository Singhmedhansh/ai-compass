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

# Workers — 1 keeps memory under Render's free-tier 512 MB limit.
workers = 1

# Worker class — sync is the most stable for a single-worker Flask app.
worker_class = "sync"

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

# Preload the application before forking workers. This:
#   1. Catches import errors immediately at startup (not after a fork).
#   2. Lets gunicorn bind the port BEFORE running app code — critical for
#      Render's port-scan probe which times out if the port isn't open
#      within ~30s.
#
# NOTE: preload=True shares the DB connection pool across workers. With
# workers=1 this is fine. If workers is ever raised, add a
# @worker_init signal hook to reconnect the pool after fork.
preload_app = False

# Print a clear marker once gunicorn has bound — useful for debugging
# port-scan failures in Render logs.
def on_starting(server):
    print(f"[gunicorn] starting — will bind on {bind}", flush=True)

def when_ready(server):
    print(f"[gunicorn] ready and listening on {bind}", flush=True)
