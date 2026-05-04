import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const tools = [
  {
    rank: 1,
    name: "ChatGPT",
    slug: "chatgpt",
    emoji: "🤖",
    tagline: "Best all-rounder for students",
    pricing: "Free + Paid",
    bestFor: "Essays, brainstorming, explaining concepts, coding help",
    studentWin: "Free tier is genuinely powerful. GPT-4o included in free plan.",
    verdict:
      "The go-to starting point for almost every student use case. If you only use one AI tool, make it this.",
    color: "#10a37f",
  },
  {
    rank: 2,
    name: "Claude",
    slug: "claude",
    emoji: "⚡",
    tagline: "Best for long documents & deep reasoning",
    pricing: "Free + Paid",
    bestFor: "Research papers, reading PDFs, nuanced writing, coding",
    studentWin:
      "200K token context window — paste an entire textbook chapter and ask questions.",
    verdict:
      "Better than ChatGPT for reading and analysing long documents. Ideal for literature reviews and research.",
    color: "#cc785c",
  },
  {
    rank: 3,
    name: "Grammarly",
    slug: "grammarly",
    emoji: "✍️",
    tagline: "Best for writing polish & grammar",
    pricing: "Free + Paid",
    bestFor: "Essays, emails, assignments, job applications",
    studentWin:
      "Free tier catches grammar, spelling, and clarity issues. Works in every browser.",
    verdict:
      "Non-negotiable if English isn't your first language, and still very useful if it is. Install the browser extension.",
    color: "#15c39a",
  },
  {
    rank: 4,
    name: "Notion AI",
    slug: "notion-ai",
    emoji: "📓",
    tagline: "Best for notes, organisation & summaries",
    pricing: "Freemium",
    bestFor: "Lecture notes, project planning, summarising readings",
    studentWin:
      "If you already use Notion, the AI is built right in. Summarise your notes in one click.",
    verdict:
      "The best tool for students who want AI woven into their actual workflow rather than a separate tab.",
    color: "#6366f1",
  },
  {
    rank: 5,
    name: "Perplexity AI",
    slug: "perplexity-ai",
    emoji: "🔍",
    tagline: "Best for research with real citations",
    pricing: "Free + Paid",
    bestFor: "Research, fact-checking, finding sources, current events",
    studentWin:
      "Every answer comes with citations you can actually use in your bibliography.",
    verdict:
      "Use this instead of Googling. You get a direct answer plus the sources — massive time saver for research.",
    color: "#20b8cd",
  },
  {
    rank: 6,
    name: "GitHub Copilot",
    slug: "github-copilot",
    emoji: "💻",
    tagline: "Best for CS students & coding assignments",
    pricing: "Free for students",
    bestFor: "Code completion, debugging, learning new languages",
    studentWin:
      "Completely free with GitHub Student Developer Pack. Saves hours on assignments.",
    verdict:
      "If you're a CS student, this is the single best free tool available to you. Apply for the student pack today.",
    color: "#6e40c9",
  },
  {
    rank: 7,
    name: "Gamma",
    slug: "gamma-app",
    emoji: "🎨",
    tagline: "Best for presentations & pitch decks",
    pricing: "Freemium",
    bestFor: "Class presentations, project pitches, visual reports",
    studentWin:
      "Generate a full slide deck from a prompt in under 2 minutes. No design skills needed.",
    verdict:
      "The fastest way to go from bullet points to a beautiful presentation. Beats spending 3 hours in PowerPoint.",
    color: "#f5a623",
  },
  {
    rank: 8,
    name: "Quillbot",
    slug: "quillbot",
    emoji: "🔄",
    tagline: "Best for paraphrasing & summarising",
    pricing: "Free + Paid",
    bestFor: "Paraphrasing, summarising articles, citation generator",
    studentWin:
      "Free paraphraser and summariser. Also has a free citation generator that supports APA, MLA, Chicago.",
    verdict:
      "The citation generator alone makes this worth bookmarking. Summarise a 20-page paper in 30 seconds.",
    color: "#4caf50",
  },
  {
    rank: 9,
    name: "Elicit",
    slug: "elicit",
    emoji: "🧪",
    tagline: "Best for academic research & literature reviews",
    pricing: "Freemium",
    bestFor: "Literature reviews, finding papers, research summaries",
    studentWin:
      "Searches academic databases and summarises papers automatically. Built for researchers.",
    verdict:
      "If you're writing a literature review or dissertation, Elicit saves you days of manual searching.",
    color: "#7c6af5",
  },
  {
    rank: 10,
    name: "Otter.ai",
    slug: "otter-ai",
    emoji: "🎙️",
    tagline: "Best for lecture transcription & notes",
    pricing: "Free + Paid",
    bestFor: "Recording lectures, meeting notes, interview transcripts",
    studentWin:
      "Free tier gives 300 minutes of transcription per month — enough for most students.",
    verdict:
      "Record your lecture, get a full transcript and AI summary. Never miss a key point again.",
    color: "#ff6b6b",
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
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best AI Tools for Students in 2026 (Free & Paid) | AI Compass</title>
        <meta
          name="description"
          content="The 10 best AI tools for students in 2026 — tested and ranked. Free tools for essays, research, coding, presentations and more. Find your perfect student AI stack."
        />
        <meta
          name="keywords"
          content="best AI tools for students, free AI tools students, AI for college students, AI tools for studying, ChatGPT for students, AI essay tools"
        />
        <link rel="canonical" href="https://ai-compass.in/best-ai-tools-for-students" />
        <meta property="og:title" content="10 Best AI Tools for Students in 2026 | AI Compass" />
        <meta property="og:description" content="Free and paid AI tools for essays, research, coding, and more — ranked for students." />
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
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-white text-slate-900 dark:bg-[#0a0f1e] dark:text-slate-200 font-serif">

        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-indigo-300 bg-indigo-50 px-4 py-1.5 text-[13px] uppercase tracking-widest text-indigo-600 mb-6 font-sans dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
            Updated April 2026 · 10 tools reviewed
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-slate-900 dark:text-slate-100 mb-5">
            The 10 Best AI Tools for Students in 2026
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-slate-600 dark:text-slate-400 max-w-[640px] mx-auto mb-8 font-sans">
            There are thousands of AI tools. Most aren't worth your time. These 10 are — ranked by how much they actually help students with essays, research, coding, and staying organised.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-slate-500 dark:text-slate-500">
            {["✅ All have free tiers", "✅ Tested by students", "✅ No sponsored rankings"].map(t => (
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
                    <span className="font-sans text-[12px] rounded-full bg-slate-100 px-3 py-0.5 text-slate-500 dark:bg-white/5 dark:text-slate-400">{tool.pricing}</span>
                  </div>
                  <p className="font-sans text-[14px] italic text-slate-500 dark:text-slate-400 m-0">{tool.tagline}</p>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-3 mb-4 font-sans text-[13px]">
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Best for</p>
                  <p className="text-slate-600 dark:text-slate-400 m-0 leading-[1.5]">{tool.bestFor}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/[0.03]">
                  <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-1">Student win</p>
                  <p className="text-slate-600 dark:text-slate-400 m-0 leading-[1.5]">{tool.studentWin}</p>
                </div>
              </div>

              {/* Verdict */}
              <p className="font-sans text-[14px] leading-[1.7] text-slate-700 dark:text-slate-300 mb-5">
                <strong className="text-slate-900 dark:text-slate-100">Our take: </strong>{tool.verdict}
              </p>

              {/* CTA */}
              <Link
                to={`/tools/${tool.slug}`}
                className="inline-flex items-center gap-1.5 font-sans text-[13px] font-semibold no-underline"
                style={{ color: tool.color }}
              >
                View full details →
              </Link>
            </div>
          ))}
        </div>

        {/* Stack builder CTA */}
        <div className="mx-auto max-w-[860px] px-6 mt-16">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-10 dark:border-indigo-500/20 dark:bg-gradient-to-br dark:from-indigo-500/10 dark:to-purple-500/5">
            <h2 className="text-[1.6rem] font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-4">
              How to build your student AI stack
            </h2>
            <p className="font-sans text-[15px] leading-[1.75] text-slate-600 dark:text-slate-400 mb-5">
              Don't try to use all 10 at once. Start with 3 tools that cover your most common tasks, then expand from there.
            </p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 font-sans mb-6">
              {stacks.map(s => (
                <div key={s.label} className="rounded-lg bg-white p-4 shadow-sm dark:bg-white/5">
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-2 font-semibold">{s.label}</p>
                  <p className="text-[13px] text-slate-700 dark:text-slate-300 m-0 leading-[1.6]">{s.tools}</p>
                </div>
              ))}
            </div>
            <Link
              to="/ai-tool-finder"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 font-sans text-[14px] font-semibold text-white no-underline transition hover:bg-indigo-500"
            >
              Get your personalised stack →
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
            <Link to="/best-free-ai-tools" className="text-[14px] font-semibold text-indigo-600 no-underline hover:text-indigo-500 dark:text-indigo-400">
              Best free AI tools →
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
