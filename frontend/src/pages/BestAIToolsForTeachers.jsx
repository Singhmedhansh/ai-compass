import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

// Brand logos are self-hosted high-res marks. Clearbit's logo API (used by the
// other guide pages) was sunset, so remote fetches silently fell through to
// tiny favicons that looked blurry at card/hero sizes. Bundling the real
// artwork keeps them crisp and removes the third-party dependency. Kahoot only
// publishes a 32px favicon, so it intentionally uses the letter-tile fallback.
import magicschoolIcon from "../assets/brand/magicschool-ai.webp";
import briskIcon from "../assets/brand/brisk-teaching.png";
import diffitIcon from "../assets/brand/diffit.png";
import khanmigoIcon from "../assets/brand/khan-academy-khanmigo.png";
import notebooklmIcon from "../assets/brand/notebooklm.svg";
import canvaIcon from "../assets/brand/canva.png";
import curipodIcon from "../assets/brand/curipod.png";
import gradescopeIcon from "../assets/brand/gradescope.png";
import perplexityIcon from "../assets/brand/perplexity-ai.png";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { useCatalogStats } from "../hooks/useCatalogStats";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";
import { toolHoverHandlers, alternativesHoverHandlers } from "../lib/prefetch";

const MotionDiv = motion.div;
// Static fallback covers the ~100ms before /api/v1/stats responds.
const FALLBACK_TOOL_COUNT = 400;

// Per-card icon with a 3-stage fallback: primary (tool.iconUrl, a self-hosted
// high-res brand mark) -> 'fallback' (DuckDuckGo's icon proxy, keyed off
// tool.clearbitDomain) -> letter tile. Each onError advances one step. Tools
// with no iconUrl (e.g. brands that only ship a tiny favicon) start at the
// letter tile so we never render a blurry mark.
//
// DuckDuckGo over Google: Google's s2/favicons API returns a generic globe
// placeholder with HTTP 200 for unknown sites, which never triggers onError.
// DuckDuckGo's ip3 endpoint returns a clean 404 on miss, so the cascade
// reliably falls through to the letter tile.
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
    if (!tool.clearbitDomain) return renderLetter();
    src = `https://icons.duckduckgo.com/ip3/${tool.clearbitDomain}.ico`;
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
const LAST_REVIEWED = "May 2026";

// Outbound CTA target: per-tool affiliateUrl (rel=sponsored) when a program is
// signed, otherwise the tool's homepage built from its clearbitDomain. None of
// the current 10 tools is an affiliate, but a future swap lands directly on the
// tool's affiliateUrl field below.
function getOutboundUrl(tool) {
  if (tool.affiliateUrl) return { url: tool.affiliateUrl, isAffiliate: true };
  if (tool.slug) return { url: `/go/${encodeURIComponent(tool.slug)}`, isAffiliate: false };
  if (tool.clearbitDomain) return { url: `https://${tool.clearbitDomain}`, isAffiliate: false };
  return { url: null, isAffiliate: false };
}

const tools = [
  {
    rank: 1,
    name: "MagicSchool AI",
    slug: "magicschool-ai",
    clearbitDomain: "magicschool.ai",
    iconUrl: magicschoolIcon,
    affiliateUrl: null,
    tagline: "80+ purpose-built classroom tools in one place",
    pricing: "Free / $9.99/mo",
    pricingType: "freemium",
    bestFor: "Lesson plans, quizzes, IEPs, rubrics, parent emails",
    verdict:
      "The closest thing to a single AI tool that covers the full teacher workday. If you only add one tool, make it this.",
    color: "#7c3aed",
  },
  {
    rank: 2,
    name: "Brisk Teaching",
    slug: "brisk-teaching",
    clearbitDomain: "briskteaching.com",
    iconUrl: briskIcon,
    affiliateUrl: null,
    tagline: "AI inside Google Docs and Slides — no tab switching",
    pricing: "Free Chrome extension",
    pricingType: "free",
    bestFor: "Inline student feedback, quiz generation, grading assist",
    verdict:
      "Installs in 30 seconds and works inside tools you already have open. The fastest way to get AI into your daily marking workflow.",
    color: "#14b8a6",
  },
  {
    rank: 3,
    name: "Diffit",
    slug: "diffit",
    clearbitDomain: "diffit.me",
    iconUrl: diffitIcon,
    affiliateUrl: null,
    tagline: "Instant reading-level differentiation for any text",
    pricing: "Free / $14.99/mo",
    pricingType: "freemium",
    bestFor: "Multi-level texts, ESL learners, comprehension questions",
    verdict:
      "Paste any article or passage, pick your grade bands, and get levelled versions with vocab lists and questions in under two minutes. Nothing else does this as well.",
    color: "#f97316",
  },
  {
    rank: 4,
    name: "Khanmigo",
    slug: "khan-academy-khanmigo",
    clearbitDomain: "khanacademy.org",
    iconUrl: khanmigoIcon,
    affiliateUrl: null,
    tagline: "Free AI tutor for students, free planning tool for teachers",
    pricing: "Free for teachers",
    pricingType: "free",
    bestFor: "Student tutoring, lesson plans, rubrics, exit tickets",
    verdict:
      "Fully free for teachers. You get lesson planning tools and can see every conversation your students have with the AI — the only student-facing AI with that level of teacher oversight.",
    color: "#14bf96",
  },
  {
    rank: 5,
    name: "NotebookLM",
    slug: "notebooklm",
    clearbitDomain: "notebooklm.google.com",
    iconUrl: notebooklmIcon,
    affiliateUrl: null,
    tagline: "Ask questions about your own uploaded documents",
    pricing: "Free",
    pricingType: "free",
    bestFor: "Processing textbooks, curriculum guides, research papers",
    verdict:
      "Upload a 200-page curriculum framework and ask it to pull out the Year 9 assessment criteria. It answers from your documents, not the open internet — no hallucinated citations.",
    color: "#4285f4",
  },
  {
    rank: 6,
    name: "Canva for Education",
    slug: "canva",
    clearbitDomain: "canva.com",
    iconUrl: canvaIcon,
    affiliateUrl: null,
    tagline: "Full Pro access — free for verified teachers",
    pricing: "Free for educators",
    pricingType: "free",
    bestFor: "Worksheets, classroom displays, slide decks, infographics",
    verdict:
      "Canva's full Pro tier — normally $15/month — is free once you verify your educator status. The AI design tools and template library make classroom materials that would have taken an hour take five minutes.",
    color: "#00c4cc",
  },
  {
    rank: 7,
    name: "Curipod",
    slug: "curipod",
    clearbitDomain: "curipod.com",
    iconUrl: curipodIcon,
    affiliateUrl: null,
    tagline: "Interactive lesson slides with live student responses",
    pricing: "Free / school plans",
    pricingType: "freemium",
    bestFor: "Live polls, word clouds, student engagement, formative checks",
    verdict:
      "Type a topic, get a complete interactive lesson with built-in polls and student-response activities. Better than a static slide deck for keeping a class engaged.",
    color: "#6c5ce7",
  },
  {
    rank: 8,
    name: "Gradescope",
    slug: "gradescope",
    clearbitDomain: "gradescope.com",
    iconUrl: gradescopeIcon,
    affiliateUrl: null,
    tagline: "AI groups similar answers so you grade each type once",
    pricing: "From $1/student (institutional)",
    pricingType: "paid",
    bestFor: "Exams, problem sets, consistent rubric-aligned grading",
    verdict:
      "If you're marking 80 identical short-answer questions, Gradescope clusters them so you write the feedback once and apply it to all similar responses. Saves hours per assessment cycle.",
    color: "#4287f5",
  },
  {
    rank: 9,
    name: "Kahoot!",
    slug: "kahoot",
    clearbitDomain: "kahoot.com",
    iconUrl: null, // Kahoot only ships a 32px favicon; use the crisp letter tile

    affiliateUrl: null,
    tagline: "Game-based quizzes with AI quiz generation",
    pricing: "Free / $6/mo",
    pricingType: "freemium",
    bestFor: "Live review sessions, formative assessment, engagement",
    verdict:
      "Students already know how Kahoot works. The AI quiz generator means you can now create a 20-question end-of-unit review from a topic name in under a minute.",
    color: "#46178f",
  },
  {
    rank: 10,
    name: "Perplexity AI",
    slug: "perplexity-ai",
    clearbitDomain: "perplexity.ai",
    iconUrl: perplexityIcon,
    affiliateUrl: null,
    tagline: "Sourced answers with citations for lesson prep",
    pricing: "Free / $20/mo",
    pricingType: "freemium",
    bestFor: "Lesson research, fact-checking, academic source discovery",
    verdict:
      "Every answer comes with numbered citations you can click. Use it for lesson prep research instead of a raw Google search — it surfaces peer-reviewed sources and gives you a summary you can verify.",
    color: "#20b8cd",
  },
];

const faqs = [
  {
    q: "Are these tools safe to use with student data?",
    a: "MagicSchool AI, Khanmigo, Brisk Teaching, Diffit, and Gradescope all have explicit FERPA/COPPA compliance and educator data agreements. For general AI tools like Perplexity and NotebookLM, never input identifiable student information — use them for your own prep only.",
  },
  {
    q: "Which tools are genuinely free for teachers?",
    a: "Khanmigo is fully free for US teachers. Canva for Education gives full Pro access free after educator verification. Brisk Teaching's core extension is free. NotebookLM is free with a Google account. MagicSchool AI, Diffit, Curipod, and Kahoot all have functional free tiers.",
  },
  {
    q: "Do I need to be tech-savvy to use these?",
    a: "No. Brisk Teaching installs like any Chrome extension. Canva, Curipod, and Kahoot are designed for non-technical users. MagicSchool AI and Diffit require nothing beyond a browser and a topic to get started.",
  },
  {
    q: "Can I use AI tools without violating academic integrity policies?",
    a: "These tools are for teacher use — creating materials, differentiating content, grading. That's unambiguously appropriate. The academic integrity question applies to student-facing AI; Khanmigo and SchoolAI are the tools designed with student guardrails built in.",
  },
  {
    q: "Will AI replace teachers?",
    a: "No — and the tools here reflect that. Every tool on this list handles the mechanical, time-intensive prep work (differentiation, grading, slide creation) so teachers spend more time on the parts that actually require a human: relationships, discussion, mentorship.",
  },
];

const stacks = [
  {
    label: "The Daily Prep Stack",
    tools: "MagicSchool AI + NotebookLM + Canva for Education",
    description:
      "MagicSchool for lesson plans and quizzes, NotebookLM to pull key ideas from curriculum documents, Canva to make everything look classroom-ready. Covers 80% of daily prep time.",
  },
  {
    label: "The Feedback Stack",
    tools: "Brisk Teaching + Diffit + Gradescope",
    description:
      "Brisk for inline written feedback in Google Docs, Diffit to differentiate reading materials for different levels, Gradescope for consistent exam grading. All three work independently.",
  },
  {
    label: "The Engagement Stack",
    tools: "Curipod + Kahoot! + Khanmigo",
    description:
      "Curipod for interactive lesson delivery, Kahoot for live review games, Khanmigo as a monitored AI tutor students can use between classes.",
  },
];

export default function BestAIToolsForTeachers() {
  const { totalTools } = useCatalogStats();
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best AI Tools for Teachers in 2026 (Hand-Tested) | AI Compass</title>
        <meta
          name="description"
          content="The 10 best AI tools for teachers in 2026 — tested across lesson planning, grading, differentiation, and student engagement. All free or freemium options included."
        />
        <meta
          name="keywords"
          content="best AI tools for teachers, AI tools for educators, AI for teaching, lesson planning AI, AI grading tools, classroom AI tools, free AI tools for teachers"
        />
        <link rel="canonical" href="https://ai-compass.in/best-ai-tools-for-teachers" />
        <meta property="og:title" content="10 Best AI Tools for Teachers in 2026 (Hand-Tested) | AI Compass" />
        <meta property="og:description" content="The 10 best AI tools for teachers in 2026 — tested across lesson planning, grading, differentiation, and student engagement. All free or freemium options included." />
        <meta property="og:url" content="https://ai-compass.in/best-ai-tools-for-teachers" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best AI Tools for Teachers in 2026",
          "description": "The 10 best AI tools for teachers — ranked and reviewed for lesson planning, grading, differentiation, and classroom engagement.",
          "url": "https://ai-compass.in/best-ai-tools-for-teachers",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-05-25",
          "dateModified": "2026-05-25",
          "author": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "image": "https://ai-compass.in/og-image.png",
          "mainEntityOfPage": { "@type": "WebPage", "@id": "https://ai-compass.in/best-ai-tools-for-teachers" },
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Best AI Tools for Teachers in 2026",
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
            { "@type": "ListItem", "position": 2, "name": "Best AI Tools for Teachers", "item": "https://ai-compass.in/best-ai-tools-for-teachers" },
          ],
        })}</script>
      </Helmet>

      <div className="font-serif">

        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            10 tools · Updated May 2026
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>The best AI tools for teachers in 2026</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            Hand-picked across lesson planning, grading, differentiation, and classroom engagement. Every tool here has a free tier or is free outright.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ All free or freemium", "✅ Hand-tested", "✅ Ranked by real utility"].map(t => (
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
                <span>Saves real prep time — cuts planning, grading, or differentiation time measurably, not theoretically.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free or low cost — every tool here has a free tier or is free for verified educators.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Classroom-safe — handles student context appropriately; FERPA/COPPA-aware where relevant.</span>
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
                    </dl>

                    {/* Verdict callout */}
                    <div className="mb-6 rounded-2xl bg-accent-soft px-5 py-4">
                      <p className="text-sm font-medium italic leading-relaxed text-accent-ink">
                        &ldquo;{tool.verdict}&rdquo;
                      </p>
                    </div>

                    {/* CTA — outbound primary, internal review secondary. Outbound uses affiliateUrl with rel=sponsored when partnered, else falls through to the tool's homepage built from its clearbitDomain. */}
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
              How to build your teacher AI stack
            </h2>
            <p className="font-sans text-[15px] leading-[1.75] text-muted mb-5">
              Don't try to use all 10 at once. Start with one stack that matches your biggest time sink, then expand from there.
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 font-sans mb-6">
              {stacks.map(s => (
                <div key={s.label} className="rounded-lg bg-bg-elev p-4 shadow-sm">
                  <p className="text-[11px] text-accent-ink uppercase tracking-widest mb-2 font-semibold">{s.label}</p>
                  <p className="text-[13px] text-ink-2 m-0 mb-2 leading-[1.6] font-semibold">{s.tools}</p>
                  <p className="text-[12px] text-muted m-0 leading-[1.6]">{s.description}</p>
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
              Browse all {displayCount} tools →
            </Link>
          </div>
          <p className="mt-8 text-[12px] text-muted-2 max-w-[560px] mx-auto leading-[1.6]">
            Some links on this page may be affiliate links. This doesn't affect how tools are ranked or reviewed — we only list tools we'd genuinely recommend.
          </p>
        </MotionDiv>

      </div>
    </>
  );
}
