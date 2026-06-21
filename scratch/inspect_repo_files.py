import urllib.request
import json

repos = [
    "tideflow-io/tideflow",
    "datalab-to/marker",
    "datalab-to/chandra",
    "datalab-to/surya"
]

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

for repo in repos:
    print(f"=== Searching in {repo} ===")
    url = f"https://api.github.com/repos/{repo}/git/trees/main?recursive=1"
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            tree = json.loads(r.read().decode("utf-8"))
            for file_info in tree.get("tree", []):
                path = file_info.get("path", "")
                if any(x in path.lower() for x in ["logo", "icon", "brand", "avatar", "favicon"]):
                    print(f"  {path}")
    except Exception as e:
        # Try master branch if main doesn't exist
        url = f"https://api.github.com/repos/{repo}/git/trees/master?recursive=1"
        req = urllib.request.Request(url, headers={"User-Agent": ua})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                tree = json.loads(r.read().decode("utf-8"))
                for file_info in tree.get("tree", []):
                    path = file_info.get("path", "")
                    if any(x in path.lower() for x in ["logo", "icon", "brand", "avatar", "favicon"]):
                        print(f"  {path}")
        except Exception as e2:
            print(f"  FAILED to fetch tree: {e2}")
