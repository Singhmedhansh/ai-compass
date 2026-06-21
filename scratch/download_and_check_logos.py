import urllib.request
import hashlib

urls = {
    "datalab-to": "https://github.com/datalab-to.png",
    "tideflow-io": "https://github.com/tideflow-io.png",
    "githubeducation": "https://github.com/githubeducation.png",
    "github": "https://github.com/github.png",
    "chandra-logo-main": "https://raw.githubusercontent.com/datalab-to/chandra/main/datalab-logo.png",
    "chandra-logo-master": "https://raw.githubusercontent.com/datalab-to/chandra/master/datalab-logo.png"
}

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

for name, url in urls.items():
    try:
        req = urllib.request.Request(url, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = r.read()
            h = hashlib.md5(data).hexdigest()
            print(f"{name}: SUCCESS (len {len(data)}, md5 {h})")
    except Exception as e:
        print(f"{name}: FAILED - {e}")
