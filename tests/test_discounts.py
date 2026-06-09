import json
import pytest
from app.tool_cache import refresh_tools_cache
from app import db
from app.models import CatalogTool


def _make_mock_tool(slug, name, category, student_perk, rating, pricing_detail, description="Description"):
    tool_dict = {
        "slug": slug,
        "name": name,
        "category": category,
        "studentPerk": student_perk,
        "student_perk": student_perk,
        "rating": rating,
        "pricingDetail": pricing_detail,
        "description": description
    }
    return CatalogTool(
        slug=slug,
        name=name,
        category=category,
        hidden=False,
        data=json.dumps(tool_dict)
    )


@pytest.fixture
def mock_student_tools(app):
    """Seed the database with at least 6 mock tools (3 student, 3 non-student) to test discounts."""
    CatalogTool.query.delete()
    db.session.commit()

    # Seed 6 tools so db_count > 5 and does not fall back to tools.json
    tools_to_seed = [
        # Tool 1: Student perk, no percentage, low rating
        _make_mock_tool("alpha-ai", "Alpha AI", "Writing & Chat", True, 3.5, "Free tier; Student discount available"),
        # Tool 2: Student perk, UNiDAYS in partner list, medium rating
        _make_mock_tool("grammarly", "Grammarly", "Writing & Chat", True, 4.0, "Free basic; Premium available"),
        # Tool 3: Student tool, 50% discount in pricing detail, high rating
        _make_mock_tool("beta-coder", "Beta Coder", "Coding", True, 4.8, "50% student discount for .edu emails"),
        # Tool 4: Non-student tool 1
        _make_mock_tool("non-student-1", "NonStudent1", "Coding", False, 4.0, "$10/month"),
        # Tool 5: Non-student tool 2
        _make_mock_tool("non-student-2", "NonStudent2", "Research", False, 4.0, "$20/month"),
        # Tool 6: Non-student tool 3
        _make_mock_tool("non-student-3", "NonStudent3", "Research", False, 4.0, "$30/month"),
    ]

    for tool in tools_to_seed:
        db.session.add(tool)
    db.session.commit()
    
    refresh_tools_cache()
    
    yield
    
    # Cleanup
    CatalogTool.query.delete()
    db.session.commit()
    refresh_tools_cache()


def test_student_discounts_endpoint(client, mock_student_tools):
    """Verify endpoint filters, extracts discounts, and sorts results correctly."""
    resp = client.get("/api/v1/student-discounts")
    assert resp.status_code == 200
    
    data = resp.json
    assert "results" in data
    assert "total" in data
    
    results = data["results"]
    # We seeded 3 student tools (Alpha AI, Grammarly, Beta Coder)
    assert len(results) == 3
    
    # Verify exact discount extraction and UNiDAYS matching
    tool_map = {t["slug"]: t for t in results}
    
    # Beta Coder: 50% Off
    assert "beta-coder" in tool_map
    assert tool_map["beta-coder"]["discount_val"] == "50% Off"
    assert tool_map["beta-coder"]["unidays_verified"] is False
    
    # Grammarly: UNiDAYS verified (Grammarly is in UNIDAYS_PARTNERS)
    assert "grammarly" in tool_map
    assert tool_map["grammarly"]["unidays_verified"] is True
    
    # Alpha AI: Student Discount fallback
    assert "alpha-ai" in tool_map
    assert tool_map["alpha-ai"]["discount_val"] == "Student Discount"
    assert tool_map["alpha-ai"]["unidays_verified"] is False
    
    # Verify sorting: UNiDAYS Verified first, then rating descending
    # Expected order:
    # 1. Grammarly (UNiDAYS = True)
    # 2. Beta Coder (UNiDAYS = False, Rating = 4.8)
    # 3. Alpha AI (UNiDAYS = False, Rating = 3.5)
    assert results[0]["slug"] == "grammarly"
    assert results[1]["slug"] == "beta-coder"
    assert results[2]["slug"] == "alpha-ai"


def test_student_discounts_empty_catalog(client):
    """Verify endpoint returns empty list when no student tools are available."""
    CatalogTool.query.delete()
    db.session.commit()
    
    # Seed 6 tools, all with student_perk = False, to satisfy db_count > 5
    tools_to_seed = [
        _make_mock_tool(f"non-student-{i}", f"NonStudent {i}", "Coding", False, 4.0, "$10/month")
        for i in range(1, 7)
    ]
    for tool in tools_to_seed:
        db.session.add(tool)
    db.session.commit()
    
    refresh_tools_cache()
    
    resp = client.get("/api/v1/student-discounts")
    assert resp.status_code == 200
    data = resp.json
    assert data["total"] == 0
    assert len(data["results"]) == 0
    
    # Cleanup
    CatalogTool.query.delete()
    db.session.commit()
    refresh_tools_cache()


def test_seo_route_and_sitemap(client):
    """Verify the student-discounts route is registered for SEO and in sitemap."""
    # 1. Verify route serves the React Shell with 200 OK
    resp = client.get("/student-discounts")
    assert resp.status_code == 200
    html_content = resp.data.decode("utf-8")
    assert "Student AI Discounts" in html_content
    assert "UNiDAYS" in html_content
    
    # 2. Verify sitemap.xml contains the route
    resp = client.get("/sitemap.xml")
    assert resp.status_code == 200
    sitemap_content = resp.data.decode("utf-8")
    assert "/student-discounts" in sitemap_content
