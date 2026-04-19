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
    color: "#ffffff",
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
        {/* Open Graph */}
        <meta property="og:title" content="10 Best AI Tools for Students in 2026 | AI Compass" />
        <meta property="og:description" content="Free and paid AI tools for essays, research, coding, and more — ranked for students." />
        <meta property="og:url" content="https://ai-compass.in/best-ai-tools-for-students" />
        <meta property="og:type" content="article" />
        {/* Schema.org Article markup */}
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best AI Tools for Students in 2026",
          "description": "The 10 best AI tools for students — ranked and reviewed for essays, research, coding, and productivity.",
          "url": "https://ai-compass.in/best-ai-tools-for-students",
          "publisher": {
            "@type": "Organization",
            "name": "AI Compass",
            "url": "https://ai-compass.in"
          },
          "datePublished": "2026-04-19",
          "dateModified": "2026-04-19"
        })}</script>
      </Helmet>

      <div style={{
        minHeight: "100vh",
        backgroundColor: "#0a0f1e",
        color: "#e2e8f0",
        fontFamily: "'Georgia', serif",
      }}>

        {/* Hero */}
        <div style={{
          maxWidth: "860px",
          margin: "0 auto",
          padding: "80px 24px 48px",
          textAlign: "center",
        }}>
          <div style={{
            display: "inline-block",
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: "999px",
            padding: "6px 16px",
            fontSize: "13px",
            color: "#a5b4fc",
            marginBottom: "24px",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontFamily: "system-ui, sans-serif",
          }}>
            Updated April 2026 · 10 tools reviewed
          </div>

          <h1 style={{
            fontSize: "clamp(2rem, 5vw, 3.2rem)",
            fontWeight: "700",
            lineHeight: "1.15",
            marginBottom: "20px",
            color: "#f1f5f9",
            letterSpacing: "-0.02em",
          }}>
            The 10 Best AI Tools for Students in 2026
          </h1>

          <p style={{
            fontSize: "1.15rem",
            lineHeight: "1.75",
            color: "#94a3b8",
            maxWidth: "640px",
            margin: "0 auto 32px",
            fontFamily: "system-ui, sans-serif",
          }}>
            There are thousands of AI tools. Most aren't worth your time. These 10 are — ranked by how much they actually help students with essays, research, coding, and staying organised.
          </p>

          <div style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            flexWrap: "wrap",
            fontFamily: "system-ui, sans-serif",
            fontSize: "13px",
            color: "#64748b",
          }}>
            {["✅ All have free tiers", "✅ Tested by students", "✅ No sponsored rankings"].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>

        {/* Quick nav */}
        <div style={{
          maxWidth: "860px",
          margin: "0 auto 48px",
          padding: "0 24px",
        }}>
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
                <a
                  key={t.slug}
                  href={`#${t.slug}`}
                  style={{
                    fontSize: "13px",
                    color: "#94a3b8",
                    textDecoration: "none",
                    background: "rgba(255,255,255,0.05)",
                    padding: "4px 12px",
                    borderRadius: "6px",
                    transition: "color 0.2s",
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

        {/* Tool cards */}
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0 24px" }}>
          {tools.map((tool, i) => (
            <div
              key={tool.slug}
              id={tool.slug}
              style={{
                marginBottom: "40px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderLeft: `3px solid ${tool.color}`,
                borderRadius: "12px",
                padding: "28px 32px",
                scrollMarginTop: "80px",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "16px" }}>
                <div style={{
                  fontSize: "2rem",
                  width: "52px",
                  height: "52px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "10px",
                  flexShrink: 0,
                }}>
                  {tool.emoji}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: "system-ui, sans-serif",
                      fontSize: "11px",
                      fontWeight: "700",
                      color: tool.color,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}>#{tool.rank}</span>
                    <h2 style={{
                      fontSize: "1.3rem",
                      fontWeight: "700",
                      color: "#f1f5f9",
                      margin: 0,
                      letterSpacing: "-0.01em",
                    }}>{tool.name}</h2>
                    <span style={{
                      fontFamily: "system-ui, sans-serif",
                      fontSize: "12px",
                      background: "rgba(255,255,255,0.06)",
                      padding: "2px 10px",
                      borderRadius: "999px",
                      color: "#64748b",
                    }}>{tool.pricing}</span>
                  </div>
                  <p style={{
                    fontFamily: "system-ui, sans-serif",
                    fontSize: "14px",
                    color: "#64748b",
                    margin: 0,
                    fontStyle: "italic",
                  }}>{tool.tagline}</p>
                </div>
              </div>

              {/* Details */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "16px",
                fontFamily: "system-ui, sans-serif",
                fontSize: "13px",
              }}>
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                }}>
                  <p style={{ color: "#475569", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Best for</p>
                  <p style={{ color: "#94a3b8", margin: 0, lineHeight: "1.5" }}>{tool.bestFor}</p>
                </div>
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                }}>
                  <p style={{ color: "#475569", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Student win</p>
                  <p style={{ color: "#94a3b8", margin: 0, lineHeight: "1.5" }}>{tool.studentWin}</p>
                </div>
              </div>

              {/* Verdict */}
              <p style={{
                fontFamily: "system-ui, sans-serif",
                fontSize: "14px",
                lineHeight: "1.7",
                color: "#cbd5e1",
                marginBottom: "20px",
                margin: "0 0 20px",
              }}>
                <strong style={{ color: "#e2e8f0" }}>Our take: </strong>{tool.verdict}
              </p>

              {/* CTA */}
              <Link
                to={`/tool/${tool.slug}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontFamily: "system-ui, sans-serif",
                  fontSize: "13px",
                  color: tool.color,
                  textDecoration: "none",
                  fontWeight: "600",
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={e => e.target.style.opacity = "0.7"}
                onMouseLeave={e => e.target.style.opacity = "1"}
              >
                View full details →
              </Link>
            </div>
          ))}
        </div>

        {/* How to build your stack */}
        <div style={{ maxWidth: "860px", margin: "64px auto 0", padding: "0 24px" }}>
          <div style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.05))",
            border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: "16px",
            padding: "40px",
          }}>
            <h2 style={{
              fontSize: "1.6rem",
              fontWeight: "700",
              color: "#f1f5f9",
              marginBottom: "16px",
              letterSpacing: "-0.02em",
            }}>
              How to build your student AI stack
            </h2>
            <p style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: "15px",
              lineHeight: "1.75",
              color: "#94a3b8",
              marginBottom: "20px",
            }}>
              Don't try to use all 10 at once. Start with 3 tools that cover your most common tasks, then expand from there.
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              fontFamily: "system-ui, sans-serif",
            }}>
              {[
                { label: "Starter stack (free)", tools: "ChatGPT + Grammarly + Perplexity" },
                { label: "For CS students", tools: "GitHub Copilot + ChatGPT + Notion AI" },
                { label: "For researchers", tools: "Elicit + Claude + Perplexity" },
                { label: "For presentations", tools: "Gamma + ChatGPT + Grammarly" },
              ].map(s => (
                <div key={s.label} style={{
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "10px",
                  padding: "16px",
                }}>
                  <p style={{ fontSize: "11px", color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px", fontWeight: "600" }}>{s.label}</p>
                  <p style={{ fontSize: "13px", color: "#cbd5e1", margin: 0, lineHeight: "1.6" }}>{s.tools}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "24px" }}>
              <Link
                to="/ai-tool-finder"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#6366f1",
                  color: "#fff",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  textDecoration: "none",
                  fontFamily: "system-ui, sans-serif",
                  fontSize: "14px",
                  fontWeight: "600",
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >
                Get your personalised stack →
              </Link>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: "860px", margin: "64px auto 0", padding: "0 24px" }}>
          <h2 style={{
            fontSize: "1.6rem",
            fontWeight: "700",
            color: "#f1f5f9",
            marginBottom: "32px",
            letterSpacing: "-0.02em",
          }}>
            Frequently asked questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: "10px",
                padding: "20px 24px",
              }}>
                <h3 style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: "15px",
                  fontWeight: "600",
                  color: "#e2e8f0",
                  marginBottom: "10px",
                }}>{faq.q}</h3>
                <p style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: "14px",
                  lineHeight: "1.7",
                  color: "#94a3b8",
                  margin: 0,
                }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div style={{
          maxWidth: "860px",
          margin: "64px auto 80px",
          padding: "0 24px",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
        }}>
          <p style={{ color: "#475569", fontSize: "14px", marginBottom: "8px" }}>
            Explore all 450+ AI tools on AI Compass
          </p>
          <Link
            to="/tools"
            style={{
              color: "#6366f1",
              fontSize: "14px",
              textDecoration: "none",
              fontWeight: "600",
            }}
          >
            Browse the full directory →
          </Link>
        </div>

      </div>
    </>
  );
}
