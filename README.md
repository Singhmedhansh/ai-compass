<div align="center">

# 🧭 AI Compass

### Find the *right* AI tool in seconds — not the hundredth listicle.

**A student‑first discovery engine for 400+ hand‑curated AI tools, with a smart recommendation wizard, editorial guides, and a real recommendation model under the hood.**

<br/>

[![Live](https://img.shields.io/badge/🌐_Live-ai--compass.in-6C5CE7?style=for-the-badge)](https://ai-compass.in)
&nbsp;
[![Explore Tools](https://img.shields.io/badge/🔎_Explore-400+_Tools-00B894?style=for-the-badge)](https://ai-compass.in/tools)
&nbsp;
[![AI Tool Finder](https://img.shields.io/badge/✨_Try-AI_Tool_Finder-FD79A8?style=for-the-badge)](https://ai-compass.in/ai-tool-finder)

<br/>

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.1-000000?style=flat-square&logo=flask&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-TF--IDF-F7931E?style=flat-square&logo=scikitlearn&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat-square&logo=render&logoColor=white)

</div>

---

## 📑 Table of Contents

- [✨ What is AI Compass?](#-what-is-ai-compass)
- [🎯 The Problem It Solves](#-the-problem-it-solves)
- [🚀 Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [🔄 How It Works — The Workflows](#-how-it-works--the-workflows)
- [🛠️ Tech Stack](#️-tech-stack)
- [⚡ Quick Start](#-quick-start)
- [📁 Project Structure](#-project-structure)
- [🔌 API Reference](#-api-reference)
- [🧠 The Recommendation Engine](#-the-recommendation-engine)
- [🌐 Deployment](#-deployment)
- [🤝 Contributing](#-contributing)

---

## ✨ What is AI Compass?

**AI Compass** is a production‑grade web app that turns the overwhelming sea of AI tools into a fast, opinionated, student‑friendly experience. It pairs a **hand‑tested catalog of 402 tools across 10 categories** with a **multi‑step recommendation wizard**, **SEO editorial guides**, **ratings & reviews**, and an **admin moderation suite** — all served by a single Flask app behind a slick React SPA.

> [!NOTE]
> Every tool is **opened, used, and given a written rationale** before it ships — no scraping, no auto‑generated filler. Pricing is re‑verified on a rolling cadence.

<div align="center">

| 🧰 **402** tools | 🗂️ **10** categories | 🔌 **85** routes | 🧠 **1** real ML model |
|:---:|:---:|:---:|:---:|

</div>

---

## 🎯 The Problem It Solves

Students don't need another generic list. They need answers to three practical questions:

```
1.  Which tools are actually worth using?        →  Curated, hand-tested catalog
2.  Which ones fit a student budget?             →  Free / freemium filters + perks
3.  Which stack should I use for MY workflow?     →  AI Tool Finder + recommender
```

---

## 🚀 Features

| | Feature | What it does |
|:---:|:---|:---|
| 🔎 | **Tool Directory** | Filter & sort 400+ tools by category, pricing, and intent with live search |
| ✨ | **AI Tool Finder** | A multi‑step wizard that builds a personalized "AI stack" from your goal, budget & skill |
| 📄 | **Tool Detail Pages** | Deep dives with pricing tiers, strengths, use‑cases, ratings & **similar tools** |
| 🆚 | **Compare & Alternatives** | Side‑by‑side `X vs Y` pages + "best alternatives to ___" for every tool |
| 📚 | **Editorial Guides** | SEO landing pages — *Best AI Tools for Students / Teachers / Coding / Free* |
| ⭐ | **Ratings & Reviews** | Authenticated users rate tools and write real reviews |
| ❤️ | **Favorites & Dashboard** | Personal library + personalized greetings |
| 🧠 | **Recommendation Engine** | TF‑IDF + cosine similarity surfaces genuinely related tools |
| 🛡️ | **Admin Suite** | Moderation, catalog drift import, cache control, retraining |
| 🔍 | **SEO Built‑in** | Server‑rendered meta tags, JSON‑LD, dynamic `sitemap.xml`, OG images |

---

## 🏗️ Architecture

A single Flask application serves the API **and** the pre‑built React SPA. The catalog is **database‑backed** with an in‑memory cache in front for speed.

```mermaid
flowchart LR
    User([👤 User])

    subgraph Client["🖥️ Frontend — React 19 SPA"]
        SPA["⚛️ Vite · Tailwind · Framer Motion"]
    end

    subgraph Server["🐍 Backend — Flask 3.1"]
        API["🔌 REST API<br/>/api/v1/*"]
        SEO["🔍 SSR meta + sitemap"]
        Cache["⚡ In-memory cache<br/>+ search index"]
        ML["🧠 TF-IDF recommender"]
        Auth["🔐 Flask-Login"]
    end

    subgraph Data["💾 Persistence"]
        DB[("🗄️ PostgreSQL<br/>catalog_tools")]
        JSON["📄 data/tools.json"]
        PKL["📦 recommendation_model.pkl"]
    end

    User --> SPA
    SPA -->|"fetch /api/v1/*"| API
    User -->|"crawlers / first paint"| SEO
    API --> Cache
    API --> Auth
    Cache -->|"source of truth"| DB
    JSON -.->|"one-time seed / fallback"| Cache
    API --> ML
    ML --- PKL

    classDef client fill:#61DAFB22,stroke:#61DAFB,color:#0b3954;
    classDef server fill:#6C5CE722,stroke:#6C5CE7,color:#2d2470;
    classDef data fill:#00B89422,stroke:#00B894,color:#0a5c47;
    class SPA client;
    class API,SEO,Cache,ML,Auth server;
    class DB,JSON,PKL data;
```

---

## 🔄 How It Works — The Workflows

### 1️⃣ Catalog data flow — *the source of truth*

`tools.json` is only a **one‑time seed**. Once the database is populated, **`catalog_tools` (PostgreSQL) becomes the source of truth**, and an in‑memory cache serves reads.

```mermaid
flowchart TD
    A["📄 data/tools.json<br/>402 curated tools"]
    B[("🗄️ catalog_tools<br/><b>SOURCE OF TRUTH</b>")]
    C["⚡ In-memory cache<br/>+ search index"]
    D["🔌 /api/v1/tools/*"]
    E["⚛️ React Frontend"]
    F["🛠️ Admin · import_catalog_drift.py"]

    A -->|"seed_from_json_if_empty()<br/>(only when table is empty)"| B
    A -.->|"fallback if DB unavailable"| C
    B -->|"load_tools_from_db()"| C
    C --> D --> E
    F -->|"upsert_tool()"| B
    F -->|"refresh_tools_cache()"| C

    classDef src fill:#FDCB6E33,stroke:#E1A100,color:#5c4400;
    classDef db fill:#00B89422,stroke:#00B894,color:#0a5c47;
    class A src;
    class B db;
```

> [!TIP]
> Adding a tool to `tools.json` **after** the DB is seeded won't appear until it's imported. Run `python import_catalog_drift.py --apply` (or the `/admin/catalog-import/<slug>` endpoint) to sync the drift, then refresh the cache.

### 2️⃣ Live search request lifecycle

```mermaid
sequenceDiagram
    actor U as 👤 User
    participant R as ⚛️ React SPA
    participant F as 🐍 Flask /search
    participant I as ⚡ Search Index

    U->>R: types "free coding tools"
    R->>R: debounce 300ms
    R->>F: GET /api/v1/search?q=...
    F->>I: rank by name · tags · desc · use-cases
    I-->>F: scored matches
    F-->>R: JSON results
    R-->>U: live, instant results
```

### 3️⃣ The AI Tool Finder wizard

```mermaid
flowchart LR
    Q1["🎯 Goal"] --> Q2["💰 Budget"] --> Q3["📊 Skill level"] --> Q4["🧩 Category"]
    Q4 --> ENG{{"🧠 Recommendation<br/>engine"}}
    ENG --> STACK["✨ Your personalized<br/>AI Stack — 5–6 tools"]

    classDef q fill:#FD79A822,stroke:#FD79A8,color:#7a2950;
    class Q1,Q2,Q3,Q4 q;
```

### 4️⃣ Deploy pipeline

```mermaid
flowchart LR
    Dev["💻 git push main"] --> Render["☁️ Render"]
    Render --> Build["🔨 build.sh<br/>npm build · pip install"]
    Build --> Gun["🦄 gunicorn wsgi:app"]
    Gun --> Warm["🧵 Background warmup<br/>migrate · seed · cache · model"]
    Warm --> Live["🌐 ai-compass.in"]

    classDef ok fill:#00B89422,stroke:#00B894,color:#0a5c47;
    class Live ok;
```

> [!IMPORTANT]
> Heavy startup work (cold DB connect, model load/training) runs in a **background thread** so gunicorn binds the port immediately — keeping deploys fast and within the platform's port‑scan window.

---

## 🛠️ Tech Stack

<table>
<tr><th>Layer</th><th>Technologies</th></tr>
<tr>
<td><b>🎨 Frontend</b></td>
<td>

![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/TailwindCSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Framer](https://img.shields.io/badge/Framer_Motion-0055FF?style=flat-square&logo=framer&logoColor=white)
![Router](https://img.shields.io/badge/React_Router-CA4245?style=flat-square&logo=reactrouter&logoColor=white)

</td>
</tr>
<tr>
<td><b>⚙️ Backend</b></td>
<td>

![Flask](https://img.shields.io/badge/Flask_3.1-000000?style=flat-square&logo=flask&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy_2-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white)
![Login](https://img.shields.io/badge/Flask--Login-000000?style=flat-square&logo=flask&logoColor=white)
![Gunicorn](https://img.shields.io/badge/Gunicorn-499848?style=flat-square&logo=gunicorn&logoColor=white)

</td>
</tr>
<tr>
<td><b>🧠 ML / Data</b></td>
<td>

![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E?style=flat-square&logo=scikitlearn&logoColor=white)
![NumPy](https://img.shields.io/badge/NumPy-013243?style=flat-square&logo=numpy&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite_(local)-003B57?style=flat-square&logo=sqlite&logoColor=white)

</td>
</tr>
<tr>
<td><b>☁️ Infra</b></td>
<td>

![Render](https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=white)
![Neon](https://img.shields.io/badge/Neon_Postgres-00E599?style=flat-square&logo=neon&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)
![Alembic](https://img.shields.io/badge/Flask--Migrate-blue?style=flat-square)

</td>
</tr>
</table>

---

## ⚡ Quick Start

> **Prerequisites:** Python 3.11+, Node 18+, and npm.

<details>
<summary><b>🔧 1. Clone & set up the backend</b></summary>

```bash
git clone https://github.com/Singhmedhansh/ai-compass.git
cd ai-compass

# create a virtualenv
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# install Python deps
pip install -r requirements.txt
```

No `DATABASE_URL`? The app falls back to a local **SQLite** DB at `instance/ai_compass.db` and seeds it from `data/tools.json` automatically — zero config to get running.

</details>

<details>
<summary><b>🎨 2. Build the frontend</b></summary>

```bash
cd frontend
npm install
npm run build      # outputs to ../static/dist (served by Flask)
cd ..
```

For live frontend development with hot reload:

```bash
cd frontend && npm run dev
```

</details>

<details>
<summary><b>🚀 3. Run the app</b></summary>

```bash
python run.py
# → http://localhost:8080
```

Or production‑style with gunicorn:

```bash
gunicorn wsgi:app --bind 0.0.0.0:8080 --workers 1 --timeout 120
```

</details>

<details>
<summary><b>🧠 4. (Optional) Build the recommendation model</b></summary>

```bash
python scripts/train_model.py
# → writes data/recommendation_model.pkl
```

If the model file is missing, the app trains it automatically on first boot.

</details>

<details>
<summary><b>🔐 Environment variables</b></summary>

| Variable | Purpose | Default |
|:---|:---|:---|
| `DATABASE_URL` | Postgres connection string | SQLite fallback |
| `SECRET_KEY` | Flask session signing | auto‑generated |
| `PORT` | Port to bind | `8080` |
| `APP_ENV` | `production` enables hardening | dev |
| `FRONTEND_URL` / `CANONICAL_HOST` | Canonical URLs / CORS | — |
| `GOOGLE_CLIENT_ID` / `GITHUB_CLIENT_ID` | Social login (optional) | — |

</details>

---

## 📁 Project Structure

<details>
<summary><b>Click to expand the tree</b></summary>

```
ai-compass/
├── app/                       # 🐍 Flask application package
│   ├── __init__.py            #    app factory + background warmup
│   ├── routes.py              #    SSR shell, SEO meta, sitemap, redirects
│   ├── api_routes.py          #    REST API (/api/v1/*) + admin endpoints
│   ├── tool_cache.py          #    in-memory cache + search index
│   ├── catalog_store.py       #    DB catalog: seed / upsert / load
│   ├── ml_recommender.py      #    TF-IDF similarity engine
│   ├── search_utils.py        #    search ranking
│   └── models.py              #    SQLAlchemy models
├── frontend/                  # ⚛️ React 19 + Vite SPA
│   └── src/
│       ├── pages/             #    routes (Directory, ToolDetail, Finder, guides…)
│       ├── components/        #    UI components
│       └── assets/brand/      #    self-hosted brand logos
├── data/
│   ├── tools.json             # 📄 curated catalog (seed source)
│   └── recommendation_model.pkl
├── scripts/                   # 🛠️ trainers, migrations, catalog tools
├── import_catalog_drift.py    #    sync tools.json → DB catalog
├── migrations/                #    Alembic migrations
├── wsgi.py / run.py           #    entry points
├── render.yaml / Procfile / Dockerfile
└── requirements.txt
```

</details>

---

## 🔌 API Reference

<details>
<summary><b>Public endpoints</b></summary>

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/api/v1/tools` | List all visible tools |
| `GET` | `/api/v1/tools/<slug>` | Single tool + similar tools + ratings |
| `GET` | `/api/v1/tools/<slug>/alternatives` | Best alternatives |
| `GET` | `/api/v1/tools/<slug>/reviews` | User reviews |
| `GET` | `/api/v1/search?q=` | Live search (name · tags · desc · use‑cases) |
| `GET` | `/api/v1/stats` | Catalog stats (total tools, etc.) |
| `GET` | `/sitemap.xml` | Dynamic SEO sitemap |
| `GET` | `/health` | Health check |

</details>

<details>
<summary><b>Authenticated & admin endpoints</b></summary>

| Method | Endpoint | Description |
|:---|:---|:---|
| `POST` | `/api/v1/tools/<slug>/ratings` | Rate a tool |
| `POST` | `/api/v1/tools/<slug>/reviews` | Write a review |
| `GET` | `/api/v1/favorites` | List favorites |
| `GET` | `/api/v1/admin/catalog-diff` | Drift between `tools.json` and the DB |
| `POST` | `/api/v1/admin/catalog-import/<slug>` | Import a tool into the DB |
| `POST` | `/api/v1/admin/clear-cache` | Reload catalog cache from source |
| `POST` | `/api/v1/admin/retrain` | Rebuild the recommendation model |

</details>

---

## 🧠 The Recommendation Engine

A lightweight, fully self‑contained **content‑based** recommender — no external API, no vendor lock‑in.

```mermaid
flowchart LR
    T["📄 Tool text<br/>name · tagline · tags · use-cases"] --> V["🔤 TF-IDF Vectorizer<br/>1,000-dim vocabulary"]
    V --> M["🔢 Tool–term matrix<br/>402 × 1000"]
    M --> S["📐 Cosine similarity"]
    S --> R["✨ Top-N similar tools"]

    classDef ml fill:#F7931E22,stroke:#F7931E,color:#6b3d00;
    class V,M,S ml;
```

1. Every tool's text is vectorized with **TF‑IDF** (scikit‑learn).
2. **Cosine similarity** ranks the closest tools.
3. Results power **"Similar tools"**, **alternatives pages**, and the **AI Tool Finder**.
4. Retrain anytime with `python scripts/train_model.py` or the `/admin/retrain` endpoint.

---

## 🌐 Deployment

Deployed on **Render** (web service + managed **Neon** Postgres).

```bash
# Build  →  npm run build (frontend)  +  pip install (backend)   [build.sh]
# Start  →  gunicorn wsgi:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
```

- `render.yaml` declares the service, build/start commands, and env wiring.
- A `Dockerfile` is also provided for container‑based hosting (Fly.io, etc.).
- DB schema is migrated via **Flask‑Migrate / Alembic** during warmup.

---

## 🤝 Contributing

Contributions welcome! A good first PR:

1. **Fork** & branch (`git checkout -b feat/my-improvement`).
2. Add or refine a tool in `data/tools.json` (follow the existing schema).
3. Run `python import_catalog_drift.py --apply` to sync it into the DB locally.
4. `cd frontend && npm run lint` and verify the app boots (`python run.py`).
5. Open a PR with a clear description.

> [!NOTE]
> The catalog is **DB‑backed in production** — `tools.json` edits need an import step to go live. See [Catalog data flow](#1️⃣-catalog-data-flow--the-source-of-truth).

---

<div align="center">

### Built for students. Curated by humans. Powered by Flask + React.

**[🌐 Live Site](https://ai-compass.in)** · **[🔎 Browse Tools](https://ai-compass.in/tools)** · **[✨ AI Tool Finder](https://ai-compass.in/ai-tool-finder)**

<sub>Crafted by <a href="https://github.com/Singhmedhansh">Medhansh Pratap Singh</a> · Made with 🧭</sub>

</div>
