import urllib.request
import urllib.error

urls = [
    # GitHub Copilot candidates
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/copilot.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/copilot-color.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/github-copilot.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/github-copilot-color.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/github.svg",

    # GitHub Student candidates
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/github-student.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/github-student-color.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/githubstudent.svg",
    "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons/githubstudent-color.svg",

    # Tideflow and Marker
    "https://github.com/datalab-to.png",
    "https://github.com/tideflow-io.png",
]

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=5) as r:
            code = r.status
            content_type = r.headers.get("Content-Type", "")
            data = r.read()
            print(f"SUCCESS: {url} -> HTTP {code} ({content_type}) length {len(data)}")
    except urllib.error.HTTPError as e:
        print(f"FAIL: {url} -> HTTP {e.code}")
    except Exception as e:
        print(f"ERROR: {url} -> {type(e).__name__}: {e}")
