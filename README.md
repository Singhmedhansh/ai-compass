# AI Compass

AI Compass is a student-first AI discovery platform that helps users find the best AI tools for writing, coding, research, studying, image generation, video creation, and productivity.

It combines a curated tool directory, SEO landing pages, a multi-step AI Tool Finder wizard, tool detail pages, favorites, ratings, newsletter capture, discovery automation, and admin moderation into one product-ready Flask application.

## Product Pitch

Students do not need another generic list of AI tools. They need a fast way to answer three practical questions:

1. Which tools are actually worth using?
2. Which ones fit a student budget?
3. Which stack should I use for my exact workflow?

AI Compass solves that by pairing a curated directory with recommendation flows, student-friendly ranking logic, and editorial collection pages that feel closer to a startup product than a basic demo app.

## Core Experience

AI Compass currently includes:

1. A professional homepage with product messaging, tool stats, trending tools, and newsletter capture.
2. A searchable AI tools directory backed by `data/tools.json`.
3. Rich tool detail pages with ratings, reviews, metadata, and related tools.
4. A multi-step AI Tool Finder wizard that recommends 3 to 6 tools based on goal, budget, and platform.
5. User favorites and dashboard recommendations.
6. Admin moderation for submitted and discovered tools.
7. SEO collection pages such as best tools for students, coding, writing, research, and free use cases.
8. A crawler/discovery pipeline for expanding the dataset over time.

## Why It Feels Like a Product

This project is built around product surfaces, not just routes:

1. Landing-page positioning focused on students.
2. Conversion touchpoints like newsletter signup and stack builder entry points.
3. Growth pages for SEO and discoverability.
4. Personalization through favorites, student mode, and saved AI stacks.
5. Operational workflows through moderation, discovery, notifications, and analytics.

## Feature Highlights

### Discovery and Directory

1. Curated AI tool dataset with categories, tags, pricing, ratings, platforms, and student perks.
2. Trending, newest, free-first, popular, and rating-based sorting.
3. Search suggestions and relevance-ranked API search.

### Recommendation Engine

1. AI Tool Finder wizard at `/ai-tool-finder`.
2. Session-backed multi-step flow:
   Goal → Budget → Platform → Results.
3. Ranking logic prioritizes student perks, stronger ratings, free or freemium pricing, and trending tools.

### Tool Detail Pages

1. Dedicated `/tool/<slug>` pages.
2. Community rating and review counts.
3. Similar and related tools.
4. Metadata and structured content designed for search visibility.

### Growth and Retention

1. Newsletter subscriptions stored in the database.
2. SEO collection pages.
3. Weekly updates feed.
4. Google Analytics support via environment variable.

### Operations

1. Admin moderation for user submissions.
2. Discovery queue approval and rejection flow.
3. Tool caching and production static file handling.
4. Docker, WSGI, and gunicorn deployment support.

## Tech Stack

1. Backend: Flask, Flask-Login, Flask-WTF, SQLAlchemy.
2. Frontend: Jinja templates, Tailwind CSS, lightweight JavaScript.
3. Data: `tools.json` for the curated catalog, SQL database for users, favorites, ratings, newsletter subscribers, views, and submissions.
4. Deployment: gunicorn, WhiteNoise, Docker, WSGI entrypoint.

## Project Structure

```text
ai-compass/
├── app.py
├── wsgi.py
├── app/
│   ├── __init__.py
│   ├── auth.py
│   ├── discovery.py
│   ├── models.py
│   ├── oauth.py
│   ├── recommendations.py
│   ├── routes.py
│   └── tool_cache.py
├── data/
│   ├── tools.json
│   ├── discovery_queue.json
│   ├── discovery_stats.json
│   └── notifications.json
├── static/
│   ├── css/
│   ├── icons/
│   └── js/
├── templates/
│   ├── base.html
│   ├── index.html
│   ├── tool_page.html
│   ├── tool_finder.html
│   ├── collection.html
│   ├── dashboard.html
│   └── admin.html
├── scripts/
├── requirements.txt
├── Dockerfile
├── Procfile
└── tailwind.config.js
```

## Local Setup

1. Install Python dependencies.

```sh
pip install -r requirements.txt
```

2. Install frontend tooling.

```sh
npm install -D tailwindcss
```

3. Set environment variables.

```sh
set SECRET_KEY=replace-with-a-real-secret
set ADMIN_EMAIL=admin@example.com
set ADMIN_PASSWORD=change-me
```

4. Start Tailwind in watch mode if you are editing styles.

```sh
npx tailwindcss -i ./static/css/input.css -o ./static/css/style.css --watch
```

5. Run the app.

```sh
python app.py
```

## Environment Variables

Required for production:

```sh
SECRET_KEY=replace-with-strong-random-value
APP_ENV=production
PORT=8000
```

Common optional settings:

```sh
DATABASE_URL=postgresql://user:pass@host:5432/dbname
ADMIN_EMAIL=admin@example.com
ADMIN_EMAILS=admin@example.com,editor@example.com
ADMIN_PASSWORD=change-me
GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
APP_SECURE_COOKIES=true
STATIC_CACHE_MAX_AGE=31536000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

## Running in Production

Run locally with gunicorn:

```sh
gunicorn wsgi:app --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 120
```

Verify imports and environment compatibility:

```sh
python scripts/verify_requirements.py
```

### Railway

Use the `Procfile` or set the start command to:

```sh
gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120
```

### Render

Build command:

```sh
pip install -r requirements.txt
```

Start command:

```sh
gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120
```

### Fly.io

The included `Dockerfile` supports container deployment. Set secrets and ensure the app listens on `$PORT`.

## Current Product Modules

1. Landing page and marketing sections.
2. Tool directory and detail pages.
3. AI Tool Finder wizard.
4. Favorites and dashboard personalization.
5. Newsletter capture.
6. Tool ratings.
7. Admin moderation.
8. Discovery crawler workflow.
9. SEO collection pages.

## Roadmap Ideas

1. Replace JSON catalog management with a database-backed editorial CMS.
2. Add team accounts and saved workspaces.
3. Add side-by-side pricing and feature comparison matrices.
4. Introduce review moderation and richer user-generated content.
5. Add email onboarding and personalized weekly recommendations.

## Repository Notes

This repository contains both product-facing code and operational tooling for moderation and discovery. For workspace-specific conventions, see [.github/copilot-instructions.md](.github/copilot-instructions.md) when present.
