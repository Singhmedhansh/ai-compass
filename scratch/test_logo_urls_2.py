import urllib.request
import urllib.error

urls = [
    # Stable Diffusion WebUI
    "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/light/stable-diffusion.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/light/stable-diffusion-color.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/light/stable-diffusion.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/light/stable-diffusion-color.svg",
    "https://raw.githubusercontent.com/AUTOMATIC1111/stable-diffusion-webui/master/favicon.ico",
    
    # ComfyUI PNG alternative
    "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-svg/light/comfyui.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/light/comfyui.svg",

    # Tideflow
    "https://raw.githubusercontent.com/tideflow-io/tideflow/master/logo.png",
    "https://raw.githubusercontent.com/tideflow-io/tideflow/main/logo.png",
    "https://raw.githubusercontent.com/tideflow-io/tideflow/master/logo.svg",
    "https://raw.githubusercontent.com/tideflow-io/tideflow/main/logo.svg",
    "https://raw.githubusercontent.com/tideflow-io/tideflow/master/public/favicon.ico",
    "https://raw.githubusercontent.com/tideflow-io/tideflow/master/public/logo.png",

    # Roo Code
    "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/src/assets/icons/icon.png",
    "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/src/assets/icons/icon.svg",
    "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/src/assets/images/roo.png",
    "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/images/roo-logo.png",
    "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/images/logo.png",
    "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/package.json"
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
