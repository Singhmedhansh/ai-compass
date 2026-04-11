path = r"C:\Users\singh\New folder (2)\ai-compass\app\api_routes.py"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = '''@api_bp.get("/tools")
def list_all_tools():
    """Return all tools for the directory page."""
    from app.tool_cache import get_cached_tools
    tools = get_cached_tools()
    return jsonify({
        "results": tools,
        "total": len(tools),
        "fallback": False
    })'''

new = '''@api_bp.get("/tools")
def list_all_tools():
    """Return all tools for the directory page."""
    try:
        from app.tool_cache import get_cached_tools
        tools = get_cached_tools()
        if not tools:
            return jsonify({"error": "tools list is empty or None", "count": len(tools) if tools else -1}), 500
        return jsonify({
            "results": tools,
            "total": len(tools),
            "fallback": False
        })
    except Exception as e:
        import traceback
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc()
        }), 500'''

if old in content:
    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("REPLACED successfully")
else:
    print("OLD TEXT NOT FOUND - printing last 40 lines for inspection:")
    lines = content.splitlines()
    for i, l in enumerate(lines[-40:]):
        print(f"{len(lines)-40+i+1}: {l}")
