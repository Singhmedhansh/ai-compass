import app.api_routes as api_routes


def test_finder_varies_with_platform(client, monkeypatch):
    sample_tools = [
        {
            "name": "Web Coder",
            "slug": "web-coder",
            "category": "Coding",
            "pricing": "free",
            "platforms": ["Web"],
            "tags": ["coding", "beginner-friendly"],
            "description": "Coding assistant for browser workflows",
            "rating": 4.4,
            "link": "https://webcoder.example",
        },
        {
            "name": "API Coder",
            "slug": "api-coder",
            "category": "Coding",
            "pricing": "paid",
            "platforms": ["API"],
            "tags": ["coding", "developer", "api"],
            "description": "Developer-first coding API",
            "rating": 4.7,
            "link": "https://apicoder.example",
        },
    ]

    monkeypatch.setattr(api_routes, "_load_tools", lambda: sample_tools)

    web_resp = client.post(
        "/api/v1/finder",
        json={
            "goal": "coding",
            "budget": "any",
            "platform": "web",
            "level": "advanced",
            "use_case": "build scripts",
        },
    )
    api_resp = client.post(
        "/api/v1/finder",
        json={
            "goal": "coding",
            "budget": "any",
            "platform": "api",
            "level": "advanced",
            "use_case": "build scripts",
        },
    )

    assert web_resp.status_code == 200
    assert api_resp.status_code == 200

    web_tools = web_resp.get_json()["tools"]
    api_tools = api_resp.get_json()["tools"]

    assert web_tools
    assert api_tools
    assert web_tools[0]["slug"] == "web-coder"
    assert api_tools[0]["slug"] == "api-coder"


def test_admin_stats_has_model_status_keys(client):
    resp = client.get("/api/v1/admin/stats")
    assert resp.status_code == 200

    payload = resp.get_json()
    assert "model_status" in payload
    assert "ml_status" in payload
    assert payload["model_status"] == payload["ml_status"]


def test_public_stats_returns_total_tools(client):
    """GET /api/v1/stats returns total tool count for the public homepage."""
    resp = client.get("/api/v1/stats")
    assert resp.status_code == 200

    payload = resp.get_json()
    assert "total_tools" in payload
    assert isinstance(payload["total_tools"], int)
    assert payload["total_tools"] > 0


def test_finder_student_perk_and_fuzzy_match(client, monkeypatch):
    sample_tools = [
        {
            "name": "Generic Writer",
            "slug": "generic-writer",
            "category": "Writing & Docs",
            "pricing": "freemium",
            "platforms": ["Web"],
            "tags": ["writing"],
            "description": "Standard writer app",
            "rating": 4.0,
            "link": "https://writer.example",
            "studentPerk": False,
        },
        {
            "name": "Super Student Writer",
            "slug": "super-student-writer",
            "category": "Writing & Docs",
            "pricing": "freemium",
            "platforms": ["Web"],
            "tags": ["writing", "student-discount"],
            "description": "Writer assistant optimized for academic essay structures",
            "rating": 4.0,
            "link": "https://studentwriter.example",
            "studentPerk": True,
        },
    ]

    monkeypatch.setattr(api_routes, "_load_tools", lambda: sample_tools)

    resp = client.post(
        "/api/v1/finder",
        json={
            "goal": "writing",
            "budget": "any",
            "platform": "web",
            "level": "beginner",
            "use_case": "academic essay structures",
        },
    )

    assert resp.status_code == 200
    tools = resp.get_json()["tools"]
    assert len(tools) == 2
    # The one with studentPerk and matching custom use-case should rank first
    assert tools[0]["slug"] == "super-student-writer"

