import os
import json
import time
import requests

CACHE_FILE = os.path.join(os.path.dirname(__file__), 'rates_cache.json')
CACHE_DURATION = 86400  # 24 hours in seconds

# Static fallbacks if API is completely down and cache doesn't exist
DEFAULT_RATES = {
    "USD": 1.0,
    "INR": 83.5,
    "EUR": 0.92,
    "GBP": 0.78
}

def get_exchange_rates():
    now = time.time()
    
    # Try to load cached rates from local file
    cache = None
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                cache = json.load(f)
        except Exception:
            pass

    # Return cached version if still fresh
    if cache and (now - cache.get("last_fetched", 0)) < CACHE_DURATION:
        return cache.get("rates", DEFAULT_RATES)

    # Cache is expired or missing. Fetch fresh rates.
    rates = DEFAULT_RATES.copy()
    api_key = os.environ.get("EXCHANGE_RATE_API_KEY")
    
    if api_key:
        url = f"https://v6.exchangerate-api.com/v6/{api_key}/latest/USD"
    else:
        # Keyless free endpoint fallback
        url = "https://open.er-api.com/v6/latest/USD"

    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            fetched_rates = data.get("rates", {})
            # Pick only the currencies we support to save space & standardize
            for c in DEFAULT_RATES.keys():
                if c in fetched_rates:
                    rates[c] = float(fetched_rates[c])
            
            # Save to cache
            new_cache = {
                "last_fetched": now,
                "rates": rates
            }
            with open(CACHE_FILE, 'w') as f:
                json.dump(new_cache, f)
        elif cache:
            # If API fails but we have stale cache, reuse stale cache
            return cache.get("rates", DEFAULT_RATES)
    except Exception as e:
        print(f"Error fetching exchange rates: {e}")
        if cache:
            return cache.get("rates", DEFAULT_RATES)

    return rates
