import os
import re
import json
import uuid
import requests
from datetime import datetime, timezone
from app.models import StudyPlan
from app import db

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
    {"name": "Vercel v0", "slug": "vercel-v0", "category": "Coding", "description": "Frontend React/HTML layout generator"}
]

def generate_study_plan_llm(course_name, duration_days, hours_per_day, topics, priority_topics, confidence_level, syllabus_image_bytes=None, syllabus_image_mimetype=None):
    """
    Generates a spaced-repetition study plan using Gemini with fallbacks to Grok or OpenAI.
    """
    # 1. Gather Gemini Keys
    gemini_keys = []
    env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
    if env_keys_str:
        gemini_keys.extend([k.strip() for k in env_keys_str.split(",") if k.strip()])
    
    single_gemini_key = os.environ.get("GEMINI_API_KEY")
    if single_gemini_key and single_gemini_key not in gemini_keys:
        gemini_keys.append(single_gemini_key)

    # 2. Gather Groq Keys
    groq_keys = []
    env_groq_keys_str = os.environ.get("GROQ_API_KEYS", "")
    if env_groq_keys_str:
        groq_keys.extend([k.strip() for k in env_groq_keys_str.split(",") if k.strip()])
    
    single_groq_key = os.environ.get("GROQ_API_KEY")
    if single_groq_key and single_groq_key not in groq_keys:
        groq_keys.append(single_groq_key)

    tools_str = json.dumps(POPULAR_TOOLS_LIST, indent=2)

    prompt = f"""
You are an elite academic tutor specializing in spaced-repetition learning science.
Generate a structured, day-by-day spaced-repetition study plan based on the following course details.

Course/Subject Name: {course_name}
Plan Duration: {duration_days} days
Study Hours per Day: {hours_per_day} hours/day
Syllabus / Focus Topics: {topics}
Priority/High Difficulty Topics to Focus On: {priority_topics}
Student Confidence Level: {confidence_level}

List of popular tools available in our directory:
{tools_str}

Instructions:
1. Divide the plan into exactly {duration_days} days (or day groups if duration is long, but structure it daily).
2. Schedule specific topics matching the syllabus inputs, but prioritize and dedicate extra depth/time/repetitions to the following priority topics: {priority_topics}.
3. Apply spaced-repetition learning stages (e.g., Initial Review, Active Recall at 24h, Spaced Revision at 7 days) and explain which stage a task belongs to.
4. For each day, provide a list of specific, actionable study tasks (maximum 4 tasks).
5. For each day, recommend 1 to 2 relevant tools from the popular tools list that the student should use to accomplish that day's tasks (use correct tool slugs).

Your response MUST be a valid JSON object matching the following structure:
{{
  "course_name": "{course_name}",
  "duration_days": {duration_days},
  "hours_per_day": {hours_per_day},
  "days": [
    {{
      "day_number": 1,
      "title": "Topic or theme of the day",
      "spaced_repetition_phase": "e.g. Initial Learning, First Active Recall, Final Review",
      "tasks": [
        "Actionable study task 1 (e.g., Read section 4.1 & sketch diagram)",
        "Actionable study task 2 (e.g., Create flashcards)"
      ],
      "recommended_tool_slugs": ["tool-slug-1", "tool-slug-2"]
    }}
  ]
}}

Provide ONLY raw JSON output. No markdown wrappers.
"""

    # --- ATTEMPT GEMINI ---
    if gemini_keys:
        for i, key in enumerate(gemini_keys):
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
                headers = {"Content-Type": "application/json"}
                
                if syllabus_image_bytes and syllabus_image_mimetype:
                    import base64
                    base64_data = base64.b64encode(syllabus_image_bytes).decode("utf-8")
                    payload = {
                        "contents": [{
                            "parts": [
                                {"inlineData": {"mimeType": syllabus_image_mimetype, "data": base64_data}},
                                {"text": prompt}
                            ]
                        }],
                        "generationConfig": {
                            "responseMimeType": "application/json"
                        }
                    }
                else:
                    payload = {
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "responseMimeType": "application/json"
                        }
                    }
                
                res = requests.post(url, headers=headers, json=payload, timeout=25)
                if res.status_code == 200:
                    res_json = res.json()
                    content = res_json["candidates"][0]["content"]["parts"][0]["text"].strip()
                    return json.loads(content)
                else:
                    print(f"[Study Plan] Gemini Key {i+1} failed with status {res.status_code}.")
            except Exception as e:
                print(f"[Study Plan] Gemini Key {i+1} error: {str(e)}")
                continue

    # --- ATTEMPT GROQ ROTATION ---
    if groq_keys:
        for i, key in enumerate(groq_keys):
            try:
                print(f"[Study Plan] Attempting Groq API Key {i+1}...")
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": "You are a professional study plan generator. Reply only with valid JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    "response_format": {"type": "json_object"}
                }
                res = requests.post(url, headers=headers, json=payload, timeout=25)
                if res.status_code == 200:
                    res_json = res.json()
                    content = res_json["choices"][0]["message"]["content"].strip()
                    return json.loads(content)
                else:
                    print(f"[Study Plan] Groq Key {i+1} failed with status {res.status_code}.")
            except Exception as e:
                print(f"[Study Plan] Groq Key {i+1} error: {str(e)}")
                continue

    # --- ATTEMPT GROK FALLBACK ---
    grok_key = os.environ.get("GROK_API_KEY")
    if grok_key:
        try:
            print("[Study Plan] Attempting Grok API fallback...")
            url = "https://api.x.ai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {grok_key}",
                "Content-Type": "application/json"
            }
            # Grok supports standard OpenAI chat completion format
            payload = {
                "model": "grok-2",
                "messages": [
                    {"role": "system", "content": "You are a professional study plan generator. Reply only with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            res = requests.post(url, headers=headers, json=payload, timeout=25)
            if res.status_code == 200:
                res_json = res.json()
                content = res_json["choices"][0]["message"]["content"].strip()
                return json.loads(content)
        except Exception as e:
            print(f"[Study Plan] Grok API error: {str(e)}")

    # --- ATTEMPT OPENAI FALLBACK ---
    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        try:
            print("[Study Plan] Attempting OpenAI API fallback...")
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {openai_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You are a professional study plan generator. Reply only with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            res = requests.post(url, headers=headers, json=payload, timeout=25)
            if res.status_code == 200:
                res_json = res.json()
                content = res_json["choices"][0]["message"]["content"].strip()
                return json.loads(content)
        except Exception as e:
            print(f"[Study Plan] OpenAI API error: {str(e)}")

    # --- LOCAL STATIC FALLBACK ---
    print("[Study Plan] All LLM APIs failed. Generating local plan.")
    return generate_study_plan_local(course_name, duration_days, hours_per_day, topics, priority_topics)

def generate_study_plan_local(course_name, duration_days, hours_per_day, topics, priority_topics):
    """
    Generate a simple offline schedule if APIs are fully exhausted/offline.
    """
    days = []
    # Build simple repetition days
    for d in range(1, duration_days + 1):
        if d == 1:
            phase = "Initial learning & reading"
            tasks = [f"Deep dive into syllabus topics: {topics or 'Overview'}", "Identify core concepts & definitions", "Set up your study Notion workspace"]
            tools = ["notion", "chatgpt"]
        elif d % 3 == 0:
            phase = "Active Recall"
            tasks = [f"Build flashcards for prioritised topics: {priority_topics or 'Key Terms'}", "Recall concepts from memory and verify gaps", "Explain concepts out loud to a virtual study buddy"]
            tools = ["anki", "claude"]
        elif d % 5 == 0:
            phase = "Spaced Revision"
            tasks = ["Review weak points from previous sessions", "Simulate practice test questions", "Search citations for research validation"]
            tools = ["perplexity-ai", "consensus"]
        else:
            phase = "Focused Work"
            tasks = ["Solve topic homework questions", "Summarize textbook material for reference", "Outline study notes"]
            tools = ["quillbot", "grammarly"]
            
        days.append({
            "day_number": d,
            "title": f"Study block {d}",
            "spaced_repetition_phase": phase,
            "tasks": tasks[:3],
            "recommended_tool_slugs": tools
        })
        
    return {
        "course_name": course_name or "Curriculum plan",
        "duration_days": duration_days,
        "hours_per_day": hours_per_day,
        "days": days
    }

def process_and_save_study_plan(course_name, duration_days, hours_per_day, topics, priority_topics, confidence_level, syllabus_image_bytes=None, syllabus_image_mimetype=None):
    """
    Orchestrates the plan creation, resolves slugs to AI Compass data, saves it to database, and returns the share payload.
    """
    plan = generate_study_plan_llm(
        course_name=course_name,
        duration_days=duration_days,
        hours_per_day=hours_per_day,
        topics=topics,
        priority_topics=priority_topics,
        confidence_level=confidence_level,
        syllabus_image_bytes=syllabus_image_bytes,
        syllabus_image_mimetype=syllabus_image_mimetype
    )

    # Resolve tool slugs to their full details from the database so the frontend has accurate info
    from app.tool_cache import get_cached_tools
    cached_tools = get_cached_tools() or []
    tools_by_slug = {t.get("slug"): t for t in cached_tools}

    resolved_days = []
    for day in plan.get("days", []):
        day_tools = []
        for slug in day.get("recommended_tool_slugs", []):
            slug = slug.strip().lower()
            tool = tools_by_slug.get(slug)
            if not tool:
                # Try soft match
                for s, t in tools_by_slug.items():
                    if slug in s or s in slug:
                        tool = t
                        slug = s
                        break
            
            if tool:
                day_tools.append({
                    "slug": slug,
                    "name": tool.get("name"),
                    "category": tool.get("category"),
                    "pricing": tool.get("pricing"),
                    "logo_emoji": tool.get("logo_emoji") or tool.get("emoji") or "⚡",
                    "url": tool.get("link") or tool.get("url"),
                    "tagline": tool.get("tagline") or ""
                })
        
        resolved_days.append({
            "day_number": day.get("day_number"),
            "title": day.get("title") or f"Day {day.get('day_number')}",
            "spaced_repetition_phase": day.get("spaced_repetition_phase") or "Recall",
            "tasks": day.get("tasks", []),
            "recommended_tools": day_tools
        })

    share_id = str(uuid.uuid4())[:8]
    
    db_plan = StudyPlan(
        share_id=share_id,
        course_name=plan.get("course_name") or course_name,
        topics=priority_topics or topics,
        plan_json=json.dumps({
            "course_name": plan.get("course_name") or course_name,
            "duration_days": duration_days,
            "hours_per_day": hours_per_day,
            "days": resolved_days
        }, ensure_ascii=False)
    )

    try:
        db.session.add(db_plan)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"[Study Plan] Database save failed: {str(e)}")

    return {
        "share_id": share_id,
        "course_name": db_plan.course_name,
        "plan": json.loads(db_plan.plan_json)
    }
