from unittest.mock import MagicMock, patch
from app.rate_limit import is_rate_limited

def test_rate_limit_fallback_in_memory():
    with patch("app.rate_limit._redis_active", False):
        key = "test_mem_key"
        # We can increment multiple times to verify in-memory triggers True
        # limit = 2
        assert is_rate_limited(key, limit=2, window_seconds=10) is False
        assert is_rate_limited(key, limit=2, window_seconds=10) is False
        assert is_rate_limited(key, limit=2, window_seconds=10) is True

def test_rate_limit_redis_success():
    mock_redis = MagicMock()
    mock_pipeline = MagicMock()
    mock_pipeline.execute.return_value = [1, -1] # 1 request, -1 TTL (new key)
    mock_redis.pipeline.return_value = mock_pipeline

    with patch("app.rate_limit._redis_active", True), \
         patch("app.rate_limit._redis_client", mock_redis):
        
        assert is_rate_limited("test_redis_key", limit=2, window_seconds=10) is False
        mock_pipeline.incr.assert_called_with("test_redis_key")
        mock_pipeline.ttl.assert_called_with("test_redis_key")
        mock_redis.expire.assert_called_with("test_redis_key", 10)

def test_rate_limit_redis_over_limit():
    mock_redis = MagicMock()
    mock_pipeline = MagicMock()
    mock_pipeline.execute.return_value = [3, 5] # 3 requests, 5 seconds TTL remaining
    mock_redis.pipeline.return_value = mock_pipeline

    with patch("app.rate_limit._redis_active", True), \
         patch("app.rate_limit._redis_client", mock_redis):
        
        assert is_rate_limited("test_redis_key", limit=2, window_seconds=10) is True

def test_rate_limit_redis_failure_fallback():
    mock_redis = MagicMock()
    mock_redis.pipeline.side_effect = Exception("Redis connection timed out")

    with patch("app.rate_limit._redis_active", True), \
         patch("app.rate_limit._redis_client", mock_redis), \
         patch("app.rate_limit._is_rate_limited_in_memory") as mock_fallback:
        
        mock_fallback.return_value = True
        assert is_rate_limited("test_redis_fail_key", limit=2, window_seconds=10) is True
        mock_fallback.assert_called_with("test_redis_fail_key", 2, 10)
