import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

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
        <title>10 Best Free AI Tools in 2026 — No Credit Card Needed | AI Compass</title>
        <meta
          name="description"
          content="The 10 best free AI tools in 2026 — no credit card, no catch. Free AI tools for writing, research, coding, and studying. Perfect for students on a budget."
        />
        <meta
          name="keywords"
          content="free AI tools, best free AI tools 2026, free AI tools for students, free AI tools India, no credit card AI tools, free ChatGPT alternatives"
        />
        <link rel="canonical" href="https://ai-compass.in/best-free-ai-tools" />
        <meta property="og:title" content="10 Best Free AI Tools in 2026 | AI Compass" />
        <meta property="og:description" content="The best free AI tools — no credit card needed. Ranked for students on a budget." />
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

      <div className="min-h-screen bg-white text-slate-900 dark:bg-[#0a0f1e] dark:text-slate-200 font-serif">

        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-[13px] uppercase tracking-widest text-emerald-700 mb-6 font-sans dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            ₹0 · No credit card · Updated April 2026
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-slate-900 dark:text-slate-100 mb-5">
            The 10 Best Free AI Tools in 2026
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-slate-600 dark:text-slate-400 max-w-[640px] mx-auto mb-8 font-sans">
            You don't need to spend money to use powerful AI. These 10 tools have free tiers that are genuinely useful — not crippled demos. Ranked by how good the free plan actually is.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-slate-500">
            {["✅ All free to start", "✅ No credit card required", "✅ Works in India"].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>

        {/* Quick nav */}
        <div className="mx-auto max-w-[860px] px-6 mb-12">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 font-sans dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[12px] text-slate-400 mb-3 uppercase tracking-widest">Quick jump</p>
            <div className="flex flex-wrap gap-2">
              {tools.map(t => (
                <a
                  key={t.slug}
                  href={`#${t.slug}`}
                  className="text-[13px] text-slate-600 no-underline rounded-md bg-slate-100 px-3 py-1 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:text-slate-400 dark:bg-white/5 dark:hover:text-slate-100"
                >
                  {t.rank}. {t.name}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Tool cards */}
        <div className="mx-auto max-w-[860px] px-6">
          {tools.map((tool) => (
            <div
              key={tool.slug}
              id={tool.slug}
              className="mb-10 rounded-xl border border-slate-200 bg-white p-7 scroll-mt-20 dark:border-white/[0.07] dark:bg-white/[0.02]"
              style={{ borderLeft: `3px solid ${tool.color}` }}
            >
              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[2rem] dark:bg-white/5">
                  {tool.emoji}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2.5 mb-1">
                    <span className="font-sans text-[11px] font-bold uppercase tracking-widest" style={{ color: tool.color }}>#{tool.rank}</span>
                    <h2 className="text-[1.3rem] font-bold tracking-tight text-slate-900 dark:text-slate-100 m-0">{tool.name}</h2>
                    <span className="font-sans text-[11px] rounded-full px-3 py-0.5 font-semibold border"
                      style={{
                        background: `${tool.color}15`,
                        borderColor: `${tool.color}40`,
                        color: tool.color,
                      }}
                    >{tool.badge}</span>
                  </div>
                  <p className="font-sans text-[14px] italic text-slate-500 dark:text-slate-400 m-0">{tool.tagline}</p>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 mb-4 font-sans text-[13px]">
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 dark:bg-emerald-500/5 dark:border-emerald-500/15">
                  <p className="text-emerald-700 dark:text-emerald-400 text-[11px] uppercase tracking-widest font-semibold mb-1">Free tier includes</p>
                  <p className="text-slate-600 dark:text-slate-400 m-0 leading-[1.5]">{tool.freeLimit}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Best for</p>
                  <p className="text-slate-600 dark:text-slate-400 m-0 leading-[1.5]">{tool.bestFor}</p>
                </div>
              </div>

              {/* Verdict */}
              <p className="font-sans text-[14px] leading-[1.7] text-slate-700 dark:text-slate-300 mb-5">
                <strong className="text-slate-900 dark:text-slate-100">Free tier verdict: </strong>{tool.freeVerdict}
              </p>

              {/* CTA row */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <Link
                  to={`/tools/${tool.slug}`}
                  className="inline-flex items-center gap-1.5 font-sans text-[13px] font-semibold no-underline"
                  style={{ color: tool.color }}
                >
                  View full details →
                </Link>
                <span className="font-sans text-[12px] text-slate-400">Paid from {tool.paidPlan}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Tips */}
        <div className="mx-auto max-w-[860px] px-6 mt-16">
          <h2 className="text-[1.6rem] font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-6">
            4 tips to get the most out of free AI tools
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {tips.map(tip => (
              <div key={tip.title} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/[0.07] dark:bg-white/[0.02]">
                <div className="text-[1.5rem] mb-2.5">{tip.icon}</div>
                <h3 className="font-sans text-[14px] font-semibold text-slate-900 dark:text-slate-100 mb-2">{tip.title}</h3>
                <p className="font-sans text-[13px] text-slate-600 dark:text-slate-400 m-0 leading-[1.6]">{tip.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stack CTA */}
        <div className="mx-auto max-w-[860px] px-6 mt-16">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-10 text-center dark:border-emerald-500/20 dark:bg-gradient-to-br dark:from-emerald-500/10 dark:to-indigo-500/5">
            <h2 className="text-[1.4rem] font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-3">
              Not sure which free tools to start with?
            </h2>
            <p className="font-sans text-[15px] text-slate-600 dark:text-slate-400 mb-6">
              Answer 3 quick questions and get a personalised free AI stack built for your exact workflow.
            </p>
            <Link
              to="/ai-tool-finder"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-7 py-3 font-sans text-[14px] font-semibold text-white no-underline transition hover:bg-emerald-500"
            >
              Find my free AI stack →
            </Link>
          </div>
        </div>

        {/* FAQ */}
        <div className="mx-auto max-w-[860px] px-6 mt-16">
          <h2 className="text-[1.6rem] font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-8">
            Frequently asked questions
          </h2>
          <div className="flex flex-col gap-4">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-white/[0.07] dark:bg-white/[0.02]">
                <h3 className="font-sans text-[15px] font-semibold text-slate-900 dark:text-slate-100 mb-2.5">{faq.q}</h3>
                <p className="font-sans text-[14px] leading-[1.7] text-slate-600 dark:text-slate-400 m-0">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mx-auto max-w-[860px] px-6 mt-16 mb-20 text-center font-sans">
          <p className="text-[14px] text-slate-400 mb-2">Also read</p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link to="/best-ai-tools-for-students" className="text-[14px] font-semibold text-indigo-600 no-underline hover:text-indigo-500 dark:text-indigo-400">
              Best AI tools for students →
            </Link>
            <Link to="/tools" className="text-[14px] font-semibold text-indigo-600 no-underline hover:text-indigo-500 dark:text-indigo-400">
              Browse all 450+ tools →
            </Link>
          </div>
        </div>

      </div>
    </>
  );
}