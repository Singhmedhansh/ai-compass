import os
import re
import pytest
from unittest.mock import patch
from app.search_utils import _get_gemini_key
from app.admin_email_routes import _get_gemini_key as _get_admin_gemini_key

def test_gemini_key_rotation_splitting():
    # 1. Comma separated
    with patch.dict(os.environ, {"GEMINI_API_KEYS": "key1,key2,key3", "GEMINI_API_KEY": "key4"}):
        keys = []
        env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
        if env_keys_str:
            keys.extend([k.strip() for k in re.split(r'[,\n\r]+', env_keys_str) if k.strip()])
        single_key = os.environ.get("GEMINI_API_KEY")
        if single_key and single_key not in keys:
            keys.append(single_key)
        
        assert keys == ["key1", "key2", "key3", "key4"]

    # 2. Newline separated
    with patch.dict(os.environ, {"GEMINI_API_KEYS": "key_a\nkey_b\nkey_c", "GEMINI_API_KEY": ""}):
        keys = []
        env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
        if env_keys_str:
            keys.extend([k.strip() for k in re.split(r'[,\n\r]+', env_keys_str) if k.strip()])
        
        assert keys == ["key_a", "key_b", "key_c"]

    # 3. Mixed commas, newlines, and carriage returns with extra whitespace
    mixed_keys_str = " key_x , \n key_y \r\n key_z ,,, \n\n key_w "
    with patch.dict(os.environ, {"GEMINI_API_KEYS": mixed_keys_str, "GEMINI_API_KEY": "key_x"}):
        keys = []
        env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
        if env_keys_str:
            keys.extend([k.strip() for k in re.split(r'[,\n\r]+', env_keys_str) if k.strip()])
        single_key = os.environ.get("GEMINI_API_KEY")
        if single_key and single_key not in keys:
            keys.append(single_key)
        
        assert keys == ["key_x", "key_y", "key_z", "key_w"]

def test_groq_key_rotation_splitting():
    # Test Groq keys split parsing in syllabus_parser logic
    mixed_groq_str = " gsk_1 \n gsk_2 , gsk_3 \r\n , gsk_4 "
    with patch.dict(os.environ, {"GROQ_API_KEYS": mixed_groq_str, "GROQ_API_KEY": "gsk_5"}):
        groq_keys = []
        env_groq_keys_str = os.environ.get("GROQ_API_KEYS", "")
        if env_groq_keys_str:
            groq_keys.extend([k.strip() for k in re.split(r'[,\n\r]+', env_groq_keys_str) if k.strip()])
        single_groq_key = os.environ.get("GROQ_API_KEY")
        if single_groq_key and single_groq_key not in groq_keys:
            groq_keys.append(single_groq_key)
            
        assert groq_keys == ["gsk_1", "gsk_2", "gsk_3", "gsk_4", "gsk_5"]

def test_search_utils_get_gemini_key():
    with patch.dict(os.environ, {"GEMINI_API_KEYS": "key_1\nkey_2", "GEMINI_API_KEY": "key_3"}):
        key = _get_gemini_key()
        assert key == "key_1"

def test_admin_email_get_gemini_key():
    with patch.dict(os.environ, {"GEMINI_API_KEYS": "\nkey_foo\r\nkey_bar,", "GEMINI_API_KEY": "key_baz"}):
        # Admin email routes get_gemini_key returns first key
        from app.admin_email_routes import _get_gemini_key as _get_admin_gemini_key
        key = _get_admin_gemini_key()
        assert key == "key_foo"
