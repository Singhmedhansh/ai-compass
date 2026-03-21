import time
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.tool_discovery import run_discovery_pipeline

RUN_INTERVAL_SECONDS = 24 * 60 * 60


def run_forever():
    while True:
        summary = run_discovery_pipeline()
        print(
            f"Scheduler run complete: discovered={summary['discovered']} queued={summary['queued']} skipped={summary['skipped']}"
        )
        time.sleep(RUN_INTERVAL_SECONDS)


if __name__ == "__main__":
    run_forever()
