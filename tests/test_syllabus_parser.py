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
