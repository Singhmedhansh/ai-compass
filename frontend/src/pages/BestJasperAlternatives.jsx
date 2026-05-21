import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

import chatgptIcon from "../assets/brand/chatgpt.svg";
import claudeIcon from "../assets/brand/claude.svg";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { useCatalogStats } from "../hooks/useCatalogStats";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";

const MotionDiv = motion.div;
// Static fallback covers the ~100ms before /api/v1/stats responds.
const FALLBACK_TOOL_COUNT = 400;

// BrandIcon — same 3-stage cascade pattern as the other Best* pages:
// primary (Clearbit / bundled SVG) -> DuckDuckGo fallback -> letter tile.
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

const LAST_REVIEWED = "May 2026";

// Slug -> affiliate URL for partnered tools. Two of the top picks
// (Sudowrite, Jenni AI) are partners; the CTA below adds rel="sponsored"
// automatically and the page-level disclosure renders because the page
// includes affiliate links.
const AFFILIATE_URLS = {
  "sudowrite": "https://www.sudowrite.com/?via=medhansh",
  "jenni-ai": "https://jenni.ai/?via=medhansh",
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
    tagline: "The fiction writer's Jasper — purpose-built for novels, not landing pages",
    pricing: "Hobby $19/mo · Pro $29/mo",
    bestFor: "Novelists, short-fiction writers, NaNoWriMo participants, anyone Jasper feels too \"marketing\" for",
    vsJasper:
      "Jasper's tone is corporate copywriting; Sudowrite was built by published novelists and understands story beats, character voice, and plot pacing. Half Jasper's price and 10× more useful for fiction.",
    verdict: "If you're writing fiction, this is the only sane Jasper replacement. The free trial is enough to see why.",
    color: "#a855f7",
  },
  {
    rank: 2,
    name: "Jenni AI",
    slug: "jenni-ai",
    iconUrl: "https://logo.clearbit.com/jenni.ai",
    tagline: "The academic-writing Jasper — essays, dissertations, research papers",
    pricing: "Free + Unlimited $20/mo (student discount available)",
    bestFor: "Undergraduates, grad students, PhDs writing literature reviews, essays, and research papers",
    vsJasper:
      "Jasper has no academic tone, no citation handling, and no PDF context. Jenni was built for academic writing — autocomplete trained on scholarly prose, in-line citations from real papers, and Zotero/Mendeley import.",
    verdict: "For anyone writing for university, Jenni replaces Jasper at a similar price with a workflow that actually fits coursework.",
    color: "#06b6d4",
  },
  {
    rank: 3,
    name: "Claude",
    slug: "claude",
    iconUrl: claudeIcon,
    tagline: "The Jasper alternative whose free tier alone beats Jasper Pro",
    pricing: "Free + Pro $20/mo",
    bestFor: "Long-form writing, careful reasoning, blog drafts, essays, document analysis",
    vsJasper:
      "Jasper costs $39+/mo for output that Claude's free tier produces at higher quality. 200K context handles entire books as input — Jasper tops out at a few thousand tokens.",
    verdict: "The most honest answer to \"is Jasper worth it?\" is to spend an afternoon with Claude's free tier and watch the question answer itself.",
    color: "#cc785c",
  },
  {
    rank: 4,
    name: "ChatGPT",
    slug: "chatgpt",
    iconUrl: chatgptIcon,
    tagline: "The general-purpose Jasper alternative everyone already has",
    pricing: "Free + Plus $20/mo",
    bestFor: "Anyone who wants Jasper's output without committing to a marketing-copy tool",
    vsJasper:
      "Jasper is essentially a UI wrapper on GPT models with templates. You can replicate ~80% of Jasper's templates with custom GPTs or saved prompts in ChatGPT — for half the price.",
    verdict: "If you can't articulate what Jasper does that ChatGPT Plus can't, you don't need Jasper.",
    color: "#10a37f",
  },
  {
    rank: 5,
    name: "Writesonic",
    slug: "writesonic",
    iconUrl: "https://logo.clearbit.com/writesonic.com",
    tagline: "The closest 1:1 Jasper replacement at a third of the price",
    pricing: "Free + Pro from ~$13/mo",
    bestFor: "Marketing teams, agencies, anyone using Jasper for blog posts, ad copy, and SEO",
    vsJasper:
      "Same template-driven workflow (long-form, ads, product descriptions) and same brand-voice features, but the Pro tier starts at $13/mo vs Jasper's $39/mo. The output is functionally indistinguishable.",
    verdict: "If you've been on Jasper for the templates and brand voice, Writesonic is the migration with the least friction.",
    color: "#5b6cff",
  },
  {
    rank: 6,
    name: "Copy.ai",
    slug: "copy-ai",
    iconUrl: "https://logo.clearbit.com/copy.ai",
    tagline: "Free-tier Jasper for short-form marketing copy",
    pricing: "Free (2,000 words/mo) + Pro $36/mo",
    bestFor: "Social posts, ad copy, email subject lines, product descriptions",
    vsJasper:
      "Free tier gives you 2,000 words/month — enough to test whether you actually need a paid copy tool at all. Jasper has no usable free tier; you're paying $39 to find out.",
    verdict: "Start here before paying Jasper anything. Most people who try Copy.ai's free tier realize they don't need either tool's paid plan.",
    color: "#2563eb",
  },
  {
    rank: 7,
    name: "Rytr",
    slug: "rytr",
    iconUrl: "https://logo.clearbit.com/rytr.me",
    tagline: "The cheapest serious Jasper alternative",
    pricing: "Free + Premium $9/mo · Unlimited $29/mo",
    bestFor: "Students and indie creators on a tight budget",
    vsJasper:
      "$9/mo unlocks unlimited generations. Jasper's cheapest paid plan is $39. The output gap is small enough that paying 4× more is hard to justify unless you specifically need Jasper's brand-voice management.",
    verdict: "The honest budget pick. Not as polished as Jasper's UI, but the per-word output is competitive.",
    color: "#8b5cf6",
  },
  {
    rank: 8,
    name: "QuillBot",
    slug: "quillbot",
    iconUrl: "https://logo.clearbit.com/quillbot.com",
    tagline: "Better than Jasper at one specific job: rewriting what you've already written",
    pricing: "Free + Premium $9.95/mo",
    bestFor: "Paraphrasing sources, polishing existing drafts, fixing tone, summarizing readings",
    vsJasper:
      "Jasper generates from scratch; QuillBot improves what's already there. If your workflow is \"I wrote something, make it better,\" QuillBot is a better fit and a quarter of the price.",
    verdict: "Different tool, different job. Pair it with Claude or ChatGPT and you cover everything Jasper does for under $30/mo total.",
    color: "#4caf50",
  },
  {
    rank: 9,
    name: "Notion AI",
    slug: "notion-ai",
    iconUrl: "https://logo.clearbit.com/notion.so",
    tagline: "Jasper-level writing assistance inside your existing workspace",
    pricing: "Notion Plus free with .edu + AI add-on $10/mo",
    bestFor: "Anyone already living in Notion for notes, projects, or docs",
    vsJasper:
      "Jasper makes you copy text in and out of its UI. Notion AI lives inside your existing pages — summaries, drafts, rewrites all happen in context. No tool-switching tax.",
    verdict: "If you already use Notion, the AI add-on is a no-brainer at $10/mo. Cancel Jasper, save $29.",
    color: "#6366f1",
  },
  {
    rank: 10,
    name: "Grammarly",
    slug: "grammarly",
    iconUrl: "https://logo.clearbit.com/grammarly.com",
    tagline: "Where Jasper drafts, Grammarly polishes — and now drafts too",
    pricing: "Free + Premium ~$12/mo (student discount available)",
    bestFor: "Final-pass editing, tone consistency, light generative use across every app",
    vsJasper:
      "Grammarly's generative AI (added in 2024) handles short drafts and rewrites in any text field — email, Google Docs, LinkedIn. Jasper makes you go to Jasper. Grammarly comes to you.",
    verdict: "Won't replace Jasper for full-blog generation, but covers ~70% of \"I need AI to write this for me\" moments at a third the price.",
    color: "#15c39a",
  },
];

const faqs = [
  {
    q: "Why look for alternatives to Jasper AI?",
    a: "Jasper Pro is $39/month and Business plans start at $59/user/month. For most students, writers, and indie creators, that's overkill — the templates are aimed at marketing teams, and the base model is the same GPT family every other tool uses. The 10 alternatives on this list are either cheaper, better fit a specific use case (fiction, academic, polish), or have a usable free tier that Jasper doesn't.",
  },
  {
    q: "What's the cheapest Jasper alternative?",
    a: "Rytr at $9/month for unlimited use is the cheapest serious option. Free-tier picks: Claude, ChatGPT, Copy.ai (2,000 words/mo), and Grammarly all have free plans that handle most use cases. If you're a student, Perplexity Pro and GitHub Copilot are completely free via the student programs.",
  },
  {
    q: "Best Jasper alternative for fiction writers?",
    a: "Sudowrite is purpose-built for fiction — story beats, character voice, plot pacing — at $19/month for the Hobby plan. Jasper's tone is corporate copywriting, which fights against creative fiction. Sudowrite was built by published novelists and it shows.",
  },
  {
    q: "Best Jasper alternative for students writing essays?",
    a: "Jenni AI is built for academic writing — autocomplete trained on scholarly prose, in-line citations, Zotero/Mendeley import. $20/month with a student discount. Free options that work for essays: Claude, ChatGPT, and Perplexity Pro (free for verified students).",
  },
  {
    q: "Is Jasper worth $39/month?",
    a: "If you're a marketing team managing brand voice across 5+ writers, possibly yes — Jasper's brand voice and team workflow features are genuinely useful at scale. For a single student or solo writer, the answer is almost always no. Claude Pro at $20/mo or Writesonic at $13/mo cover the same workflow with comparable output quality.",
  },
  {
    q: "Can I use ChatGPT instead of Jasper?",
    a: "Yes, and most people who try this realize they didn't need Jasper. Jasper is essentially a UI wrapper around GPT models with marketing templates — you can recreate the templates as saved prompts or custom GPTs in ChatGPT Plus ($20/mo) and get the same output for half the price.",
  },
];

const stacks = [
  { label: "Fiction writer's stack", tools: "Sudowrite + Claude + Grammarly" },
  { label: "Student writer's stack", tools: "Jenni AI + Claude + QuillBot" },
  { label: "Marketing copy stack", tools: "Writesonic + Copy.ai (free) + Grammarly" },
  { label: "Cheapest viable stack", tools: "Rytr + ChatGPT free + Grammarly free" },
];

export default function BestJasperAlternatives() {
  const { totalTools } = useCatalogStats();
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best Jasper AI Alternatives in 2026 (Tested & Ranked) | AI Compass</title>
        <meta
          name="description"
          content="Jasper is $39+/mo and built for marketing teams. These 10 alternatives are cheaper, better suited to fiction/academic/student workflows, and most have usable free tiers. Hand-tested, last reviewed May 2026."
        />
        <meta
          name="keywords"
          content="Jasper alternatives, Jasper AI alternatives, alternatives to Jasper, cheaper than Jasper, Jasper vs Sudowrite, Jasper for students, free Jasper alternative"
        />
        <link rel="canonical" href="https://ai-compass.in/best-jasper-alternatives" />
        <meta property="og:title" content="10 Best Jasper AI Alternatives in 2026 (Tested & Ranked) | AI Compass" />
        <meta property="og:description" content="Jasper is $39+/mo and built for marketing teams. These 10 alternatives are cheaper, better suited to fiction/academic/student workflows, and most have usable free tiers." />
        <meta property="og:url" content="https://ai-compass.in/best-jasper-alternatives" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best Jasper AI Alternatives in 2026",
          "description": "The 10 best Jasper AI alternatives — ranked and reviewed for fiction writers, students, marketers, and budget users.",
          "url": "https://ai-compass.in/best-jasper-alternatives",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-05-14",
          "dateModified": "2026-05-14",
          "author": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "image": "https://ai-compass.in/og-image.png",
          "mainEntityOfPage": { "@type": "WebPage", "@id": "https://ai-compass.in/best-jasper-alternatives" },
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Best Jasper AI Alternatives in 2026",
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
            <WordReveal>10 Best Jasper AI Alternatives in 2026</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            Jasper is $39+/mo and built for marketing teams. For fiction writers, students, and indie creators, these 10 alternatives are cheaper, better suited to the work — and most have usable free tiers Jasper doesn't.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ Hand-tested vs Jasper", "✅ Free tier or under $25/mo", "✅ Ranked by real fit"].map(t => (
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
            <h2 className="text-lg font-semibold text-ink sm:text-xl">How we picked these alternatives</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Tested against the workflows people actually use Jasper for — blog drafts, marketing copy, brand voice, long-form.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free tier or paid tier under $25/mo. Jasper Pro starts at $39 — most readers want cheaper, not pricier.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Pricing verified within the last 30 days; the order does not change for sponsored placements.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Specialist tools (fiction, academic, paraphrase) rank by how much better they are than Jasper for that audience — not by general-purpose breadth.</span>
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
                          vs Jasper
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.vsJasper}</dd>
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
                          <Link
                            to={`/alternatives/${tool.slug}`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
                          >
                            See alternatives →
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
              How to replace Jasper depending on what you actually use it for
            </h2>
            <p className="font-sans text-[15px] leading-[1.75] text-muted mb-5">
              Jasper bundles three jobs (fiction, academic, marketing) into one $39/mo subscription. Pick the stack that matches the job you're actually doing — most readers end up paying less.
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
              <Link to="/best-ai-tools-for-students" className="text-[14px] font-semibold text-accent no-underline hover:underline">
                Best AI tools for students →
              </Link>
            </MagneticWrapper>
            <Link to="/best-free-ai-tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Best free AI tools →
            </Link>
            <Link to="/tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Browse all {displayCount} tools →
            </Link>
          </div>
        </MotionDiv>

      </div>
    </>
  );
}
