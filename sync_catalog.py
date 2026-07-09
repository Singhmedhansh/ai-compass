import sys
from app import create_app, db
from app.catalog_store import upsert_tool
from app.tool_cache import _load_tools_from_disk

def main():
    app = create_app()
    with app.app_context():
        tools = _load_tools_from_disk() or []
        print(f"Loaded {len(tools)} tools from disk.")
        ok, fail = 0, 0
        for t in tools:
            slug = t.get("slug")
            if not slug:
                continue
            if upsert_tool(t):
                ok += 1
            else:
                fail += 1
                print(f"FAILED to sync: {slug}")
        db.session.commit()
        print(f"Sync completed. Successfully upserted: {ok}, Failed: {fail}")

if __name__ == "__main__":
    main()
