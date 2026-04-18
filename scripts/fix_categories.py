import json
import re
from collections import Counter
from pathlib import Path

TOOLS_PATH = Path(__file__).resolve().parent.parent / "data" / "tools.json"

RULES = [
    (
        "Video Generation",
        [
            "text-to-video",
            "video",
            "animation",
            "film",
            "clip",
            "footage",
            "sora",
            "runway",
        ],
    ),
    (
        "Coding",
        [
            "code",
            "coding",
            "programming",
            "developer",
            "ide",
            "debug",
            "github",
            "git",
            "terminal",
            "compiler",
            "api",
            "backend",
            "frontend",
            "software",
        ],
    ),
    (
        "Writing & Chat",
        [
            "writing",
            "write",
            "essay",
            "grammar",
            "content",
            "blog",
            "chat",
            "conversation",
            "copywriting",
            "paraphrase",
            "summarize",
        ],
    ),
    (
        "Productivity",
        [
            "note",
            "task",
            "calendar",
            "schedule",
            "productivity",
            "organize",
            "flashcard",
            "learning",
            "education",
            "calculator",
            "math",
            "study",
            "workspace",
        ],
    ),
    (
        "Research",
        [
            "research",
            "paper",
            "citation",
            "academic",
            "scholar",
            "literature review",
            "scientific",
            "journal",
            "peer review",
            "arxiv",
            "semantic",
        ],
    ),
]

IMAGE_NAME_KEYWORDS = [
    "midjourney",
    "dall-e",
    "stable diffusion",
    "firefly",
    "imagen",
    "flux",
    "playground",
    "leonardo",
    "ideogram",
    "nightcafe",
    "getimg",
    "clipdrop",
    "photosonic",
    "bing image",
]

IMAGE_DESCRIPTION_PHRASES = [
    "text-to-image",
    "image generation",
    "generate images",
    "ai image",
]


def infer_category(tool: dict) -> str | None:
    name = str(tool.get("name", "") or "").lower()
    description = str(tool.get("description", "") or "").lower()
    text = f"{name} {description}".lower()

    if any(keyword in name for keyword in IMAGE_NAME_KEYWORDS) or any(
        phrase in description for phrase in IMAGE_DESCRIPTION_PHRASES
    ):
        return "Image Generation"

    for category, keywords in RULES:
        if any(matches_keyword(text, keyword) for keyword in keywords):
            return category

    return None


def matches_keyword(text: str, keyword: str) -> bool:
    key = keyword.lower().strip()
    if not key:
        return False

    # Keep phrase matching simple and explicit.
    if " " in key or "-" in key:
        return key in text

    return re.search(rf"\b{re.escape(key)}\b", text) is not None


def main() -> None:
    with TOOLS_PATH.open("r", encoding="utf-8") as handle:
        tools = json.load(handle)

    if not isinstance(tools, list):
        raise RuntimeError("Expected tools.json to contain a top-level list.")

    changed = 0

    for tool in tools:
        current = tool.get("category")
        inferred = infer_category(tool)

        if inferred and inferred != current:
            tool["category"] = inferred
            changed += 1

    with TOOLS_PATH.open("w", encoding="utf-8") as handle:
        json.dump(tools, handle, ensure_ascii=False, indent=2)

    counts = Counter((tool.get("category") or "") for tool in tools)

    print(f"Total tools: {len(tools)}")
    print(f"Category changes made: {changed}")
    print("Final category counts:")
    for category, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        print(f"{count:4d}  {category}")


if __name__ == "__main__":
    main()
