import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

import { MagneticWrapper, WordReveal } from "../components/ui";
import { useCatalogStats } from "../hooks/useCatalogStats";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";
import { toolHoverHandlers, alternativesHoverHandlers } from "../lib/prefetch";

const MotionDiv = motion.div;
// Static fallback covers the ~100ms before /api/v1/stats responds.
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

const AFFILIATE_URLS = {
  "pictory": "https://pictory.ai?ref=medhansh34",
};

function getOutboundUrl(tool) {
  const affiliate = AFFILIATE_URLS[tool.slug];
  if (affiliate) return { url: affiliate, isAffiliate: true };
  if (tool.slug) return { url: `/go/${encodeURIComponent(tool.slug)}`, isAffiliate: false };
  const m = typeof tool.iconUrl === "string" && tool.iconUrl.match(/clearbit\.com\/([^/]+)/);
  if (m) return { url: `https://${m[1]}`, isAffiliate: false };
  return { url: null, isAffiliate: false };
}

const tools = [
  {
    rank: 1,
    name: "Pictory",
    slug: "pictory",
    iconUrl: "https://logo.clearbit.com/pictory.ai",
    tagline: "Synthesia without the avatar — script-to-video for people who don't want to be on camera",
    pricing: "Free 3 projects · Starter $25/mo · Pro $59/mo",
    bestFor: "Explainer videos, study summaries, social-media shorts, marketing content — anywhere a talking-head avatar isn't the point",
    vsSynthesia:
      "Synthesia builds the video around a stock avatar. Pictory builds it around your script and pulls in matching stock footage, captions, and AI voiceover. Half the price, faster workflow, and the result doesn't look like an AI avatar.",
    verdict: "If you can't say why your video needs a talking head, you probably don't need Synthesia. Pictory ships the same explainer for less.",
    color: "#7c3aed",
  },
  {
    rank: 2,
    name: "HeyGen",
    slug: "heygen",
    iconUrl: "https://logo.clearbit.com/heygen.com",
    tagline: "The direct Synthesia competitor most creators are switching to",
    pricing: "Free 1 min/mo · Creator $29/mo · Team $89/mo",
    bestFor: "Anyone who genuinely needs avatar-based videos: corporate training, multilingual product walkthroughs, sales outreach",
    vsSynthesia:
      "Same use case (avatar + script + voice), but HeyGen's avatar realism overtook Synthesia in 2024 and the lip-sync is noticeably cleaner. Free tier gives you 1 minute/month — Synthesia's free plan is gone.",
    verdict: "If you're set on the avatar workflow, this is the modern winner. The 1-minute free tier is enough to ship one short before you decide.",
    color: "#7e3af2",
  },
  {
    rank: 3,
    name: "D-ID",
    slug: "d-id",
    iconUrl: "https://logo.clearbit.com/d-id.com",
    tagline: "Turn a single photo into a talking avatar — without licensing a stock face",
    pricing: "Free trial + Lite $5.99/mo · Pro $29/mo",
    bestFor: "Personal branding, founder videos, history teachers bringing photos to life, creators who want THEIR face on the avatar",
    vsSynthesia:
      "Synthesia uses pre-built stock avatars (or charges a lot to make a custom one). D-ID generates the talking avatar from any photo — your own, a historical figure, a character design. Different problem, much cheaper price.",
    verdict: "Not a like-for-like Synthesia replacement, but the right answer if \"the avatar should be a specific person\" is a hard requirement.",
    color: "#3a86ff",
  },
  {
    rank: 4,
    name: "Colossyan",
    slug: "colossyan",
    iconUrl: "https://logo.clearbit.com/colossyan.com",
    tagline: "Synthesia for L&D teams — avatar videos with built-in branching scenarios",
    pricing: "Starter $19/mo · Pro $61/mo · Enterprise custom",
    bestFor: "Corporate learning teams, compliance training, scenario-based onboarding videos",
    vsSynthesia:
      "Same avatar-driven workflow, but Colossyan ships with conversation/scenario templates (manager-employee dialogues, sales role-play) that Synthesia makes you build by hand. Starter at $19/mo undercuts Synthesia's $22/mo by enough to matter at scale.",
    verdict: "Underrated for L&D teams. If your videos are mostly training scenarios, this is the specialist pick.",
    color: "#1d4ed8",
  },
  {
    rank: 5,
    name: "Elai.io",
    slug: "elai-io",
    iconUrl: "https://logo.clearbit.com/elai.io",
    tagline: "Synthesia at a budget tier — same workflow, smaller price",
    pricing: "Free trial + Basic $23/mo · Advanced $100/mo",
    bestFor: "Solo creators and small teams who want avatar videos without Synthesia's per-seat pricing",
    vsSynthesia:
      "Voice and avatar quality is a step below HeyGen and Synthesia, but for internal documentation, product demos, and short social posts, the gap doesn't matter. Pricing is more forgiving for solo creators.",
    verdict: "The budget pick if you've decided you specifically need avatars but Synthesia's seat math doesn't work for you.",
    color: "#0ea5e9",
  },
  {
    rank: 6,
    name: "Runway",
    slug: "runway-ml",
    iconUrl: "https://logo.clearbit.com/runwayml.com",
    tagline: "AI video creator that thinks beyond talking heads",
    pricing: "Free + Standard $15/mo · Pro $35/mo",
    bestFor: "Filmmakers, creative-agency producers, art direction, anyone who wants cinematic AI video — not corporate avatars",
    vsSynthesia:
      "Synthesia is for narrated explainer videos. Runway is for everything else AI video can do — motion brushes, video-to-video, generative B-roll, lip-sync. Different category, much wider creative range.",
    verdict: "If the videos you actually want to make aren't talking-head explainers, you weren't a Synthesia customer anyway. Runway is the real answer.",
    color: "#000000",
  },
  {
    rank: 7,
    name: "Descript",
    slug: "descript",
    iconUrl: "https://logo.clearbit.com/descript.com",
    tagline: "Talking-head videos without an avatar — just film yourself",
    pricing: "Free 1 hour/mo + Hobbyist $12/mo · Creator $24/mo",
    bestFor: "Founders, course creators, YouTubers who actually have a camera and want to edit by typing",
    vsSynthesia:
      "Synthesia's whole pitch is \"never go on camera.\" Descript's pitch is \"go on camera once, then edit by deleting words from the transcript.\" If the avatar was a workaround for camera anxiety, Descript is the better long-term answer.",
    verdict: "If the only reason you used Synthesia was to avoid filming yourself, fix the actual problem — Descript makes self-filming bearable.",
    color: "#212934",
  },
  {
    rank: 8,
    name: "InVideo AI",
    slug: "invideo",
    iconUrl: "https://logo.clearbit.com/invideo.io",
    tagline: "Synthesia output without the avatar — type a prompt, get a finished video",
    pricing: "Free + Plus $25/mo · Max $60/mo",
    bestFor: "Social-media managers, YouTube Shorts creators, anyone needing high-volume short-form video",
    vsSynthesia:
      "Synthesia takes a script and renders an avatar reading it. InVideo takes a prompt and assembles stock footage + AI voice + captions into a finished short. Closer to TikTok's pace than corporate-training pace.",
    verdict: "The right pick if your videos are 30-60 seconds, vertical, and live on Reels/Shorts/TikTok.",
    color: "#fb5607",
  },
  {
    rank: 9,
    name: "Veed.io",
    slug: "veed",
    iconUrl: "https://logo.clearbit.com/veed.io",
    tagline: "Synthesia-style avatar + a full browser video editor",
    pricing: "Free + Basic $18/mo · Pro $30/mo",
    bestFor: "Creators who need avatar narration AND want to do timeline editing, captions, and background removal in the same tool",
    vsSynthesia:
      "Synthesia is essentially read-only after rendering. Veed gives you the avatar AND a proper editor — trim, add B-roll, custom captions, branded intros. Same monthly price, much more flexibility.",
    verdict: "The right pick if Synthesia's biggest pain was \"I have to export and re-edit in a second tool.\" Veed does both.",
    color: "#06b6d4",
  },
  {
    rank: 10,
    name: "Lumen5",
    slug: "lumen5",
    iconUrl: "https://logo.clearbit.com/lumen5.com",
    tagline: "Blog-post to video, no avatar — Synthesia's older but still capable cousin",
    pricing: "Free 5 videos/mo · Basic $19/mo · Starter $59/mo",
    bestFor: "Bloggers and marketers repurposing written content into LinkedIn / Facebook / YouTube videos",
    vsSynthesia:
      "Synthesia talks at the viewer through an avatar; Lumen5 shows the viewer the points as text-over-footage with optional voiceover. For social-media repurposing of written content, the second format converts better.",
    verdict: "The OG \"AI video from text\" tool. Slightly dated UI, but the workflow still works and the free tier is generous.",
    color: "#fd7e14",
  },
];

const faqs = [
  {
    q: "Why look for alternatives to Synthesia?",
    a: "Synthesia starts at $22/month and is built around AI avatar videos — which most creators don't actually need. If your video is an explainer, study summary, or social-media short, you're paying for an avatar feature you'll never use. The 10 alternatives below split into two camps: cheaper avatar tools (HeyGen, Colossyan) and \"AI video without avatars\" tools (Pictory, Runway, InVideo) that may be a better fit for what you're actually making.",
  },
  {
    q: "Best Synthesia alternative without avatars?",
    a: "Pictory is the closest fit — script-to-video with AI voiceover and matching stock footage, starting at $25/month with a free tier for 3 projects. If you want broader creative range (motion graphics, generative video), Runway is the answer. For social-media shorts specifically, InVideo AI is purpose-built.",
  },
  {
    q: "HeyGen vs Synthesia — which is better in 2026?",
    a: "HeyGen has overtaken Synthesia on avatar realism and lip-sync quality, and it still has a free tier (1 minute/month) while Synthesia's free plan was discontinued. For new avatar-video creators picking today, HeyGen is the default pick. Synthesia's remaining edge is the enterprise sales motion — relevant for big companies, not for individuals.",
  },
  {
    q: "Cheapest Synthesia alternative?",
    a: "Elai.io at $23/month is the cheapest paid avatar option. Free-tier picks: HeyGen (1 min/mo), Pictory (3 projects), Runway (free with limits), and Veed (free with watermark) all let you ship at least one finished video before paying anything.",
  },
  {
    q: "Best Synthesia alternative for L&D / corporate training?",
    a: "Colossyan is the specialist pick — branching scenario templates, conversation-style avatar dialogues, and L&D-specific features Synthesia leaves you to build by hand. HeyGen is the broader pick if you want avatar variety. WellSaid Labs + Veed is a strong non-avatar alternative if voiceover quality is the priority.",
  },
  {
    q: "Can I create avatar videos for free?",
    a: "HeyGen's free tier gives 1 minute/month of avatar video — enough to ship one short. D-ID's trial lets you generate a few clips from a photo. Beyond that, free avatar video at scale doesn't really exist — the underlying GPU cost is real. Most creators end up on the $20-30/month tier of one of these tools.",
  },
];

const stacks = [
  { label: "Explainer creator's stack", tools: "Pictory + ElevenLabs + Veed" },
  { label: "Avatar-needed stack", tools: "HeyGen + Descript + ElevenLabs" },
  { label: "Solo founder's stack", tools: "Descript + D-ID + ElevenLabs" },
  { label: "Social shorts stack", tools: "InVideo + Pictory + Lumen5" },
];

export default function BestSynthesiaAlternatives() {
  const { totalTools } = useCatalogStats();
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>10 Best Synthesia Alternatives in 2026 (Tested & Ranked) | AI Compass</title>
        <meta
          name="description"
          content="Synthesia is $22+/mo for AI avatar videos most creators don't need. These 10 alternatives — led by Pictory — split into cheaper avatar tools and 'AI video without avatars' for explainers, shorts, and explainers. Hand-tested, published June 2026."
        />
        <meta
          name="keywords"
          content="Synthesia alternatives, alternatives to Synthesia, Synthesia vs HeyGen, Synthesia vs Pictory, AI avatar video, free Synthesia alternative, AI video without avatar"
        />
        <link rel="canonical" href="https://ai-compass.in/best-synthesia-alternatives" />
        <meta property="og:title" content="10 Best Synthesia Alternatives in 2026 (Tested & Ranked) | AI Compass" />
        <meta property="og:description" content="Synthesia is $22+/mo for AI avatar videos most creators don't need. These 10 alternatives — led by Pictory — split into cheaper avatar tools and 'AI video without avatars' for explainers, shorts, and explainers." />
        <meta property="og:url" content="https://ai-compass.in/best-synthesia-alternatives" />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          "headline": "10 Best Synthesia Alternatives in 2026",
          "description": "The 10 best Synthesia alternatives — ranked and reviewed for explainer creators, L&D teams, social-media producers, and founders.",
          "url": "https://ai-compass.in/best-synthesia-alternatives",
          "publisher": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "datePublished": "2026-05-14",
          "dateModified": "2026-05-14",
          "author": { "@type": "Organization", "name": "AI Compass", "url": "https://ai-compass.in" },
          "image": "https://ai-compass.in/og-image.png",
          "mainEntityOfPage": { "@type": "WebPage", "@id": "https://ai-compass.in/best-synthesia-alternatives" },
        })}</script>
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Best Synthesia Alternatives in 2026",
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
            { "@type": "ListItem", "position": 2, "name": "Best Synthesia Alternatives", "item": "https://ai-compass.in/best-synthesia-alternatives" },
          ],
        })}</script>
      </Helmet>

      <div className="font-serif">

        {/* Hero */}
        <div className="mx-auto max-w-[860px] px-6 pt-20 pb-12 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            Updated June 2026 · 10 tools tested
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>10 Best Synthesia Alternatives in 2026</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[640px] mx-auto mb-8 font-sans">
            Synthesia is $22+/mo for avatar-based videos most creators don't actually need. These 10 alternatives split into cheaper avatar tools (HeyGen, Colossyan) and "AI video without avatars" tools (Pictory, Runway) — pick the one that fits the video you're actually making.
          </p>
          <div className="flex flex-wrap justify-center gap-3 font-sans text-[13px] text-muted">
            {["✅ Hand-tested vs Synthesia", "✅ Free tier or under $30/mo", "✅ Avatar AND no-avatar picks"].map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1 text-xs font-medium text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Published: {LAST_REVIEWED}
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
                <span>Built the same 90-second explainer script in each tool and judged on: time-to-finished-video, output quality, and re-edit friction.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Free tier or paid tier under $30/mo for the consumer-facing picks; enterprise-only specialists ranked by depth, not breadth.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Pricing verified within the last 30 days; rankings include tools that aren't direct 1:1 replacements but fit the same job-to-be-done.</span>
              </li>
              <li className="flex items-start gap-3 text-sm text-ink-2 leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                <span>Order does not change for sponsored placements. Pictory ranks #1 because most readers searching "Synthesia alternatives" are after cheaper script-to-video — not a different avatar.</span>
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
                          vs Synthesia
                        </dt>
                        <dd className="text-sm leading-relaxed text-muted">{tool.vsSynthesia}</dd>
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
              Decide the workflow first, the tool second
            </h2>
            <p className="font-sans text-[15px] leading-[1.75] text-muted mb-5">
              The biggest waste with Synthesia is paying for avatars you don't need. Figure out what your video actually is first — explainer, training, social short, founder pitch — then pick the stack that matches.
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
              <Link to="/best-murf-alternatives" className="text-[14px] font-semibold text-accent no-underline hover:underline">
                Best Murf alternatives →
              </Link>
            </MagneticWrapper>
            <Link to="/best-jasper-alternatives" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Best Jasper alternatives →
            </Link>
            <Link to="/tools" className="text-[14px] font-semibold text-accent no-underline hover:underline">
              Browse all {displayCount} tools →
            </Link>
          </div>
        </MotionDiv>

      </div>
    </>
  );
}
