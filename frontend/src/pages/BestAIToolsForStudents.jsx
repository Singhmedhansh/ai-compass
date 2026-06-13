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
import chatgptIcon from "../assets/brand/chatgpt.svg";
import claudeIcon from "../assets/brand/claude.svg";
import githubCopilotIcon from "../assets/brand/github-copilot.svg";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { useCatalogStats } from "../hooks/useCatalogStats";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";
import { toolHoverHandlers, alternativesHoverHandlers } from "../lib/prefetch";

const MotionDiv = motion.div;
// Static fallback covers the ~100ms before /api/v1/stats responds.
const FALLBACK_TOOL_COUNT = 400;

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
      alt={`${tool.name} logo`}
      loading="lazy"
      decoding="async"
      width="64"
      height="64"
      className={isHero ? "h-12 w-12 object-contain md:h-14 md:w-14" : "h-10 w-10 object-contain md:h-12 md:w-12"}
      onError={() => {
        setStage((prev) => (prev === "primary" ? "fallback" : "letter"));
      }}
    />
  );
}

// Surface review recency as a trust signal — matches the catalog's "no scraping, hand-tested" claim on the homepage Curation Discipline section.
const LAST_REVIEWED = "April 2026";

// Slug -> affiliate URL for tools we partner with. Add an entry when an
// affiliate program is signed; the CTA picks it up and adds rel="sponsored".
// Keep keys in sync with the `slug` field on each entry in the tools array
// below — none of the current 10 tools is an affiliate, but a future swap
// would land directly in this map.
const AFFILIATE_URLS = {
  // 'sudowrite': 'https://www.sudowrite.com/?via=medhansh',
  // 'jenni-ai': 'https://jenni.ai/?via=medhansh',
  // 'elevenlabs': 'https://try.elevenlabs.io/2f10b9jmqa4g',
  // 'pictory': 'https://pictory.ai?ref=medhansh34',
};

function getOutboundUrl(tool) {
  const affiliate = AFFILIATE_URLS[tool.slug];
  if (affiliate) return { url: affiliate, isAffiliate: true };
  if (tool.slug) return { url: `/go/${encodeURIComponent(tool.slug)}`, isAffiliate: false };
  const m = typeof tool.iconUrl === 'string' && tool.iconUrl.match(/clearbit\.com\/([^/]+)/);
  if (m) return { url: `https://${m[1]}`, isAffiliate: false };
  return { url: null, isAffiliate: false };
}

const tools = [
  {
    rank: 1,
    name: "ChatGPT",
    slug: "chatgpt",
    iconUrl: chatgptIcon,
    tagline: "The universal AI assistant for students",
    pricing: "Free + Plus $20/mo",
    bestFor: "Essays, research, coding, brainstorming",
    studentWin:
      "Free tier handles most coursework; Plus unlocks GPT-5 and longer context for complex projects",
    verdict:
      "If you pick one AI tool this year, make it this one. Everything else is a specialist beside it.",
    color: "#10a37f",
  },
  {
    rank: 2,
    name: "Claude",
    slug: "claude",
    iconUrl: claudeIcon,
    tagline: "Best for long-form writing and careful reasoning",
    pricing: "Free + Pro $20/mo",
    bestFor: "Essays, literature reviews, code review, nuanced analysis",
    studentWin:
      "Handles 200-page PDFs as context; the free tier alone outperforms paid alternatives for writing",
    verdict:
      "The model I reach for when the answer needs to be right, not just plausible.",
    color: "#cc785c",
  },
  {
    rank: 3,
    name: "Notion AI",
    slug: "notion-ai",
    iconUrl: "https://logo.clearbit.com/notion.so",
    tagline: "Notes and AI assistance in one workspace",
    pricing: "Free for students + AI add-on $10/mo",
    bestFor: "Lecture notes, project tracking, study planning",
    studentWin:
      "Notion Plus is free with .edu email; AI summarizes lectures and drafts study guides inline with your notes",
    verdict:
      "The only note-taking tool where AI feels native, not bolted on.",
    color: "#6366f1",
  },
  {
    rank: 4,
    name: "Cursor",
    slug: "cursor",
    iconUrl: "https://logo.clearbit.com/cursor.com",
    tagline: "AI-first code editor for serious projects",
    pricing: "Free + Pro $20/mo",
    bestFor: "CS coursework, side projects, learning to code",
    studentWin:
      "Free tier ships with Claude and GPT-5 integrated; reads your whole codebase, not just the current file",
    verdict:
      "If you write code as a student, this is the productivity multiplier that actually multiplies.",
    color: "#000000",
  },
  {
    rank: 5,
    name: "Perplexity",
    slug: "perplexity-ai",
    iconUrl: "https://logo.clearbit.com/perplexity.ai",
    tagline: "AI search with cited sources, free for students",
    pricing: "FREE for students + Pro $20/mo",
    bestFor: "Research, fact-checking, finding sources for papers",
    studentWin:
      "Perplexity Pro is genuinely free for verified students — same model access as paying users",
    verdict:
      "The fastest way to research a topic when you actually need citations, not vibes.",
    color: "#20b8cd",
  },
  {
    rank: 6,
    name: "Grammarly",
    slug: "grammarly",
    iconUrl: "https://logo.clearbit.com/grammarly.com",
    tagline: "Final-pass writing polish across every app",
    pricing: "Free + Premium ~$12/mo (student discount)",
    bestFor: "Essay submission, professional emails, application writing",
    studentWin:
      "Premium adds tone suggestions and full-sentence rewrites; student discount drops it by ~40%",
    verdict:
      "Free tier is fine for catching typos. Premium is worth it the week you submit a major application.",
    color: "#15c39a",
  },
  {
    rank: 7,
    name: "Otter.ai",
    slug: "otter-ai",
    iconUrl: "https://logo.clearbit.com/otter.ai",
    tagline: "Lecture transcription that actually works",
    pricing: "Free 300 min/mo + Pro $17/mo",
    bestFor: "Recording lectures, transcribing interviews, capturing meetings",
    studentWin:
      "300 free minutes per month covers ~10 lectures; transcripts are searchable, timestamped, and AI-summarized",
    verdict:
      "Worth installing before your next 9 AM class. Stop trying to write and listen at the same time.",
    color: "#ff6b6b",
  },
  {
    rank: 8,
    name: "QuillBot",
    slug: "quillbot",
    iconUrl: "https://logo.clearbit.com/quillbot.com",
    tagline: "Paraphrasing and grammar for academic writing",
    pricing: "Free + Premium $9.95/mo",
    bestFor: "Rephrasing sources, summarizing readings, grammar polish",
    studentWin:
      "The free tier handles paraphrasing well enough for most assignments; cheaper than Grammarly Premium for similar work",
    verdict:
      "A specialist tool for one specific job — rephrasing without losing meaning — and it does that job well.",
    color: "#4caf50",
  },
  {
    rank: 9,
    name: "GitHub Copilot",
    slug: "github-copilot",
    iconUrl: githubCopilotIcon,
    tagline: "AI pair programmer built into your editor",
    pricing: "FREE for verified students + Pro $10/mo",
    bestFor: "Learning languages, finishing assignments, exploring new frameworks",
    studentWin:
      "Completely free for students with the GitHub Student Developer Pack — same access as paying users",
    verdict:
      "If Cursor feels like too much, Copilot in VS Code is the easier on-ramp to AI-assisted coding.",
    color: "#6e40c9",
  },
  {
    rank: 10,
    name: "Gamma",
    slug: "gamma",
    iconUrl: "https://logo.clearbit.com/gamma.app",
    tagline: "AI presentation builder for class decks and pitches",
    pricing: "Free + Plus $10/mo",
    bestFor: "Class presentations, project decks, internship pitches, club proposals",
    studentWin:
      "Free tier ships 400 AI credits — enough for 4-5 full decks before any paywall; outputs look better than what most students produce manually",
    verdict:
      "PowerPoint takes three hours; Gamma takes five minutes. The night-before-a-presentation tool.",
    color: "#a259ff",
  },
];

const faqs = [
  {
    q: "Are these AI tools free for students?",
    a: "Most of the tools on this list have a free tier that's genuinely useful. ChatGPT, Claude, Grammarly, Perplexity, and Quillbot are all free to start. GitHub Copilot is completely free with the GitHub Student Developer Pack.",
  },
  {
    q: "Which AI tool is best for writing essays?",
    a: "For essay writing, use a combination: Perplexity for research and finding sources, Claude or ChatGPT for drafting and brainstorming, and Grammarly for final proofreading. Using all three together covers the full essay workflow.",
  },
  {
    q: "Is using AI tools for assignments cheating?",
    a: "This depends entirely on your institution's policy. Most universities now allow AI-assisted work with disclosure. Always check your course guidelines and be transparent about AI use. Using AI for research and brainstorming is generally accepted; submitting AI-generated text as your own is not.",
  },
  {
    q: "What's the best free AI tool for coding?",
    a: "GitHub Copilot is the best coding AI for students and it's completely free via the GitHub Student Developer Pack. For learning concepts and debugging without an IDE plugin, ChatGPT is excellent.",
  },
  {
    q: "Which AI tool is best for research papers?",
    a: "Elicit is purpose-built for academic research — it searches papers and summarises them. Perplexity is great for general research with citations. Claude is best for reading and analysing long PDFs once you have your sources.",
  },
];

const stacks = [
  { label: "Starter stack (free)", tools: "ChatGPT + Grammarly + Perplexity" },
  { label: "For CS students", tools: "GitHub Copilot + ChatGPT + Notion AI" },
  { label: "For researchers", tools: "Elicit + Claude + Perplexity" },
  { label: "For presentations", tools: "Gamma + ChatGPT + Grammarly" },
];

export default function BestAIToolsForStudents() {
  const { totalTools } = useCatalogStats();
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best AI Tools for Students in 2026 (Hand-Tested) | AI Compass</title>
        <meta
          name="description"
          content="The 10 best AI tools for students in 2026, hand-tested and ranked. Free tiers, student plans, real workflows. Published April 2026."
        />
        <meta
          name="keywords"
          content="best AI tools for students, free AI tools students, AI for college students, AI tools for studying, ChatGPT for students, AI essay tools"
        />
        <link rel="canonical" href="https://ai-compass.in/best-ai-tools-for-students" />
        <meta property="og:title" content="10 Best AI Tools for Students in 2026 (Hand-Tested) | AI Compass" />
        <meta property="og:description" content="The 10 best AI tools for students in 2026, hand-tested and ranked. Free tiers, student plans, real workflows. Published April 2026." />
        <meta property="og:url" content="https://ai-compass.in/best-ai-tools-for-students" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best AI Tools for Students in 2026",
          "description": "The 10 best AI tools for students — ranked and reviewed for essays, research, coding, and productivity.",
          "url": "https://ai-compass.in/best-ai-tools-for-students",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-04-19",
          "dateModified": "2026-04-19",
          "author": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "image": "https://ai-compass.in/og-image.png",
          "mainEntityOfPage": { "@type": "WebPage", "@id": "https://ai-compass.in/best-ai-tools-for-students" },
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Best AI Tools for Students in 2026",
          "numberOfItems": tools.length,
          "itemListElement": tools.map(t => ({
            "@type": "ListItem",
            "position": t.rank,
            "name": t.name,
            "url": `https://ai-compass.in/tools/${t.slug}`,
          })),
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqs.map(f => ({
            "@type": "Question",
            "name": f.q,
            "acceptedAnswer": { "@type": "Answer", "text": f.a },
          })),
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ai-compass.in/" },
            { "@type": "ListItem", "position": 2, "name": "Best AI Tools for Students", "item": "https://ai-compass.in/best-ai-tools-for-students" },
          ],
        })}</script>
      </Helmet>

      <div className="font-serif">

        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            Updated April 2026 · 10 tools reviewed
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>The 10 Best AI Tools for Students in 2026</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            There are thousands of AI tools. Most aren't worth your time. These 10 are — ranked by how much they actually help students with essays, research, coding, and staying organised.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ All have free tiers", "✅ Tested by students", "✅ Ranked by real utility"].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1 text-xs font-medium text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Published: {LAST_REVIEWED}
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
                <span>Each tool was opened, used for at least an hour, and assigned a written rationale — same standard as the rest of the catalog.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free tier or student plan covers real coursework — not a 7-day trial that converts to paid.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Pricing verified within the last 30 days; recheck cadence is weekly when a tier changes.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Order reflects student utility — what actually helps with coursework, research, and projects.</span>
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
                // Capped stagger via custom={i * 0.04}; for a 10-card list the last card enters ~0.4s after the first — cascading but not slow.
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
                            {...toolHoverHandlers(tool.slug)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
                          >
                            Read review →
                          </Link>
                          <Link
                            to={`/alternatives/${tool.slug}`}
                            {...alternativesHoverHandlers(tool.slug)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
                          >
                            See alternatives →
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
              How to build your student AI stack
            </h2>
            <p className="font-sans text-[15px] leading-[1.75] text-muted mb-5">
              Don't try to use all 10 at once. Start with 3 tools that cover your most common tasks, then expand from there.
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
              <Link to="/best-free-ai-tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
                Best free AI tools →
              </Link>
            </MagneticWrapper>
            <Link to="/tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Browse all {displayCount} tools →
            </Link>
          </div>
        </MotionDiv>

      </div>
    </>
  );
}
