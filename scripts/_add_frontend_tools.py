#!/usr/bin/env python3
"""One-shot script to add frontend AI tool candidates to data/tools.json.

Skips any candidate whose slug, normalized name, or URL hostname already
exists in the catalog. Designed to be run once for the P-CATALOG-1 commit.

Committed for traceability of what was added and how dedup decisions were
made. Re-running on a current catalog is a no-op (everything will be skipped).
"""
import json
import sys
from datetime import date
from pathlib import Path

# Reuse normalization from the advisory dedup checker so adds and audits
# disagree on nothing.
sys.path.insert(0, str(Path(__file__).parent))
from check_tool_duplicates import normalize_name, normalize_url


# Candidate tools — keyed by canonical fields. The add loop adapts them to
# the live tools.json schema (uses `link` not `url`, attaches defaults).
candidates = [
    {
        'name': 'Stitch',
        'slug': 'stitch-google',
        'tagline': 'Design and code UI from text prompts (Google)',
        'description': "Google's AI tool for generating frontend UI designs and code from natural-language prompts. Outputs production-ready code in popular frameworks; iterate visually or via prompt refinement.",
        'category': 'Coding',
        'pricing': 'free',
        'link': 'https://stitch.withgoogle.com',
        'tags': ['design-to-code', 'ui-generation', 'prototyping', 'google', 'free'],
        'use_cases': ['prototyping', 'ui-design', 'frontend-development'],
    },
    {
        'name': 'Google AI Studio',
        'slug': 'google-ai-studio',
        'tagline': 'Prototype with Gemini and Google AI models',
        'description': "Free workbench for prototyping with Gemini and other Google models. Build and test prompts, tune behavior, export to API. Includes free access to current Gemini models.",
        'category': 'Coding',
        'pricing': 'free',
        'link': 'https://aistudio.google.com',
        'tags': ['prompting', 'prototyping', 'gemini', 'google', 'api', 'free'],
        'use_cases': ['prompt-engineering', 'ai-prototyping', 'model-testing'],
    },
    {
        'name': 'Uizard',
        'slug': 'uizard',
        'tagline': 'AI design tool for non-designers',
        'description': "Turn text prompts, sketches, or screenshots into editable UI designs. Built for fast prototyping and team handoff to designers.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://uizard.io',
        'tags': ['design-to-code', 'wireframing', 'prototyping', 'no-code'],
        'use_cases': ['prototyping', 'ui-design'],
    },
    {
        'name': 'Visily',
        'slug': 'visily',
        'tagline': 'AI wireframe and mockup tool',
        'description': "Generate wireframes and mockups from text, sketches, or screenshots. Pre-built component library and templates for fast iteration.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://www.visily.ai',
        'tags': ['wireframing', 'prototyping', 'design', 'freemium'],
        'use_cases': ['prototyping', 'ui-design', 'wireframing'],
    },
    {
        'name': 'Magic Patterns',
        'slug': 'magic-patterns',
        'tagline': 'Generate React UI patterns from text',
        'description': "AI tool for generating React components and UI patterns from natural-language prompts. Export production-ready code; works alongside existing component libraries.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://www.magicpatterns.com',
        'tags': ['design-to-code', 'react', 'ui-generation', 'frontend'],
        'use_cases': ['frontend-development', 'prototyping', 'ui-design'],
    },
    {
        'name': 'Subframe',
        'slug': 'subframe',
        'tagline': 'AI design and code editor in one',
        'description': "Build UI components visually with AI assistance; export clean React code. Bridges the design-to-code workflow without the Figma export step.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://www.subframe.com',
        'tags': ['design-to-code', 'react', 'visual-editor', 'frontend'],
        'use_cases': ['frontend-development', 'ui-design', 'component-building'],
    },
    {
        'name': 'Anima',
        'slug': 'anima',
        'tagline': 'Convert Figma designs to React/Vue/HTML code',
        'description': "Design-to-code with AI assistance. Generates clean component code from Figma frames, with support for React, Vue, and plain HTML/CSS output.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://www.animaapp.com',
        'tags': ['design-to-code', 'figma', 'react', 'vue', 'frontend'],
        'use_cases': ['frontend-development', 'figma-to-code'],
    },
    {
        'name': 'Builder.io',
        'slug': 'builder-io',
        'tagline': 'Visual development with AI (Visual Copilot)',
        'description': "Visual page builder with AI-powered Figma-to-code conversion (Visual Copilot). Generates production code in your component framework and design system.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://www.builder.io',
        'tags': ['design-to-code', 'visual-development', 'cms', 'react', 'enterprise'],
        'use_cases': ['frontend-development', 'figma-to-code', 'cms'],
    },
    {
        'name': 'Polymet AI',
        'slug': 'polymet-ai',
        'tagline': 'AI UI design from text or reference images',
        'description': "Generate UI designs from natural language prompts or reference images. Export to React code or hand off to designers.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://polymet.ai',
        'tags': ['design-to-code', 'ui-generation', 'react'],
        'use_cases': ['ui-design', 'prototyping', 'frontend-development'],
    },
    {
        'name': 'Continue.dev',
        'slug': 'continue-dev',
        'tagline': 'Open-source AI coding assistant',
        'description': "Open-source alternative to GitHub Copilot. Plugs into VS Code and JetBrains, connects to any LLM (Claude, GPT, local models). Self-hosted option for privacy.",
        'category': 'Coding',
        'pricing': 'free',
        'link': 'https://continue.dev',
        'tags': ['copilot-alternative', 'open-source', 'vscode', 'jetbrains', 'free'],
        'use_cases': ['ai-coding', 'code-completion', 'developer-tools'],
    },
    {
        'name': 'Codeium',
        'slug': 'codeium',
        'tagline': 'Free AI coding assistant',
        'description': "Free Copilot alternative with autocomplete, chat, and codebase-aware search. No credit card required for individual use; team plans available.",
        'category': 'Coding',
        'pricing': 'free + paid',
        'link': 'https://codeium.com',
        'tags': ['copilot-alternative', 'free', 'ai-coding', 'autocomplete'],
        'use_cases': ['ai-coding', 'code-completion'],
    },
    {
        'name': 'Amazon Q Developer',
        'slug': 'amazon-q-developer',
        'tagline': 'AWS-integrated AI coding assistant',
        'description': "AWS's AI coding tool (formerly CodeWhisperer). Particularly strong for AWS-centric workflows — generates SDK calls, IAM policies, CloudFormation. Free tier with monthly limits.",
        'category': 'Coding',
        'pricing': 'free + paid',
        'link': 'https://aws.amazon.com/q/developer',
        'tags': ['aws', 'ai-coding', 'enterprise', 'amazon'],
        'use_cases': ['ai-coding', 'aws-development'],
    },
    {
        'name': 'Mintlify',
        'slug': 'mintlify',
        'tagline': 'AI documentation for code',
        'description': "Auto-generate documentation from your codebase using AI. Hosts beautiful docs sites; popular with API-first companies.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://mintlify.com',
        'tags': ['documentation', 'api-docs', 'ai-coding'],
        'use_cases': ['documentation', 'api-development'],
    },
    {
        'name': 'Pieces for Developers',
        'slug': 'pieces',
        'tagline': 'AI snippet manager and dev assistant',
        'description': "Save code snippets with AI-enhanced search and chat. Cross-IDE companion that remembers context across your VS Code, browser, and terminal sessions.",
        'category': 'Coding',
        'pricing': 'free',
        'link': 'https://pieces.app',
        'tags': ['snippets', 'productivity', 'ai-coding', 'free'],
        'use_cases': ['ai-coding', 'developer-productivity'],
    },
    {
        'name': 'Roo Code',
        'slug': 'roo-code',
        'tagline': 'Autonomous AI coding agent for VS Code',
        'description': "Fork of Cline with extended autonomous coding capabilities. Free and open-source; brings agent-level autonomy directly into VS Code.",
        'category': 'Coding',
        'pricing': 'free',
        'link': 'https://github.com/RooVetGit/Roo-Code',
        'tags': ['ai-agent', 'autonomous-coding', 'open-source', 'vscode', 'free'],
        'use_cases': ['ai-coding', 'autonomous-development'],
    },
    {
        'name': 'Galileo AI',
        'slug': 'galileo-ai',
        'tagline': 'Text-to-design for product UI mockups',
        'description': "Generate UI mockups from text prompts; outputs to Figma for further iteration. Acquired by Google in 2024 and partially folded into Stitch — original product still operates.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://www.usegalileo.ai',
        'tags': ['design-to-code', 'figma', 'ui-generation'],
        'use_cases': ['ui-design', 'prototyping', 'figma-handoff'],
    },
    {
        'name': 'Tempo',
        'slug': 'tempo-ai',
        'tagline': 'AI design tool that writes real React code',
        'description': "Visual editor that produces React + Tailwind code synced to your codebase. Bridges designer and developer workflows on the same source files.",
        'category': 'Coding',
        'pricing': 'freemium',
        'link': 'https://tempo.new',
        'tags': ['design-to-code', 'react', 'tailwind', 'visual-editor'],
        'use_cases': ['frontend-development', 'design-to-code'],
    },
]


def main():
    tools_path = Path('data/tools.json')
    with open(tools_path, encoding='utf-8') as f:
        tools = json.load(f)

    existing_slugs = {(t.get('slug') or '').strip().lower() for t in tools}
    existing_names = {normalize_name(t.get('name') or '') for t in tools if t.get('name')}
    existing_urls = {
        normalize_url(t.get('link') or t.get('url') or t.get('website') or '')
        for t in tools
        if t.get('link') or t.get('url') or t.get('website')
    }
    existing_urls.discard('')

    max_id = max((t.get('id', 0) for t in tools if isinstance(t.get('id'), int)), default=0)

    today = date.today().isoformat()

    added = []
    skipped = []

    for cand in candidates:
        slug = (cand.get('slug') or '').strip().lower()
        name_norm = normalize_name(cand.get('name') or '')
        url_norm = normalize_url(cand.get('link') or '')

        skip_reason = None
        if slug and slug in existing_slugs:
            skip_reason = f"slug already exists: {slug}"
        elif name_norm and name_norm in existing_names:
            skip_reason = f"name already exists: {name_norm}"
        elif url_norm and url_norm in existing_urls:
            skip_reason = f"url already exists: {url_norm}"

        if skip_reason:
            skipped.append((cand['name'], skip_reason))
            continue

        max_id += 1
        new_entry = {
            'id': max_id,
            **cand,
            'icon': '',
            'rating': 0,
            'review_count': 0,
            'weeklyUsers': None,
            'trending': True,
            'is_ai_native': True,
            'last_verified_at': today,
        }
        tools.append(new_entry)
        existing_slugs.add(slug)
        existing_names.add(name_norm)
        existing_urls.add(url_norm)
        added.append(cand['name'])

    with open(tools_path, 'w', encoding='utf-8') as f:
        json.dump(tools, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print(f'Added: {len(added)}')
    for name in added:
        print(f'  + {name}')
    print(f'Skipped (already present): {len(skipped)}')
    for name, reason in skipped:
        print(f'  - {name} ({reason})')
    print(f'\nTotal tools after: {len(tools)}')


if __name__ == '__main__':
    main()
