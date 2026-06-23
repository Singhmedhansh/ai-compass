"""
seed_upstash.py
───────────────
Populate the Upstash Vector index with the entire AI Compass tool catalog
from data/tools.json. Generates 384-dimension dense vectors using sentence-transformers
and uploads them in batches.

Run:
    python seed_upstash.py

Requires environment variables set in your shell or .env:
    UPSTASH_VECTOR_REST_URL
    UPSTASH_VECTOR_REST_TOKEN
"""

import os
import sys
import json
import re

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Lazy imports: verify packages are installed.
# ---------------------------------------------------------------------------
try:
    from upstash_vector import Index
    from upstash_vector.types import Vector
except ImportError:
    print(
        "[ERROR] upstash-vector is not installed.\n"
        "Run:  .venv\\Scripts\\python.exe -m pip install upstash-vector"
    )
    sys.exit(1)

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print(
        "[ERROR] sentence-transformers is not installed.\n"
        "Run:  .venv\\Scripts\\python.exe -m pip install sentence-transformers"
    )
    sys.exit(1)


def _tool_slug(tool: dict) -> str:
    explicit_slug = str(tool.get("slug") or "").strip().lower()
    if explicit_slug:
        return explicit_slug

    tool_key = str(tool.get("tool_key") or "").strip().lower()
    if tool_key:
        return tool_key

    name = str(tool.get("name") or "").strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


# ---------------------------------------------------------------------------
# Seeding routine
# ---------------------------------------------------------------------------
def seed_catalog(index: Index, tools_path: str, model: SentenceTransformer) -> None:
    if not os.path.exists(tools_path):
        print(f"[ERROR] Catalog file not found at {tools_path}")
        sys.exit(1)

    print(f"Reading catalog from {tools_path}...")
    with open(tools_path, "r", encoding="utf-8") as f:
        tools = json.load(f)

    if not isinstance(tools, list):
        print("[ERROR] Tools file is not a valid JSON list.")
        sys.exit(1)

    print(f"Loaded {len(tools)} tools. Generating embeddings and preparing vectors...")

    vectors = []
    for idx, tool in enumerate(tools):
        slug = _tool_slug(tool)
        
        # Construct a rich text representation for semantic encoding
        searchable_parts = [
            f"Tool Name: {tool.get('name')}",
            f"Tagline: {tool.get('tagline') or ''}",
            f"Category: {tool.get('category') or ''}",
            f"Subcategory: {tool.get('subCategory') or ''}",
            f"Description: {tool.get('description') or ''}",
            f"Use cases: {', '.join(tool.get('use_cases') or [])}",
            f"Tags: {', '.join(tool.get('tags') or [])}",
        ]
        text_content = ". ".join(p for p in searchable_parts if p)

        # Generate 384-dimension vector locally
        vector_embedding = model.encode(text_content).tolist()

        # Build structured metadata matching frontend expectations
        metadata = {
            "name": tool.get("name"),
            "category": tool.get("category", ""),
            "pricing": tool.get("price", "Freemium"),
            "url": tool.get("link", ""),
        }

        vectors.append(
            Vector(
                id=slug,
                vector=vector_embedding,
                metadata=metadata,
            )
        )
        if (idx + 1) % 50 == 0 or (idx + 1) == len(tools):
            print(f"  -> Generated {idx + 1}/{len(tools)} embeddings...")

    # Upload in batches of 100 to protect connections
    batch_size = 100
    print(f"Upserting to Upstash Dense Index in batches of {batch_size}...")
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i : i + batch_size]
        index.upsert(vectors=batch)
        print(f"  Uploaded batch {i // batch_size + 1} ({len(batch)} vectors)")

    print("OK: Seeding complete. Successfully uploaded " + str(len(vectors)) + " tools to Upstash Vector.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> None:
    url = os.environ.get("UPSTASH_VECTOR_REST_URL")
    token = os.environ.get("UPSTASH_VECTOR_REST_TOKEN")

    if not url or not token:
        print(
            "[ERROR] Missing environment variables.\n"
            "Set UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN."
        )
        sys.exit(1)

    project_root = os.path.dirname(os.path.abspath(__file__))
    tools_path = os.path.join(project_root, "data", "tools.json")

    print("Loading SentenceTransformer model 'all-MiniLM-L6-v2'...")
    model = SentenceTransformer('all-MiniLM-L6-v2')

    print(f"Connecting to Upstash Vector Index: {url}")
    index = Index(url=url, token=token)

    try:
        seed_catalog(index, tools_path, model)
    except Exception as exc:
        print(f"[ERROR] Seeding failed: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
