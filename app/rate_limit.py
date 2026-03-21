from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone


_RATE_LIMIT_STORE = defaultdict(deque)


def is_rate_limited(key: str, limit: int, window_seconds: int) -> bool:
    """Simple in-memory fixed-window-ish limiter by key."""
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=max(1, int(window_seconds)))

    bucket = _RATE_LIMIT_STORE[str(key)]
    while bucket and bucket[0] < window_start:
        bucket.popleft()

    if len(bucket) >= max(1, int(limit)):
        return True

    bucket.append(now)
    return False
