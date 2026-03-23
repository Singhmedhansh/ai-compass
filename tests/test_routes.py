import pytest

def test_homepage(client):
    response = client.get("/")
    assert response.status_code == 200

def test_directory_index(client):
    response = client.get("/directory")
    assert response.status_code == 200
    assert b"Test Category" in response.data
    assert b"Test Tool" in response.data

def test_tool_detail(client):
    response = client.get("/tool/test-tool")
    assert response.status_code == 200
    assert b"Test Tool" in response.data

def test_search_results(client):
    response = client.get("/search?q=Test")
    assert response.status_code == 200
    assert b"Test Tool" in response.data
