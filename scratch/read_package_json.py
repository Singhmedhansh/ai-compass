import urllib.request
import json

url = "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/package.json"
ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

try:
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=5) as r:
        data = json.loads(r.read().decode("utf-8"))
        print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error: {e}")
