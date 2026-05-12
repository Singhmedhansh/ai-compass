"""Tests for scripts/validate_tools.py."""
from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import validate_tools  # noqa: E402


def test_passes_with_ai_keyword_in_description():
    tool = {"slug": "x", "name": "X", "description": "An AI writing tool."}
    assert validate_tools.passes_ai_check(tool)


def test_passes_with_is_ai_native_override():
    tool = {"slug": "x", "name": "X", "description": "Just a calculator."}
    assert not validate_tools.passes_ai_check(tool)
    tool["is_ai_native"] = True
    assert validate_tools.passes_ai_check(tool)


def test_fails_without_keywords_or_override():
    # Substring match — avoid words like "plain"/"again"/"main" that contain "ai".
    tool = {"slug": "x", "name": "Simple Calculator", "description": "Sums up numbers."}
    assert not validate_tools.passes_ai_check(tool)


def test_validate_detects_duplicate_slugs():
    tools = [
        {"slug": "x", "name": "X", "description": "AI tool"},
        {"slug": "x", "name": "X2", "description": "AI tool"},
    ]
    errors = validate_tools.validate(tools)
    assert any("Duplicate slugs" in e for e in errors)


def test_validate_detects_non_ai_tool():
    tools = [{"slug": "x", "name": "Calc", "description": "Adds numbers"}]
    errors = validate_tools.validate(tools)
    assert any("AI relevance" in e for e in errors)


def test_validate_passes_clean_catalog():
    tools = [
        {"slug": "a", "name": "ChatGPT", "description": "AI chatbot"},
        {"slug": "b", "name": "Detexify", "description": "Symbol lookup", "is_ai_native": True},
    ]
    errors = validate_tools.validate(tools)
    assert errors == []


def test_real_tools_json_passes():
    """The actual catalog must pass validation. If this fails, fix the data."""
    import json
    with (REPO_ROOT / "data" / "tools.json").open(encoding="utf-8") as f:
        tools = json.load(f)
    errors = validate_tools.validate(tools)
    assert errors == [], "tools.json fails validation:\n" + "\n".join(errors)
