import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles, Shield, Cpu, RefreshCw, Layers } from "lucide-react";
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
    name: "DuckDuckGo AI Chat",
    slug: "duckduckgo-ai-chat",
    iconUrl: "https://logo.clearbit.com/duckduckgo.com",
    tagline: "100% Free, anonymous access to top models",
    freeLimit: "Unlimited free chat (subject to fair use caps)",
    paidPlan: "N/A — completely free",
    bestFor: "Anonymous essay ideas, basic code generation, and Q&A without tracking",
    studentTip: "Toggle between Claude 3 Haiku, Llama 3, Mixtral, and Gemma models on the fly to get different perspectives on the same essay topic.",
    limitation: "Does not support file uploads, image generation, or real-time web browsing.",
    freeVerdict:
      "A privacy advocate's dream. Completely free access to top-tier models with absolutely zero account requirements or subscription prompts.",
    color: "#de5833",
    badge: "No Account Required",
  },
  {
    rank: 2,
    name: "LM Studio",
    slug: "lm-studio",
    iconUrl: "https://logo.clearbit.com/lmstudio.ai",
    tagline: "Run powerful AI models locally on your PC or Mac",
    freeLimit: "Unlimited lifetime use, offline execution",
    paidPlan: "N/A — 100% free for personal use",
    bestFor: "CS homework, secure research, private writing",
    studentTip: "Download lightweight models like Llama 3 8B or Mistral 7B. They run smoothly on mid-range laptops and don't require an active internet connection.",
    limitation: "Requires a modern machine with a decent GPU or Apple Silicon chip for fast response rates.",
    freeVerdict:
      "The gold standard for local LLM tools. Runs completely offline, keeping your transcripts 100% private and bypass-proof.",
    color: "#6366f1",
    badge: "100% Local & Private",
  },
  {
    rank: 3,
    name: "Upscayl",
    slug: "upscayl",
    iconUrl: "https://logo.clearbit.com/upscayl.org",
    tagline: "Open-source AI image upscaler and enhancer",
    freeLimit: "Unlimited batch image upscaling up to 8x",
    paidPlan: "N/A — fully open-source and free",
    bestFor: "Enhancing presentation graphics, resume headshots, and design assets",
    studentTip: "Use the 'Double Upscayl' option to scale blurry charts or graphs from old research papers into crisp, high-resolution figures.",
    limitation: "Processes images locally, which can take several seconds per image depending on your graphics card.",
    freeVerdict:
      "Beats commercial web-based upscalers hands down. No watermarks, no resolution limits, and zero credits to buy.",
    color: "#10b981",
    badge: "No Watermarks",
  },
  {
    rank: 4,
    name: "Hugging Face Chat",
    slug: "hugging-face",
    iconUrl: "https://logo.clearbit.com/huggingface.co",
    tagline: "Free playground for the world's best open LLMs",
    freeLimit: "Unlimited access to Llama 3, Command R+, Phi-3, and Mistral",
    paidPlan: "N/A — completely free playground",
    bestFor: "Trying open-source models, customizing system prompts, and programming research",
    studentTip: "Check the 'System Prompt' field under settings to instruct the model to act as a strict tutor that guides you rather than giving answers.",
    limitation: "Can experience high server load during peak hours, causing slower generation times.",
    freeVerdict:
      "Access the bleeding edge of open-source AI in a simple, web-based UI with zero upgrades or premium walls.",
    color: "#ffd21e",
    badge: "Open Source Hub",
  },
  {
    rank: 5,
    name: "Whisper (Buzz)",
    slug: "buzz-whisper",
    iconUrl: "https://logo.clearbit.com/github.com",
    tagline: "Open-source local transcription app powered by OpenAI Whisper",
    freeLimit: "Unlimited transcribing duration, zero server fees",
    paidPlan: "N/A — free desktop client",
    bestFor: "Transcribing long lectures, seminar records, and project interviews",
    studentTip: "Select the 'Medium' or 'Large' Whisper models if you have an Apple Silicon Mac or dedicated GPU; it matches human accuracy for complex vocabulary.",
    limitation: "The large model file downloads take up a few gigabytes of disk space during installation.",
    freeVerdict:
      "Say goodbye to subscription-based transcription tools. Transcribe hours of lectures directly on your machine for free.",
    color: "#24292e",
    badge: "Unlimited Transcription",
  },
  {
    rank: 6,
    name: "Fooocus",
    slug: "fooocus",
    iconUrl: "https://logo.clearbit.com/github.com",
    tagline: "Offline AI image generator with Midjourney-grade quality",
    freeLimit: "Unlimited offline image generation",
    paidPlan: "N/A — run locally for free",
    bestFor: "Stunning presentation artwork, poster designs, and artistic prompts",
    studentTip: "Use the built-in 'Styles' library to easily generate images in technical drawing, anime, or architectural mockups without learning complex prompts.",
    limitation: "Requires a high-end Nvidia graphic card (minimum 6GB VRAM) to run efficiently on Windows.",
    freeVerdict:
      "Stunning SDXL rendering engine wrapped in a highly simplified UI. 100% free, private, and customizable on your machine.",
    color: "#ec4899",
    badge: "Local Midjourney Alternative",
  },
  {
    rank: 7,
    name: "Jan.ai",
    slug: "jan-ai",
    iconUrl: "https://logo.clearbit.com/jan.ai",
    tagline: "Open-source, offline-first chat client for your desktop",
    freeLimit: "Unlimited offline local model chat",
    paidPlan: "N/A — completely free and local",
    bestFor: "Secure code debugging, note formatting, private question answering",
    studentTip: "Link your local notes folder to Jan using its extensions to chat directly with your semesters' lecture notes offline.",
    limitation: "Requires manually downloading models from Hugging Face through their in-app search.",
    freeVerdict:
      "A beautiful, clean chat interface modeled after ChatGPT but running entirely offline on your computer.",
    color: "#f59e0b",
    badge: "Offline Chat client",
  },
  {
    rank: 8,
    name: "Audacity with OpenVINO Plugins",
    slug: "audacity-openvino",
    iconUrl: "https://logo.clearbit.com/audacityteam.org",
    tagline: "Free local AI plugins for music, transcription, and noise removal",
    freeLimit: "Unlimited local audio processing",
    paidPlan: "N/A — open-source audio editor extension",
    bestFor: "Cleaning up lecture audio recordings, separating music track stems, and podcast projects",
    studentTip: "Run the 'Noise Suppression' plugin to scrub low hums or background chatter from lecture notes recorded on your phone.",
    limitation: "Currently works best on Windows machines with Intel CPUs or Nvidia GPUs.",
    freeVerdict:
      "Brings massive AI capabilities directly to the world's most popular free audio editor with zero cloud processing.",
    color: "#3b82f6",
    badge: "Intel OpenVINO Powered",
  },
  {
    rank: 9,
    name: "Pinokio",
    slug: "pinokio",
    iconUrl: "https://logo.clearbit.com/pinokio.computer",
    tagline: "The 1-click AI application installer and browser",
    freeLimit: "Unlimited local installs of complex machine learning tools",
    paidPlan: "N/A — free open-source script launcher",
    bestFor: "Running complex AI projects (like Stable Diffusion, Face Fusion, voice cloners) without code",
    studentTip: "Perfect for CS/Design students who want to test complex AI GitHub repos but don't want to wrestle with Python environments, CUDA paths, or terminal dependencies.",
    limitation: "Downloaded applications can consume massive hard drive space (often 10GB-30GB per model).",
    freeVerdict:
      "A complete game-changer. Solves the nightmare of local machine learning installations by automating scripts in 1 click.",
    color: "#1e293b",
    badge: "1-Click Script Installer",
  },
  {
    rank: 10,
    name: "GPT4All",
    slug: "gpt4all",
    iconUrl: "https://logo.clearbit.com/gpt4all.io",
    tagline: "Run lightweight local chat models on any CPU (no GPU needed)",
    freeLimit: "Unlimited offline use, search local documents",
    paidPlan: "N/A — Nomic AI open project",
    bestFor: "Searching PDFs, reading textbook data offline, general helper chatbot",
    studentTip: "Use the LocalDocs feature to point GPT4All to your courses' PDF folder. Ask it questions, and it will search and summarize the answers based exclusively on those documents.",
    limitation: "Local execution on CPU is slower than GPU, generating text at roughly 3-10 tokens per second.",
    freeVerdict:
      "The best local AI option for students without gaming laptops. Runs directly on normal CPUs (Intel/AMD/Apple M-series).",
    color: "#8b5cf6",
    badge: "Works on Regular Laptops",
  },
];

const tips = [
  {
    icon: "💻",
    title: "Embrace Local AI Tools",
    body: "By running tools like LM Studio or Upscayl directly on your laptop, you bypass all cloud limits, queue wait times, and monthly subscription paywalls entirely.",
  },
  {
    icon: "🔌",
    title: "Go completely offline",
    body: "Local models require zero internet. Use them to study on flights, trains, or in campus libraries with poor Wi-Fi, without any interruption or connection drops.",
  },
  {
    icon: "📂",
    title: "Chat with your private files",
    body: "Using tools like GPT4All LocalDocs, you can search and summarize your personal PDF library and course textbook files securely without uploading them to commercial servers.",
  },
  {
    icon: "🛑",
    title: "Disable VPNs for web freebies",
    body: "For free web services like DuckDuckGo AI Chat, make sure your VPN is disabled if you hit connection blocks. Many CDNs restrict access to known VPN IP ranges.",
  },
];

const faqs = [
  {
    q: "Why are these tools 100% free with no upgrade plans?",
    a: "Most tools on this list are open-source projects or run locally on your computer's own processor (CPU/GPU). Because the developers don't have to pay for expensive cloud computing servers, they can distribute the software completely free of charge.",
  },
  {
    q: "Do I need a powerful gaming computer to run local AI?",
    a: "Not necessarily. While image generators like Fooocus require a dedicated graphics card (Nvidia/AMD), chat clients like GPT4All are optimized to run on regular laptops using just the standard processor (CPU).",
  },
  {
    q: "Are these tools safe and private for student research?",
    a: "Yes, they are far safer than commercial cloud assistants. Because local apps (LM Studio, Jan, GPT4All, Whisper Buzz) process everything on your physical device, no data is uploaded to third-party databases, eliminating data leaks or academic tracking.",
  },
];

export default function BestFreeAITools() {
  const { totalTools } = useCatalogStats();
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>100% Free AI Tools Guide (No Subscriptions or Paywalls) | AI Compass</title>
        <meta
          name="description"
          content="Hand-tested 100% free AI tools with zero premium tiers, top-ups, or credit limits. Includes DuckDuckGo AI Chat, local desktop LLMs, and open-source enhancers."
        />
        <meta
          name="keywords"
          content="free AI tools, 100% free AI, open source AI tools, local LLM, run AI offline, free AI tools for students, no credit card AI"
        />
        <link rel="canonical" href="https://ai-compass.in/best-free-ai-tools" />
        <meta property="og:title" content="100% Free AI Tools Guide (No Subscriptions) | AI Compass" />
        <meta property="og:description" content="Hand-tested 100% free AI tools with zero premium tiers, top-ups, or credit limits. Includes DuckDuckGo AI Chat, local desktop LLMs, and open-source enhancers." />
        <meta property="og:url" content="https://ai-compass.in/best-free-ai-tools" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "100% Free AI Tools in 2026 — No Subscriptions or Paywalls",
          "description": "The best 100% free AI tools for students — featuring local LLMs, open-source enhancers, and anonymous web tools.",
          "url": "https://ai-compass.in/best-free-ai-tools",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-06-16",
          "dateModified": "2026-06-16",
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
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ai-compass.in/" },
            { "@type": "ListItem", "position": 2, "name": "Best Free AI Tools", "item": "https://ai-compass.in/best-free-ai-tools" },
          ],
        })}</script>
      </Helmet>

      <div className="font-serif">
        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            ₹0 · 100% Free · Local & Private · Updated June 2026
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>The 100% Free AI Toolbox</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            Tired of premium upgrades, daily word limits, and token top-up plans? We curated the best 
            AI tools that are <strong>genuinely 100% free</strong>—mostly open-source, local-first applications 
            with zero subscription models.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ No Credit Cards", "✅ No Upgrade Popups", "✅ Works Offline"].map(t => (
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

        {/* What "100% Free" actually means */}
        <div className="mx-auto max-w-[860px] px-6 mb-12">
          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-10% 0px' }}
            className="rounded-2xl border border-line bg-bg-elev p-6 md:p-8 font-sans"
          >
            <h2 className="text-lg font-semibold text-ink sm:text-xl flex items-center gap-2">
              <Shield className="h-5 w-5 text-accent" /> Why there are no catch-ups or limits
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span><strong>No Cloud Server Cost:</strong> By running AI on your own computer processor, there are no expensive API bills for developers to pass on to you.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span><strong>Open Source Licenses:</strong> Built by global open-source communities that champion free, privacy-first software access.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span><strong>No Account Signups:</strong> Web tools featured here (like DuckDuckGo AI) require zero logins or registration to function.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span><strong>Privacy First:</strong> Your prompts, text edits, and designs never leave your local hardware, making them 100% academic-safe.</span>
              </li>
            </ul>
          </MotionDiv>
        </div>

        {/* Quick Comparison Table */}
        <div className="mx-auto max-w-[860px] px-6 mb-12">
          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-10% 0px' }}
            className="overflow-x-auto rounded-2xl border border-line bg-bg-elev shadow-sm font-sans"
          >
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-bg-sunk text-xs font-semibold uppercase tracking-wider text-ink-2">
                  <th className="px-6 py-4">Tool</th>
                  <th className="px-6 py-4">Best For</th>
                  <th className="px-6 py-4">Execution Type</th>
                  <th className="px-6 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tools.map((t) => (
                  <tr key={t.slug} className="transition-colors hover:bg-accent-soft/15">
                    <td className="whitespace-nowrap px-6 py-4 font-semibold text-ink">
                      {t.rank}. {t.name}
                    </td>
                    <td className="px-6 py-4 text-muted">{t.bestFor}</td>
                    <td className="px-6 py-4 text-muted">
                      {t.badge.includes("Local") || t.badge.includes("Offline") ? "💻 Local PC/Mac" : "🌐 Web (Anonymous)"}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <a
                        href={`#${t.slug}`}
                        className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
                      >
                        Read More →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
            <p className="text-[12px] text-muted-2 mb-3 uppercase tracking-widest">Jump to tool walkthrough</p>
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
            const isHero = tool.rank === 1;
            return (
              <MotionDiv
                key={tool.slug}
                variants={staggerChild}
                custom={i * 0.04}
                id={tool.slug}
                className={`group relative mb-10 overflow-hidden rounded-3xl border border-line scroll-mt-20 transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-lg ${isHero ? 'bg-gradient-to-br from-bg-elev to-accent-soft/40 ring-1 ring-accent/30' : 'bg-bg-elev'}`}
              >
                {isHero ? (
                  <div className="px-6 pt-6 sm:px-8 sm:pt-8">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink font-sans">
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
                  <div className="min-w-0 font-sans">
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

                    <p className="mb-6 text-base leading-relaxed text-muted font-serif">
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
                          Free model
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.freeLimit}</dd>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                        <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2 sm:w-32">
                          Premium Cost
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.paidPlan}</dd>
                      </div>
                      {tool.studentTip && (
                        <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                          <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-accent sm:w-32">
                            How to use
                          </dt>
                          <dd className="text-sm font-medium leading-relaxed text-ink-2">{tool.studentTip}</dd>
                        </div>
                      )}
                      {tool.limitation && (
                        <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
                          <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-danger sm:w-32">
                            Hardware Catch
                          </dt>
                          <dd className="text-sm leading-relaxed text-muted">{tool.limitation}</dd>
                        </div>
                      )}
                    </dl>

                    {/* Verdict callout */}
                    <div className="mb-6 rounded-2xl bg-accent-soft px-5 py-4">
                      <p className="text-sm font-medium italic leading-relaxed text-accent-ink font-serif">
                        &ldquo;{tool.freeVerdict}&rdquo;
                      </p>
                    </div>

                    {/* CTA */}
                    {(() => {
                      const { url } = getOutboundUrl(tool);
                      return (
                        <div className="flex flex-wrap items-center gap-3">
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-all duration-200 hover:gap-3 hover:bg-ink-2"
                            >
                              Open Tool Site
                              <ArrowUpRight className="h-4 w-4" />
                            </a>
                          )}
                          <Link
                            to={`/tools/${tool.slug}`}
                            {...toolHoverHandlers(tool.slug)}
                            className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"
                          >
                            Read details →
                          </Link>
                          <Link
                            to={`/alternatives/${tool.slug}`}
                            {...alternativesHoverHandlers(tool.slug)}
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

        {/* Tips */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-[860px] px-6 mt-16 font-sans"
        >
          <h2 className="text-[1.6rem] font-bold tracking-tight text-ink mb-6">
            Pro tips for running local AI tools
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {tips.map(tip => (
              <div key={tip.title} className="rounded-xl border border-line bg-bg-elev p-5">
                <div className="text-[1.5rem] mb-2.5">{tip.icon}</div>
                <h3 className="text-[14px] font-semibold text-ink mb-2">{tip.title}</h3>
                <p className="text-[13px] text-muted m-0 leading-[1.6] font-serif">{tip.body}</p>
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
          className="mx-auto max-w-[860px] px-6 mt-16 font-sans"
        >
          <div className="rounded-2xl border border-accent bg-accent-soft p-10 text-center">
            <h2 className="text-[1.4rem] font-bold tracking-tight text-ink mb-3">
              Need a personalized recommendation?
            </h2>
            <p className="text-[15px] text-muted mb-6">
              Answer 4 questions and get a custom free AI stack selected specifically for your hardware setup.
            </p>
            <Link
              to="/ai-tool-finder"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-7 py-3 text-[14px] font-semibold text-bg no-underline transition hover:opacity-90"
            >
              Build my free AI stack →
            </Link>
          </div>
        </MotionDiv>

        {/* FAQ */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-[860px] px-6 mt-16 font-sans"
        >
          <h2 className="text-[1.6rem] font-bold tracking-tight text-ink mb-8">
            Frequently asked questions
          </h2>
          <div className="flex flex-col gap-4">
            {faqs.map((faq, i) => (
              <div key={i} className="rounded-xl border border-line bg-bg-elev p-6">
                <h3 className="text-[15px] font-semibold text-ink mb-2.5">{faq.q}</h3>
                <p className="text-[14px] leading-[1.7] text-muted m-0 font-serif">{faq.a}</p>
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
          <p className="text-[14px] text-muted-2 mb-2 font-serif">Read also</p>
          <div className="flex flex-wrap justify-center gap-6">
            <MagneticWrapper strength={0.2}>
              <Link to="/best-ai-tools-for-students" className="text-[14px] font-semibold text-accent no-underline hover:underline">
                Best AI tools for students →
              </Link>
            </MagneticWrapper>
            <Link to="/tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Browse all {displayCount} tools →
            </Link>
          </div>
        </MotionDiv>
      </div>
    </>
  );
}
