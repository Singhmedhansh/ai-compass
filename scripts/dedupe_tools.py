import json
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TOOLS_PATH = BASE_DIR / "data" / "tools.json"


def derive_slug(tool: dict) -> str:
    explicit_slug = str(tool.get("slug") or "").strip().lower()
    if explicit_slug:
        return explicit_slug

    tool_key = str(tool.get("tool_key") or "").strip().lower()
    if tool_key:
        return tool_key

    name = str(tool.get("name") or "").strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def main() -> None:
    with TOOLS_PATH.open("r", encoding="utf-8") as fh:
        tools = json.load(fh)

    if not isinstance(tools, list):
        raise ValueError("Expected tools.json to contain a top-level list of tools")

    seen_slugs: set[str] = set()
    deduped_tools: list[dict] = []
    removed_count = 0

    for tool in tools:
        if not isinstance(tool, dict):
            deduped_tools.append(tool)
            continue

        slug = derive_slug(tool)
        if slug in seen_slugs:
            removed_count += 1
            continue

        seen_slugs.add(slug)
        deduped_tools.append(tool)

    with TOOLS_PATH.open("w", encoding="utf-8") as fh:
        json.dump(deduped_tools, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    print(f"Removed {removed_count} duplicate tools by slug")
    print(f"Remaining: {len(deduped_tools)} tools, {len(seen_slugs)} unique slugs")


if __name__ == "__main__":
    main()
