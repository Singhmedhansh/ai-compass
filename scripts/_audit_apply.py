"""Apply the audit proposal to tools.json with the rules from Prompt 7.

Rules (from user spec):
1. high conf + needs_review=False  -> apply proposed_category
2. high conf + needs_review=True   -> apply proposed_category (review flag is just for surfacing)
3. medium conf                      -> apply proposed_category EXCEPT slug=weights-&-biases (override -> Coding)
4. low conf                         -> leave current category unchanged
5. proposed_inclusion=remove and slug in approved_removals -> delete from tools.json
6. Image Generation in proposal     -> remap to Design & Graphics for design/UI tools
                                       (heuristic explained inline)

Only the `category` field is modified. Removed tools drop entirely.
"""
import json
from collections import Counter

with open("data/tools.json", encoding="utf-8") as f:
    tools = json.load(f)

with open("data/tools_audit_proposal.json", encoding="utf-8") as f:
    audit = json.load(f)

proposals = {p["slug"]: p for p in audit["proposals"]}

APPROVED_REMOVALS = {
    "discord", "slack", "zulip", "google-meet", "apple-notes",
    "numbers", "bear", "cold-turkey", "alfred", "things-3",
}
# google-meet, apple-notes, numbers are not present in the catalog;
# net removals will be 7 not 10. Reported in summary.

MEDIUM_CONF_OVERRIDE = {
    "weights-&-biases": "Coding",
}

# Image Generation reserved for AI-native generators only.
# All other "design/UI/visual workflow" tools whose proposal said
# Image Generation get remapped to "Design & Graphics".
#
# AI-native image generators (KEEP as Image Generation):
AI_IMAGE_GENERATOR_SLUGS = {
    "midjourney", "stable-diffusion", "dalle", "dalle-2", "dalle-3",
    "bing-image-creator", "ideogram", "leonardo-ai", "leonardo",
    "playground-ai", "playgroundai", "playground", "nightcafe",
    "lexica", "krea", "krea-ai", "recraft", "recraft-ai",
    "fal-ai", "fal.ai",
    "pollinationsai", "pollinations-ai", "pollinations",
    "civitai", "imagen", "google-imagen", "firefly", "adobe-firefly",
    "flux", "flux-ai", "black-forest-labs",
    "magnific-ai", "magnific", "magnific-upscaler",
    "scenario", "scenario-ai", "scenario-gg",
    "novel-ai", "novelai-image",
    "draw-things", "automatic1111", "comfyui",
    "fotor-ai", "fotor", "remove-bg", "remove.bg", "removebg",
    "promptchan", "promptchan-ai",
    "artbreeder", "deepdream",
    "tilda-ai-image", "tildaai",
    "polycam-image",
    "starryai", "starry-ai",
    "deepai-image", "deepai",
    "wonder-ai-art", "wonder",
    "dream-by-wombo", "wombo", "dream",
    "diffusion-bee", "diffusionbee",
    "perchance", "this-person-does-not-exist",
    "deepart", "deepart-io",
    "anifusion", "tensor-art", "tensorart",
    "promptbase",
    "openart", "openart-ai",
    "gencraft", "neuralblender",
    "looka", "tailor-brands",  # logo-from-AI generators (border case)
    "logoai", "logo-ai",
    "thispersondoesnotexist",
    "imagine-with-meta", "meta-imagine",
    "promethean-ai", "soulgen", "soul-gen",
    "easel-ai", "fy-studio", "neural-frames",
    "uberduck-image",
    "instasd", "vance-ai", "vanceai",
    "let-s-enhance", "letsenhance", "lets-enhance",
    "topaz-photo-ai", "topaz", "topazlabs",
    "imagine-art", "imgcreator-ai",
    "promptohero", "prompthero",
    "vondy", "vondy-image",
    "deep-image-ai", "deep-image",
    "freepik-ai-image", "freepik",  # AI image generation arm
    "skybox-ai", "skybox", "blockade-labs",
    "mage-space", "mage",
    "leiapix", "leia-pix",
    "passport-photo-ai",
    "ai-room-planner",
    "interior-ai", "interior-ai-design",
    "ai-comic-factory",
    "monsterapi", "monster-api",
    "neural-love",
    "playground-v2",
    "stylar", "stylar-ai",
    "imagine-v5",
    "muse-ai",
    "promptpix",
    "lovart", "lovart-ai",
    "img2prompt",
    "draw3-ai",
    "perplexity-image",
    "tensor.art",
    "modelscope",
    "kicked",
    "stockimg", "stockimg-ai",
    "qwen-image",
    "ai-anime-art",
    "ai-portrait",
    "imagen-2", "imagen-3",
    "neon-ai",
    "promptimum",
}


def remap_image_generation(slug, name, tool_blob):
    """Decide whether a proposed-as-Image-Generation tool stays there or
    becomes Design & Graphics.

    Rules:
    1. Slug is in the AI_IMAGE_GENERATOR_SLUGS allowlist -> Image Generation
    2. Tool's tags or description heavily emphasize "image generation"
       / "text-to-image" / "ai image" / "generative ai art" with little
       design-tool signal -> Image Generation
    3. Otherwise -> Design & Graphics (catches Figma, Webflow, Framer,
       Canva, presentation tools, mockup tools, vector editors, etc.)
    """
    s = slug.lower()
    if s in AI_IMAGE_GENERATOR_SLUGS:
        return "Image Generation"

    blob = tool_blob.lower()

    # Strong AI-image-generator signal (keyword-only)
    strong_imgen_phrases = [
        "text-to-image", "text to image",
        "image generation",
        "ai image generator", "ai-image generator",
        "generative image",
        "ai art generator",
        "image diffusion", "diffusion model",
        "stable diffusion",
        "midjourney alternative",
        "dall-e alternative",
        "ai image model",
        "ai-generated images",
        "ai-generated artwork",
    ]
    has_strong_imgen = any(phrase in blob for phrase in strong_imgen_phrases)

    # Design-tool signal that disqualifies Image Generation
    design_phrases = [
        "design tool", "design platform",
        "ui design", "ux design",
        "mockup", "wireframe", "prototype",
        "vector graphics", "vector design",
        "presentation", "presentations", "slides", "slide deck",
        "page builder", "site builder",
        "no-code design", "no code design",
        "brand kit", "branding tool",
        "interactive design",
        "web design platform", "web design tool",
        "infographic", "diagrams",
        "figma plugin",
        "drag-and-drop design", "drag and drop design",
        "screen design",
    ]
    has_design = any(phrase in blob for phrase in design_phrases)

    if has_strong_imgen and not has_design:
        return "Image Generation"
    return "Design & Graphics"


# Apply
applied_count = 0
removed_count = 0
unchanged_low_conf_count = 0
medium_override_count = 0
imgen_to_design_count = 0
imgen_kept_count = 0
new_tools = []
removed_slugs = []
imgen_remap_log = []
left_alone_low_conf = []
applied_changes = []

for tool in tools:
    slug = (tool.get("slug") or "").lower()
    proposal = proposals.get(slug)
    if not proposal:
        new_tools.append(tool)
        continue

    inclusion = proposal["proposed_inclusion"]
    confidence = proposal["confidence"]
    proposed_cat = proposal["proposed_category"]
    current_cat = tool.get("category")

    # Removal path: user-approved removal list overrides audit verdict.
    # The audit only marked Discord as `remove` (conservatively), but the
    # user has explicitly approved the 10-slug list for removal in Prompt 7.
    if slug in APPROVED_REMOVALS:
        removed_count += 1
        removed_slugs.append(slug)
        continue

    # Low confidence: leave current category alone
    if confidence == "low":
        if current_cat != proposed_cat:
            unchanged_low_conf_count += 1
            left_alone_low_conf.append((slug, current_cat, proposed_cat))
        new_tools.append(tool)
        continue

    # Medium override
    if confidence == "medium" and slug in MEDIUM_CONF_OVERRIDE:
        proposed_cat = MEDIUM_CONF_OVERRIDE[slug]
        medium_override_count += 1

    # If proposed Image Generation, decide IG vs Design & Graphics
    if proposed_cat == "Image Generation":
        blob = " ".join([
            tool.get("name", ""),
            tool.get("tagline", ""),
            tool.get("description", ""),
            " ".join(tool.get("tags") or []),
            " ".join(tool.get("use_cases") or []),
        ])
        remapped = remap_image_generation(slug, tool.get("name", ""), blob)
        if remapped != proposed_cat:
            imgen_to_design_count += 1
            imgen_remap_log.append((slug, tool.get("name"), "Design & Graphics"))
            proposed_cat = remapped
        else:
            imgen_kept_count += 1
            imgen_remap_log.append((slug, tool.get("name"), "Image Generation"))

    # Skip remaining if proposed_cat is None (would only happen for
    # non-approved removals - leave them alone in their current category)
    if proposed_cat is None:
        new_tools.append(tool)
        continue

    # Apply the category
    if current_cat != proposed_cat:
        tool["category"] = proposed_cat
        applied_count += 1
        applied_changes.append((slug, current_cat, proposed_cat))

    new_tools.append(tool)

# Write back
with open("data/tools.json", "w", encoding="utf-8") as f:
    json.dump(new_tools, f, indent=2, ensure_ascii=False)

print(f"Total before: {len(tools)}")
print(f"Total after:  {len(new_tools)}")
print(f"Removed:      {removed_count} ({removed_slugs})")
print(f"Categories changed:        {applied_count}")
print(f"Medium-conf overrides:     {medium_override_count}")
print(f"Image Gen kept:            {imgen_kept_count}")
print(f"Image Gen -> Design&Graphics: {imgen_to_design_count}")
print(f"Low-conf left unchanged:   {unchanged_low_conf_count}")
print()
print("New category distribution:")
cat_counts = Counter(t.get("category") for t in new_tools)
for c, n in sorted(cat_counts.items(), key=lambda x: -x[1]):
    print(f"  {n:4} {c!r}")

# Persist some logs for the report
with open("_audit_apply_log.json", "w", encoding="utf-8") as f:
    json.dump({
        "removed": removed_slugs,
        "applied_changes": applied_changes,
        "medium_overrides": list(MEDIUM_CONF_OVERRIDE.keys()),
        "imgen_remap": imgen_remap_log,
        "low_conf_unchanged": left_alone_low_conf,
        "category_distribution": dict(cat_counts),
        "total_before": len(tools),
        "total_after": len(new_tools),
    }, f, indent=2)
