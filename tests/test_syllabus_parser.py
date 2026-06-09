import pytest
import json
from io import BytesIO
from app.services.syllabus_parser import parse_syllabus_local, process_syllabus_and_build_toolkit
from app.models import SyllabusStack

def test_local_parser_heuristic():
    sample_syllabus = """
    CS101: Introduction to Programming with Python
    Course Syllabus
    
    This class covers basics of computer science.
    Assignments:
    - Weekly Python coding exercises
    - Final debugging project
    
    Software required: Python 3.10, VS Code.
    """
    
    parsed = parse_syllabus_local(sample_syllabus)
    assert parsed is not None
    assert "CS101" in parsed["course_name"] or "Introduction" in parsed["course_name"]
    assert parsed["subject_area"] == "Computer Science"
    assert "Python" in parsed["technologies"]
    assert len(parsed["tools_recommendations"]) > 0

def test_api_parse_syllabus_text(client):
    payload = {
        "text": "CS 202: Essay Writing and English Literature class. We have 3 major writing essays."
    }
    
    response = client.post(
        "/api/v1/parse-syllabus",
        data=payload
    )
    
    assert response.status_code == 200
    data = json.loads(response.data.decode("utf-8"))
    assert "share_id" in data
    assert "course_name" in data
    assert "recommendations" in data
    assert len(data["recommendations"]) > 0

def test_api_parse_syllabus_file(client):
    file_content = b"Introduction to Java Programming Course. Deliverable: 5 coding assignments."
    file_data = {
        "file": (BytesIO(file_content), "syllabus.txt")
    }
    
    response = client.post(
        "/api/v1/parse-syllabus",
        data=file_data,
        content_type="multipart/form-data"
    )
    
    assert response.status_code == 200
    data = json.loads(response.data.decode("utf-8"))
    assert "share_id" in data
    assert "recommendations" in data

def test_api_shared_toolkit(client):
    # First create a mock stack row in db
    from app import db
    stack = SyllabusStack(
        share_id="test1234",
        course_name="Introduction to Java",
        subject_area="Computer Science",
        tools_json=json.dumps({
            "is_llm": False,
            "technologies": ["Java"],
            "recommendations": [
                {
                    "slug": "cursor",
                    "name": "Cursor",
                    "category": "Coding",
                    "pricing": "Freemium",
                    "rating": 4.8,
                    "url": "https://cursor.sh",
                    "tagline": "AI Code editor",
                    "custom_reason": "Matches your java syllabus requirement"
                }
            ]
        })
    )
    db.session.add(stack)
    db.session.commit()
    
    response = client.get("/api/v1/shared-toolkit/test1234")
    assert response.status_code == 200
    data = json.loads(response.data.decode("utf-8"))
    assert data["course_name"] == "Introduction to Java"
    assert len(data["recommendations"]) == 1
    assert data["recommendations"][0]["slug"] == "cursor"

def test_api_parse_syllabus_image_no_keys(client):
    # Sends a dummy png byte stream. Since no API keys are present in testing,
    # it should degrade gracefully and return 400 with the error detail.
    image_content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR..."
    file_data = {
        "file": (BytesIO(image_content), "syllabus.png")
    }
    
    response = client.post(
        "/api/v1/parse-syllabus",
        data=file_data,
        content_type="multipart/form-data"
    )
    
    assert response.status_code == 400
    data = json.loads(response.data.decode("utf-8"))
    assert "error" in data
    assert "local fallback does not support image" in data["error"].lower() or "gemini" in data["error"].lower()

def test_normalize_and_save_toolkit_with_external_tool(app):
    from app.services.syllabus_parser import _normalize_and_save_toolkit
    from app.models import CatalogTool
    from app import db
    
    parsed_payload = {
        "course_name": "ME112: Engineering Graphics",
        "subject_area": "Design & Graphics",
        "technologies": ["CAD", "drawing"],
        "tools_recommendations": [
            {
                "tool_slug": "my-new-exclusive-cad-tool",
                "relevance_reason": "Excellent for rendering CAD sketches.",
                "is_external": True,
                "external_metadata": {
                    "name": "ExclCadTool",
                    "url": "https://www.exclcadtool.ai",
                    "category": "Design & Graphics",
                    "pricing": "Freemium",
                    "tagline": "AI creative tools for industrial designers"
                }
            }
        ]
    }
    
    with app.app_context():
        # Before running, clean up if my-new-exclusive-cad-tool exists (though reset cache fixture handles it)
        existing = CatalogTool.query.filter_by(slug="my-new-exclusive-cad-tool").first()
        if existing:
            db.session.delete(existing)
            db.session.commit()
            
        result = _normalize_and_save_toolkit(parsed_payload, is_llm_mode=True)
        
        # Verify result contains the new tool
        assert result["course_name"] == "ME112: Engineering Graphics"
        assert len(result["recommendations"]) == 1
        assert result["recommendations"][0]["slug"] == "my-new-exclusive-cad-tool"
        assert result["recommendations"][0]["name"] == "ExclCadTool"
        assert result["recommendations"][0]["url"] == "https://www.exclcadtool.ai"
        
        # Verify it was inserted in the database
        db_tool = CatalogTool.query.filter_by(slug="my-new-exclusive-cad-tool").first()
        assert db_tool is not None
        assert db_tool.name == "ExclCadTool"


