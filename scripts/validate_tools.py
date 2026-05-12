"""Validate data/tools.json against AI Compass inclusion rules.

Run from repo root:
    python scripts/validate_tools.py

Exit code 0 if valid, 1 if any rule violation.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TOOLS_PATH = REPO_ROOT / "data" / "tools.json"

AI_KEYWORDS = (
    "ai", "artificial intelligence", "machine learning", "ml-", "llm", "gpt",
    "neural", "transformer", "generative", "auto-generate", "algorithm", "nlp",
    "computer vision", "deep learning", "chatbot", "agent", "genai", "gen-ai",
    "diffusion", "embedding", "classifier", "predictive", "automation",
)


def haystack_for(tool: dict) -> str:
    fields = ("name", "description", "tagline", "short_description",
              "long_description", "category", "subCategory", "categories", "tags")
    parts = []
    for f in fields:
        value = tool.get(f)
        if isinstance(value, list):
            parts.append(" ".join(str(v) for v in value))
        elif value:
            parts.append(str(value))
    return " ".join(parts).lower()


def passes_ai_check(tool: dict) -> bool:
    if tool.get("is_ai_native") is True:
        return True
    return any(kw in haystack_for(tool) for kw in AI_KEYWORDS)


def validate(tools: list[dict]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    slugs = [t.get("slug") for t in tools]
    slug_counts = Counter(s for s in slugs if s)
    duplicates = [s for s, c in slug_counts.items() if c > 1]
    if duplicates:
        errors.append(f"Duplicate slugs found: {duplicates}")

    missing_slug = [t.get("name", "?") for t in tools if not t.get("slug")]
    if missing_slug:
        errors.append(f"Tools missing slug: {missing_slug}")

    non_ai = []
    for t in tools:
        if not passes_ai_check(t):
            non_ai.append(f"{t.get('name', '?')} ({t.get('slug', '?')})")
    if non_ai:
        errors.append(
            f"{len(non_ai)} tool(s) failed AI relevance check. Add an AI keyword "
            f"to the description/tagline/category/tags, OR set is_ai_native: true "
            f"if the tool is AI-native but described without the standard vocabulary. "
            f"Offenders: {non_ai}"
        )

    # Missing icon is non-fatal — ToolLogo falls back to favicon services + initial-letter circle —
    # but dedicated brand icons render sharper, so this surfaces tools worth manually sourcing logos for.
    missing_icons = [
        f"{t.get('name', '?')} ({t.get('slug', '?')})"
        for t in tools
        if not (t.get("icon") or "").strip()
    ]
    if missing_icons:
        warnings.append(
            f"{len(missing_icons)} tool(s) have no icon set. They will render via "
            f"favicon services with an initial-letter circle as final fallback, but "
            f"a dedicated brand icon would look sharper. Tools: {missing_icons}"
        )

    return errors, warnings


def main() -> int:
    if not TOOLS_PATH.exists():
        print(f"ERROR: {TOOLS_PATH} not found", file=sys.stderr)
        return 1

    with TOOLS_PATH.open(encoding="utf-8") as f:
        tools = json.load(f)

    if not isinstance(tools, list):
        print("ERROR: tools.json must be a JSON array", file=sys.stderr)
        return 1

    errors, warnings = validate(tools)

    for w in warnings:
        print(f"WARN — {w}\n")

    if errors:
        print(f"FAIL — tools.json has {len(errors)} validation issue(s):\n")
        for e in errors:
            print(f"  - {e}\n")
        return 1

    print(f"OK — {len(tools)} tools pass all validation rules.")
    if warnings:
        print(f"({len(warnings)} warning(s) shown above — not blocking.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
