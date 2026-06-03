import os
import logging
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

# Global redis client and status
_redis_client = None
_redis_active = False

def init_redis():
    global _redis_client, _redis_active
    redis_url = os.environ.get("REDIS_URL") or os.environ.get("CELERY_BROKER_URL")
    if not redis_url:
        logger.info("No REDIS_URL or CELERY_BROKER_URL found. Using in-memory rate limiting.")
        return

    try:
        import redis
        _redis_client = redis.Redis.from_url(
            redis_url, 
            decode_responses=True, 
            socket_connect_timeout=2, 
            socket_timeout=2
        )
        _redis_client.ping()
        _redis_active = True
        logger.info("Successfully connected to Redis for rate limiting.")
    except Exception as e:
        logger.warning("Failed to initialize Redis connection, falling back to in-memory: %s", e)
        _redis_client = None
        _redis_active = False

# Initialize on module load
init_redis()

_RATE_LIMIT_STORE = defaultdict(deque)

def _is_rate_limited_in_memory(key: str, limit: int, window_seconds: int) -> bool:
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=max(1, int(window_seconds)))

    bucket = _RATE_LIMIT_STORE[str(key)]
    while bucket and bucket[0] < window_start:
        bucket.popleft()

    if len(bucket) >= max(1, int(limit)):
        return True

    bucket.append(now)
    return False

def is_rate_limited(key: str, limit: int, window_seconds: int) -> bool:
    global _redis_active, _redis_client
    if _redis_active and _redis_client is not None:
        try:
            # Atomic check-and-increment block
            pipe = _redis_client.pipeline()
            pipe.incr(key)
            pipe.ttl(key)
            current_count, ttl = pipe.execute()
            
            # If the key has no TTL (newly created), set the expiration window
            if ttl < 0:
                _redis_client.expire(key, max(1, int(window_seconds)))
                
            if current_count > max(1, int(limit)):
                return True
            return False
        except Exception as exc:
            logger.warning("Redis operation failed inside rate limiter, falling back to in-memory: %s", exc)
            return _is_rate_limited_in_memory(key, limit, window_seconds)
    else:
        return _is_rate_limited_in_memory(key, limit, window_seconds)
