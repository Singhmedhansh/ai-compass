import os
import re
import json
import uuid
import requests
from datetime import datetime, timezone
from app.models import SyllabusStack
from app import db

# Try loading extraction libraries
try:
    import pypdf
    pypdf_available = True
except ImportError:
    pypdf_available = False

try:
    import docx
    docx_available = True
except ImportError:
    docx_available = False

# List of the most critical student tools for prompt priming to help the LLM select correct slugs
POPULAR_TOOLS_LIST = [
    {"name": "ChatGPT", "slug": "chatgpt", "category": "Writing & Chat", "description": "Conversational writing, brainstorming, and editing"},
    {"name": "Claude", "slug": "claude", "category": "Writing & Chat", "description": "Long document analysis, complex coding, and structured reasoning"},
    {"name": "Gemini", "slug": "gemini", "category": "Writing & Chat", "description": "Multi-modal analysis, Google Workspace integration"},
    {"name": "Cursor", "slug": "cursor", "category": "Coding", "description": "AI-first code editor with codebase-aware chat and inline edits"},
    {"name": "GitHub Copilot", "slug": "github-copilot", "category": "Coding", "description": "IDE autocomplete for programming files"},
    {"name": "Codeium", "slug": "codeium", "category": "Coding", "description": "Free coding autocomplete and terminal chat"},
    {"name": "Tabnine", "slug": "tabnine", "category": "Coding", "description": "Privacy-first local AI code completion"},
    {"name": "Perplexity AI", "slug": "perplexity-ai", "category": "Research", "description": "Academic search engine that answers questions with web citations"},
    {"name": "Elicit", "slug": "elicit", "category": "Research", "description": "Finds, groups, and summarizes research papers"},
    {"name": "Consensus", "slug": "consensus", "category": "Research", "description": "Finds scientific consensus and aggregates paper outcomes"},
    {"name": "ResearchRabbit", "slug": "researchrabbit", "category": "Research", "description": "Visual mapping tool for academic citation networks"},
    {"name": "Quillbot", "slug": "quillbot", "category": "Writing & Chat", "description": "Grammar checker, summarizer, and paraphraser"},
    {"name": "Grammarly", "slug": "grammarly", "category": "Writing & Chat", "description": "Spelling, voice alignment, and final pass polish"},
    {"name": "Notion", "slug": "notion", "category": "Productivity", "description": "Study wikis, planner, and workspace database notes"},
    {"name": "Otter.ai", "slug": "otter-ai", "category": "Productivity", "description": "Meeting recorder and lecture transcriptions"},
    {"name": "Canva", "slug": "canva", "category": "Design & Graphics", "description": "Presentations, syllabus slides, and visual graphics"},
    {"name": "Midjourney", "slug": "midjourney", "category": "Image Generation", "description": "High-fidelity artistic prompts and image generations"},
    {"name": "Runway Gen-3", "slug": "runway-gen-3", "category": "Video Generation", "description": "Video prompts and animations"},
    {"name": "Suno", "slug": "suno", "category": "Audio & Voice", "description": "Text to full musical tracks and audio"},
    {"name": "ElevenLabs", "slug": "elevenlabs", "category": "Audio & Voice", "description": "Text to speech voiceovers"},
    {"name": "Vercel v0", "slug": "vercel-v0", "category": "Coding", "description": "Frontend React/HTML layout generator"},
]

def extract_text_from_file(file_stream, filename):
    """Extracts raw text from a PDF, DOCX, or text file."""
    ext = os.path.splitext(filename or "")[1].lower()
    
    if ext == ".pdf":
        if not pypdf_available:
            return "[Error: pypdf library is not installed on this server]"
        try:
            reader = pypdf.PdfReader(file_stream)
            text = ""
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
                # Cap extremely long files at 25 pages to avoid memory/rate limit overflows
                if i >= 25:
                    text += "\n[Truncated syllabus due to length]\n"
                    break
            return text
        except Exception as e:
            return f"[Error parsing PDF: {str(e)}]"
            
    elif ext == ".docx":
        if not docx_available:
            return "[Error: python-docx library is not installed on this server]"
        try:
            doc = docx.Document(file_stream)
            text = ""
            for para in doc.paragraphs:
                text += para.text + "\n"
            # Cap at 50,000 characters
            if len(text) > 50000:
                text = text[:50000] + "\n[Truncated syllabus due to length]\n"
            return text
        except Exception as e:
            return f"[Error parsing DOCX: {str(e)}]"
            
    else:
        # Fallback for plain text files
        try:
            content = file_stream.read()
            if isinstance(content, bytes):
                return content.decode("utf-8", errors="ignore")
            return str(content)
        except Exception as e:
            return f"[Error reading text file: {str(e)}]"

def parse_syllabus_llm(syllabus_text):
    """
    Calls Google Gemini using direct API calls with rate-limit key rotation.
    Returns parsed metadata dict or None if all keys are exhausted.
    """
    # 1. Gather all API keys
    keys = []
    env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
    if env_keys_str:
        keys.extend([k.strip() for k in env_keys_str.split(",") if k.strip()])
    
    # Fallback to single key if config uses that
    single_key = os.environ.get("GEMINI_API_KEY")
    if single_key and single_key not in keys:
        keys.append(single_key)
        
    if not keys:
        print("[Syllabus Parser] No GEMINI_API_KEYS configured. Falling back to local parser.")
        return None

    # Limit payload text size
    max_len = 15000
    trimmed_text = syllabus_text[:max_len] + "..." if len(syllabus_text) > max_len else syllabus_text

    tools_str = json.dumps(POPULAR_TOOLS_LIST, indent=2)

    prompt = f"""
You are an expert academic assistant. Analyze the syllabus text provided below and identify the student resources they will need to succeed in this course.

List of popular tools available in our directory:
{tools_str}

Syllabus Text:
---
{trimmed_text}
---

Your response MUST be a valid JSON object matching the following structure:
{{
  "course_name": "extracted course name and code, e.g. CS201: Data Structures",
  "subject_area": "general subject, e.g. Computer Science, Chemistry, English",
  "technologies": ["list of technologies mentioned, e.g. Python, Java, writing, papers"],
  "tools_recommendations": [
    {{
      "tool_slug": "slug of recommended tool from the provided list",
      "relevance_reason": "Specific custom reason (under 120 chars) connecting the tool directly to coursework.",
      "is_external": false
    }},
    {{
      "tool_slug": "unique-lowercase-slug-of-the-external-tool",
      "relevance_reason": "Specific custom reason connecting the tool to the course.",
      "is_external": true,
      "external_metadata": {{
        "name": "Name of the external tool",
        "url": "Website URL of the tool starting with https://",
        "category": "One of: Coding, Writing & Chat, Research, Productivity, Image Generation, Video Generation, Audio & Voice",
        "pricing": "One of: Free, Freemium, Paid",
        "tagline": "A short, descriptive tagline for the tool (under 100 chars)"
      }}
    }}
  ]
}}

Instructions on recommending tools:
1. Try to recommend relevant tools from the popular tools list first.
2. If there are highly specialized AI tools that would be significantly better for this specific course but are NOT in the popular tools list (e.g. Vizcom or Kaedim for engineering graphics, specialized CAD AI assistants, math equation solvers, chemistry simulation AIs), you may recommend them as external tools.
3. For any external tool recommended, you MUST set `is_external` to true and provide the `external_metadata` object. For catalog tools, set `is_external` to false.

Provide ONLY the raw JSON output. Do not wrap it in markdown code blocks like ```json.
"""

    # 2. Iterate keys to attempt parsing
    for i, key in enumerate(keys):
        try:
            # Using Gemini 1.5 Flash as standard for structured JSON tasks
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
            headers = {"Content-Type": "application/json"}
            
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "OBJECT",
                        "properties": {
                            "course_name": {"type": "STRING"},
                            "subject_area": {"type": "STRING"},
                            "technologies": {"type": "ARRAY", "items": {"type": "STRING"}},
                            "tools_recommendations": {
                                "type": "ARRAY",
                                "items": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "tool_slug": {"type": "STRING"},
                                        "relevance_reason": {"type": "STRING"},
                                        "is_external": {"type": "BOOLEAN"},
                                        "external_metadata": {
                                            "type": "OBJECT",
                                            "properties": {
                                                "name": {"type": "STRING"},
                                                "url": {"type": "STRING"},
                                                "category": {"type": "STRING"},
                                                "pricing": {"type": "STRING"},
                                                "tagline": {"type": "STRING"}
                                            },
                                            "required": ["name", "url", "category", "pricing", "tagline"]
                                        }
                                    },
                                    "required": ["tool_slug", "relevance_reason", "is_external"]
                                }
                            }
                        },
                        "required": ["course_name", "subject_area", "technologies", "tools_recommendations"]
                    }
                }
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=6)
            
            if response.status_code == 429:
                print(f"[Syllabus Parser] Key {i+1} hit rate limits (429). Rotating...")
                continue
            elif response.status_code != 200:
                print(f"[Syllabus Parser] Key {i+1} failed with status {response.status_code}. Rotating...")
                continue
                
            res_data = response.json()
            # Extract content text
            content_text = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            
            start_idx = content_text.find('{')
            end_idx = content_text.rfind('}')
            if start_idx != -1 and end_idx != -1:
                content_text = content_text[start_idx:end_idx+1]
            
            # Load as json
            parsed = json.loads(content_text.strip())
            return parsed
            
        except Exception as e:
            print(f"[Syllabus Parser] Exception during API attempt with Key {i+1}: {str(e)}")
            continue
            
    # --- ATTEMPT GROQ ROTATION ---
    groq_keys = []
    env_groq_keys_str = os.environ.get("GROQ_API_KEYS", "")
    if env_groq_keys_str:
        groq_keys.extend([k.strip() for k in env_groq_keys_str.split(",") if k.strip()])
    single_groq_key = os.environ.get("GROQ_API_KEY")
    if single_groq_key and single_groq_key not in groq_keys:
        groq_keys.append(single_groq_key)

    if groq_keys:
        for i, key in enumerate(groq_keys):
            try:
                print(f"[Syllabus Parser] Attempting Groq API Key {i+1}...")
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": "You are a professional syllabus parser. Reply only with valid JSON matching the requested schema."},
                        {"role": "user", "content": prompt}
                    ],
                    "response_format": {"type": "json_object"}
                }
                response = requests.post(url, headers=headers, json=payload, timeout=6)
                if response.status_code == 200:
                    res_data = response.json()
                    content_text = res_data["choices"][0]["message"]["content"].strip()
                    
                    start_idx = content_text.find('{')
                    end_idx = content_text.rfind('}')
                    if start_idx != -1 and end_idx != -1:
                        content_text = content_text[start_idx:end_idx+1]
                    
                    parsed = json.loads(content_text.strip())
                    return parsed
                else:
                    print(f"[Syllabus Parser] Groq Key {i+1} failed with status {response.status_code}.")
            except Exception as e:
                print(f"[Syllabus Parser] Groq Key {i+1} error: {str(e)}")
                continue

    print("[Syllabus Parser] All Gemini and Groq keys exhausted. Falling back to local parsing.")
    return None

def parse_syllabus_local(syllabus_text):
    """
    Local fallback parser. Analyzes keywords, extracts headers,
    and runs TF-IDF vector similarity queries against tools.json.
    """
    # 1. Extrapolate Course Name from top of text
    lines = [line.strip() for line in syllabus_text.split("\n") if line.strip()]
    course_name = "Course Syllabus"
    for line in lines[:8]:
        # Look for code structures like CS201, CS 101, CHEM-102, ENG 1A
        if re.search(r'\b[A-Za-z]{2,4}\s*\-?\s*\d{3,4}\b', line) or "course" in line.lower() or "syllabus" in line.lower() or "introduction to" in line.lower():
            if len(line) < 60:
                course_name = line
                break
    
    if course_name == "Course Syllabus" and lines:
        course_name = lines[0][:50]

    # 2. Extract technologies & interests
    text_lower = syllabus_text.lower()
    detected_techs = []
    subject_area = "General Education"
    
    tech_keywords = {
        "Python": ["python", "py", "anaconda", "numpy", "pandas", "matplotlib"],
        "Java": ["java", "jdk", "jvm", "eclipse", "intellij"],
        "C/C++": ["c++", "cpp", "gcc", "clang"],
        "Web Development": ["javascript", "html", "css", "react", "vue", "frontend", "node.js"],
        "Database": ["sql", "sqlite", "postgresql", "mysql", "database", "databases"],
        "Writing & Essays": ["essay", "report", "paper", "writing", "composition", "thesis", "summarize", "literature"],
        "Academic Papers": ["citation", "academic", "journal", "ieee", "arxiv", "pubmed", "bibtex"],
        "Presentations": ["presentation", "slides", "powerpoint", "keynote", "ppt"],
        "Calculus & Math": ["calculus", "linear algebra", "statistics", "math", "equations", "derivatives"],
        "Video Editing": ["video", "youtube", "editing", "cut", "premiere", "frame"],
        "Audio": ["podcast", "audio", "voice", "transcribe", "recording"]
    }
    
    for tech, kws in tech_keywords.items():
        if any(kw in text_lower for kw in kws):
            detected_techs.append(tech)
            
    # Classify subject area based on tags
    tech_set = set(detected_techs)
    if {"Python", "Java", "C/C++", "Web Development", "Database"} & tech_set:
        subject_area = "Computer Science"
    elif {"Calculus & Math"} & tech_set:
        subject_area = "Mathematics"
    elif {"Writing & Essays", "Academic Papers"} & tech_set:
        subject_area = "Humanities / Science"
    elif {"Video Editing", "Audio"} & tech_set:
        subject_area = "Communications / Media"

    # 3. TF-IDF recommendation fallback
    from app.ml_recommender import semantic_search
    
    # Run queries based on tech terms
    results = []
    seen_slugs = set()
    
    search_queries = []
    if detected_techs:
        search_queries.append(" ".join(detected_techs))
    search_queries.append(subject_area)
    search_queries.append("student friendly free study writing")
    
    # Query semantic search using existing ML index
    for query in search_queries:
        matches = semantic_search(query, limit=5)
        for tool in matches:
            slug = tool.get("slug")
            if slug and slug not in seen_slugs:
                seen_slugs.add(slug)
                # Map reason
                category = tool.get("category", "")
                reason = f"Excellent {category} assistant for your {subject_area} workload."
                results.append({
                    "tool_slug": slug,
                    "relevance_reason": reason
                })
        if len(results) >= 6:
            break
            
    # Default fallback list if everything else yields empty results
    if not results:
        results = [
            {"tool_slug": "chatgpt", "relevance_reason": "All-around tool for brainstorming course content"},
            {"tool_slug": "perplexity-ai", "relevance_reason": "Ideal search companion to find sources for assignments"},
            {"tool_slug": "notion", "relevance_reason": "Keep all your syllabus items and lecture notes in one database"}
        ]
        
    return {
        "course_name": course_name,
        "subject_area": subject_area,
        "technologies": detected_techs,
        "tools_recommendations": results[:6]
    }

def parse_syllabus_image_llm(image_bytes, mimetype):
    """
    Calls Gemini API with an image payload (multimodal) using key rotation.
    Returns parsed metadata dict or None if rate limited/no keys.
    """
    import base64
    
    keys = []
    errors = []
    
    env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
    if env_keys_str:
        keys.extend([k.strip() for k in env_keys_str.split(",") if k.strip()])
    
    single_key = os.environ.get("GEMINI_API_KEY")
    if single_key and single_key not in keys:
        keys.append(single_key)
        
    if not keys:
        print("[Syllabus Parser] No GEMINI_API_KEYS configured for image parsing.")
        return None

    # Base64 encode the image bytes
    base64_data = base64.b64encode(image_bytes).decode("utf-8")

    tools_str = json.dumps(POPULAR_TOOLS_LIST, indent=2)

    prompt = f"""
You are an expert academic assistant. Analyze the syllabus image provided and identify the student resources they will need to succeed in this course.

List of popular tools available in our directory:
{tools_str}

Your response MUST be a valid JSON object matching the following structure:
{{
  "course_name": "extracted course name and code, e.g. CS201: Data Structures",
  "subject_area": "general subject, e.g. Computer Science, Chemistry, English",
  "technologies": ["list of technologies mentioned, e.g. Python, Java, writing, papers"],
  "tools_recommendations": [
    {{
      "tool_slug": "slug of recommended tool from the provided list",
      "relevance_reason": "Specific custom reason (under 120 chars) connecting the tool directly to coursework.",
      "is_external": false
    }},
    {{
      "tool_slug": "unique-lowercase-slug-of-the-external-tool",
      "relevance_reason": "Specific custom reason connecting the tool to the course.",
      "is_external": true,
      "external_metadata": {{
        "name": "Name of the external tool",
        "url": "Website URL of the tool starting with https://",
        "category": "One of: Coding, Writing & Chat, Research, Productivity, Image Generation, Video Generation, Audio & Voice",
        "pricing": "One of: Free, Freemium, Paid",
        "tagline": "A short, descriptive tagline for the tool (under 100 chars)"
      }}
    }}
  ]
}}

Instructions on recommending tools:
1. Try to recommend relevant tools from the popular tools list first.
2. If there are highly specialized AI tools that would be significantly better for this specific course but are NOT in the popular tools list (e.g. Vizcom or Kaedim for engineering graphics, specialized CAD AI assistants, math equation solvers, chemistry simulation AIs), you may recommend them as external tools.
3. For any external tool recommended, you MUST set `is_external` to true and provide the `external_metadata` object. For catalog tools, set `is_external` to false.

Provide ONLY the raw JSON output. Do not wrap it in markdown code blocks like ```json.
"""

    for i, key in enumerate(keys):
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
            headers = {"Content-Type": "application/json"}
            
            payload = {
                "contents": [{
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": mimetype,
                                "data": base64_data
                            }
                        },
                        {
                            "text": prompt
                        }
                    ]
                }],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "OBJECT",
                        "properties": {
                            "course_name": {"type": "STRING"},
                            "subject_area": {"type": "STRING"},
                            "technologies": {"type": "ARRAY", "items": {"type": "STRING"}},
                            "tools_recommendations": {
                                "type": "ARRAY",
                                "items": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "tool_slug": {"type": "STRING"},
                                        "relevance_reason": {"type": "STRING"},
                                        "is_external": {"type": "BOOLEAN"},
                                        "external_metadata": {
                                            "type": "OBJECT",
                                            "properties": {
                                                "name": {"type": "STRING"},
                                                "url": {"type": "STRING"},
                                                "category": {"type": "STRING"},
                                                "pricing": {"type": "STRING"},
                                                "tagline": {"type": "STRING"}
                                            },
                                            "required": ["name", "url", "category", "pricing", "tagline"]
                                        }
                                    },
                                    "required": ["tool_slug", "relevance_reason", "is_external"]
                                }
                            }
                        },
                        "required": ["course_name", "subject_area", "technologies", "tools_recommendations"]
                    }
                }
            }
            
            response = requests.post(url, headers=headers, json=payload, timeout=20)
            
            if response.status_code == 429:
                print(f"[Syllabus Parser] Key {i+1} hit rate limits (429). Rotating...")
                continue
            elif response.status_code != 200:
                print(f"[Syllabus Parser] Key {i+1} failed with status {response.status_code}. Rotating...")
                continue
                
            res_data = response.json()
            content_text = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            
            start_idx = content_text.find('{')
            end_idx = content_text.rfind('}')
            if start_idx != -1 and end_idx != -1:
                content_text = content_text[start_idx:end_idx+1]
            
            parsed = json.loads(content_text.strip())
            return parsed
            
        except Exception as e:
            err_msg = str(e)
            print(f"[Syllabus Parser] Exception during API attempt with Key {i+1}: {err_msg}")
            errors.append(f"Gemini Key {i+1}: {err_msg}")
            continue
            
    # --- ATTEMPT GROQ ROTATION FOR IMAGES ---
    groq_keys = []
    env_groq_keys_str = os.environ.get("GROQ_API_KEYS", "")
    if env_groq_keys_str:
        groq_keys.extend([k.strip() for k in env_groq_keys_str.split(",") if k.strip()])
    single_groq_key = os.environ.get("GROQ_API_KEY")
    if single_groq_key and single_groq_key not in groq_keys:
        groq_keys.append(single_groq_key)

    if groq_keys:
        for i, key in enumerate(groq_keys):
            try:
                print(f"[Syllabus Parser] Attempting Groq Vision API Key {i+1}...")
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.2-90b-vision-preview",
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mimetype};base64,{base64_data}"
                                    }
                                }
                            ]
                        }
                    ]
                }
                
                response = requests.post(url, headers=headers, json=payload, timeout=20)
                if response.status_code == 429:
                    print(f"[Syllabus Parser] Groq Vision Key {i+1} hit rate limits (429). Rotating...")
                    continue
                elif response.status_code != 200:
                    err_text = response.text
                    print(f"[Syllabus Parser] Groq Vision Key {i+1} failed with status {response.status_code}. {err_text}")
                    errors.append(f"Groq Key {i+1} ({response.status_code}): {err_text}")
                    continue
                    
                res_data = response.json()
                content_text = res_data["choices"][0]["message"]["content"].strip()
                
                start_idx = content_text.find('{')
                end_idx = content_text.rfind('}')
                if start_idx != -1 and end_idx != -1:
                    content_text = content_text[start_idx:end_idx+1]
                
                parsed = json.loads(content_text.strip())
                return parsed
                
            except Exception as e:
                err_msg = str(e)
                print(f"[Syllabus Parser] Exception during Groq Vision API attempt with Key {i+1}: {err_msg}")
                errors.append(f"Groq Key {i+1} Exception: {err_msg}")
                continue

    return {"error": "All APIs failed. Details: " + " | ".join(errors)}

def _normalize_and_save_toolkit(parsed, is_llm_mode):
    """Enriches matches from tools.json, generates share ID, saves stack, and returns payload."""
    from app.tool_cache import get_cached_tools
    
    cached_tools = get_cached_tools() or []
    tools_by_slug = {t.get("slug"): t for t in cached_tools}
    
    normalized_recommendations = []
    for rec in parsed.get("tools_recommendations", []):
        slug = rec.get("tool_slug", "").strip().lower()
        reason = rec.get("relevance_reason", "").strip()
        
        # Match slug exactly or fuzzy match if LLM returned slightly off slug
        tool = tools_by_slug.get(slug)
        if not tool:
            # Try keyword match on key
            for cached_slug, t in tools_by_slug.items():
                if slug in cached_slug or cached_slug in slug:
                    tool = t
                    slug = cached_slug
                    break

        # If still not found, check if it's an external tool suggestion
        if not tool and rec.get("is_external") and rec.get("external_metadata"):
            meta = rec.get("external_metadata")
            ext_name = meta.get("name", "").strip()
            ext_url = meta.get("url", "").strip()
            if ext_name and ext_url:
                ext_slug = slug or re.sub(r"[^a-z0-9]+", "-", ext_name.lower()).strip("-")
                tool = {
                    "name": ext_name,
                    "slug": ext_slug,
                    "tagline": meta.get("tagline", "Specialized AI tool recommended for this syllabus course."),
                    "category": meta.get("category", "Productivity"),
                    "pricing": meta.get("pricing", "Freemium"),
                    "price": meta.get("pricing", "Freemium"),
                    "link": ext_url,
                    "url": ext_url,
                    "description": meta.get("tagline", "Specialized AI tool recommended for this syllabus course."),
                    "use_cases": [meta.get("tagline", "Course tasks support")],
                    "tags": [meta.get("category", "Productivity").lower(), "external-added"],
                    "rating": 4.0,
                    "review_count": 1,
                    "platforms": ["Web"],
                    "difficulty": "beginner",
                    "logo_emoji": "⚡",
                    "hidden": False
                }
                try:
                    from app.catalog_store import upsert_tool
                    from app.tool_cache import refresh_tools_cache
                    upsert_tool(tool)
                    refresh_tools_cache()
                    # Re-retrieve after caching to get database structure correct
                    cached_tools = get_cached_tools() or []
                    tools_by_slug = {t.get("slug"): t for t in cached_tools}
                    tool = tools_by_slug.get(ext_slug) or tool
                    slug = ext_slug
                except Exception as db_err:
                    print(f"[Syllabus Parser] Failed to insert external tool {ext_name}: {str(db_err)}")
        
        if tool:
            normalized_recommendations.append({
                "slug": slug,
                "name": tool.get("name"),
                "category": tool.get("category", "Productivity"),
                "pricing": tool.get("pricing", "Freemium"),
                "rating": tool.get("rating", 4.0),
                "url": tool.get("link") or tool.get("url"),
                "tagline": tool.get("tagline") or tool.get("shortDescription") or "",
                "custom_reason": reason or f"Top-rated helper matching your syllabus requirements."
            })
            
    # If LLM mapping failed to return matches, get top trending in their subject category
    if not normalized_recommendations:
        # Fallback to general list
        for slug in ["chatgpt", "perplexity-ai", "notion"]:
            tool = tools_by_slug.get(slug)
            if tool:
                normalized_recommendations.append({
                    "slug": slug,
                    "name": tool.get("name"),
                    "category": tool.get("category"),
                    "pricing": tool.get("pricing"),
                    "rating": tool.get("rating"),
                    "url": tool.get("link"),
                    "tagline": tool.get("tagline") or "",
                    "custom_reason": "High-quality academic helper verified for this study subject."
                })

    # Persist output in SyllabusStack
    share_id = str(uuid.uuid4())[:8] # Unique share id
    
    stack = SyllabusStack(
        share_id=share_id,
        course_name=parsed.get("course_name", "Curriculum Stack"),
        subject_area=parsed.get("subject_area", "General Academic"),
        tools_json=json.dumps({
            "is_llm": is_llm_mode,
            "technologies": parsed.get("technologies", []),
            "recommendations": normalized_recommendations
        }, ensure_ascii=False)
    )
    
    try:
        db.session.add(stack)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[Syllabus Parser] Database save failed: {str(e)}")
        
    return {
        "share_id": share_id,
        "course_name": stack.course_name,
        "subject_area": stack.subject_area,
        "is_llm": is_llm_mode,
        "technologies": parsed.get("technologies", []),
        "recommendations": normalized_recommendations
    }

def process_syllabus_and_build_toolkit(text_content):
    """
    Orchestrates the syllabus parsing (Gemini or local TF-IDF fallback) and
    normalizes output tools against the database tools.json.
    Saves the final toolkit in SyllabusStack table and returns the payload.
    """
    parsed = parse_syllabus_llm(text_content)
    is_llm_mode = True
    
    if not parsed:
        parsed = parse_syllabus_local(text_content)
        is_llm_mode = False
        
    return _normalize_and_save_toolkit(parsed, is_llm_mode)

def process_syllabus_image_and_build_toolkit(image_bytes, mimetype):
    """
    Orchestrates the multimodal syllabus image parsing (Gemini) and
    normalizes output tools. Saves the final toolkit in SyllabusStack table.
    """
    parsed = parse_syllabus_image_llm(image_bytes, mimetype)
    if isinstance(parsed, dict) and "error" in parsed:
        return parsed
    if not parsed:
        return {"error": "All Gemini and Groq keys exhausted or rate-limited. Local fallback does not support image analysis. Please check your API KEYS configuration."}
        
    return _normalize_and_save_toolkit(parsed, True)
