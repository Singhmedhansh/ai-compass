import sys, subprocess, json

def run(cmd):
    print("COMMAND:", cmd)
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.stdout: print(res.stdout.strip())
    if res.stderr: print(res.stderr.strip())
    print("---")

run("python -m py_compile app/api_routes.py")
run('python -c "from app import create_app"')
run('python -c "from app.models import User"')
run("python -m py_compile app/forms.py")
run("python -m py_compile app/ml_recommender.py")
run("python -m py_compile app/search_utils.py")
run("python -m py_compile app/tool_cache.py")

try:
    tools = json.load(open("data/tools.json", encoding="utf-8"))
    categories = set(t.get("category","MISSING") for t in tools)
    pricings = set(t.get("pricing","MISSING") for t in tools)
    print(f"Total tools: {len(tools)}")
    print(f"Categories: {categories}")
    print(f"Pricings: {pricings}")
    print(f"Missing use_cases: {sum(1 for t in tools if not t.get('use_cases'))}")
    print(f"Missing tags: {sum(1 for t in tools if not t.get('tags'))}")
    print(f"Missing student_perk: {sum(1 for t in tools if 'student_perk' not in t)}")
    
    print("\n--- FIRST TOOL ---")
    print(json.dumps(tools[0], indent=2))
    print("\n--- RANDOM TOOL ---")
    print(json.dumps(tools[10], indent=2))
    
    # Check specific fields
    fields_to_check = ["tags", "use_cases", "strengths", "pricing", "student_perk", "trending", "featured", "platforms", "category", "rating", "review_count", "company", "logo_emoji"]
    missing_counts = {k: 0 for k in fields_to_check}
    for t in tools:
        for k in fields_to_check:
            if k not in t:
                missing_counts[k] += 1
    for k, v in missing_counts.items():
        print(f"Field '{k}' is missing from {v} tools")
        
except Exception as e:
    print(f"ERROR: {e}")

run('python -c "from app import create_app; app = create_app(); print(\'APP BOOT: OK\')"')
run('python -c "from app.models import User; print(\'MODELS: OK\')"')
run('python -c "from app.forms import *; print(\'FORMS: OK\')"')
run('python -c "from app.ml_recommender import get_recommendations; print(\'RECOMMENDER: OK\')"')
