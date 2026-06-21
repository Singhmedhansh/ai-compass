import urllib.request
import urllib.error

urls = [
    # Stable Diffusion (main branch)
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/packages/static-svg/light/stable-diffusion.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/packages/static-svg/light/stable-diffusion-color.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/packages/assets/icons/stable-diffusion.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/packages/assets/icons/stable-diffusion-color.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/main/packages/static-svg/light/stable-diffusion.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/main/packages/static-svg/light/stable-diffusion-color.svg",
    
    # ComfyUI (main branch)
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/packages/static-svg/light/comfyui.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/main/packages/assets/icons/comfyui.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/main/packages/static-svg/light/comfyui.svg",
    
    # Tideflow website or other public assets
    "https://tideflow.io/images/logo.png",
    "https://tideflow.io/favicon.ico",
    "https://raw.githubusercontent.com/tideflow-io/tideflow/master/src/main/resources/static/images/logo.png",
    "https://raw.githubusercontent.com/tideflow-io/tideflow/master/public/img/logo.png",
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
