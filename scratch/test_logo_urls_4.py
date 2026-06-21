import urllib.request
import urllib.error

urls = [
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/comfyui.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/stable-diffusion.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/stable-diffusion-color.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/stability.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/stability-color.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/automatic1111.svg",
]

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

for url in urls:
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
