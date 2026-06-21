import urllib.request
import urllib.error

urls = {
    "Stable Diffusion WebUI": [
        "https://logo.clearbit.com/stability.ai",
        "https://raw.githubusercontent.com/AUTOMATIC1111/stable-diffusion-webui/master/html/favicon.png",
    ],
    "ComfyUI": [
        "https://logo.clearbit.com/comfy.org",
        "https://raw.githubusercontent.com/Comfy-Org/docs/main/logo.ico",
        "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/assets/icons/comfyui.svg",
    ],
    "Docling": [
        "https://huggingface.co/organizations/ds4sd/avatar.png",
        "https://raw.githubusercontent.com/DS4SD/docling/main/docs/assets/logo.png",
    ],
    "Marker": [
        "https://github.com/datalab-to.png",
    ],
    "Tideflow": [
        "https://logo.clearbit.com/tideflow.io",
    ],
    "Roo Code": [
        "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/assets/icons/icon.png",
        "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/main/icon.png",
        "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/master/assets/icons/icon.png",
        "https://raw.githubusercontent.com/RooCodeInc/Roo-Code/master/icon.png",
        "https://raw.githubusercontent.com/RooVetGit/Roo-Code/main/icon.png",
    ]
}

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

for name, url_list in urls.items():
    print(f"=== Testing for {name} ===")
    for url in url_list:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": ua})
            with urllib.request.urlopen(req, timeout=5) as r:
                code = r.status
                content_type = r.headers.get("Content-Type", "")
                print(f"  SUCCESS: {url} -> HTTP {code} ({content_type})")
        except urllib.error.HTTPError as e:
            print(f"  FAIL: {url} -> HTTP {e.code}")
        except Exception as e:
            print(f"  ERROR: {url} -> {type(e).__name__}: {e}")
