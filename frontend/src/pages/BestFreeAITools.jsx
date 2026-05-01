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

      <div style={{ minHeight: "100vh", backgroundColor: "#0a0f1e", color: "#e2e8f0", fontFamily: "'Georgia', serif" }}>
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "80px 24px 48px", textAlign: "center" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(16,163,127,0.15)",
            border: "1px solid rgba(16,163,127,0.3)",
            borderRadius: "999px",
            padding: "6px 16px",
            fontSize: "13px",
            color: "#6ee7b7",
            marginBottom: "24px",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontFamily: "system-ui, sans-serif",
          }}>
            ₹0 · No credit card · Updated April 2026
          </div>

          <h1 style={{
            fontSize: "clamp(2rem, 5vw, 3.2rem)",
            fontWeight: "700",
            lineHeight: "1.15",
            marginBottom: "20px",
            color: "#f1f5f9",
            letterSpacing: "-0.02em",
          }}>
            The 10 Best Free AI Tools in 2026
          </h1>

          <p style={{
            fontSize: "1.15rem",
            lineHeight: "1.75",
            color: "#94a3b8",
            maxWidth: "640px",
            margin: "0 auto 32px",
            fontFamily: "system-ui, sans-serif",
          }}>
            You don't need to spend money to use powerful AI. These 10 tools have free tiers that are genuinely useful — not crippled demos. Ranked by how good the free plan actually is.
          </p>

          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap", fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#64748b" }}>
            {["✅ All free to start", "✅ No credit card required", "✅ Works in India"].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "0 auto 48px", padding: "0 24px" }}>
          <div style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "20px 24px",
            fontFamily: "system-ui, sans-serif",
          }}>
            <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick jump</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {tools.map(t => (
                <a key={t.slug} href={`#${t.slug}`} style={{
                  fontSize: "13px", color: "#94a3b8", textDecoration: "none",
                  background: "rgba(255,255,255,0.05)", padding: "4px 12px", borderRadius: "6px",
                }}
                  onMouseEnter={e => e.target.style.color = "#e2e8f0"}
                  onMouseLeave={e => e.target.style.color = "#94a3b8"}
                >
                  {t.rank}. {t.name}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 24px" }}>
          {tools.map((tool) => (
            <div key={tool.slug} id={tool.slug} style={{
              marginBottom: "40px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderLeft: `3px solid ${tool.color}`,
              borderRadius: "12px",
              padding: "28px 32px",
              scrollMarginTop: "80px",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "16px" }}>
                <div style={{
                  fontSize: "2rem", width: "52px", height: "52px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,0.05)", borderRadius: "10px", flexShrink: 0,
                }}>{tool.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "11px", fontWeight: "700", color: tool.color, textTransform: "uppercase", letterSpacing: "0.1em" }}>#{tool.rank}</span>
                    <h2 style={{ fontSize: "1.3rem", fontWeight: "700", color: "#f1f5f9", margin: 0, letterSpacing: "-0.01em" }}>{tool.name}</h2>
                    <span style={{
                      fontFamily: "system-ui, sans-serif", fontSize: "11px",
                      background: "rgba(16,163,127,0.15)", border: "1px solid rgba(16,163,127,0.3)",
                      padding: "2px 10px", borderRadius: "999px", color: "#6ee7b7", fontWeight: "600",
                    }}>{tool.badge}</span>
                  </div>
                  <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "14px", color: "#64748b", margin: 0, fontStyle: "italic" }}>{tool.tagline}</p>
                </div>
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
                marginBottom: "16px", fontFamily: "system-ui, sans-serif", fontSize: "13px",
              }}>
                <div style={{ background: "rgba(16,163,127,0.06)", border: "1px solid rgba(16,163,127,0.15)", borderRadius: "8px", padding: "12px 14px" }}>
                  <p style={{ color: "#10a37f", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: "600" }}>Free tier includes</p>
                  <p style={{ color: "#94a3b8", margin: 0, lineHeight: "1.5" }}>{tool.freeLimit}</p>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "12px 14px" }}>
                  <p style={{ color: "#475569", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Best for</p>
                  <p style={{ color: "#94a3b8", margin: 0, lineHeight: "1.5" }}>{tool.bestFor}</p>
                </div>
              </div>

              <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "14px", lineHeight: "1.7", color: "#cbd5e1", margin: "0 0 20px" }}>
                <strong style={{ color: "#e2e8f0" }}>Free tier verdict: </strong>{tool.freeVerdict}
              </p>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <Link to={`/tools/${tool.slug}`} style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  fontFamily: "system-ui, sans-serif", fontSize: "13px",
                  color: tool.color, textDecoration: "none", fontWeight: "600",
                }}>
                  View full details →
                </Link>
                <span style={{ fontFamily: "system-ui, sans-serif", fontSize: "12px", color: "#475569" }}>
                  Paid from {tool.paidPlan}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: "860px", margin: "64px auto 0", padding: "0 24px" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#f1f5f9", marginBottom: "24px", letterSpacing: "-0.02em" }}>
            4 tips to get the most out of free AI tools
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
            {tips.map(tip => (
              <div key={tip.title} style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "10px", padding: "20px",
              }}>
                <div style={{ fontSize: "1.5rem", marginBottom: "10px" }}>{tip.icon}</div>
                <h3 style={{ fontFamily: "system-ui, sans-serif", fontSize: "14px", fontWeight: "600", color: "#e2e8f0", marginBottom: "8px" }}>{tip.title}</h3>
                <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "13px", color: "#64748b", margin: 0, lineHeight: "1.6" }}>{tip.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "64px auto 0", padding: "0 24px" }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(16,163,127,0.1), rgba(99,102,241,0.05))",
            border: "1px solid rgba(16,163,127,0.2)",
            borderRadius: "16px", padding: "40px", textAlign: "center",
          }}>
            <h2 style={{ fontSize: "1.4rem", fontWeight: "700", color: "#f1f5f9", marginBottom: "12px", letterSpacing: "-0.02em" }}>
              Not sure which free tools to start with?
            </h2>
            <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "15px", color: "#94a3b8", marginBottom: "24px" }}>
              Answer 3 quick questions and get a personalised free AI stack built for your exact workflow.
            </p>
            <Link to="/ai-tool-finder" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: "#10a37f", color: "#fff", padding: "12px 28px",
              borderRadius: "8px", textDecoration: "none",
              fontFamily: "system-ui, sans-serif", fontSize: "14px", fontWeight: "600",
            }}>
              Find my free AI stack →
            </Link>
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "64px auto 0", padding: "0 24px" }}>
          <h2 style={{ fontSize: "1.6rem", fontWeight: "700", color: "#f1f5f9", marginBottom: "32px", letterSpacing: "-0.02em" }}>
            Frequently asked questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "10px", padding: "20px 24px",
              }}>
                <h3 style={{ fontFamily: "system-ui, sans-serif", fontSize: "15px", fontWeight: "600", color: "#e2e8f0", marginBottom: "10px" }}>{faq.q}</h3>
                <p style={{ fontFamily: "system-ui, sans-serif", fontSize: "14px", lineHeight: "1.7", color: "#94a3b8", margin: 0 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "64px auto 80px", padding: "0 24px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <p style={{ color: "#475569", fontSize: "14px", marginBottom: "8px" }}>Also read</p>
          <div style={{ display: "flex", gap: "24px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/best-ai-tools-for-students" style={{ color: "#6366f1", fontSize: "14px", textDecoration: "none", fontWeight: "600" }}>
              Best AI tools for students →
            </Link>
            <Link to="/tools" style={{ color: "#6366f1", fontSize: "14px", textDecoration: "none", fontWeight: "600" }}>
              Browse all 450+ tools →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}