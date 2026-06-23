"""
seed_upstash.py
───────────────
Populate the Upstash Vector index with a curated set of AI tools for
students.  Run once (or re-run to refresh/update entries):

    python seed_upstash.py

Requires two environment variables (add them to your .env file):

    UPSTASH_VECTOR_REST_URL   -- the REST endpoint for your index
    UPSTASH_VECTOR_REST_TOKEN -- the read-write token for your index

Upstash's built-in bge-m3 model converts the 'data' text to a vector
automatically -- no manual embedding code needed.
"""

import os
import sys

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Lazy import: give a helpful message if the package is not installed.
# ---------------------------------------------------------------------------
try:
    from upstash_vector import Index
    from upstash_vector.types import Data
except ImportError:
    print(
        "[ERROR] upstash-vector is not installed.\n"
        "Run:  .venv\\Scripts\\python.exe -m pip install upstash-vector"
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Tool catalogue
# Each entry has:
#   id       -- unique, stable identifier (used as the vector ID)
#   data     -- plain-English description; Upstash embeds this for free
#   metadata -- structured fields returned alongside query results
# ---------------------------------------------------------------------------
AI_TOOLS: list[dict] = [
    {
        "id": "cursor-ai",
        "data": (
            "Cursor is an AI-first code editor built on VS Code that offers "
            "intelligent autocomplete, multi-line edits, and a natural-language "
            "chat interface to explain, refactor, or generate code. It supports "
            "all major programming languages and integrates directly with your "
            "existing VS Code extensions and settings. Ideal for students learning "
            "to code, debugging assignments, or building side projects faster. "
            "Features include codebase-aware context, one-click PR generation, "
            "and privacy-first local models."
        ),
        "metadata": {
            "name": "Cursor",
            "category": "Coding",
            "pricing": "Free tier available",
            "url": "https://cursor.sh",
        },
    },
    {
        "id": "v0-dev",
        "data": (
            "v0.dev by Vercel is an AI-powered UI generation tool that converts "
            "natural-language prompts into production-ready React and Tailwind CSS "
            "components. Students can describe a UI element or full page layout in "
            "plain English and instantly get clean, copy-paste-ready JSX code. "
            "Great for rapid prototyping, hackathons, and front-end projects without "
            "deep design experience. Supports shadcn/ui components, dark mode, and "
            "Radix primitives out of the box."
        ),
        "metadata": {
            "name": "v0.dev",
            "category": "Design & UI",
            "pricing": "Free tier available",
            "url": "https://v0.dev",
        },
    },
    {
        "id": "phind",
        "data": (
            "Phind is a search engine and AI assistant optimised for developers and "
            "students. It combines web search with large language model reasoning to "
            "deliver accurate, cited answers to technical questions about programming, "
            "mathematics, and science. Unlike generic chatbots, Phind fetches live "
            "documentation, Stack Overflow threads, and GitHub issues to back every "
            "answer with real sources. Supports code execution, step-by-step "
            "explanations, and a pair-programmer chat mode."
        ),
        "metadata": {
            "name": "Phind",
            "category": "Research & Coding",
            "pricing": "Free",
            "url": "https://www.phind.com",
        },
    },
    {
        "id": "notionai",
        "data": (
            "Notion AI is an embedded writing and productivity assistant inside the "
            "Notion workspace. Students can use it to summarise lecture notes, draft "
            "essays, create study schedules, generate action items from meeting "
            "transcripts, and brainstorm ideas. It understands context from existing "
            "Notion pages and databases, making it especially powerful for "
            "knowledge management, research organisation, and collaborative "
            "coursework. Supports multiple languages and integrates with Notion "
            "databases, calendars, and project boards."
        ),
        "metadata": {
            "name": "Notion AI",
            "category": "Productivity",
            "pricing": "Freemium (AI add-on $8/mo)",
            "url": "https://www.notion.so/product/ai",
        },
    },
]


# ---------------------------------------------------------------------------
# Upsert helper
# ---------------------------------------------------------------------------
def upsert_tools(index: Index, tools: list[dict]) -> None:
    """
    Upsert all tools into the Upstash Vector index.

    Each vector is created from a Data object so that Upstash built-in
    embedding model (bge-m3) converts the plain 'data' text to a vector on
    the server -- no local embedding computation required.
    """
    vectors = [
        Data(
            id=tool["id"],
            data=tool["data"],
            metadata=tool["metadata"],
        )
        for tool in tools
    ]

    index.upsert(vectors=vectors)
    print(f"Seeded {len(vectors)} tools successfully.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    url = os.environ.get("UPSTASH_VECTOR_REST_URL")
    token = os.environ.get("UPSTASH_VECTOR_REST_TOKEN")

    if not url or not token:
        print(
            "[ERROR] Missing environment variables.\n"
            "Set UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN "
            "in your .env file or shell."
        )
        sys.exit(1)

    print(f"Connecting to Upstash Vector index: {url}")
    index = Index(url=url, token=token)

    try:
        upsert_tools(index, AI_TOOLS)
    except Exception as exc:
        print(f"[ERROR] Upsert failed: {exc}")
        sys.exit(1)

    print("\nSeeded tools:")
    for tool in AI_TOOLS:
        m = tool["metadata"]
        print(f"  * {m['name']} [{m['category']}] -- {m['pricing']}  {m['url']}")


if __name__ == "__main__":
    main()
