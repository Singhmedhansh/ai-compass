import json
import os
from unittest.mock import patch, MagicMock
import urllib.error

def test_model_advisor_no_requirements(client):
    response = client.post(
        "/api/v1/model-advisor",
        data=json.dumps({
            "promptTokens": 1000,
            "responseTokens": 500,
            "requestsCount": 2000
        }),
        content_type="application/json"
    )
    assert response.status_code == 400
    data = json.loads(response.data.decode("utf-8"))
    assert "error" in data

def test_model_advisor_no_keys(client):
    # Ensure no keys are present in the environment
    with patch.dict(os.environ, {}, clear=True):
        response = client.post(
            "/api/v1/model-advisor",
            data=json.dumps({
                "requirements": "Need a simple text classifier with low cost."
            }),
            content_type="application/json"
        )
        assert response.status_code == 500
        data = json.loads(response.data.decode("utf-8"))
        assert "error" in data
        assert "not configured" in data["error"]

@patch("urllib.request.urlopen")
def test_model_advisor_gemini_success(mock_urlopen, client):
    # Setup mock Gemini API key
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test-gemini-key"}, clear=True):
        # Setup mock response from urlopen
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": "Based on your requirements, GPT-4o mini is recommended because of its extremely low cost."
                    }]
                }
            }]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        response = client.post(
            "/api/v1/model-advisor",
            data=json.dumps({
                "requirements": "Need a simple text classifier with low cost.",
                "promptTokens": 1000,
                "responseTokens": 500,
                "requestsCount": 2000
            }),
            content_type="application/json"
        )
        
        assert response.status_code == 200
        data = json.loads(response.data.decode("utf-8"))
        assert "recommendation" in data
        assert "GPT-4o mini" in data["recommendation"]

@patch("urllib.request.urlopen")
def test_model_advisor_groq_success(mock_urlopen, client):
    # Setup mock Groq API key and ensure no Gemini key exists
    with patch.dict(os.environ, {"GROQ_API_KEY": "test-groq-key"}, clear=True):
        # Setup mock response from urlopen
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "choices": [{
                "message": {
                    "content": "For low latency requirements, Llama 3.1 70B is recommended."
                }
            }]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        response = client.post(
            "/api/v1/model-advisor",
            data=json.dumps({
                "requirements": "Low latency classification task.",
                "promptTokens": 1000,
                "responseTokens": 500,
                "requestsCount": 2000
            }),
            content_type="application/json"
        )
        
        assert response.status_code == 200
        data = json.loads(response.data.decode("utf-8"))
        assert "recommendation" in data
        assert "Llama 3.1 70B" in data["recommendation"]

@patch("urllib.request.urlopen")
def test_model_advisor_key_rotation_success(mock_urlopen, client):
    # Setup multiple Gemini API keys
    with patch.dict(os.environ, {"GEMINI_API_KEYS": "key-bad,key-good"}, clear=True):
        # Setup mock response for the second key
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            "candidates": [{
                "content": {
                    "parts": [{
                        "text": "Success with second key!"
                    }]
                }
            }]
        }).encode("utf-8")
        mock_response.__enter__.return_value = mock_response

        # Create HTTPError for the first key's failure (429 Rate Limit)
        fp = MagicMock()
        fp.read.return_value = b"Rate limit exceeded"
        err = urllib.error.HTTPError("https://generativelanguage.googleapis.com", 429, "Too Many Requests", {}, fp)

        # Set side effect: first call raises err, second returns mock_response
        mock_urlopen.side_effect = [err, mock_response]

        response = client.post(
            "/api/v1/model-advisor",
            data=json.dumps({
                "requirements": "Need a simple text classifier with low cost.",
                "promptTokens": 1000,
                "responseTokens": 500,
                "requestsCount": 2000
            }),
            content_type="application/json"
        )
        
        assert response.status_code == 200
        data = json.loads(response.data.decode("utf-8"))
        assert "recommendation" in data
        assert data["recommendation"] == "Success with second key!"
        assert mock_urlopen.call_count == 2

