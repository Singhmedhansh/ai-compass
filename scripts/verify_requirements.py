import importlib
import sys
from pathlib import Path

REQ_PATH = Path(__file__).resolve().parents[1] / "requirements.txt"

# Map pip package names to import names where they differ.
IMPORT_MAP = {
    "flask-login": "flask_login",
    "flask-sqlalchemy": "flask_sqlalchemy",
    "flask-bcrypt": "flask_bcrypt",
    "flask-wtf": "flask_wtf",
    "email-validator": "email_validator",
    "beautifulsoup4": "bs4",
}


def read_requirements(path: Path):
    packages = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name = line.split("==")[0].strip().lower()
        packages.append(name)
    return packages


def main():
    missing = []
    for package in read_requirements(REQ_PATH):
        module_name = IMPORT_MAP.get(package, package.replace("-", "_"))
        try:
            importlib.import_module(module_name)
        except Exception:
            missing.append((package, module_name))

    if missing:
        print("Missing imports for these requirements:")
        for package, module_name in missing:
            print(f"- {package} (import as {module_name})")
        return 1

    print("Requirements verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
