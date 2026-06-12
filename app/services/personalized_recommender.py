import json
import os
import re
import hashlib
import time
import requests
from flask_login import current_user
from app.models import Favorite, SavedStack, ToolView, CatalogTool
from app import db
from app.tool_cache import get_visible_tools
from app.recommendations import _collect_user_profile

# Module-level in-memory cache
# Format: user_id -> {"timestamp": float, "cache_key": str, "data": list}
RECOMMENDATIONS_CACHE = {}
CACHE_TTL = 300  # 5 minutes in seconds

def get_profile_cache_key(user, favorite_slugs, stack_slugs, viewed_slugs) -> str:
    """Computes a unique MD5 hash based on the user's current profile state."""
    profile = _collect_user_profile(user)
    
    key_dict = {
        "favorites": sorted(list(favorite_slugs)),
        "stack_slugs": sorted(list(stack_slugs)),
        "viewed_slugs": list(viewed_slugs),
        "interests": sorted(list(profile.get("interests", []))),
        "goals": sorted(list(profile.get("goals", []))),
        "skill_level": profile.get("skill_level"),
        "preferred_pricing": profile.get("preferred_pricing"),
        "preferred_category": profile.get("preferred_category"),
    }
    
    key_bytes = json.dumps(key_dict, sort_keys=True).encode("utf-8")
    return hashlib.md5(key_bytes).hexdigest()

def generate_local_relevance_reason(tool, user, profile) -> str:
    """Generates a dynamic relevance explanation for the user for local fallbacks."""
    tags = {str(t).lower().strip() for t in tool.get("tags", [])}
    interests = profile.get("interests", set())
    goals = profile.get("goals", set())
    
    tool_cat = tool.get("category", "")
    pref_cat = profile.get("preferred_category", "")
    
    if tool_cat and pref_cat and tool_cat.lower() == pref_cat.lower():
        return f"Aligned with your favorite category: {tool_cat}."
        
    common_interests = sorted(list(interests & tags))
    if common_interests:
        return f"Matches your interest in {common_interests[0]}."
        
    common_goals = sorted(list(goals & tags))
    if common_goals:
        return f"Supports your goal of {common_goals[0]}."
        
    tool_pricing = str(tool.get("pricing", "")).strip().lower()
    pref_pricing = str(profile.get("preferred_pricing", "")).strip().lower()
    if tool_pricing and tool_pricing == pref_pricing:
        return f"Fits your preference for {tool_pricing} tools."
        
    rating = tool.get("rating")
    if rating and float(rating) >= 4.5:
        return f"Highly-rated ({rating}★) tool matching your profile."
        
    return "A top productivity tool curated for you."

def get_local_tfidf_recommendations(user, favorite_slugs, candidates, limit=6) -> list:
    """Fallback 1: Vector similarity matching using the pre-trained TF-IDF model."""
    try:
        from app.ml_recommender import load_model
        model = load_model()
        if not model:
            return []
            
        vectorizer = model.get("vectorizer")
        tfidf_matrix = model.get("tfidf_matrix")
        tool_index = model.get("tool_index")
        
        if vectorizer is None or tfidf_matrix is None or tool_index is None:
            return []
            
        import numpy as np
        from sklearn.metrics.pairwise import cosine_similarity
        
        profile = _collect_user_profile(user)
        
        # Construct profile representation string
        query_parts = []
        if profile.get("interests"):
            query_parts.append(" ".join(profile["interests"]))
        if profile.get("goals"):
            query_parts.append(" ".join(profile["goals"]))
        if profile.get("preferred_category"):
            query_parts.append(profile["preferred_category"])
        if profile.get("preferred_pricing"):
            query_parts.append(profile["preferred_pricing"])
        if profile.get("skill_level"):
            query_parts.append(profile["skill_level"])
            
        # Add names and categories of favorites to bias recommendations
        favorites = Favorite.query.filter_by(user_id=user.id).all()
        all_tools = get_visible_tools()
        tools_by_slug = {str(t.get("slug") or "").strip().lower(): t for t in all_tools}
        for fav in favorites:
            fav_slug = str(fav.tool_id or "").strip().lower()
            fav_tool = tools_by_slug.get(fav_slug)
            if fav_tool:
                query_parts.append(fav_tool.get("name", ""))
                query_parts.append(fav_tool.get("category", ""))
                if fav_tool.get("tags"):
                    query_parts.append(" ".join(fav_tool["tags"]))
                    
        query_string = " ".join(query_parts).strip()
        if not query_string:
            return []
            
        query_vec = vectorizer.transform([query_string])
        similarities = cosine_similarity(query_vec, tfidf_matrix)[0]
        
        scored_candidates = []
        for cand in candidates:
            slug = str(cand.get("slug") or "").strip().lower()
            score = 0.0
            if slug in tool_index:
                score = float(similarities[tool_index[slug]])
            scored_candidates.append((score, cand))
            
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        
        results = []
        for score, tool in scored_candidates[:limit]:
            tool_copy = dict(tool)
            tool_copy["relevance_reason"] = generate_local_relevance_reason(tool, user, profile)
            results.append(tool_copy)
            
        return results
    except Exception as e:
        print(f"[Personalization] Local TF-IDF recommendation failed: {str(e)}")
        return []

def get_local_heuristic_recommendations(user, candidates, limit=6) -> list:
    """Fallback 2: Simple heuristic scoring based on interest tags and categories."""
    try:
        from app.services.recommendation_service import compute_tool_score, generate_reason
        
        scored = []
        for tool in candidates:
            score = compute_tool_score(tool, user=user)
            reason = generate_reason(tool, user=user)
            
            tool_copy = dict(tool)
            tool_copy["relevance_reason"] = reason
            scored.append((score, tool_copy))
            
        scored.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scored[:limit]]
    except Exception as e:
        print(f"[Personalization] Local heuristic recommendation failed: {str(e)}")
        return []

def get_personalized_recommendations(user, limit=6) -> list:
    """Retrieves personalized recommendations (catalog or new external discoveries) with Gemini rotation."""
    if not user or not hasattr(user, "id"):
        return []
        
    all_tools = get_visible_tools()
    favorites = Favorite.query.filter_by(user_id=user.id).all()
    favorite_slugs = {str(item.tool_id or "").strip().lower() for item in favorites if item.tool_id}
    
    # Query Saved Stacks
    stack_rows = SavedStack.query.filter_by(user_id=user.id).all()
    stack_tools_list = []
    for row in stack_rows:
        try:
            payload = json.loads(row.tools_json)
            if isinstance(payload, dict) and "tools" in payload:
                stack_tools_list.extend(payload["tools"])
        except Exception:
            pass
            
    stack_slugs = set()
    stack_details = []
    for tool_name_or_slug in stack_tools_list:
        slug = re.sub(r"[^a-z0-9]+", "-", str(tool_name_or_slug or "").strip().lower()).strip("-")
        if slug in stack_slugs:
            continue
        stack_slugs.add(slug)
        stack_tool = next((t for t in all_tools if str(t.get("slug") or "").strip().lower() == slug), None)
        if stack_tool:
            stack_details.append({
                "name": stack_tool.get("name"),
                "category": stack_tool.get("category"),
                "tagline": stack_tool.get("tagline") or stack_tool.get("description") or "",
                "tags": list(stack_tool.get("tags") or [])
            })
            
    # Query Recently Viewed Tools
    viewed_rows = ToolView.query.filter_by(user_id=user.id).order_by(ToolView.timestamp.desc()).limit(10).all()
    viewed_slugs = [str(v.tool_name).strip().lower() for v in viewed_rows if v.tool_name]
    
    viewed_details = []
    viewed_seen = set()
    for slug in viewed_slugs:
        if slug in viewed_seen:
            continue
        viewed_seen.add(slug)
        viewed_tool = next((t for t in all_tools if str(t.get("slug") or "").strip().lower() == slug), None)
        if viewed_tool:
            viewed_details.append({
                "name": viewed_tool.get("name"),
                "category": viewed_tool.get("category"),
                "tagline": viewed_tool.get("tagline") or viewed_tool.get("description") or "",
                "tags": list(viewed_tool.get("tags") or [])
            })

    # 1. Cache lookup
    cache_key = get_profile_cache_key(user, favorite_slugs, stack_slugs, viewed_slugs)
    now = time.time()
    cached = RECOMMENDATIONS_CACHE.get(user.id)
    if cached and cached.get("cache_key") == cache_key and (now - cached.get("timestamp", 0)) < CACHE_TTL:
        return cached.get("data", [])
        
    candidates = [t for t in all_tools if str(t.get("slug") or "").strip().lower() not in favorite_slugs]
    if not candidates:
        return []
        
    # 2. Try Gemini with key rotation
    keys = []
    env_keys_str = os.environ.get("GEMINI_API_KEYS", "")
    if env_keys_str:
        keys.extend([k.strip() for k in env_keys_str.split(",") if k.strip()])
    single_key = os.environ.get("GEMINI_API_KEY")
    if single_key and single_key.strip() not in keys:
        keys.append(single_key.strip())
        
    recs = []
    
    if keys:
        # Build profiles for favorites
        fav_details = []
        for f in favorites:
            f_slug = str(f.tool_id or "").strip().lower()
            fav_tool = next((t for t in all_tools if str(t.get("slug") or "").strip().lower() == f_slug), None)
            if fav_tool:
                fav_details.append({
                    "name": fav_tool.get("name"),
                    "category": fav_tool.get("category"),
                    "description": fav_tool.get("tagline") or fav_tool.get("description") or "",
                    "tags": list(fav_tool.get("tags") or [])
                })
                
        profile = _collect_user_profile(user)
        
        # Condensed catalog to prevent bloating token usage
        catalog_candidates = []
        for cand in candidates:
            catalog_candidates.append({
                "slug": cand.get("slug"),
                "name": cand.get("name"),
                "category": cand.get("category"),
                "tagline": cand.get("tagline") or cand.get("shortDescription") or cand.get("description") or "",
                "tags": list(cand.get("tags") or [])
            })
            
        prompt = f"""
You are an expert AI recommender. Recommend the top {limit} tools that would be most relevant, complementary, or helpful alternatives for the user based on their profile.
You can recommend matching tools from the candidate catalog below, OR suggest highly relevant, specialized tools that are NOT in the catalog.

User Profile:
- Favorited Tools: {json.dumps(fav_details)}
- Saved Stacks: {json.dumps(stack_details)}
- Recently Viewed Tools: {json.dumps(viewed_details)}
- Interests: {list(profile.get("interests", []))}
- Goals: {list(profile.get("goals", []))}
- Pricing Preference: {profile.get("preferred_pricing")}
- Preferred Category: {profile.get("preferred_category")}
- Skill Level: {profile.get("skill_level")}

Candidate Catalog:
{json.dumps(catalog_candidates)}

Instructions:
1. Select exactly the top {limit} most relevant tools. Do not recommend tools the user has already favorited.
2. You can recommend tools from the Candidate Catalog, OR suggest specialized external tools. For catalog tools, set `is_external` to false. For external tools, set `is_external` to true and provide their `external_metadata`.
3. For each recommendation, write a brief, helpful explanation (under 120 chars) connecting the tool directly to the user's interests, goals, or favorite tools (e.g. "Complements Notion with advanced AI summarization", "Great for learning Python as per your goal").
4. Respond ONLY with a valid JSON object matching this schema:
{{
  "recommendations": [
    {{
      "tool_slug": "slug-of-the-tool-or-slug-for-external-tool",
      "relevance_reason": "Specific custom reason why it fits the profile",
      "is_external": true/false,
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
"""
        
        for i, key in enumerate(keys):
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
                headers = {"Content-Type": "application/json"}
                
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "responseSchema": {
                            "type": "OBJECT",
                            "properties": {
                                "recommendations": {
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
                            "required": ["recommendations"]
                        }
                    }
                }
                
                response = requests.post(url, headers=headers, json=payload, timeout=10)
                if response.status_code == 429:
                    print(f"[Personalization] Key {i+1} hit rate limits (429). Rotating...")
                    continue
                elif response.status_code != 200:
                    print(f"[Personalization] Key {i+1} failed with status {response.status_code}. Rotating...")
                    continue
                    
                res_data = response.json()
                content_text = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if content_text.startswith("```json"): content_text = content_text[7:]
                elif content_text.startswith("```"): content_text = content_text[3:]
                if content_text.endswith("```"): content_text = content_text[:-3]
                parsed = json.loads(content_text.strip())
                gemini_recs = parsed.get("recommendations", [])
                
                tools_by_slug = {str(t.get("slug") or "").strip().lower(): t for t in all_tools}
                for rec in gemini_recs:
                    slug = str(rec.get("tool_slug") or "").strip().lower()
                    reason = rec.get("relevance_reason", "").strip()
                    
                    tool = tools_by_slug.get(slug)
                    
                    # If not found in catalog, check if it's an external tool discovery
                    if not tool and rec.get("is_external") and rec.get("external_metadata"):
                        meta = rec.get("external_metadata")
                        ext_name = meta.get("name", "").strip()
                        ext_url = meta.get("url", "").strip()
                        if ext_name and ext_url:
                            ext_slug = slug or re.sub(r"[^a-z0-9]+", "-", ext_name.lower()).strip("-")
                            tool = {
                                "name": ext_name,
                                "slug": ext_slug,
                                "tagline": meta.get("tagline", "Specialized AI tool discovered for your personal profile."),
                                "category": meta.get("category", "Productivity"),
                                "pricing": meta.get("pricing", "Freemium"),
                                "price": meta.get("pricing", "Freemium"),
                                "link": ext_url,
                                "url": ext_url,
                                "description": meta.get("tagline", "Specialized AI tool discovered for your personal profile."),
                                "use_cases": [meta.get("tagline", "Personal workspace tasks")],
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
                                # Refresh our lists
                                all_tools = get_visible_tools()
                                tools_by_slug = {t.get("slug"): t for t in all_tools}
                                tool = tools_by_slug.get(ext_slug) or tool
                                slug = ext_slug
                            except Exception as db_err:
                                print(f"[Personalization] Failed to register external tool {ext_name}: {str(db_err)}")
                                
                    if tool:
                        tool_copy = dict(tool)
                        tool_copy["relevance_reason"] = reason
                        recs.append(tool_copy)
                        
                if len(recs) >= limit:
                    break
            except Exception as e:
                print(f"[Personalization] Gemini attempt with Key {i+1} failed: {str(e)}")
                continue
                
    # 3. Fallbacks if Gemini did not return enough/any results
    if len(recs) < limit:
        needed = limit - len(recs)
        existing_slugs = {str(r.get("slug") or "").strip().lower() for r in recs}
        fallback_candidates = [c for c in candidates if str(c.get("slug") or "").strip().lower() not in existing_slugs]
        
        # Try TF-IDF fallback first
        fallback_recs = get_local_tfidf_recommendations(user, favorite_slugs, fallback_candidates, limit=needed)
        
        # Try Heuristic fallback second if TF-IDF yields nothing
        if not fallback_recs:
            fallback_recs = get_local_heuristic_recommendations(user, fallback_candidates, limit=needed)
            
        recs.extend(fallback_recs)
        
    # Final slice and caching
    final_recs = recs[:limit]
    RECOMMENDATIONS_CACHE[user.id] = {
        "timestamp": now,
        "cache_key": cache_key,
        "data": final_recs
    }
    
    return final_recs
