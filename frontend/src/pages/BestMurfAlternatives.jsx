import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";

const MotionDiv = motion.div;

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
      alt=""
      loading="lazy"
      className={isHero ? "h-12 w-12 object-contain md:h-14 md:w-14" : "h-10 w-10 object-contain md:h-12 md:w-12"}
      onError={() => {
        setStage((prev) => (prev === "primary" ? "fallback" : "letter"));
      }}
    />
  );
}

const LAST_REVIEWED = "May 2026";

const AFFILIATE_URLS = {
  "elevenlabs": "https://try.elevenlabs.io/2f10b9jmqa4g",
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
    name: "ElevenLabs",
    slug: "elevenlabs",
    iconUrl: "https://logo.clearbit.com/elevenlabs.io",
    tagline: "The voice quality everyone is now comparing other tools to",
    pricing: "Free 10K chars/mo · Starter $5/mo · Creator $22/mo",
    bestFor: "Anyone who has heard ElevenLabs and Murf back-to-back — narration, dubbing, character voices, audiobooks, YouTube",
    vsMurf:
      "Murf's voices sound like polished TTS; ElevenLabs voices sound like humans who were recorded. Free tier gives you 10,000 characters/month — Murf's free trial is 10 minutes and then it's gone.",
    verdict: "If you compare a 30-second sample side-by-side, the decision is over in 30 seconds. This is the obvious 2026 winner.",
    color: "#000000",
  },
  {
    rank: 2,
    name: "Play.ht",
    slug: "play-ht",
    iconUrl: "https://logo.clearbit.com/play.ht",
    tagline: "The closest 1:1 Murf replacement with a usable free tier",
    pricing: "Free 12,500 chars/mo · Creator $39/mo · Unlimited $99/mo",
    bestFor: "Voiceover artists, podcasters, e-learning creators who want Murf's UI without Murf's pricing",
    vsMurf:
      "Same studio-style UI (multi-voice timelines, pronunciation library, SSML) but the free tier is genuinely usable for shorter projects. Voice quality sits between Murf and ElevenLabs.",
    verdict: "If you've built a Murf workflow around the timeline editor, Play.ht is the migration with the least muscle-memory loss.",
    color: "#0098f7",
  },
  {
    rank: 3,
    name: "Speechify",
    slug: "speechify",
    iconUrl: "https://logo.clearbit.com/speechify.com",
    tagline: "Murf is for creators; Speechify is for listeners",
    pricing: "Free + Premium $11.58/mo (annual)",
    bestFor: "Students wanting to listen to PDFs, articles, and textbooks — not produce voiceovers",
    vsMurf:
      "Murf and Speechify look similar but solve opposite problems. Speechify reads things to you (Chrome extension, mobile app, Kindle). It's the better tool if your job is consumption, not creation.",
    verdict: "Wrong tool for narration projects, right tool for getting through your reading list 2× faster. Don't confuse them.",
    color: "#0c1d3c",
  },
  {
    rank: 4,
    name: "WellSaid Labs",
    slug: "wellsaid-labs",
    iconUrl: "https://logo.clearbit.com/wellsaidlabs.com",
    tagline: "When Murf isn't broadcast-quality enough",
    pricing: "Maker $44/mo · Creative $89/mo · Team custom",
    bestFor: "Agencies, professional e-learning, corporate training where voice quality is the brand",
    vsMurf:
      "WellSaid's voices are trained from actual licensed voice actors and the directionality you can give them (tone, emphasis, breath) outstrips Murf's. The pricing reflects that — this is enterprise, not hobby.",
    verdict: "If you're producing for a paying client and Murf's output keeps getting kicked back, this is the upgrade path.",
    color: "#5a4fff",
  },
  {
    rank: 5,
    name: "Descript",
    slug: "descript",
    iconUrl: "https://logo.clearbit.com/descript.com",
    tagline: "Murf's voice generation plus video editing in one app",
    pricing: "Free 1 hour/mo + Hobbyist $12/mo · Creator $24/mo",
    bestFor: "Podcasters and YouTubers who edit by typing — and now want AI voiceover in the same workflow",
    vsMurf:
      "Murf only generates audio. Descript generates audio (Overdub clones your own voice) AND edits video AND removes filler words AND transcribes — all in one app. If you're also editing the final video, the workflow consolidation is the killer feature.",
    verdict: "Not the best pure TTS, but the only tool where AI voiceover and the rest of your video edit happen in the same window.",
    color: "#212934",
  },
  {
    rank: 6,
    name: "Lovo AI",
    slug: "lovo-ai",
    iconUrl: "https://logo.clearbit.com/lovo.ai",
    tagline: "The budget Murf — same use case, half the price",
    pricing: "Free + Basic $24/mo · Pro $48/mo",
    bestFor: "Students, indie creators, and YouTubers on the tightest budget",
    vsMurf:
      "Voice library is competitive with Murf and the price tier is a step below. Quality isn't ElevenLabs-level, but for non-broadcast use (study videos, internal explainers, YouTube Shorts) the gap doesn't matter.",
    verdict: "The honest budget pick if you've decided the free tiers above don't cover enough. Pay less, ship faster.",
    color: "#ff5a5f",
  },
  {
    rank: 7,
    name: "Resemble AI",
    slug: "resemble-ai",
    iconUrl: "https://logo.clearbit.com/resemble.ai",
    tagline: "Voice cloning specialist — when you need YOUR voice, not a stock voice",
    pricing: "Free trial + Pro $30/mo + API usage",
    bestFor: "Creators who want to generate audio in their own voice without re-recording every time",
    vsMurf:
      "Murf's voices are good, but they're someone else's. Resemble's whole point is cloning your voice from ~3 minutes of audio. For brand consistency on a podcast, course, or character voice, that's the entire game.",
    verdict: "Different tool for a different problem. If \"sound like me\" matters more than \"sound polished,\" this is the answer.",
    color: "#7c3aed",
  },
  {
    rank: 8,
    name: "Synthesys",
    slug: "synthesys",
    iconUrl: "https://logo.clearbit.com/synthesys.io",
    tagline: "Multi-language Murf alternative for international creators",
    pricing: "Creator $27/mo · Creator+ $37/mo",
    bestFor: "Creators producing content in non-English languages (Hindi, Arabic, Spanish, Mandarin, etc.)",
    vsMurf:
      "Murf supports a handful of major languages well; Synthesys covers 140+ with native-sounding voices in each. If your audience isn't English-first, the language coverage alone justifies the switch.",
    verdict: "Underrated outside of English-speaking markets. The right pick if your content goes out in Hindi, Spanish, or Arabic.",
    color: "#1a73e8",
  },
  {
    rank: 9,
    name: "Listnr",
    slug: "listnr",
    iconUrl: "https://logo.clearbit.com/listnr.tech",
    tagline: "Murf for podcasters, with a podcast publishing pipeline built in",
    pricing: "Free + Solo $19/mo · Pro $39/mo",
    bestFor: "Solo podcasters who want to write a script, generate a voice, and publish to Spotify/Apple — without leaving one tool",
    vsMurf:
      "Listnr generates voiceover AND hosts the podcast feed AND distributes to all major podcast directories. Murf hands you an MP3 and waves goodbye.",
    verdict: "Narrower than Murf but deeper for one specific job. If you only make AI podcasts, this is faster.",
    color: "#0ea5e9",
  },
  {
    rank: 10,
    name: "Google Cloud TTS",
    slug: "google-cloud-text-to-speech",
    iconUrl: "https://logo.clearbit.com/cloud.google.com",
    tagline: "Free Murf alternative if you're willing to write five lines of code",
    pricing: "Free 1M chars/mo (standard) + pay-as-you-go beyond",
    bestFor: "CS students, developers, anyone with a script + a terminal who doesn't need a UI",
    vsMurf:
      "Murf charges per month for a UI; Google charges per character through an API. WaveNet voices are competitive with paid Murf tiers, and one million free characters per month is enough for most personal projects.",
    verdict: "Not a tool — a credential. If you can copy-paste a Python script, this is the most under-priced voice generation on the internet.",
    color: "#4285f4",
  },
];

const faqs = [
  {
    q: "Why look for alternatives to Murf?",
    a: "Murf is fine — but it's no longer the quality leader. ElevenLabs has overtaken it on voice realism, Play.ht matches the UI at a similar price, and several specialist tools (Speechify for listening, Resemble for voice cloning, Descript for video) do specific jobs better. Murf also has no usable free tier — the 10-minute trial runs out before you've explored the voice library.",
  },
  {
    q: "Best Murf alternative for YouTube creators?",
    a: "ElevenLabs is the consensus 2026 pick — free tier covers 10,000 characters/month (roughly 8-10 minutes of narration), and the voice quality is what most successful AI-voiced YouTube channels are now using. Descript is the alternative pick if you want voiceover and video editing in one app.",
  },
  {
    q: "Cheapest Murf alternative?",
    a: "ElevenLabs Starter at $5/month is the cheapest paid plan with serious quality. For completely free use: ElevenLabs free tier (10K chars/mo), Play.ht free tier (12,500 chars/mo), or Google Cloud TTS (1M chars/mo with a credit card on file but no charge under quota).",
  },
  {
    q: "Murf vs ElevenLabs — which is better?",
    a: "ElevenLabs in almost every dimension as of 2026: voice realism, language coverage, free tier, voice cloning quality. Murf's only remaining advantage is the timeline-style editor for multi-voice scripts, which Play.ht has now matched. If you're choosing today and don't have an existing Murf workflow, pick ElevenLabs.",
  },
  {
    q: "Is there a free Murf alternative?",
    a: "Yes — ElevenLabs free tier (10,000 characters/month), Play.ht free tier (12,500/month), and Google Cloud TTS (1 million/month) are all genuinely usable for short projects, study videos, and prototypes. The Murf free trial is 10 minutes one-time, which doesn't compare.",
  },
  {
    q: "Best Murf alternative for voice cloning?",
    a: "Resemble AI is the specialist — purpose-built for cloning your own voice from a short sample. ElevenLabs also offers voice cloning on the Creator tier ($22/mo) and the quality is competitive. Murf does not offer custom voice cloning on consumer tiers.",
  },
];

const stacks = [
  { label: "YouTube creator's stack", tools: "ElevenLabs + Descript + Captions" },
  { label: "Podcaster's stack", tools: "Listnr + ElevenLabs + Resemble" },
  { label: "Student's stack (free)", tools: "ElevenLabs free + Google TTS + Audacity" },
  { label: "Multilingual stack", tools: "Synthesys + ElevenLabs + DeepL" },
];

export default function BestMurfAlternatives() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best Murf AI Alternatives in 2026 (Tested & Ranked) | AI Compass</title>
        <meta
          name="description"
          content="Murf is no longer the voice-quality leader. These 10 alternatives — led by ElevenLabs — have better voices, usable free tiers, and pricing that doesn't feel like a 2022 SaaS quote. Hand-tested, last reviewed May 2026."
        />
        <meta
          name="keywords"
          content="Murf alternatives, Murf AI alternatives, alternatives to Murf, ElevenLabs vs Murf, Murf for YouTube, free Murf alternative, AI voice generator"
        />
        <link rel="canonical" href="https://ai-compass.in/best-murf-alternatives" />
        <meta property="og:title" content="10 Best Murf AI Alternatives in 2026 (Tested & Ranked) | AI Compass" />
        <meta property="og:description" content="Murf is no longer the voice-quality leader. These 10 alternatives — led by ElevenLabs — have better voices, usable free tiers, and pricing that doesn't feel like a 2022 SaaS quote." />
        <meta property="og:url" content="https://ai-compass.in/best-murf-alternatives" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best Murf AI Alternatives in 2026",
          "description": "The 10 best Murf AI alternatives — ranked and reviewed for YouTube creators, podcasters, students, and multilingual use.",
          "url": "https://ai-compass.in/best-murf-alternatives",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-05-14",
          "dateModified": "2026-05-14",
          "author": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "image": "https://ai-compass.in/og-image.png",
          "mainEntityOfPage": { "@type": "WebPage", "@id": "https://ai-compass.in/best-murf-alternatives" },
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Best Murf AI Alternatives in 2026",
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
            <WordReveal>10 Best Murf AI Alternatives in 2026</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            Murf is fine — but it's no longer the voice-quality leader, and there's no usable free tier. These 10 alternatives — led by ElevenLabs — sound more human, cost less, and most let you try before paying.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ Hand-tested vs Murf", "✅ Free tier or under $25/mo", "✅ Ranked by voice quality + price"].map(t => (
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
                <span>Generated the same 30-second test script in each tool and compared output blind — voice realism is the lead criterion.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free tier or paid tier under $25/mo, except specialist enterprise picks (WellSaid) and developer APIs (Google).</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Pricing verified within the last 30 days; specialist tools (voice cloning, multilingual) rank by depth in their niche, not breadth.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Order does not change for sponsored placements. ElevenLabs ranks #1 because it wins the blind A/B — it would be there regardless.</span>
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
                          vs Murf
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.vsMurf}</dd>
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
              Pick the stack that matches your project
            </h2>
            <p className="font-sans text-[15px] leading-[1.75] text-muted mb-5">
              You don't need one tool — you need a workflow. Most creators end up combining a primary voice tool with one specialist (cloning, editing, distribution) depending on what they actually ship.
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
              <Link to="/best-jasper-alternatives" className="text-[14px] font-semibold text-accent no-underline hover:underline">
                Best Jasper alternatives →
              </Link>
            </MagneticWrapper>
            <Link to="/best-free-ai-tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Best free AI tools →
            </Link>
            <Link to="/tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Browse all 399 tools →
            </Link>
          </div>
        </MotionDiv>

      </div>
    </>
  );
}
