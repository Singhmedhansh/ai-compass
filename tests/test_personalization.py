import json
import pytest
from app import db
from app.models import User, Favorite, CatalogTool, SavedStack, ToolView
from app.services.personalized_recommender import RECOMMENDATIONS_CACHE, get_personalized_recommendations
from app.tool_cache import refresh_tools_cache

def _create_mock_tool(slug, name, category, tags, description):
    tool_dict = {
        "slug": slug,
        "name": name,
        "category": category,
        "tags": tags,
        "description": description,
        "pricing": "freemium",
        "rating": 4.5,
    }
    return CatalogTool(
        slug=slug,
        name=name,
        category=category,
        hidden=False,
        data=json.dumps(tool_dict)
    )

@pytest.fixture
def seeded_tools(app):
    """Seed the database with catalog tools for recommendation tests."""
    with app.app_context():
        CatalogTool.query.delete()
        db.session.commit()

        tools = [
            _create_mock_tool("notion", "Notion", "Productivity", ["notes", "organization"], "Perfect note taking tool"),
            _create_mock_tool("chatgpt", "ChatGPT", "Writing & Chat", ["chat", "ai"], "General purpose AI chat assistant"),
            _create_mock_tool("cursor", "Cursor", "Coding", ["code", "ide", "editor"], "AI code editor built for speed"),
            _create_mock_tool("midjourney", "Midjourney", "Image Generation", ["image", "art"], "Stunning image generator"),
            _create_mock_tool("perplexity", "Perplexity", "Research", ["search", "citations"], "AI powered research search engine"),
            _create_mock_tool("grammarly", "Grammarly", "Writing & Chat", ["writing", "grammar"], "Grammar checker and writing assistant"),
        ]

        for tool in tools:
            db.session.add(tool)
        db.session.commit()
        refresh_tools_cache()

    yield
    
    with app.app_context():
        CatalogTool.query.delete()
        db.session.commit()
        refresh_tools_cache()

def test_unauthorized_dashboard_recommendations(client):
    """Verify endpoint returns 401 when accessed anonymously."""
    client.post("/api/v1/auth/logout")
    client.get("/logout")
    resp = client.get("/api/v1/dashboard/recommendations")
    assert resp.status_code == 401

def test_dashboard_recommendations_success(client, app, seeded_tools):
    """Verify recommendations are returned correctly for a logged-in user."""
    with app.app_context():
        # 1. Create and save a user
        user = User(
            email="test_rec@example.com",
            display_name="Rec User",
            preferences=json.dumps({
                "interests": ["code", "notes"],
                "goals": ["build a web app"],
                "skill_level": "intermediate",
                "preferred_pricing": "freemium",
            })
        )
        db.session.add(user)
        db.session.commit()
        user_id = user.id

        # Add cursor as favorite (it should not be recommended again)
        fav = Favorite(user_id=user_id, tool_id="cursor")
        db.session.add(fav)
        db.session.commit()

        # Log user in
        with client.session_transaction() as sess:
            sess["_user_id"] = str(user_id)
            sess["_fresh"] = True

        # Call endpoint (should fall back to TF-IDF or Heuristics in tests as no Gemini key is set)
        resp = client.get("/api/v1/dashboard/recommendations?limit=3")
        assert resp.status_code == 200
        
        data = resp.get_json()
        assert isinstance(data, list)
        assert len(data) <= 3
        
        # Excludes favorite ("cursor")
        recommended_slugs = [item["slug"] for item in data]
        assert "cursor" not in recommended_slugs
        
        # Each recommendation has a relevance reason
        for item in data:
            assert "relevance_reason" in item
            assert len(item["relevance_reason"]) > 0

def test_cache_hits_and_invalidation(client, app, seeded_tools):
    """Verify cache caches repeats and invalidates on changes."""
    with app.app_context():
        RECOMMENDATIONS_CACHE.clear()

        user = User(email="test_cache@example.com", preferences=json.dumps({"interests": ["chat"]}))
        db.session.add(user)
        db.session.commit()
        user_id = user.id

        # 1. Generate recommendations directly to test service caching
        recs_first = get_personalized_recommendations(user, limit=3)
        assert len(recs_first) > 0
        
        # Check cache entry exists
        assert user_id in RECOMMENDATIONS_CACHE
        
        # 2. Get recommendations again (should hit cache)
        recs_second = get_personalized_recommendations(user, limit=3)
        assert recs_first == recs_second
        
        # 3. Add a favorite (should invalidate cache because cache_key changes)
        fav = Favorite(user_id=user_id, tool_id="chatgpt")
        db.session.add(fav)
        db.session.commit()
        
        # Re-fetch user to make sure db relationships are clean
        user = User.query.get(user_id)
        recs_third = get_personalized_recommendations(user, limit=3)
        # The new recommendation set must exclude "chatgpt"
        assert "chatgpt" not in [item["slug"] for item in recs_third]

def test_gemini_key_rotation_and_fallback(client, app, seeded_tools, monkeypatch):
    """Verify key rotation rotates on failures and falls back correctly."""
    with app.app_context():
        user = User(email="test_rotate@example.com", preferences=json.dumps({"interests": ["art"]}))
        db.session.add(user)
        db.session.commit()

        # Configure multiple dummy keys
        monkeypatch.setenv("GEMINI_API_KEYS", "key_dummy_1,key_dummy_2")
        
        post_calls = []

        def mock_post(url, headers=None, json=None, timeout=None):
            post_calls.append(url)
            # Return 429 for the first key to trigger rotation
            if "key_dummy_1" in url:
                class MockResponse429:
                    status_code = 429
                return MockResponse429()
            # Return 200 and custom recommendations for the second key
            elif "key_dummy_2" in url:
                class MockResponse200:
                    status_code = 200
                    def json(self):
                        return {
                            "candidates": [
                                {
                                    "content": {
                                        "parts": [
                                            {
                                                "text": json_response_payload
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                return MockResponse200()
            
            class MockResponse500:
                status_code = 500
            return MockResponse500()

        json_response_payload = json.dumps({
            "recommendations": [
                {"tool_slug": "midjourney", "relevance_reason": "Gemini-powered option for design"},
                {"tool_slug": "notion", "relevance_reason": "Gemini-powered option for text"}
            ]
        })

        import requests
        monkeypatch.setattr(requests, "post", mock_post)

        # Trigger recommendation
        recs = get_personalized_recommendations(user, limit=2)
        
        # Verify both keys were tried (rotation occurred)
        assert len(post_calls) == 2
        assert "key_dummy_1" in post_calls[0]
        assert "key_dummy_2" in post_calls[1]

        # Verify recommendations parsed successfully from Key 2
        slugs = [item["slug"] for item in recs]
        assert "midjourney" in slugs
        assert "notion" in slugs
        
        # Verify relevance reasons are preserved
        relevance_reasons = {item["slug"]: item["relevance_reason"] for item in recs}
        assert relevance_reasons["midjourney"] == "Gemini-powered option for design"


def test_gemini_external_tool_discovery(client, app, seeded_tools, monkeypatch):
    """Verify that external tools suggested by Gemini are automatically registered in the database."""
    with app.app_context():
        # Cleanup any prior run residue for safety
        User.query.filter_by(email="test_external@example.com").delete()
        CatalogTool.query.filter_by(slug="researchbot-ai").delete()
        db.session.commit()

        # 1. Create user with preferences
        user = User(
            email="test_external@example.com",
            preferences=json.dumps({
                "interests": ["research"],
                "goals": ["write a research paper"],
                "skill_level": "beginner",
                "preferred_pricing": "free"
            })
        )
        db.session.add(user)
        db.session.commit()
        user_id = user.id

        # 2. Add a SavedStack
        stack = SavedStack(
            user_id=user_id,
            name="My Research Stack",
            tools_json=json.dumps({"tools": ["perplexity"]})
        )
        db.session.add(stack)

        # 3. Add a ToolView event
        view = ToolView(
            user_id=user_id,
            tool_name="perplexity"
        )
        db.session.add(view)
        db.session.commit()

        # 4. Mock Gemini API keys and requests.post
        monkeypatch.setenv("GEMINI_API_KEYS", "key_dummy_ext")
        
        post_calls = []

        ext_metadata = {
            "name": "ResearchBot AI",
            "url": "https://researchbot.ai",
            "category": "Research",
            "pricing": "Free",
            "tagline": "AI that writes citations and scrapes research articles automatically"
        }

        json_response_payload = json.dumps({
            "recommendations": [
                {
                    "tool_slug": "researchbot-ai",
                    "relevance_reason": "Suggested research scraper for your citation workflow",
                    "is_external": True,
                    "external_metadata": ext_metadata
                }
            ]
        })

        def mock_post_safe(url, **kwargs):
            post_calls.append(url)
            class MockResponse200:
                status_code = 200
                def json(self):
                    return {
                        "candidates": [
                            {
                                "content": {
                                    "parts": [
                                        {
                                            "text": json_response_payload
                                        }
                                    ]
                                }
                            }
                        ]
                    }
            return MockResponse200()

        import requests
        monkeypatch.setattr(requests, "post", mock_post_safe)

        # 5. Call get_personalized_recommendations directly
        user_refetched = User.query.get(user_id)
        recs = get_personalized_recommendations(user_refetched, limit=1)
        
        # Verify the Gemini API was hit
        assert len(post_calls) == 1
        assert "key_dummy_ext" in post_calls[0]

        # Verify recommendation returned has the external tool
        assert len(recs) == 1
        rec = recs[0]
        assert rec["slug"] == "researchbot-ai"
        assert rec["name"] == "ResearchBot AI"
        assert rec["category"] == "Research"
        assert rec["relevance_reason"] == "Suggested research scraper for your citation workflow"
        
        # 6. Verify that it was successfully saved into CatalogTool in DB
        db_tool = CatalogTool.query.filter_by(slug="researchbot-ai").first()
        assert db_tool is not None
        tool_data = json.loads(db_tool.data)
        assert tool_data["name"] == "ResearchBot AI"
        assert tool_data["link"] == "https://researchbot.ai"

        # 7. Log user in and request endpoint to verify integration
        with client.session_transaction() as sess:
            sess["_user_id"] = str(user_id)
            sess["_fresh"] = True

        # Clear cache first so it doesn't just return the local cached result from get_personalized_recommendations
        RECOMMENDATIONS_CACHE.clear()

        resp = client.get("/api/v1/dashboard/recommendations?limit=1")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["slug"] == "researchbot-ai"

        # 8. Check that the newly registered tool can be accessed on details page
        resp_tool = client.get("/api/v1/tools/researchbot-ai")
        assert resp_tool.status_code == 200
        tool_detail = resp_tool.get_json()
        assert tool_detail["name"] == "ResearchBot AI"


def test_update_profile_preferences(client, app):
    """Verify that updating profile preferences via PUT endpoint correctly updates the user's columns, onboarding completion status, and clears the recommendations cache."""
    with app.app_context():
        # Clean prior run residue
        User.query.filter_by(email="test_pref@example.com").delete()
        db.session.commit()

        # 1. Create a user
        user = User(
            email="test_pref@example.com",
            display_name="Preference Test User",
            onboarding_completed=False
        )
        db.session.add(user)
        db.session.commit()
        user_id = user.id

        # 2. Log in
        with client.session_transaction() as sess:
            sess["_user_id"] = str(user_id)
            sess["_fresh"] = True

        # 3. Request preference update
        payload = {
            "interests": ["Coding", "Research"],
            "goals": ["Build software Projects", "Academic Writing"],
            "skill_level": "advanced",
            "pricing_pref": "free"
        }
        resp = client.put("/api/v1/profile/preferences", json=payload)
        assert resp.status_code == 200
        
        data = resp.get_json()
        assert data["onboarding_completed"] is True
        assert "Coding" in data["interests"]
        assert "Research" in data["interests"]
        assert "Build software Projects" in data["goals"]
        assert "Academic Writing" in data["goals"]
        assert data["skill_level"] == "advanced"
        assert data["pricing_pref"] == "free"

        # 4. Verify database updates
        user_db = User.query.get(user_id)
        assert user_db.onboarding_completed is True
        assert user_db.interests == "Coding,Research"
        assert user_db.goals == "Build software Projects,Academic Writing"
        assert user_db.skill_level == "advanced"
        assert user_db.pricing_pref == "free"

        # Verify parsed preferences JSON
        prefs = json.loads(user_db.preferences)
        assert "interests" in prefs
        assert "goals" in prefs
        assert prefs["skill_level"] == "advanced"
        assert prefs["preferred_pricing"] == "free"


