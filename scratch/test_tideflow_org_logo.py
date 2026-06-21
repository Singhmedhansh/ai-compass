import urllib.request
import urllib.error

url = "https://github.com/tideflow-io.png"
ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

try:
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=5) as r:
        code = r.status
        content_type = r.headers.get("Content-Type", "")
        print(f"SUCCESS: {url} -> HTTP {code} ({content_type})")
except urllib.error.HTTPError as e:
    print(f"FAIL: {url} -> HTTP {e.code}")
except Exception as e:
    print(f"ERROR: {url} -> {type(e).__name__}: {e}")
