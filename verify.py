import subprocess, sys

commands = [
    [r".venv\Scripts\python", "-m", "py_compile", "app/api_routes.py"],
    [r".venv\Scripts\python", "-m", "py_compile", "app/search_utils.py"],
    [r".venv\Scripts\python", "-m", "py_compile", "app/forms.py"],
    [r".venv\Scripts\pip", "check"],
    [r".venv\Scripts\python", "scripts/fix_tools_schema.py"],
    [r".venv\Scripts\python", "-c", "from app import create_app; app = create_app(); print('APP BOOT: OK')"],
    [r".venv\Scripts\python", "-c", "from app.models import User; print('MODELS: OK')"],
    [r".venv\Scripts\python", "-c", "from app.forms import LoginForm; print('FORMS: OK')"],
    [r".venv\Scripts\python", "-c", "from app.ml_recommender import get_recommendations; print('RECOMMENDER: OK')"],
    [r".venv\Scripts\python", "-c", "from app.search_utils import search_tools; print('SEARCH: OK')"]
]

for cmd in commands:
    print("Running:", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("FAIL")
        print("STDOUT:", res.stdout)
        print("STDERR:", res.stderr)
        sys.exit(1)
    else:
        print("PASS")
print("ALL PASS")
