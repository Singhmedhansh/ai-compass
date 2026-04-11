import sys, subprocess, json

with open("report.txt", "w", encoding="utf-8") as f:
    def run(cmd):
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        f.write(res.stdout)
        if res.stderr:
            f.write(res.stderr)
            
    f.write("--- FILE 1 ---\n")
    run("python -m py_compile app/api_routes.py")
    f.write("--- FILE 2 ---\n")
    run("pip check")
    f.write("--- FILE 3 ---\n")
    run('python -c "from app import create_app"')
    f.write("--- FILE 4 ---\n")
    run('python -c "from app.models import User"')
    f.write("--- FILE 5 ---\n")
    run("python -m py_compile app/forms.py")
    f.write("--- FILE 6 ---\n")
    run("python -m py_compile app/ml_recommender.py")
    f.write("--- FILE 7 ---\n")
    run("python -m py_compile app/search_utils.py")
    f.write("--- FILE 8 ---\n")
    run("python -m py_compile app/tool_cache.py")
    f.write("--- FILE 9 ---\n")
    
    try:
        tools = json.load(open("data/tools.json", encoding="utf-8"))
        categories = set(t.get("category","MISSING") for t in tools)
        pricings = set(t.get("pricing","MISSING") for t in tools)
        f.write(f"Total tools: {len(tools)}\n")
        f.write(f"Categories: {categories}\n")
        f.write(f"Pricings: {pricings}\n")
        f.write(f"Missing use_cases: {sum(1 for t in tools if not t.get('use_cases'))}\n")
        f.write(f"Missing tags: {sum(1 for t in tools if not t.get('tags'))}\n")
        f.write(f"Missing student_perk: {sum(1 for t in tools if 'student_perk' not in t)}\n")
        
        f.write("--- FIRST TOOL ---\n")
        f.write(json.dumps(tools[0], indent=2))
        f.write("\n--- RANDOM TOOL ---\n")
        f.write(json.dumps(tools[10], indent=2))
        f.write("\n")
        
        # Check specific fields
        fields_to_check = ["tags", "use_cases", "strengths", "pricing", "student_perk", "trending", "featured", "platforms", "category", "rating", "review_count", "company", "logo_emoji"]
        missing_counts = {k: 0 for k in fields_to_check}
        for t in tools:
            for k in fields_to_check:
                if k not in t:
                    missing_counts[k] += 1
        for k, v in missing_counts.items():
            f.write(f"Field '{k}' is missing from {v} tools\n")
            
    except Exception as e:
        f.write(f"ERROR: {e}\n")
        
    f.write("--- FINAL BOOT TEST ---\n")
    run('python -c "from app import create_app; app = create_app(); print(\'APP BOOT: OK\')"')
    run('python -c "from app.models import User; print(\'MODELS: OK\')"')
    run('python -c "from app.forms import *; print(\'FORMS: OK\')"')
    run('python -c "from app.ml_recommender import get_recommendations; print(\'RECOMMENDER: OK\')"')
