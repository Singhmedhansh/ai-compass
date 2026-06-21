import urllib.request
import urllib.error

urls = [
    # UNPKG paths
    "https://unpkg.com/@lobehub/icons-static-svg/assets/comfyui.svg",
    "https://unpkg.com/@lobehub/icons-static-svg/assets/stable-diffusion.svg",
    "https://unpkg.com/@lobehub/icons-static-svg/assets/stable-diffusion-color.svg",
    "https://unpkg.com/@lobehub/icons-static-svg/assets/automatic1111.svg",
    "https://unpkg.com/@lobehub/icons-static-svg/assets/stability.svg",
    "https://unpkg.com/@lobehub/icons-static-svg/comfyui.svg",
    "https://unpkg.com/@lobehub/icons-static-svg/stable-diffusion.svg",
    
    # Let's check if there is an assets folder
    "https://unpkg.com/@lobehub/icons-static-svg/package.json"
]

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=5) as r:
            code = r.status
            content_type = r.headers.get("Content-Type", "")
            print(f"SUCCESS: {url} -> HTTP {code} ({content_type})")
            if url.endswith("package.json"):
                print("package.json preview:", r.read()[:500])
    except urllib.error.HTTPError as e:
        print(f"FAIL: {url} -> HTTP {e.code}")
    except Exception as e:
        print(f"ERROR: {url} -> {type(e).__name__}: {e}")
