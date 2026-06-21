import urllib.request

urls = [
    # Tideflow
    "https://raw.githubusercontent.com/tideflow-io/tideflow/master/public/images/logo.png",
    "https://raw.githubusercontent.com/tideflow-io/tideflow/main/public/images/logo.png",
    
    # Marker
    "https://raw.githubusercontent.com/datalab-to/marker/main/data/images/datalab-logo.png",
    "https://raw.githubusercontent.com/datalab-to/marker/master/data/images/datalab-logo.png",
    
    # Chandra
    "https://raw.githubusercontent.com/datalab-to/chandra/main/assets/datalab-logo.png",
    "https://raw.githubusercontent.com/datalab-to/chandra/master/assets/datalab-logo.png"
]

ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

for url in urls:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = r.read()
            print(f"SUCCESS: {url} -> HTTP {r.status} (length {len(data)})")
    except Exception as e:
        print(f"FAILED: {url} -> {e}")
