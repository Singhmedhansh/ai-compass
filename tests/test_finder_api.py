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
