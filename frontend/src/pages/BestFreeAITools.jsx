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
    name: "ChatGPT",
    slug: "chatgpt",
    iconUrl: chatgptIcon,
    tagline: "Best free all-purpose AI",
    freeLimit: "Unlimited GPT-5 mini on free plan",
    paidPlan: "$20/month for Plus",
    bestFor: "Writing, coding, brainstorming, Q&A",
    freeVerdict:
      "The free tier is genuinely excellent now. Most students will never hit Plus territory.",
    color: "#10a37f",
    badge: "100% Free to start",
  },
  {
    rank: 2,
    name: "Claude",
    slug: "claude",
    iconUrl: claudeIcon,
    tagline: "Best free model for long writing",
    freeLimit: "Generous daily message cap with Claude Sonnet",
    paidPlan: "$20/month for Pro",
    bestFor: "Essays, code review, document analysis, careful reasoning",
    freeVerdict:
      "Free tier handles documents up to ~75K words. Outperforms most paid tools for writing.",
    color: "#cc785c",
    badge: "Free 200K context",
  },
  {
    rank: 3,
    name: "Gemini",
    slug: "gemini",
    iconUrl: "https://logo.clearbit.com/gemini.google.com",
    tagline: "Google's free multimodal AI",
    freeLimit: "Unlimited free access to Gemini 2.5 Flash",
    paidPlan: "$20/month for Advanced",
    bestFor: "Image analysis, web-aware research, Google ecosystem",
    freeVerdict:
      "The free model is competitive with paid tools, and it ties into Drive/Docs natively.",
    color: "#4285f4",
    badge: "No credit card",
  },
  {
    rank: 4,
    name: "DeepL",
    slug: "deepl",
    iconUrl: "https://logo.clearbit.com/deepl.com",
    tagline: "Translation that beats Google Translate",
    freeLimit: "500K characters/month free",
    paidPlan: "$8.74/month for Pro",
    bestFor: "Translating sources, language learning, multilingual writing",
    freeVerdict:
      "500K characters is plenty for a semester of foreign-language coursework.",
    color: "#0f2b46",
    badge: "No signup needed",
  },
  {
    rank: 5,
    name: "Hugging Face Chat",
    slug: "hugging-face",
    iconUrl: "https://logo.clearbit.com/huggingface.co",
    tagline: "Open-source models, free, no signup",
    freeLimit: "Unlimited free access to Llama, Mistral, and other open models",
    paidPlan: "N/A — fully free",
    bestFor: "Trying alternative models, technical experimentation, privacy-conscious use",
    freeVerdict:
      "The most open AI access on the internet. No account required, no rate limits worth mentioning.",
    color: "#ffd21e",
    badge: "Open source",
  },
  {
    rank: 6,
    name: "Perplexity",
    slug: "perplexity-ai",
    iconUrl: "https://logo.clearbit.com/perplexity.ai",
    tagline: "Free AI search with citations",
    freeLimit: "Unlimited free searches with the base model",
    paidPlan: "Free for students + $20/month for Pro",
    bestFor: "Research, fact-checking, finding sources",
    freeVerdict:
      "Free tier alone replaces Google for most research queries. Pro adds smarter models but isn't required.",
    color: "#20b8cd",
    badge: "Free for students",
  },
  {
    rank: 7,
    name: "Phind",
    slug: "phind",
    iconUrl: "https://logo.clearbit.com/phind.com",
    tagline: "AI search built for developers",
    freeLimit: "Generous free tier with current models",
    paidPlan: "$15/month for Pro",
    bestFor: "Debugging, framework lookups, technical reference",
    freeVerdict:
      "For technical questions, Phind's free tier often outperforms ChatGPT free because it pulls live docs.",
    color: "#00b3a4",
    badge: "Free unlimited",
  },
  {
    // Spec asked for Pi (Inflection); not in tools.json. Substituted with Microsoft Copilot — closest free conversational AI in the catalog.
    rank: 8,
    name: "Microsoft Copilot",
    slug: "microsoft-copilot",
    iconUrl: "https://logo.clearbit.com/microsoft.com",
    tagline: "Conversational AI with no signup wall",
    freeLimit: "Unlimited free conversations",
    paidPlan: "N/A — fully free",
    bestFor: "Brainstorming out loud, casual problem-solving, voice mode",
    freeVerdict:
      "A different vibe than ChatGPT — designed for conversation, not tasks. Useful when you're thinking through something.",
    color: "#0078d4",
    badge: "No signup needed",
  },
  {
    // Spec asked for PhotoRoom; not in tools.json. Substituted with Remove.bg — closest free background-removal tool in the catalog.
    rank: 9,
    name: "Remove.bg",
    slug: "remove.bg",
    iconUrl: "https://logo.clearbit.com/remove.bg",
    tagline: "Free AI image editing and background removal",
    freeLimit: "Free for basic editing; unlimited background removals",
    paidPlan: "$12.99/month for Pro",
    bestFor: "Cleaning up photos, removing backgrounds, prepping images for assignments",
    freeVerdict:
      "The free tier covers everything most students need. Pro is for designers, not coursework.",
    color: "#52525b",
    badge: "No watermark",
  },
  {
    // Spec asked for Mistral Le Chat; not in tools.json. Substituted with Mistral AI — closest Mistral entry in the catalog.
    rank: 10,
    name: "Mistral AI",
    slug: "mistral-ai",
    iconUrl: "https://logo.clearbit.com/mistral.ai",
    tagline: "Fast free AI from a top open-source lab",
    freeLimit: "Unlimited free access to Mistral's best model",
    paidPlan: "N/A for now — fully free in beta",
    bestFor: "Quick lookups, coding, fast iteration",
    freeVerdict:
      "Noticeably faster than ChatGPT for short prompts. Underrated for everyday use.",
    color: "#fa520f",
    badge: "Free beta",
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
          "author": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "image": "https://ai-compass.in/og-image.png",
          "mainEntityOfPage": { "@type": "WebPage", "@id": "https://ai-compass.in/best-free-ai-tools" },
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Best Free AI Tools in 2026",
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
              Browse all 399 tools →
            </Link>
          </div>
        </MotionDiv>

      </div>
    </>
  );
}
