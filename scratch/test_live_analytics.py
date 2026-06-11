import sys
import requests
import json

def test_live_analytics(email, password):
    base_url = "https://ai-compass.in"
    session = requests.Session()
    
    # 1. Login
    login_url = f"{base_url}/api/v1/auth/login"
    print(f"Logging in to {login_url}...")
    resp = session.post(login_url, json={"email": email, "password": password})
    if resp.status_code != 200:
        print(f"Failed to log in: {resp.status_code}")
        print(resp.text)
        return False
        
    user_data = resp.json()
    print(f"Logged in successfully as user: {user_data.get('name')} ({user_data.get('email')})")
    
    # 2. Add some test favorites to make sure we have analytics data
    fav_tool_slugs = ["chatgpt", "perplexity", "notion"]
    for slug in fav_tool_slugs:
        fav_url = f"{base_url}/api/v1/favorites"
        resp = session.post(fav_url, json={"slug": slug})
        if resp.status_code == 200:
            print(f"Toggled favorite for: {slug} -> {resp.json()}")
        else:
            print(f"Failed to toggle favorite for {slug}: {resp.status_code}")
            
    # 3. Call workflow-analytics
    analytics_url = f"{base_url}/api/v1/profile/workflow-analytics"
    print(f"Calling workflow analytics at {analytics_url}...")
    resp = session.get(analytics_url)
    if resp.status_code != 200:
        print(f"Failed to fetch workflow analytics: {resp.status_code}")
        print(resp.text)
        return False
        
    analytics_data = resp.json()
    print("Workflow Analytics response:")
    print(json.dumps(analytics_data, indent=2))
    
    # Check keys
    required_keys = ["persona", "persona_description", "workflow_insights", "distribution", "recommendations"]
    all_ok = True
    for key in required_keys:
        if key not in analytics_data:
            print(f"Error: Missing key '{key}' in response!")
            all_ok = False
            
    if all_ok:
        print("Success: Live workflow-analytics endpoint verified successfully!")
    else:
        print("Failure: Missing expected keys.")
        
    return all_ok

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python test_live_analytics.py <email> <password>")
        sys.exit(1)
    test_live_analytics(sys.argv[1], sys.argv[2])
