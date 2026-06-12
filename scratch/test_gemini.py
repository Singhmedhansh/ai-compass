import os
import requests
from dotenv import load_dotenv

load_dotenv()

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    api_key = "dummykey1234"
else:
    api_key = api_key.strip()
print(f"Key length: {len(api_key)}")

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-nonexistent:generateContent?key={api_key}"
payload = {
    "contents": [{"parts": [{"text": "Hello"}]}],
}
resp = requests.post(url, json=payload)
print(resp.status_code)
print(resp.text)
