import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";

const MotionDiv = motion.div;

// Surface review recency as a trust signal — matches the catalog's "no scraping, hand-tested" claim on the homepage Curation Discipline section.
const LAST_REVIEWED = "April 2026";

const tools = [
  {
    rank: 1,
    name: "ChatGPT",
    slug: "chatgpt",
    emoji: "🤖",
    tagline: "Best free all-purpose AI",
    freeLimit: "Unlimited GPT-4o on free plan",
    paidPlan: "$20/month for Plus",
    bestFor: "Writing, coding, brainstorming, Q&A",
    freeVerdict: "The free tier is genuinely excellent now. GPT-4o is included at no cost — you don't need to pay unless you hit usage limits.",
    color: "#10a37f",
    badge: "100% Free to start",
  },
  {
    rank: 2,
    name: "Claude",
    slug: "claude",
    emoji: "⚡",
    tagline: "Best free AI for long documents",
    freeLimit: "Daily message limit on free plan",
    paidPlan: "$20/month for Pro",
    bestFor: "Reading PDFs, research, nuanced writing",
    freeVerdict: "Free tier lets you paste entire documents and ask questions. Hit the daily limit? Just come back tomorrow — it resets.",
    color: "#cc785c",
    badge: "100% Free to start",
  },
  {
    rank: 3,
    name: "Grammarly",
    slug: "grammarly",
    emoji: "✍️",
    tagline: "Best free writing assistant",
    freeLimit: "Grammar, spelling, tone — all free",
    paidPlan: "$12/month for Premium",
    bestFor: "Essays, emails, assignments",
    freeVerdict: "The free plan catches grammar and spelling mistakes and works in every browser and app. Most students never need the paid plan.",
    color: "#15c39a",
    badge: "Free forever",
  },
  {
    rank: 4,
    name: "Perplexity AI",
    slug: "perplexity-ai",
    emoji: "🔍",
    tagline: "Best free AI search engine",
    freeLimit: "Unlimited searches, citations included",
    paidPlan: "$20/month for Pro",
    bestFor: "Research, fact-checking, finding sources",
    freeVerdict: "Completely free with no login required. Every answer comes with real citations. Use it instead of Google for research.",
    color: "#20b8cd",
    badge: "No login needed",
  },
  {
    rank: 5,
    name: "Quillbot",
    slug: "quillbot",
    emoji: "🔄",
    tagline: "Best free paraphrasing tool",
    freeLimit: "125 words per paraphrase, summariser free",
    paidPlan: "$9.95/month for Premium",
    bestFor: "Paraphrasing, summarising, citations",
    freeVerdict: "Free summariser has no word limit — paste an entire article and get a summary instantly. The citation generator is also completely free.",
    color: "#4caf50",
    badge: "Free summariser",
  },
  {
    rank: 6,
    name: "GitHub Copilot",
    slug: "github-copilot",
    emoji: "💻",
    tagline: "Best free AI for coding",
    freeLimit: "Free with GitHub Student Developer Pack",
    paidPlan: "$10/month without student pack",
    bestFor: "Code completion, debugging, learning",
    freeVerdict: "Apply for the GitHub Student Developer Pack with your college email — you get Copilot completely free. Takes 5 minutes to apply.",
    color: "#6e40c9",
    badge: "Free for students",
  },
  {
    rank: 7,
    name: "Gamma",
    slug: "gamma-app",
    emoji: "🎨",
    tagline: "Best free presentation maker",
    freeLimit: "400 AI credits free (roughly 10 decks)",
    paidPlan: "$10/month for Plus",
    bestFor: "Presentations, pitch decks, visual reports",
    freeVerdict: "400 free credits is enough for a full semester of presentations. Generate a complete slide deck from a prompt in under 2 minutes.",
    color: "#f5a623",
    badge: "400 free credits",
  },
  {
    rank: 8,
    name: "Google Gemini",
    slug: "gemini",
    emoji: "💎",
    tagline: "Best free AI with Google integration",
    freeLimit: "Unlimited on free plan",
    paidPlan: "$20/month for Advanced",
    bestFor: "Research, writing, Google Docs integration",
    freeVerdict: "Free and unlimited. Especially useful if you use Google Docs, Gmail, or Google Drive — Gemini integrates directly into all of them.",
    color: "#4285f4",
    badge: "Unlimited free",
  },
  {
    rank: 9,
    name: "Otter.ai",
    slug: "otter-ai",
    emoji: "🎙️",
    tagline: "Best free lecture transcription",
    freeLimit: "300 minutes free per month",
    paidPlan: "$16.99/month for Pro",
    bestFor: "Recording lectures, meeting notes",
    freeVerdict: "300 free minutes per month is enough for most students. Record your lectures, get a full transcript and summary automatically.",
    color: "#ff6b6b",
    badge: "300 mins free",
  },
  {
    rank: 10,
    name: "Elicit",
    slug: "elicit",
    emoji: "🧪",
    tagline: "Best free academic research tool",
    freeLimit: "5 free credits per week",
    paidPlan: "$12/month for Plus",
    bestFor: "Literature reviews, finding papers",
    freeVerdict: "5 credits per week is limiting but enough for occasional deep research. Each credit searches and summarises multiple academic papers at once.",
    color: "#7c6af5",
    badge: "Free weekly credits",
  },
];

const tips = [
  {
    icon: "🎓",
    title: "Use your college email",
    body: "Many AI tools have hidden student discounts. GitHub Copilot, Notion, and Figma are completely free with a .edu or college email address.",
  },
  {
    icon: "🔄",
    title: "Stack free tools smartly",
    body: "Use Perplexity for research, ChatGPT for writing, Grammarly for editing. Three free tools covering your whole workflow costs ₹0.",
  },
  {
    icon: "⏰",
    title: "Daily limits reset",
    body: "Most free tiers with daily limits (like Claude) reset every 24 hours. Hit the limit? Switch to a different free tool and come back tomorrow.",
  },
  {
    icon: "🇮🇳",
    title: "India pricing is lower",
    body: "If you do decide to pay, always check the India pricing page specifically. ChatGPT Plus, Notion AI, and others charge significantly less in INR than USD.",
  },
];

const faqs = [
  {
    q: "Which AI tools are completely free with no credit card?",
    a: "ChatGPT, Claude, Grammarly, Perplexity, and Google Gemini all have free plans that require no credit card. Just sign up with your email and start using them immediately.",
  },
  {
    q: "What's the best free AI tool for Indian students?",
    a: "Perplexity AI is the best starting point — no login required, unlimited searches, and real citations. Pair it with the free tier of ChatGPT and Grammarly for a complete zero-cost AI stack.",
  },
  {
    q: "Are free AI tools good enough or do I need to pay?",
    a: "For most student use cases, free tiers are genuinely sufficient. ChatGPT free includes GPT-4o, Grammarly free catches all common errors, and Perplexity free has unlimited searches. You only need paid plans if you're hitting daily limits regularly.",
  },
  {
    q: "How do I get GitHub Copilot for free as a student?",
    a: "Go to education.github.com and apply for the GitHub Student Developer Pack using your college email address. Approval usually takes 1-3 days and gives you Copilot plus dozens of other developer tools completely free.",
  },
  {
    q: "What free AI tools work in India without VPN?",
    a: "All tools on this list work in India without a VPN — ChatGPT, Claude, Grammarly, Perplexity, Quillbot, Gamma, Google Gemini, and Otter.ai are all fully accessible in India.",
  },
];

export default function BestFreeAITools() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best Free AI Tools 2026 — No Credit Card | AI Compass</title>
        <meta
          name="description"
          content="The 10 best truly-free AI tools in 2026. No credit card, no demo-grade limits. Hand-tested, pricing re-verified monthly. Last reviewed April 2026."
        />
        <meta
          name="keywords"
          content="free AI tools, best free AI tools 2026, free AI tools for students, free AI tools India, no credit card AI tools, free ChatGPT alternatives"
        />
        <link rel="canonical" href="https://ai-compass.in/best-free-ai-tools" />
        <meta property="og:title" content="10 Best Free AI Tools 2026 — No Credit Card | AI Compass" />
        <meta property="og:description" content="The 10 best truly-free AI tools in 2026. No credit card, no demo-grade limits. Hand-tested, pricing re-verified monthly. Last reviewed April 2026." />
        <meta property="og:url" content="https://ai-compass.in/best-free-ai-tools" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best Free AI Tools in 2026 — No Credit Card Needed",
          "description": "The best free AI tools for students — ranked by how useful the free tier actually is.",
          "url": "https://ai-compass.in/best-free-ai-tools",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-04-20",
          "dateModified": "2026-04-20",
        })}</script>
      </Helmet>

      <div className="font-serif">

        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            ₹0 · No credit card · Updated April 2026
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>The 10 Best Free AI Tools in 2026</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            You don't need to spend money to use powerful AI. These 10 tools have free tiers that are genuinely useful — not crippled demos. Ranked by how good the free plan actually is.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ All free to start", "✅ No credit card required", "✅ Works in India"].map(t => (
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

        {/* What "free" actually means — criteria block inserted between hero and Quick nav */}
        <div className="mx-auto max-w-[860px] px-6 mb-12">
          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-10% 0px' }}
            className="rounded-2xl border border-line bg-bg-elev p-6 md:p-8"
          >
            <h2 className="text-lg font-semibold text-ink sm:text-xl">What "free" actually means here</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free means free — no credit card required to start, no auto-conversion to paid.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free tier covers actual student workflows, not just demo-grade limits.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free-tier quotas re-checked monthly — they shrink without notice on most platforms.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>If a tool starts gating essential features behind paid plans, it drops off this list.</span>
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
                      className={`flex shrink-0 items-center justify-center rounded-2xl ${isHero ? 'h-16 w-16 text-4xl md:h-20 md:w-20 md:text-5xl' : 'h-14 w-14 text-3xl md:h-16 md:w-16 md:text-4xl'}`}
                      // tool.color at ~10% opacity (1A hex suffix ≈ 26/255) — brand-tinted icon backdrop is the per-tool color accent for this card.
                      style={{ backgroundColor: `${tool.color}1A` }}
                      aria-hidden="true"
                    >
                      {tool.emoji}
                    </div>
                  </div>

                  {/* Right content */}
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <h3 className={`font-semibold tracking-tight text-ink ${isHero ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'}`}>
                        {tool.name}
                      </h3>
                      {tool.badge ? (
                        <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
                          {tool.badge}
                        </span>
                      ) : null}
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
                          Free tier
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.freeLimit}</dd>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                        <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2 sm:w-32">
                          Paid plan starts
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.paidPlan}</dd>
                      </div>
                    </dl>

                    {/* Verdict callout */}
                    <div className="mb-6 rounded-2xl bg-accent-soft px-5 py-4">
                      <p className="text-sm font-medium italic leading-relaxed text-accent-ink">
                        &ldquo;{tool.freeVerdict}&rdquo;
                      </p>
                    </div>

                    {/* CTA */}
                    <Link
                      to={`/tools/${tool.slug}`}
                      className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-all duration-200 hover:gap-3 hover:bg-ink-2"
                    >
                      See full review
                      <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:rotate-12" />
                    </Link>
                  </div>
                </div>
              </MotionDiv>
            )
          })}
        </MotionDiv>

        {/* Tips */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-[860px] px-6 mt-16"
        >
          <h2 className="text-[1.6rem] font-bold tracking-tight text-ink mb-6">
            4 tips to get the most out of free AI tools
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {tips.map(tip => (
              <div key={tip.title} className="rounded-xl border border-line bg-bg-elev p-5">
                <div className="text-[1.5rem] mb-2.5">{tip.icon}</div>
                <h3 className="font-sans text-[14px] font-semibold text-ink mb-2">{tip.title}</h3>
                <p className="font-sans text-[13px] text-muted m-0 leading-[1.6]">{tip.body}</p>
              </div>
            ))}
          </div>
        </MotionDiv>

        {/* Stack CTA */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-[860px] px-6 mt-16"
        >
          <div className="rounded-2xl border border-accent bg-accent-soft p-10 text-center">
            <h2 className="text-[1.4rem] font-bold tracking-tight text-ink mb-3">
              Not sure which free tools to start with?
            </h2>
            <p className="font-sans text-[15px] text-muted mb-6">
              Answer 3 quick questions and get a personalised free AI stack built for your exact workflow.
            </p>
            <Link
              to="/ai-tool-finder"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-3 font-sans text-[14px] font-semibold text-bg no-underline transition hover:opacity-90"
            >
              Find my free AI stack →
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
            <Link to="/tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Browse all 450+ tools →
            </Link>
          </div>
        </MotionDiv>

      </div>
    </>
  );
}
