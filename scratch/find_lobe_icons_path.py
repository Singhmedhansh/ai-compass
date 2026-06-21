import urllib.request
import urllib.error

urls = [
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/package.json",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/packages/static-svg/package.json",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/icons-static-svg/package.json",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/packages/icons-static-svg/package.json",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/package.json",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/package.json",
]

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=5) as r:
            code = r.status
            print(f"SUCCESS: {url} -> HTTP {code}")
            # print first 300 characters of content
            print(r.read()[:300].decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        print(f"FAIL: {url} -> HTTP {e.code}")
    except Exception as e:
        print(f"ERROR: {url} -> {type(e).__name__}: {e}")
