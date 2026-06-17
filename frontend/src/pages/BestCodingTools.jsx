import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles, Code2, Terminal, Cpu, Database, Check, X, ShieldAlert, GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { useCatalogStats } from "../hooks/useCatalogStats";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";
import { toolHoverHandlers, alternativesHoverHandlers } from "../lib/prefetch";

const MotionDiv = motion.div;
const FALLBACK_TOOL_COUNT = 400;

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

const LAST_REVIEWED = "June 2026";

function getOutboundUrl(tool) {
  if (tool.slug) return { url: `/go/${encodeURIComponent(tool.slug)}`, isAffiliate: false };
  return { url: null, isAffiliate: false };
}

const tools = [
  {
    rank: 1,
    name: "Cursor",
    slug: "cursor",
    iconUrl: "https://logo.clearbit.com/cursor.com",
    tagline: "AI-first code editor — fork of VS Code with codebase indexing",
    pricing: "Free + Pro $20/mo",
    bestFor: "CS coursework, side projects, learning a new stack, refactoring legacy code",
    studentWin: "Free tier ships with Claude and GPT-4o integrated; Composer mode edits across multiple files simultaneously",
    verdict: "The absolute standard for developer productivity. The codebase indexing actually works.",
    color: "#000000",
  },
  {
    rank: 2,
    name: "GitHub Copilot",
    slug: "github-copilot",
    iconUrl: "https://logo.clearbit.com/github.com",
    tagline: "The fastest inline autocomplete assistant",
    pricing: "FREE for verified students",
    bestFor: "Autocomplete, boilerplate, framework lookups",
    studentWin: "100% free through the GitHub Student Developer Pack. Integrates directly inside VS Code, JetBrains, and Neovim",
    verdict: "Lowest developer friction. The free student pack makes it a mandatory install.",
    color: "#6e40c9",
  },
  {
    rank: 3,
    name: "Claude Code",
    slug: "claude-code",
    iconUrl: "https://logo.clearbit.com/anthropic.com",
    tagline: "Anthropic's terminal AI agent — run Claude inside your repo",
    pricing: "Pay-as-you-go API costs",
    bestFor: "Multi-file refactors, debugging failing tests via console",
    studentWin: "Can execute terminal tasks, compile files, and fix bugs autonomously via command line",
    verdict: "Ideal when you want an agent to debug complex code directly in your terminal.",
    color: "#cc785c",
  },
];

const editorComparison = {
  headers: ["Feature", "VS Code (Extension Model)", "Cursor (Fork)", "Antigravity (Google DeepMind)"],
  rows: [
    {
      name: "Codebase Context",
      vscode: "Limited (file-by-file)",
      cursor: "High (local vector index)",
      antigravity: "Full (multimodal graph database)",
    },
    {
      name: "Multi-file Edits",
      vscode: "Manual / Search-Replace",
      cursor: "Composer (Cmd+I) UI",
      antigravity: "Parallel agent coordination",
    },
    {
      name: "Agentic Autonomy",
      vscode: "None (extensions only)",
      cursor: "Moderate (Composer Agent)",
      antigravity: "Complete (isolated branched sandboxes)",
    },
    {
      name: "Planning Mode",
      vscode: "No",
      cursor: "Basic text overview",
      antigravity: "Structured implementation plan + approval",
    },
    {
      name: "System Integration",
      vscode: "Extension sandbox",
      cursor: "Terminal permissions",
      antigravity: "Secure parallel workspace branching",
    },
    {
      name: "Cost",
      vscode: "100% Free",
      cursor: "Free tier / $20/mo Pro",
      antigravity: "Free student license",
    },
  ],
};

const agentComparison = {
  headers: ["Capability", "GitHub Copilot", "Claude Code", "Antigravity Agent Manager"],
  rows: [
    {
      name: "Execution Format",
      copilot: "IDE Extension (Inline)",
      claude: "CLI Terminal App",
      agentManager: "IDE-Integrated Agent Orchestrator",
    },
    {
      name: "Autonomy",
      copilot: "Passive (Assistive autocomplete)",
      claude: "Active (Executes terminal commands)",
      agentManager: "Autonomous (Spawns and manages subagents)",
    },
    {
      name: "Sandbox / Testing",
      copilot: "No sandbox support",
      claude: "Runs directly on host terminal",
      agentManager: "Full sandboxed workspace branching",
    },
    {
      name: "Task Planning",
      copilot: "No (instant chat only)",
      claude: "Implicit path planning",
      agentManager: "Explicit plan.md / approval cycle",
    },
    {
      name: "Agent Cooperation",
      copilot: "None",
      claude: "Single-agent loop",
      agentManager: "Multi-agent swarm (Research/Self/Test)",
    },
    {
      name: "Primary Model",
      copilot: "GPT-4o / Gemini 1.5 Pro",
      claude: "Claude 3.7 Sonnet (Agentic)",
      agentManager: "Gemini 2.5 Ultra / DeepMind Coding",
    },
  ],
};

const faqs = [
  {
    q: "How do I get GitHub Copilot for free?",
    a: "Apply for the GitHub Student Developer Pack with your school email. Once approved, Copilot is activated in your account settings automatically.",
  },
  {
    q: "Should I switch from VS Code to Cursor or Antigravity?",
    a: "If you work on large projects with multiple files, yes. Cursor and Antigravity provide native codebase indexing which allows the AI to understand your files together, saving you from constant copy-pasting.",
  },
  {
    q: "What is an Agent Manager in AI coding?",
    a: "An Agent Manager (like Antigravity's) goes beyond simple chat. It can define, launch, and coordinate specialized subagents (e.g., a researcher to read docs and a coder to make edits) in isolated branches to complete complex tasks autonomously.",
  },
];

export default function BestCodingTools() {
  const { totalTools } = useCatalogStats();
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>Best Coding Tools for Students — AI Compass</title>
        <meta
          name="description"
          content="The best AI coding tools for student developers — Cursor, GitHub Copilot, Claude Code, and more. Features comparative analysis of text editors and agent managers."
        />
        <meta
          name="keywords"
          content="AI coding tools, best coding tools, Cursor vs VS Code, GitHub Copilot vs Claude Code, Antigravity, coding agent manager, student developers"
        />
        <link rel="canonical" href="https://ai-compass.in/best-coding-tools-for-students" />
      </Helmet>

      <div className="font-serif">
        {/* Hero */}
        <div className="mx-auto max-w-[960px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            Updated June 2026 · CS & Engineering Curation
          </div>
          <h1 className="text-[clamp(2.2rem,6vw,3.6rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>The Best AI Coding Tools</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[680px] mx-auto mb-8 font-sans">
            AI has changed software engineering. We analyzed and compared the top AI-native editors 
            and autonomous agents to help you select the ultimate developer stack.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["🚀 Codebase-wide context", "🤖 Agentic task execution", "🎓 Student benefits included"].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1 text-xs font-medium text-ink-2 font-sans">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Verified: {LAST_REVIEWED}
            </span>
          </p>
        </div>

        {/* COMPARATIVE ANALYSIS SECTION: EDITORS */}
        <div className="mx-auto max-w-[960px] px-6 mb-16 font-sans">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Code2 className="h-6 w-6 text-accent" /> Editor Battleground: Antigravity vs. Cursor vs. VS Code
          </h2>
          <p className="text-muted text-sm md:text-base leading-relaxed mb-6 font-serif">
            Selecting the right editor dictates your daily workflow. The comparison below contrasts the classic 
            <strong>VS Code</strong> extension model with modern AI-native interfaces like <strong>Cursor</strong> and 
            the state-of-the-art agentic sandbox environment of <strong>Antigravity</strong>.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-line bg-bg-elev shadow-sm mb-8">
            <table className="w-full border-collapse text-left text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-line bg-bg-sunk text-xs font-semibold uppercase tracking-wider text-ink-2">
                  {editorComparison.headers.map((h, idx) => (
                    <th key={idx} className="px-5 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {editorComparison.rows.map((row, idx) => (
                  <tr key={idx} className="transition-colors hover:bg-accent-soft/10">
                    <td className="px-5 py-4 font-semibold text-ink">{row.name}</td>
                    <td className="px-5 py-4 text-muted">{row.vscode}</td>
                    <td className="px-5 py-4 text-muted">{row.cursor}</td>
                    <td className="px-5 py-4 font-medium text-accent bg-accent-soft/5">{row.antigravity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Quick analysis cards for Editors */}
          <div className="grid md:grid-cols-3 gap-5 mb-16">
            <div className="p-5 rounded-xl border border-line bg-bg-elev/40">
              <h4 className="font-bold text-base mb-2">VS Code (Baseline)</h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                Best for developers who want complete control over their ecosystem and prefer a lightweight core IDE, 
                relying on standard extensions (like GitHub Copilot) for auxiliary autocomplete support.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-line bg-bg-elev/40">
              <h4 className="font-bold text-base mb-2">Cursor (AI-First Fork)</h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                Excellent for rapid multi-file editing and code generation. Features native codebase embedding indexing, 
                making context-aware chat much more reliable than copy-pasting.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-line bg-accent-soft/10 border-accent/20">
              <h4 className="font-bold text-base text-accent mb-2 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> Antigravity (Agent-Native)
              </h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                Built by DeepMind specifically for advanced agentic coding. Coordinates multiple specialized subagents in isolated 
                sandboxed branches, running test verification automatically before applying changes.
              </p>
            </div>
          </div>
        </div>

        {/* COMPARATIVE ANALYSIS SECTION: AGENTS */}
        <div className="mx-auto max-w-[960px] px-6 mb-16 font-sans">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Terminal className="h-6 w-6 text-accent" /> Assistant vs. Agent: Copilot vs. Claude Code vs. Antigravity Agent Manager
          </h2>
          <p className="text-muted text-sm md:text-base leading-relaxed mb-6 font-serif">
            Assistants write code *with* you, whereas Agents write code *for* you. Below, we dissect the difference between 
            inline autocompleters, terminal coding loops, and parallel agent management systems.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-line bg-bg-elev shadow-sm mb-8">
            <table className="w-full border-collapse text-left text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-line bg-bg-sunk text-xs font-semibold uppercase tracking-wider text-ink-2">
                  {agentComparison.headers.map((h, idx) => (
                    <th key={idx} className="px-5 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {agentComparison.rows.map((row, idx) => (
                  <tr key={idx} className="transition-colors hover:bg-accent-soft/10">
                    <td className="px-5 py-4 font-semibold text-ink">{row.name}</td>
                    <td className="px-5 py-4 text-muted">{row.copilot}</td>
                    <td className="px-5 py-4 text-muted">{row.claude}</td>
                    <td className="px-5 py-4 font-medium text-accent bg-accent-soft/5">{row.agentManager}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Quick analysis cards for Agents */}
          <div className="grid md:grid-cols-3 gap-5 mb-16">
            <div className="p-5 rounded-xl border border-line bg-bg-elev/40">
              <h4 className="font-bold text-base mb-2">GitHub Copilot</h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                The best helper for fast boilerplate generation, loop writing, and inline comments. It acts as an active autocomplete 
                rather than an independent task executor.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-line bg-bg-elev/40">
              <h4 className="font-bold text-base mb-2">Claude Code CLI</h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                A terminal-based agent that is highly capable at running tests and debugging errors locally in real-time, 
                though limited to a text-only command interface.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-line bg-accent-soft/10 border-accent/20">
              <h4 className="font-bold text-base text-accent mb-2 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" /> Antigravity Agent Manager
              </h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                DeepMind's framework for launching specialized subagents (researchers, testers, programmers). Operates on isolated 
                branches, validating code compilations and test execution prior to delivery.
              </p>
            </div>
          </div>
        </div>

        {/* STEP-BY-STEP PRO LINKS */}
        <div className="mx-auto max-w-[860px] px-6 mb-16 font-sans">
          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="rounded-2xl border border-accent bg-accent-soft/10 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <div>
              <h3 className="text-lg md:text-xl font-bold mb-2 flex items-center gap-1.5">
                <GraduationCap className="h-5 w-5 text-accent" /> Student Developer Perks
              </h3>
              <p className="text-sm text-muted leading-relaxed font-serif max-w-xl">
                Don't pay for coding tools out of pocket. Claim free access to GitHub Copilot, JetBrains, 
                and other premium student software using our verified step-by-step guides.
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
              <Link
                to="/guides/github-student-pack"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-accent text-bg font-semibold text-xs transition hover:opacity-90"
              >
                Claim GitHub Student Pack <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/guides/jetbrains-student-license"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-line bg-bg-elev text-ink font-semibold text-xs transition hover:bg-bg-sunk"
              >
                Claim JetBrains License <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </MotionDiv>
        </div>

        {/* INDIVIDUAL TOOLS SECTION */}
        <div className="mx-auto max-w-[860px] px-6 mb-16 font-sans">
          <h2 className="text-2xl font-bold mb-8">Detailed Tool Reviews</h2>
          <MotionDiv
            variants={staggerParent}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-5% 0px' }}
            className="space-y-8"
          >
            {tools.map((tool, idx) => {
              const isHero = tool.rank === 1;
              return (
                <MotionDiv
                  key={tool.slug}
                  variants={staggerChild}
                  custom={idx * 0.04}
                  id={tool.slug}
                  className={`relative p-6 md:p-8 rounded-3xl border border-line transition-all hover:border-line-strong hover:shadow-md ${isHero ? 'bg-gradient-to-br from-bg-elev to-accent-soft/30 ring-1 ring-accent/20' : 'bg-bg-elev'}`}
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex items-center md:items-start gap-4">
                      <span className="text-4xl font-extrabold text-accent/15 select-none font-mono">
                        {String(tool.rank).padStart(2, '0')}
                      </span>
                      <div className="h-12 w-12 rounded-xl bg-white border border-line flex items-center justify-center overflow-hidden shrink-0">
                        <BrandIcon tool={tool} isHero={false} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                        <h3 className="text-xl font-bold text-ink">{tool.name}</h3>
                        <span className="text-xs px-2.5 py-1 rounded-full border border-line bg-bg-sunk text-ink-2 font-medium">
                          {tool.pricing}
                        </span>
                      </div>
                      <p className="text-sm text-muted mb-4 font-serif leading-relaxed">{tool.tagline}</p>
                      <dl className="space-y-2 border-y border-line/60 py-4 mb-4 text-xs md:text-sm">
                        <div className="flex flex-col sm:flex-row">
                          <dt className="font-bold text-ink-2 sm:w-28 shrink-0">Best for</dt>
                          <dd className="text-muted">{tool.bestFor}</dd>
                        </div>
                        <div className="flex flex-col sm:flex-row">
                          <dt className="font-bold text-ink-2 sm:w-28 shrink-0">Student Win</dt>
                          <dd className="text-muted">{tool.studentWin}</dd>
                        </div>
                      </dl>
                      <div className="bg-accent-soft/45 rounded-xl p-4 mb-4 text-sm font-medium italic text-accent-ink font-serif">
                        &ldquo;{tool.verdict}&rdquo;
                      </div>
                      <div className="flex items-center gap-3">
                        <a
                          href={`/go/${tool.slug}`}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:underline"
                        >
                          Visit Site <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                        <Link
                          to={`/tools/${tool.slug}`}
                          className="text-xs font-semibold text-muted hover:text-ink transition-colors"
                        >
                          Read Details →
                        </Link>
                      </div>
                    </div>
                  </div>
                </MotionDiv>
              );
            })}
          </MotionDiv>
        </div>

        {/* FAQs */}
        <div className="mx-auto max-w-[860px] px-6 mt-16 font-sans">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
            <Database className="h-6 w-6 text-accent" /> Frequently Asked Questions
          </h2>
          <div className="grid md:grid-cols-2 gap-6 mb-20">
            {faqs.map((faq, idx) => (
              <div key={idx} className="p-5 rounded-2xl border border-line bg-bg-elev/20">
                <h4 className="font-bold text-base md:text-lg mb-2">{faq.q}</h4>
                <p className="text-muted text-sm leading-relaxed font-serif">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
