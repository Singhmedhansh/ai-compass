import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowLeft } from 'lucide-react'

import { WordReveal } from '../components/ui'
import { sectionReveal, staggerParent, staggerChild } from '../lib/motion'
import { outboundUrl, OUTBOUND_REL } from '../utils/outbound'

const MotionDiv = motion.div
const LAST_REVIEWED = 'May 2026'

// Most catalog tools have a broken `/static/icons/<slug>.svg` icon path that
// returns 404 in the Vite SPA, so we don't trust tool.icon. Instead derive a
// DuckDuckGo favicon from the tool's canonical domain (link/url) — DuckDuckGo
// returns 404 on miss, so onError reliably falls through to the letter tile.
// Same pattern as BrandIcon in BestFreeAITools/BestAIToolsForStudents.
function getDomain(url) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    try {
      return new URL(`https://${url}`).hostname.replace(/^www\./, '')
    } catch {
      return null
    }
  }
}

function BrandIcon({ tool, size = 'md' }) {
  const domain = getDomain(tool?.link || tool?.url || tool?.website)
  const [failed, setFailed] = useState(!domain)

  const sizeClasses = size === 'sm'
    ? 'h-10 w-10 text-lg'
    : 'h-12 w-12 text-xl'

  if (failed) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl border border-line bg-white font-bold ${sizeClasses}`}
        style={{ color: tool?.color || '#666666' }}
        aria-hidden="true"
      >
        {tool?.name?.charAt(0) || '?'}
      </div>
    )
  }

  return (
    <img
      src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
      alt=""
      loading="lazy"
      className={`shrink-0 rounded-xl border border-line bg-white object-contain p-1.5 ${sizeClasses}`}
      onError={() => setFailed(true)}
    />
  )
}

export default function AlternativesPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadAlternatives() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/v1/tools/${slug}/alternatives`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const json = await response.json()
        setData(json)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setData(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadAlternatives()
    window.scrollTo(0, 0)

    return () => controller.abort()
  }, [slug])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 font-serif">
        <div className="h-12 w-2/3 animate-pulse rounded-lg bg-bg-elev" />
        <div className="mt-4 h-6 w-1/2 animate-pulse rounded-lg bg-bg-elev" />
      </div>
    )
  }

  if (error || !data?.tool) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center font-serif">
        <h1 className="text-3xl font-bold text-ink">Tool not found</h1>
        <p className="mt-4 text-muted">
          We couldn&apos;t find alternatives for &ldquo;{slug}&rdquo;.
        </p>
        <Link
          to="/tools"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg hover:bg-ink-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Browse all tools
        </Link>
      </div>
    )
  }

  const { tool, alternatives } = data
  const count = alternatives.length

  const pageTitle = `Top ${tool.name} Alternatives in 2026 | AI Compass`
  const pageDescription = `${count} hand-tested alternatives to ${tool.name}, ranked by similarity. Free tiers, pricing, and use cases compared. Curated by AI Compass.`
  const canonical = `https://ai-compass.in/alternatives/${tool.slug}`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Top ${tool.name} Alternatives in 2026`,
    description: pageDescription,
    numberOfItems: count,
    itemListElement: alternatives.map((alt, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: alt.name,
      url: `https://ai-compass.in/tools/${alt.slug}`,
    })),
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Why look for alternatives to ${tool.name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Common reasons to explore ${tool.name} alternatives include pricing differences, missing features, free-tier limits, or wanting a tool optimized for a specific workflow. The alternatives on this page were chosen based on similarity to ${tool.name} across category, use case, and feature set.`,
        },
      },
      {
        '@type': 'Question',
        name: `Are there free alternatives to ${tool.name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Several alternatives in this list have free tiers. Look for the pricing badge on each card — some offer fully free use, others have generous free tiers that cover most student or hobby use cases.`,
        },
      },
      {
        '@type': 'Question',
        name: 'How were these alternatives ranked?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Alternatives are ranked by similarity to ${tool.name} using a combination of category, use case, and feature overlap. Every tool on this list has been hand-tested by the AI Compass team.`,
        },
      },
    ],
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>

      <div className="font-serif">
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          animate="animate"
          className="mx-auto max-w-5xl px-4 pt-12 pb-8 sm:pt-16"
        >
          <nav className="mb-6 text-sm text-muted-2">
            <Link to="/tools" className="hover:text-ink-2">All tools</Link>
            <span className="mx-2">/</span>
            <Link to={`/tools/${tool.slug}`} className="hover:text-ink-2">{tool.name}</Link>
            <span className="mx-2">/</span>
            <span className="text-ink-2">Alternatives</span>
          </nav>

          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>{`Top ${count} ${tool.name} Alternatives in 2026`}</WordReveal>
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            Hand-tested alternatives to {tool.name}, ranked by similarity across
            category, use case, and feature set. Every tool on this list is in
            our curated catalog of 399 AI tools.
          </p>
          <p className="mt-4 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1 text-xs font-medium text-ink-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Last reviewed: {LAST_REVIEWED}
            </span>
          </p>
        </MotionDiv>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-5xl px-4 mb-12"
        >
          <div className="rounded-2xl border border-line bg-bg-elev p-5 sm:p-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-2">
              You&apos;re viewing alternatives to
            </div>
            <div className="flex items-center gap-4">
              <BrandIcon tool={tool} />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-ink">{tool.name}</h2>
                <p className="truncate text-sm text-muted">{tool.tagline || tool.description || ''}</p>
              </div>
              <Link
                to={`/tools/${tool.slug}`}
                className="hidden shrink-0 items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-sm font-medium text-ink-2 hover:border-line-strong hover:text-ink sm:inline-flex"
              >
                See full review
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </MotionDiv>

        <MotionDiv
          variants={staggerParent}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-5% 0px' }}
          className="mx-auto max-w-5xl px-4 mb-16"
        >
          <h2 className="mb-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            The {count} best alternatives
          </h2>
          {alternatives.some(a => a.affiliate_url) && (
            <p className="mb-6 text-xs text-muted-2">
              Some "Try" buttons below are affiliate links — we may earn a small commission if you sign up. Ranking and review content are unaffected. <Link to="/terms" className="underline hover:text-ink-2">Disclosure</Link>.
            </p>
          )}
          <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
            {alternatives.map((alt, i) => (
              <MotionDiv
                key={alt.slug}
                variants={staggerChild}
                custom={i * 0.04}
                className="group rounded-2xl border border-line bg-bg-elev p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <BrandIcon tool={alt} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold text-ink">{alt.name}</h3>
                      {(alt.pricing_tier || alt.pricing) && (
                        <span className="shrink-0 rounded-full border border-line bg-bg-sunk px-2.5 py-0.5 text-xs text-ink-2">
                          {alt.pricing_tier || alt.pricing}
                        </span>
                      )}
                    </div>
                    <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-muted">
                      {alt.tagline || alt.description || ''}
                    </p>
                    {(() => {
                      const altUrl = outboundUrl(alt)
                      return (
                        <div className="flex flex-wrap items-center gap-2">
                          {altUrl && altUrl !== '#' && (
                            <a
                              href={altUrl}
                              target="_blank"
                              rel={OUTBOUND_REL}
                              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-bg transition-all hover:gap-2 hover:bg-ink-2"
                            >
                              Try {alt.name}
                              <ArrowUpRight className="h-3 w-3" />
                            </a>
                          )}
                          <Link
                            to={`/tools/${alt.slug}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
                          >
                            Review →
                          </Link>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </MotionDiv>
            ))}
          </div>
        </MotionDiv>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-3xl px-4 mb-16"
        >
          <h2 className="mb-6 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Frequently asked
          </h2>
          <div className="space-y-4">
            <details className="group rounded-2xl border border-line bg-bg-elev p-5 open:bg-bg-elev">
              <summary className="cursor-pointer text-base font-semibold text-ink">
                Why look for alternatives to {tool.name}?
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Common reasons include pricing differences, missing features, free-tier limits, or wanting a tool optimized for a specific workflow. The alternatives on this page were chosen based on similarity to {tool.name} across category, use case, and feature set.
              </p>
            </details>
            <details className="group rounded-2xl border border-line bg-bg-elev p-5">
              <summary className="cursor-pointer text-base font-semibold text-ink">
                Are there free alternatives to {tool.name}?
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Several alternatives in this list have free tiers. Look for the pricing badge on each card — some offer fully free use, others have generous free tiers that cover most student or hobby use cases.
              </p>
            </details>
            <details className="group rounded-2xl border border-line bg-bg-elev p-5">
              <summary className="cursor-pointer text-base font-semibold text-ink">
                How were these alternatives ranked?
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Alternatives are ranked by similarity to {tool.name} using a combination of category, use case, and feature overlap. Every tool on this list has been hand-tested by the AI Compass team.
              </p>
            </details>
          </div>
        </MotionDiv>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-3xl px-4 pb-20"
        >
          <div className="rounded-3xl border border-line bg-bg-elev p-8 text-center sm:p-10">
            <h2 className="text-2xl font-semibold text-ink sm:text-3xl">
              Looking for something different?
            </h2>
            <p className="mt-3 text-muted">
              Take our 30-second quiz to find the right AI tool for your specific needs, or browse the full catalog of 399 hand-curated tools.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/ai-tool-finder"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg hover:bg-ink-2"
              >
                Take the quiz
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                to="/tools"
                className="inline-flex items-center gap-2 rounded-full border border-line bg-bg px-5 py-2.5 text-sm font-medium text-ink-2 hover:border-line-strong hover:text-ink"
              >
                Browse all tools
              </Link>
            </div>
          </div>
        </MotionDiv>
      </div>
    </>
  )
}
