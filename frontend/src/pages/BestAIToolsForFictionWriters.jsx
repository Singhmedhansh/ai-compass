import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

import claudeIcon from "../assets/brand/claude.svg";
import chatgptIcon from "../assets/brand/chatgpt.svg";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";

const MotionDiv = motion.div;

// Same 3-stage cascade as the other Best* pages: bundled SVG / Clearbit ->
// DuckDuckGo favicon -> letter tile. Keeps the page brand-coherent even
// when third-party logo CDNs miss.
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

// Affiliate URLs for partnered tools. CTA below sets rel="sponsored" when
// the click is monetised; the page-level disclosure in the hero is shown
// because this page contains affiliate links.
const AFFILIATE_URLS = {
  "sudowrite": "https://www.sudowrite.com/?via=medhansh",
};

function getOutboundUrl(tool) {
  const affiliate = AFFILIATE_URLS[tool.slug];
  if (affiliate) return { url: affiliate, isAffiliate: true };
  const m = typeof tool.iconUrl === "string" && tool.iconUrl.match(/clearbit\.com\/([^/]+)/);
  if (m) return { url: `https://${m[1]}`, isAffiliate: false };
  return { url: null, isAffiliate: false };
}

const tools = [
  {
    rank: 1,
    name: "Sudowrite",
    slug: "sudowrite",
    iconUrl: "https://logo.clearbit.com/sudowrite.com",
    tagline: "The only AI tool actually built by published novelists, for novelists",
    pricing: "Hobby $19/mo · Pro $29/mo",
    bestFor: "Novelists, short-fiction writers, NaNoWriMo participants, anyone whose other AI tools keep producing 'corporate blog post' prose",
    fictionEdge:
      "Sudowrite understands story craft — story beats, character voice, pacing, scene-level revision. The Describe, Brainstorm, and Canvas tools are designed around how fiction actually gets written (stuck scenes, dialogue problems, the murky middle), not how marketing copy gets generated.",
    verdict: "If you're serious about fiction, the free trial alone will tell you whether this saves you 30 minutes a session. For most writers, it does.",
    color: "#a855f7",
  },
  {
    rank: 2,
    name: "NovelAI",
    slug: "novelai",
    iconUrl: "https://logo.clearbit.com/novelai.net",
    tagline: "The sandbox: open-ended AI fiction generation with no safety filters in your way",
    pricing: "Tablet $10/mo · Scroll $15/mo · Opus $25/mo",
    bestFor: "Genre writers (fantasy, sci-fi, romance), worldbuilders, anyone whose other AI tools refuse to write what their book actually needs",
    fictionEdge:
      "Fine-tuned on a fiction corpus rather than generic web text — the prose has voice instead of Wikipedia-flat exposition. The Lorebook system lets you persist characters, locations, and worldbuilding across sessions. The model will also actually write your villain, your sex scene, and your grimdark battle without lecturing you.",
    verdict: "Pair Sudowrite's craft tools with NovelAI's looser generation and you've replaced every AI fiction subscription on the market for under $35.",
    color: "#f59e0b",
  },
  {
    rank: 3,
    name: "Squibler",
    slug: "squibler",
    iconUrl: "https://logo.clearbit.com/squibler.io",
    tagline: "Structure-first AI writing for novels, screenplays, and anything long-form",
    pricing: "Free + Pro $16/mo",
    bestFor: "Writers who outline before drafting, screenwriters, anyone whose problem is 'I have a story but can't structure it'",
    fictionEdge:
      "Distraction-free editor + AI prompts + project organization in one place. Generates chapter outlines from a logline, then expands sections on demand. The screenwriting templates are unusually good — most fiction AI tools ignore screenplay format entirely.",
    verdict: "Doesn't have Sudowrite's prose-level craft, but if structure is where you get stuck, this hits harder for the price.",
    color: "#ef4444",
  },
  {
    rank: 4,
    name: "Notebook AI",
    slug: "notebook-ai",
    iconUrl: "https://logo.clearbit.com/notebook.ai",
    tagline: "Worldbuilding bible meets AI — characters, locations, magic systems, all queryable",
    pricing: "Free + Premium $7/mo",
    bestFor: "Worldbuilders, fantasy/sci-fi authors with a sprawling cast, writers who lose track of which character has the scar",
    fictionEdge:
      "Less about generating prose, more about remembering everything you've already built. Characters, locations, items, factions — each as a structured record the AI references when generating scenes or answering 'wait, when did she meet him?'. Free tier covers most series-bible needs.",
    verdict: "The single best $7/month a worldbuilder can spend. Pairs with any prose-generation tool above.",
    color: "#0ea5e9",
  },
  {
    rank: 5,
    name: "Claude",
    slug: "claude",
    iconUrl: claudeIcon,
    tagline: "The fiction draft partner whose free tier alone outperforms most paid AI writing tools",
    pricing: "Free + Pro $20/mo",
    bestFor: "Writers who want a single thoughtful collaborator instead of five specialist tools",
    fictionEdge:
      "200K context handles an entire novel in a single conversation — feed in everything you've written so far and ask for a continuation that actually remembers the lore. The prose voice is closer to literary than commercial, which most writers prefer. No filter as heavy as ChatGPT's; will engage with dark themes if your story needs them.",
    verdict: "If you can only have one AI tool and you write literary fiction or character-driven work, this is it. Free tier is enough to test.",
    color: "#cc785c",
  },
  {
    rank: 6,
    name: "AI Dungeon",
    slug: "ai-dungeon",
    iconUrl: "https://logo.clearbit.com/aidungeon.com",
    tagline: "Story-as-game: collaborative fiction by playing through it",
    pricing: "Free + Premium from $10/mo",
    bestFor: "Discovery writers, people who plot by writing, anyone whose drafts come alive in dialogue and choices rather than outlines",
    fictionEdge:
      "Not a writing tool in the traditional sense — you co-write a story by playing it as a text adventure. Sounds gimmicky; it's actually one of the best ways to discover what your character would do in a scene you haven't figured out yet. Many writers use it for character voice testing.",
    verdict: "Not a primary tool but an unusually effective unsticker. The free tier is plenty for occasional use.",
    color: "#8b5cf6",
  },
  {
    rank: 7,
    name: "Lex",
    slug: "lex",
    iconUrl: "https://logo.clearbit.com/lex.page",
    tagline: "Google Docs for writers who want AI summoned only when they ask, never before",
    pricing: "Free + Pro from $12/mo",
    bestFor: "Writers who hate Sudowrite's busy UI and want a clean drafting surface with AI on demand",
    fictionEdge:
      "Looks and feels like Google Docs. Type +++ and AI continues your sentence; the rest of the time it's invisible. For writers who find every other AI tool's UI distracting during deep work, the minimalism alone is worth the subscription. Built by Every (Substack writers' platform).",
    verdict: "If your problem isn't generation quality but UI noise, Lex is the cleanest writing environment with AI built in.",
    color: "#111827",
  },
  {
    rank: 8,
    name: "ChatGPT",
    slug: "chatgpt",
    iconUrl: chatgptIcon,
    tagline: "The general-purpose option most writers already have — works fine for fiction with the right prompts",
    pricing: "Free + Plus $20/mo",
    bestFor: "Writers who want to start free and don't yet need fiction-specific tooling",
    fictionEdge:
      "GPT-4o handles dialogue, scene drafting, and revision well — but the default voice is generic and the safety filter intrudes on darker themes more than Claude's or NovelAI's. With a strong custom GPT (style guide, character bible, tone rules), it's serviceable. Without one, it reads like every other AI on the internet.",
    verdict: "Fine starting point. The moment you hit the safety filter mid-scene or grow tired of bland prose, you'll graduate to Sudowrite, NovelAI, or Claude.",
    color: "#10a37f",
  },
  {
    rank: 9,
    name: "ProWritingAid",
    slug: "prowritingaid",
    iconUrl: "https://logo.clearbit.com/prowritingaid.com",
    tagline: "Grammarly built for novelists — the only style checker that understands fiction conventions",
    pricing: "Free + Premium $30/year (student discount available)",
    bestFor: "Drafting is done, revision is the bottleneck — pace, repetition, dialogue tags, sticky sentences",
    fictionEdge:
      "Twenty-plus reports specific to fiction: overused words, dialogue tag variety, sentence-length variance, pacing across chapters, sticky sentences. Grammarly flags grammar; ProWritingAid flags craft. The annual pricing makes it cheaper than most monthly tools after month two.",
    verdict: "Not generative — but the single best revision tool for fiction. Pairs with any drafting tool above.",
    color: "#4caf50",
  },
  {
    rank: 10,
    name: "Wordtune",
    slug: "wordtune",
    iconUrl: "https://logo.clearbit.com/wordtune.com",
    tagline: "Sentence-level rewriting for prose voice and rhythm",
    pricing: "Free + Premium $9.99/mo",
    bestFor: "Writers polishing scenes line by line, anyone whose first drafts are functional but lifeless",
    fictionEdge:
      "Highlight a flat sentence, get five rewrites in different tones (casual, formal, shortened, expanded). Faster than asking ChatGPT for variations and stays inside your document. Particularly good for tightening dialogue and varying sentence rhythm — two of the most common revision asks in fiction.",
    verdict: "Not a writing tool, a polishing tool. The free tier handles a chapter or two a week, which is enough for most.",
    color: "#2563eb",
  },
];

const faqs = [
  {
    q: "What's the single best AI tool for fiction writers?",
    a: "Sudowrite, by a wide margin — it's the only major AI writing tool actually built by novelists, with features designed around how fiction writing gets stuck (the murky middle, flat dialogue, scene-level revision). The Hobby plan at $19/mo is enough for most writers. If you're cost-conscious, Claude's free tier is the strongest non-fiction-specific option.",
  },
  {
    q: "Is using AI to write fiction cheating?",
    a: "Depends on what you mean. Generating an entire novel and publishing it as your own work is plagiarism-adjacent and most readers will spot the prose voice. Using AI to brainstorm, unstick scenes, generate variations, draft a synopsis, or revise pacing is closer to how writers have always used editors, beta readers, and writing groups — just faster. Most working novelists in 2026 use some form of AI in their process; the ones who don't disclose are increasingly the exception.",
  },
  {
    q: "Will AI replace fiction writers?",
    a: "No — and this isn't optimism. AI generates competent prose in any genre, but it can't make the editorial choices that produce a book worth reading (whose story is this, what does it owe the reader, which scenes earn their place). What changes is that drafting gets faster, revision gets deeper, and the writers who refuse to learn the tools fall behind the ones who do.",
  },
  {
    q: "Can I use AI for NaNoWriMo?",
    a: "NaNoWriMo's official rules in 2025 explicitly allow AI assistance. Most participants who use AI use it for brainstorming, scene-unsticking, and synopsis generation rather than wholesale drafting — partly because the daily word count is the point, partly because AI-drafted prose still needs heavier revision than your own draft. Sudowrite is the most popular AI tool in the NaNoWriMo community.",
  },
  {
    q: "Best AI for fantasy or sci-fi worldbuilding?",
    a: "Notebook AI for the worldbuilding bible (characters, locations, magic systems), NovelAI for prose generation that won't refuse to write your darker scenes, and Claude for long-context reasoning over your accumulated lore. The three together cost under $35/mo combined and outperform any single tool on its own.",
  },
  {
    q: "What about AI detection — will publishers reject my work?",
    a: "If you write the prose yourself and use AI for brainstorming, structure, or revision suggestions, AI detection tools won't flag it (and shouldn't — that's not AI-generated text). If you publish AI-drafted prose verbatim, expect it to be flagged and increasingly to be rejected by traditional publishers. The middle ground (AI-assisted, human-written) is where most working writers operate.",
  },
];

const stacks = [
  { label: "Pantser's stack (discovery writer)", tools: "Sudowrite + AI Dungeon + Lex" },
  { label: "Plotter's stack (outline-first)", tools: "Squibler + Sudowrite + ProWritingAid" },
  { label: "Worldbuilder's stack (fantasy / sci-fi)", tools: "Notebook AI + NovelAI + Claude" },
  { label: "Cheapest viable stack", tools: "Claude free + Notebook AI free + Wordtune free" },
];

export default function BestAIToolsForFictionWriters() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best AI Tools for Fiction Writers in 2026 (Tested & Ranked) | AI Compass</title>
        <meta
          name="description"
          content="The 10 best AI tools for fiction writers, novelists, and screenwriters — Sudowrite, NovelAI, Squibler, Claude, and more. Hand-tested for prose voice, worldbuilding, and revision. Last reviewed May 2026."
        />
        <meta
          name="keywords"
          content="AI for fiction writers, AI tools for novelists, best AI writing tools for fiction, Sudowrite vs NovelAI, AI for NaNoWriMo, AI worldbuilding, AI for novels"
        />
        <link rel="canonical" href="https://ai-compass.in/best-ai-tools-for-fiction-writers" />
        <meta property="og:title" content="10 Best AI Tools for Fiction Writers in 2026 (Tested & Ranked) | AI Compass" />
        <meta property="og:description" content="The 10 best AI tools for fiction writers and novelists — Sudowrite, NovelAI, Squibler, Claude, and more. Hand-tested for prose, worldbuilding, and revision." />
        <meta property="og:url" content="https://ai-compass.in/best-ai-tools-for-fiction-writers" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best AI Tools for Fiction Writers in 2026",
          "description": "Ranked and reviewed AI tools for novelists, screenwriters, and worldbuilders. Sudowrite, NovelAI, Squibler, Claude, and more.",
          "url": "https://ai-compass.in/best-ai-tools-for-fiction-writers",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-05-21",
          "dateModified": "2026-05-21",
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Best AI Tools for Fiction Writers in 2026",
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
      </Helmet>

      <div className="font-serif">

        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            Updated May 2026 · 10 tools tested
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>10 Best AI Tools for Fiction Writers in 2026</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            Most "AI writing" tools are built for marketing copy and produce blog-post prose that fights against fiction. These 10 are the ones that actually understand story — drafting, revision, worldbuilding, and the murky middle.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ Hand-tested on real drafts", "✅ Free tier or under $30/mo", "✅ Ranked by fiction-craft fit"].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1 text-xs font-medium text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Last reviewed: {LAST_REVIEWED}
            </span>
          </p>
          <p className="mt-3 text-xs text-muted-2 font-sans max-w-[640px] mx-auto">
            Some "Try" buttons below are affiliate links — we may earn a small commission if you sign up. Ranking and review content are unaffected. <Link to="/terms" className="underline hover:text-ink-2">Disclosure</Link>.
          </p>
        </div>

        {/* How we picked */}
        <div className="mx-auto max-w-[860px] px-6 mb-12">
          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-10% 0px" }}
            className="rounded-2xl border border-line bg-bg-elev p-6 md:p-8"
          >
            <h2 className="text-lg font-semibold text-ink sm:text-xl">How we picked these tools</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Tested on the jobs fiction writers actually hire AI for — unsticking scenes, generating dialogue variations, worldbuilding, revision passes.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Prose voice matters more than template count. Generic "blog post" voice was a disqualifier.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free tier or paid tier under $30/mo. Pricing verified within the last 30 days; ranking does not change for sponsored placements.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Specialist tools (worldbuilding, revision, sandbox) ranked on how much better they are at their one job than general-purpose AI.</span>
              </li>
            </ul>
          </MotionDiv>
        </div>

        {/* Quick nav */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-10% 0px" }}
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
          viewport={{ once: true, margin: "-5% 0px" }}
          className="mx-auto max-w-[860px] px-6"
        >
          {tools.map((tool, i) => {
            const isHero = tool.rank === 1;
            return (
              <MotionDiv
                key={tool.slug}
                variants={staggerChild}
                custom={i * 0.04}
                id={tool.slug}
                className={`group relative mb-10 overflow-hidden rounded-3xl border border-line scroll-mt-20 transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-lg ${isHero ? "bg-gradient-to-br from-bg-elev to-accent-soft/40 ring-1 ring-accent/30" : "bg-bg-elev"}`}
              >
                {isHero ? (
                  <div className="px-6 pt-6 sm:px-8 sm:pt-8">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Editor&apos;s pick
                    </span>
                  </div>
                ) : null}

                <div className={`grid gap-6 md:grid-cols-[auto_1fr] md:gap-8 ${isHero ? "px-6 pt-4 pb-6 sm:px-8 sm:pb-8" : "p-6 sm:p-8"}`}>
                  <div className="flex items-center gap-5 md:flex-col md:items-start md:gap-6 md:pr-2">
                    <span
                      className={`font-serif font-bold leading-none tracking-tighter text-muted-2 ${isHero ? "text-7xl md:text-8xl" : "text-6xl md:text-7xl"}`}
                      aria-hidden="true"
                    >
                      {String(tool.rank).padStart(2, "0")}
                    </span>
                    <div
                      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white ${isHero ? "h-16 w-16 md:h-20 md:w-20" : "h-14 w-14 md:h-16 md:w-16"}`}
                      aria-hidden="true"
                    >
                      <BrandIcon tool={tool} isHero={isHero} />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <h3 className={`font-semibold tracking-tight text-ink ${isHero ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"}`}>
                        {tool.name}
                      </h3>
                      <span className="shrink-0 rounded-full border border-line bg-bg-sunk px-3 py-1 text-xs font-medium text-ink-2">
                        {tool.pricing}
                      </span>
                    </div>

                    <p className="mb-6 text-base leading-relaxed text-muted">
                      {tool.tagline}
                    </p>

                    <dl className="mb-6 space-y-3 border-y border-line py-5">
                      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                        <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2 sm:w-32">
                          Best for
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.bestFor}</dd>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                        <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2 sm:w-32">
                          Fiction edge
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.fictionEdge}</dd>
                      </div>
                    </dl>

                    <div className="mb-6 rounded-2xl bg-accent-soft px-5 py-4">
                      <p className="text-sm font-medium italic leading-relaxed text-accent-ink">
                        &ldquo;{tool.verdict}&rdquo;
                      </p>
                    </div>

                    {(() => {
                      const { url, isAffiliate } = getOutboundUrl(tool);
                      return (
                        <div className="flex flex-wrap items-center gap-3">
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel={isAffiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"}
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
                      );
                    })()}
                  </div>
                </div>
              </MotionDiv>
            );
          })}
        </MotionDiv>

        {/* Stack builder CTA */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-10% 0px" }}
          className="mx-auto max-w-[860px] px-6 mt-16"
        >
          <div className="rounded-2xl border border-accent bg-accent-soft p-10">
            <h2 className="text-[1.6rem] font-bold tracking-tight text-ink mb-4">
              Build your stack by how you actually write
            </h2>
            <p className="font-sans text-[15px] leading-[1.75] text-muted mb-5">
              The right tool depends on how your draft gets stuck. Pantsers, plotters, and worldbuilders need different things — and the cheapest stack works fine if you know which problem you're solving.
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
              Get a personalised pick in 40 seconds →
            </Link>
          </div>
        </MotionDiv>

        {/* FAQ */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-10% 0px" }}
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
          viewport={{ once: true, margin: "-10% 0px" }}
          className="mx-auto max-w-[860px] px-6 mt-16 mb-20 text-center font-sans"
        >
          <p className="text-[14px] text-muted-2 mb-2">Also read</p>
          <div className="flex flex-wrap justify-center gap-6">
            <MagneticWrapper strength={0.2}>
              <Link to="/best-jasper-alternatives" className="text-[14px] font-semibold text-accent no-underline hover:underline">
                Best Jasper alternatives →
              </Link>
            </MagneticWrapper>
            <Link to="/best-ai-tools-for-students" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Best AI tools for students →
            </Link>
            <Link to="/tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Browse all 399 tools →
            </Link>
          </div>
        </MotionDiv>

      </div>
    </>
  );
}
