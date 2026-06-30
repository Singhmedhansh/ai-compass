from app.tool_cache import get_cached_tools

TRENDING_METADATA = {
    "Coding": [
        {"rank": 1, "slug": "cursor", "why_trending": "AI-first code editor with agentic codebase navigation."},
        {"rank": 2, "slug": "claude", "why_trending": "Claude Code CLI agent to navigate and build codebases autonomously."},
        {"rank": 3, "slug": "v0", "why_trending": "Generative UI system to build frontends from prompts instantly."},
        {"rank": 4, "slug": "github-copilot", "why_trending": "Industry-standard AI autocomplete companion in major IDEs."},
        {"rank": 5, "slug": "windsurf", "why_trending": "Advanced agentic IDE built around collaborative AI agents."}
    ],
    "Writing & Chat": [
        {"rank": 1, "slug": "claude", "why_trending": "Nuanced, natural prose generation and complex styling guidance."},
        {"rank": 2, "slug": "chatgpt", "why_trending": "Universal conversational partner and versatile text generator."},
        {"rank": 3, "slug": "notebooklm", "why_trending": "Google AI notebook for summarizing and generating podcasts."},
        {"rank": 4, "slug": "notion", "why_trending": "Clean workspace document manager with inline writing assistants."},
        {"rank": 5, "slug": "editgpt", "why_trending": "Dedicated proofreader and contextual editor for essays."}
    ],
    "Research": [
        {"rank": 1, "slug": "notebooklm", "why_trending": "Google research tool specializing in Audio Overviews from PDFs."},
        {"rank": 2, "slug": "consensus", "why_trending": "Direct search interface backed by peer-reviewed science papers."},
        {"rank": 3, "slug": "perplexity-ai", "why_trending": "Conversational search engine with cited reference links."},
        {"rank": 4, "slug": "elicit", "why_trending": "AI research assistant that automates literature review analysis."},
        {"rank": 5, "slug": "scite", "why_trending": "Validate citations and verify research paper conclusions."}
    ],
    "Productivity": [
        {"rank": 1, "slug": "granola", "why_trending": "Invisible local transcriber and notepad for meeting audio."},
        {"rank": 2, "slug": "notion", "why_trending": "A complete workspace with inline databases and AI features."},
        {"rank": 3, "slug": "fireflies-ai", "why_trending": "Automated meeting notes agent that joins calendar invites."},
        {"rank": 4, "slug": "speechify", "why_trending": "High-quality text-to-speech reader for study materials."},
        {"rank": 5, "slug": "krisp", "why_trending": "Real-time background noise removal and transcription on calls."}
    ],
    "Image Generation": [
        {"rank": 1, "slug": "midjourney", "why_trending": "Stunning artistic styles and high photorealism control."},
        {"rank": 2, "slug": "stable-diffusion", "why_trending": "Open-weight detailed model providing custom model generation."},
        {"rank": 3, "slug": "adobe-firefly", "why_trending": "Commercially safe design and generation engine."},
        {"rank": 4, "slug": "canva", "why_trending": "AI-powered quick graphics, resizing, and template designs."},
        {"rank": 5, "slug": "dall-e-3", "why_trending": "Precise instruction following inside ChatGPT interface."}
    ],
    "Video Generation": [
        {"rank": 1, "slug": "kling-ai", "why_trending": "Realistic video motion, duration, and human physics generation."},
        {"rank": 2, "slug": "runway", "why_trending": "Advanced cinematic controls and multi-motion brush adjustments."},
        {"rank": 3, "slug": "luma-dream-machine", "why_trending": "High-speed camera controls and fast generation queues."},
        {"rank": 4, "slug": "heygen", "why_trending": "Lifelike digital avatars for video presentations and speech translation."},
        {"rank": 5, "slug": "sora", "why_trending": "High-fidelity prompt-to-video capabilities from OpenAI."}
    ],
    "Audio & Voice": [
        {"rank": 1, "slug": "elevenlabs", "why_trending": "Photorealistic voice cloning and multi-language TTS narration."},
        {"rank": 2, "slug": "suno", "why_trending": "Suno v4 produces high-fidelity full song compositions."},
        {"rank": 3, "slug": "udio", "why_trending": "High-quality music track generation and vocal extensions."},
        {"rank": 4, "slug": "descript", "why_trending": "Text-based video/audio editor with overdub vocal cloning."},
        {"rank": 5, "slug": "deepgram", "why_trending": "High-speed voice transcription APIs for developer stacks."}
    ]
}

def resolve_trending_tools():
    """Matches the trending registry slugs to active catalog tools to return
    fully enriched catalog entries alongside rank and trending reasoning.
    """
    tools = get_cached_tools()
    tools_by_slug = {str(t.get("slug", "")).strip().lower(): t for t in tools}

    results = {}
    for category, list_items in TRENDING_METADATA.items():
        results[category] = []
        for item in list_items:
            slug = item["slug"]
            tool_data = tools_by_slug.get(slug)
            
            # Construct a fully resolved item
            resolved_item = {
                "rank": item["rank"],
                "slug": slug,
                "why_trending": item["why_trending"],
                "tool": tool_data  # None if missing, but we handle in frontend
            }
            results[category].append(resolved_item)

    return results
