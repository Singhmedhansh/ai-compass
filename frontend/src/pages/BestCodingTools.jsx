import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

// Brand logos: tools with a curated SVG under /assets/brand/ get pixel-perfect
// vector marks; everything else uses Clearbit's logo CDN keyed off the tool's
// canonical domain. Clearbit returns 404 on miss (unlike Google's favicon API
// which returns a generic globe with HTTP 200), so onError correctly flips the
// card to its initial-letter tile.
import claudeIcon from "../assets/brand/claude.svg";
import githubCopilotIcon from "../assets/brand/github-copilot.svg";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";

const MotionDiv = motion.div;

// Per-card icon with a 3-stage fallback: primary (tool.iconUrl, usually Clearbit
// or a Vite-imported brand SVG) -> 'fallback' (DuckDuckGo's icon proxy, keyed off
// the Clearbit domain) -> letter tile. Each onError advances one step. A
// Vite-bundled SVG that 404s jumps straight to the letter since its URL doesn't
// match the Clearbit pattern, so domain extraction returns null.
//
// DuckDuckGo over Google: Google's s2/favicons API returns a generic globe
// placeholder with HTTP 200 for unknown sites, which never triggers onError —
// Phind manifested this exact bug (globe icon stuck on the card). DuckDuckGo's
// ip3 endpoint returns a clean 404 on miss, so the cascade reliably falls
// through to the letter tile.
function BrandIcon({ tool, isHero }) {
  const [stage, setStage] = useState(tool.iconUrl ? "primary" : "letter");

  const renderLetter = () => (
    <span
      className={`font-bold ${isHero ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"}`}
      style={{ color: tool.color || "#666666" }}
    >
      {tool.name.charAt(0)}
    </span>
  );

  if (stage === "letter") return renderLetter();

  let src = tool.iconUrl;
  if (stage === "fallback") {
    const match = tool.iconUrl?.match(/clearbit\.com\/(.+)/);
    if (!match) return renderLetter();
    src = `https://icons.duckduckgo.com/ip3/${match[1]}.ico`;
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={isHero ? "h-12 w-12 object-contain md:h-14 md:w-14" : "h-10 w-10 object-contain md:h-12 md:w-12"}
      onError={() => {
        setStage((prev) => (prev === "primary" ? "fallback" : "letter"));
      }}
    />
  );
}

const LAST_REVIEWED = "May 2026";

// Slug -> affiliate URL. Add entries here when partnerships are signed;
// the CTA picks them up and adds rel="sponsored" automatically.
const AFFILIATE_URLS = {
  // 'sudowrite': 'https://www.sudowrite.com/?via=medhansh',
  // 'jenni-ai': 'https://jenni.ai/?via=medhansh',
  // 'elevenlabs': 'https://try.elevenlabs.io/2f10b9jmqa4g',
  // 'pictory': 'https://pictory.ai?ref=medhansh34',
};

function getOutboundUrl(tool) {
  const affiliate = AFFILIATE_URLS[tool.slug];
  if (affiliate) return { url: affiliate, isAffiliate: true };
  const m = typeof tool.iconUrl === 'string' && tool.iconUrl.match(/clearbit\.com\/([^/]+)/);
  if (m) return { url: `https://${m[1]}`, isAffiliate: false };
  return { url: null, isAffiliate: false };
}

const tools = [
  {
    rank: 1,
    name: "Cursor",
    slug: "cursor",
    iconUrl: "https://logo.clearbit.com/cursor.com",
    tagline: "AI-first code editor — the only IDE that reads your whole codebase",
    pricing: "Free + Pro $20/mo",
    bestFor: "CS coursework, side projects, learning a new stack, refactoring legacy code",
    studentWin:
      "Free tier ships with Claude and GPT-5 integrated; agent mode edits across multiple files from one natural-language prompt",
    verdict:
      "If you write code as a student, this is the productivity multiplier that actually multiplies.",
    color: "#000000",
  },
  {
    rank: 2,
    name: "GitHub Copilot",
    slug: "github-copilot",
    iconUrl: githubCopilotIcon,
    tagline: "AI pair programmer that lives inside VS Code, JetBrains, and Neovim",
    pricing: "FREE for verified students + Pro $10/mo",
    bestFor: "Autocomplete, boilerplate, picking up a new framework without docs",
    studentWin:
      "Completely free with the GitHub Student Developer Pack — same access as paying customers, no time limit",
    verdict:
      "The lowest-friction way to add AI to your editor. The free student plan is the killer feature.",
    color: "#6e40c9",
  },
  {
    rank: 3,
    name: "Claude Code",
    slug: "claude-code",
    iconUrl: "https://logo.clearbit.com/anthropic.com",
    tagline: "Anthropic's terminal AI coding agent — `claude` in any repo, anywhere",
    pricing: "Included with Claude Pro/Max + free trial",
    bestFor: "Multi-file refactors, debugging from the terminal, working on a Linux server with no IDE",
    studentWin:
      "Drop into any repo with `claude`, ask 'fix the failing tests' — actually works for non-trivial tasks across files",
    verdict:
      "When Cursor is too much app and ChatGPT is too much copy-paste, Claude Code is exactly right.",
    color: "#cc785c",
  },
  {
    rank: 4,
    name: "Claude",
    slug: "claude",
    iconUrl: claudeIcon,
    tagline: "Best LLM for code review, debugging logic, and reading long codebases",
    pricing: "Free + Pro $20/mo",
    bestFor: "Code review, walking through logic step by step, reading 500-line files",
    studentWin:
      "200K context handles entire small codebases as input; free tier alone outperforms most paid tools at code reasoning",
    verdict:
      "The model I reach for when the answer needs to be correct, not just plausible.",
    color: "#cc785c",
  },
  {
    rank: 5,
    name: "Antigravity",
    slug: "antigravity",
    iconUrl: "https://logo.clearbit.com/antigravity.google",
    tagline: "Google's cloud AI agents that build, debug, and ship full-stack apps end-to-end (Gemini 3)",
    pricing: "Freemium + paid tiers",
    bestFor: "Hands-off shipping of a working SaaS, codebase-level debugging, automating repetitive coding chores",
    studentWin:
      "Cloud-hosted agents mean zero local setup — works from any device including Chromebooks and school-issued laptops with no admin rights",
    verdict:
      "When you want the AI to drive the keyboard, not just suggest a line. The most agentic of the agentic IDEs.",
    color: "#000000",
  },
  {
    rank: 6,
    name: "v0 by Vercel",
    slug: "v0-by-vercel",
    iconUrl: "https://logo.clearbit.com/v0.dev",
    tagline: "Generate production-ready React + Tailwind components from a prompt",
    pricing: "Free + Premium $20/mo",
    bestFor: "Landing pages, dashboard UIs, portfolio sites, hackathon front-ends",
    studentWin:
      "Output is real Next.js + Tailwind code you copy into your project — not no-code lock-in",
    verdict:
      "Skip the 'design from scratch' phase entirely. Prompt v0, tweak the output, ship.",
    color: "#000000",
  },
  {
    rank: 7,
    name: "bolt.new",
    slug: "bolt-new",
    iconUrl: "https://logo.clearbit.com/bolt.new",
    tagline: "Build, run, and deploy a full-stack app from a single prompt",
    pricing: "Free + paid tiers $20-50/mo",
    bestFor: "MVPs, hackathon projects, prototyping a SaaS idea over a weekend",
    studentWin:
      "Spin up Next.js + Supabase + Tailwind with auth in 60 seconds; deploys to Netlify in one click",
    verdict:
      "The fastest 'idea to live URL' tool that exists. Use it when speed beats craft.",
    color: "#1abc9c",
  },
  {
    rank: 8,
    name: "Supabase",
    slug: "supabase",
    iconUrl: "https://logo.clearbit.com/supabase.com",
    tagline: "Postgres database, auth, storage, and edge functions on a single free tier",
    pricing: "Free + Pro $25/mo",
    bestFor: "Backend for your side project, student SaaS, hackathon database, class capstone",
    studentWin:
      "Free tier includes 500MB DB, 50K monthly active users, social auth, file storage — enough for a real production app",
    verdict:
      "Firebase without the vendor lock-in. The default backend choice for student-built apps in 2026.",
    color: "#3ecf8e",
  },
  {
    rank: 9,
    name: "Replit",
    slug: "replit",
    iconUrl: "https://logo.clearbit.com/replit.com",
    tagline: "Browser-based IDE with AI agent, instant deploy, and zero local setup",
    pricing: "Free + Core $20/mo",
    bestFor: "Coding from a Chromebook, teaching a friend, hackathon collaboration, mobile coding",
    studentWin:
      "No local toolchain to install; the Replit Agent can build entire apps end-to-end from a prompt",
    verdict:
      "When your laptop can't run a local dev stack, Replit makes the browser your dev environment.",
    color: "#f26207",
  },
  {
    rank: 10,
    name: "Netlify",
    slug: "netlify",
    iconUrl: "https://logo.clearbit.com/netlify.com",
    tagline: "One-click deploy for static sites and serverless functions with global edge",
    pricing: "Free + Pro $19/mo",
    bestFor: "Deploying your portfolio, hackathon landing pages, hobby SaaS, class project demos",
    studentWin:
      "Generous free tier (100GB bandwidth, 300 build minutes/mo); GitHub-connected deploys mean push-to-prod in 30 seconds",
    verdict:
      "The first deploy that just works. Use Netlify for static + functions; reach for Vercel if you're heavy on Next.js.",
    color: "#00C7B7",
  },
];

const faqs = [
  {
    q: "Which AI coding tool is free for students?",
    a: "GitHub Copilot is completely free for verified students via the GitHub Student Developer Pack — same access as paying customers. Pair it with Claude's free tier (for code review) and Antigravity's free tier (for cloud-agent builds) and you have a complete AI coding setup at zero cost.",
  },
  {
    q: "Cursor vs GitHub Copilot — which should I pick as a student?",
    a: "GitHub Copilot if you're already in VS Code and want low-friction autocomplete plus chat (and it's free for students). Cursor if you want an AI-first IDE with agent mode that can edit across multiple files (worth the $20/mo for bigger projects). Most students start with Copilot's free student plan, then upgrade to Cursor as projects grow.",
  },
  {
    q: "How do I deploy a student project for free?",
    a: "For frontend (React, Next.js, plain HTML): Netlify or Vercel — both have generous free tiers. For full-stack with a database: combine Supabase (database + auth, free) with Netlify (frontend hosting, free). For one-platform-no-config: Replit handles everything in the browser.",
  },
  {
    q: "What's the best backend for a student-built app?",
    a: "Supabase is the default in 2026. Free tier covers a real production app, the REST API auto-generates from your database schema, auth is built in, and you get Postgres (not a NoSQL lock-in). Firebase is the second choice — slightly more opinionated, no SQL.",
  },
  {
    q: "Do I need to learn Docker and Kubernetes as a student?",
    a: "No. Focus on Git + one framework (Next.js or similar) + one backend (Supabase or similar) + one deploy target (Netlify or similar). Docker and Kubernetes are job-search skills for later — they don't help you ship a student project faster, and you can pick them up in 2-3 weeks when you actually need them.",
  },
  {
    q: "Is using AI to write code cheating in class?",
    a: "Depends on your institution's policy and the assignment. Most CS programs in 2026 allow AI-assisted coding with disclosure on coursework, and most actively encourage it on capstone/side projects. Always check the syllabus and be transparent. Using AI to learn faster and to write boilerplate is universally fine; submitting AI-generated code as your own work without understanding it is not.",
  },
];

const stacks = [
  { label: "Frontend solo", tools: "Cursor + v0 + Netlify" },
  { label: "Full-stack MVP", tools: "bolt.new + Supabase + Netlify" },
  { label: "Free + simple", tools: "GitHub Copilot + Claude + Replit" },
  { label: "Terminal-first", tools: "Claude Code + Supabase + Netlify" },
  { label: "Hands-off agentic", tools: "Antigravity + Supabase + Netlify" },
];

export default function BestCodingTools() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best Coding Tools for Students in 2026 (AI-First) | AI Compass</title>
        <meta
          name="description"
          content="The 10 best coding tools for student developers in 2026. Cursor, GitHub Copilot, Claude Code, Supabase, v0, Netlify — free tiers, student plans, hand-tested for real projects."
        />
        <meta
          name="keywords"
          content="best coding tools for students, AI coding tools, student developer tools, free coding tools, GitHub Copilot students, Cursor for students, best IDE 2026, student dev stack"
        />
        <link rel="canonical" href="https://ai-compass.in/best-coding-tools-for-students" />
        <meta property="og:title" content="10 Best Coding Tools for Students in 2026 (AI-First) | AI Compass" />
        <meta property="og:description" content="The 10 best coding tools for student developers in 2026. Cursor, GitHub Copilot, Claude Code, Supabase, v0, Netlify — free tiers, student plans, hand-tested for real projects." />
        <meta property="og:url" content="https://ai-compass.in/best-coding-tools-for-students" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best Coding Tools for Students in 2026",
          "description": "The 10 best coding tools for student developers — ranked and reviewed for frontend, backend, full-stack, deployment, code editors, and API workflows.",
          "url": "https://ai-compass.in/best-coding-tools-for-students",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-05-14",
          "dateModified": "2026-05-14",
        })}</script>
      </Helmet>

      <div className="font-serif">

        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            Updated May 2026 · 10 tools reviewed
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>The 10 Best Coding Tools for Students in 2026</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            Frontend, backend, full-stack, deploy, code editors, API — the 10 tools student devs actually reach for in 2026. Ranked by real workflow utility.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ Free tier or student plan", "✅ Real student workflows", "✅ Ranked by real utility"].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1 text-xs font-medium text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Last reviewed: {LAST_REVIEWED}
            </span>
          </p>
        </div>

        {/* How we picked — criteria block inserted between hero and Quick nav */}
        <div className="mx-auto max-w-[860px] px-6 mb-12">
          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-10% 0px' }}
            className="rounded-2xl border border-line bg-bg-elev p-6 md:p-8"
          >
            <h2 className="text-lg font-semibold text-ink sm:text-xl">How we picked these tools</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Each tool was opened, used on a real student-scale project for at least an hour, and assigned a written rationale.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free tier or student plan covers a real side project — not a 7-day trial that converts to paid.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Pricing and free-tier limits verified within the last 30 days; rechecked weekly when a tier changes.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Order reflects real workflow utility — what student devs actually ship side projects and assignments with.</span>
              </li>
            </ul>
          </MotionDiv>
        </div>

        {/* Quick nav */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-[860px] px-6 mb-12"
        >
          <div className="rounded-xl border border-line bg-bg-elev p-5 font-sans">
            <p className="text-[12px] text-muted-2 mb-3 uppercase tracking-widest">Quick jump</p>
            <div className="flex flex-wrap gap-2">
              {tools.map(t => (
                <a
                  key={t.slug}
                  href={`#${t.slug}`}
                  className="text-[13px] text-muted no-underline rounded-md bg-bg-sunk px-3 py-1 transition-colors hover:bg-bg hover:text-ink"
                >
                  {t.rank}. {t.name}
                </a>
              ))}
            </div>
          </div>
        </MotionDiv>

        {/* Tool cards */}
        <MotionDiv
          variants={staggerParent}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-5% 0px' }}
          className="mx-auto max-w-[860px] px-6"
        >
          {tools.map((tool, i) => {
            const isHero = tool.rank === 1
            return (
              <MotionDiv
                key={tool.slug}
                variants={staggerChild}
                custom={i * 0.04}
                id={tool.slug}
                className={`group relative mb-10 overflow-hidden rounded-3xl border border-line scroll-mt-20 transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-lg ${isHero ? 'bg-gradient-to-br from-bg-elev to-accent-soft/40 ring-1 ring-accent/30' : 'bg-bg-elev'}`}
              >
                {isHero ? (
                  <div className="px-6 pt-6 sm:px-8 sm:pt-8">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Editor&apos;s pick
                    </span>
                  </div>
                ) : null}

                <div className={`grid gap-6 md:grid-cols-[auto_1fr] md:gap-8 ${isHero ? 'px-6 pt-4 pb-6 sm:px-8 sm:pb-8' : 'p-6 sm:p-8'}`}>
                  {/* Left rail — rank + icon */}
                  <div className="flex items-center gap-5 md:flex-col md:items-start md:gap-6 md:pr-2">
                    <span
                      className={`font-serif font-bold leading-none tracking-tighter text-muted-2 ${isHero ? 'text-7xl md:text-8xl' : 'text-6xl md:text-7xl'}`}
                      aria-hidden="true"
                    >
                      {String(tool.rank).padStart(2, '0')}
                    </span>
                    <div
                      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white ${isHero ? 'h-16 w-16 md:h-20 md:w-20' : 'h-14 w-14 md:h-16 md:w-16'}`}
                      aria-hidden="true"
                    >
                      <BrandIcon tool={tool} isHero={isHero} />
                    </div>
                  </div>

                  {/* Right content */}
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <h3 className={`font-semibold tracking-tight text-ink ${isHero ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'}`}>
                        {tool.name}
                      </h3>
                      <span className="shrink-0 rounded-full border border-line bg-bg-sunk px-3 py-1 text-xs font-medium text-ink-2">
                        {tool.pricing}
                      </span>
                    </div>

                    <p className="mb-6 text-base leading-relaxed text-muted">
                      {tool.tagline}
                    </p>

                    {/* Structured details */}
                    <dl className="mb-6 space-y-3 border-y border-line py-5">
                      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                        <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2 sm:w-32">
                          Best for
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.bestFor}</dd>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                        <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2 sm:w-32">
                          Student win
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.studentWin}</dd>
                      </div>
                    </dl>

                    {/* Verdict callout */}
                    <div className="mb-6 rounded-2xl bg-accent-soft px-5 py-4">
                      <p className="text-sm font-medium italic leading-relaxed text-accent-ink">
                        &ldquo;{tool.verdict}&rdquo;
                      </p>
                    </div>

                    {/* CTA — outbound primary, internal review secondary. Outbound uses affiliate_url with rel=sponsored when partnered, else falls through to the tool's homepage extracted from its Clearbit icon URL. */}
                    {(() => {
                      const { url, isAffiliate } = getOutboundUrl(tool)
                      return (
                        <div className="flex flex-wrap items-center gap-3">
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel={isAffiliate ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
                              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-all duration-200 hover:gap-3 hover:bg-ink-2"
                            >
                              Try {tool.name}
                              <ArrowUpRight className="h-4 w-4" />
                            </a>
                          )}
                          <Link
                            to={`/tools/${tool.slug}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
                          >
                            Read review →
                          </Link>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </MotionDiv>
            )
          })}
        </MotionDiv>

        {/* Stack builder CTA */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-[860px] px-6 mt-16"
        >
          <div className="rounded-2xl border border-accent bg-accent-soft p-10">
            <h2 className="text-[1.6rem] font-bold tracking-tight text-ink mb-4">
              How to build your student dev stack
            </h2>
            <p className="font-sans text-[15px] leading-[1.75] text-muted mb-5">
              Don&apos;t try to use all 10 at once. Pick a stack of 3 that covers your project type, ship something, then expand.
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 font-sans mb-6">
              {stacks.map(s => (
                <div key={s.label} className="rounded-lg bg-bg-elev p-4 shadow-sm">
                  <p className="text-[11px] text-accent-ink uppercase tracking-widest mb-2 font-semibold">{s.label}</p>
                  <p className="text-[13px] text-ink-2 m-0 leading-[1.6]">{s.tools}</p>
                </div>
              ))}
            </div>
            <Link
              to="/ai-tool-finder"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 font-sans text-[14px] font-semibold text-bg no-underline transition hover:opacity-90"
            >
              Get your personalised stack →
            </Link>
          </div>
        </MotionDiv>

        {/* FAQ */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-[860px] px-6 mt-16"
        >
          <h2 className="text-[1.6rem] font-bold tracking-tight text-ink mb-8">
            Frequently asked questions
          </h2>
          <div className="flex flex-col gap-4">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-line bg-bg-elev p-6">
                <h3 className="font-sans text-[15px] font-semibold text-ink mb-2.5">{faq.q}</h3>
                <p className="font-sans text-[14px] leading-[1.7] text-muted m-0">{faq.a}</p>
              </div>
            ))}
          </div>
        </MotionDiv>

        {/* Footer CTA */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-[860px] px-6 mt-16 mb-20 text-center font-sans"
        >
          <p className="text-[14px] text-muted-2 mb-2">Also read</p>
          <div className="flex flex-wrap justify-center gap-6">
            <MagneticWrapper strength={0.2}>
              <Link to="/best-ai-tools-for-students" className="text-[14px] font-semibold text-accent no-underline hover:underline">
                Best AI tools for students →
              </Link>
            </MagneticWrapper>
            <Link to="/best-free-ai-tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Best free AI tools →
            </Link>
            <Link to="/tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Browse all 427+ tools →
            </Link>
          </div>
        </MotionDiv>

      </div>
    </>
  );
}
