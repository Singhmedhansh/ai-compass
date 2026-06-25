import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'

import { SEO, WordReveal } from '../components/ui'
import ErrorState from '../components/ErrorState'
import { useCatalogStats } from '../hooks/useCatalogStats'
import { sectionReveal, staggerParent, staggerChild } from '../lib/motion'
import { toolHoverHandlers } from '../lib/prefetch'
import { outboundUrl, OUTBOUND_REL } from '../utils/outbound'
import { inferErrorVariant } from '../utils/errorState'

const MotionDiv = motion.div
// Static fallback covers the ~100ms before /api/v1/stats responds — kept close to the live count so the body copy never reads as broken.
const FALLBACK_TOOL_COUNT = 400

// Format an ISO date ("2026-05-21") as "May 2026". Returns null for
// missing / unparseable values so callers can conditionally render
// instead of falling back to a hardcoded month that goes stale.
function formatVerifiedMonth(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

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
      alt={tool?.name ? `${tool.name} favicon` : ''}
      loading="lazy"
      decoding="async"
      width="64"
      height="64"
      className={`shrink-0 rounded-xl border border-line bg-white object-contain p-1.5 ${sizeClasses}`}
      onError={() => setFailed(true)}
    />
  )
}

export default function AlternativesPage() {
  const { slug } = useParams()
  const { totalTools } = useCatalogStats()
  const catalogCount = totalTools ?? FALLBACK_TOOL_COUNT
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  // error is null when fine, otherwise one of 'offline' | 'server' |
  // 'notfound' (see utils/errorState.js).
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

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
          const httpErr = new Error(`HTTP ${response.status}`)
          httpErr.status = response.status
          throw httpErr
        }
        const json = await response.json()
        setData(json)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(inferErrorVariant(err))
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
  }, [slug, retryNonce])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 font-serif">
        <div className="h-12 w-2/3 animate-pulse rounded-lg bg-bg-elev" />
        <div className="mt-4 h-6 w-1/2 animate-pulse rounded-lg bg-bg-elev" />
      </div>
    )
  }

  if (error || !data?.tool) {
    // A real 404 (bad slug) gets the notfound variant with a tool-specific
    // body. Network/server errors get the offline/server variants with
    // a retry button — those are recoverable.
    const variant = error || 'notfound'
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 font-serif">
        <ErrorState
          variant={variant}
          message={
            variant === 'notfound'
              ? `We couldn't find alternatives for "${slug}". It may not be in our catalog yet.`
              : undefined
          }
          onRetry={variant === 'notfound' ? undefined : () => setRetryNonce((n) => n + 1)}
          secondaryAction={{ label: 'Browse all tools', to: '/tools' }}
        />
      </div>
    )
  }

  const { tool, alternatives } = data
  const count = alternatives.length

  const pageTitle = `${count} Best ${tool.name} Alternatives 2026 (Free Options) | AI Compass`
  const pageDescription = `${count} hand-tested alternatives to ${tool.name}, ranked by similarity. Free tiers, pricing, and use cases compared. Curated by AI Compass. No login to compare.`
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
      <SEO
        title={`${count} Best ${tool.name} Alternatives 2026 (Free Options)`}
        description={pageDescription}
        path={`/alternatives/${tool.slug}`}
      />
      <Helmet>
        <link rel="canonical" href={canonical} />
        {/* Article wrapper so this page is eligible for top-stories /
            article rich results, matching what the listicles emit. */}
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: pageTitle,
          description: pageDescription,
          url: canonical,
          publisher: { '@type': 'Organization', name: 'AI Compass', url: 'https://ai-compass.in' },
          author: { '@type': 'Organization', name: 'AI Compass', url: 'https://ai-compass.in' },
          image: 'https://ai-compass.in/og-image.png',
          mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
          // Only emit dates when we have a real ISO timestamp from the
          // tool record. The previous fallback was a human-readable
          // "May 2026" string, which Google rejects as an invalid
          // datePublished value AND silently went stale month over
          // month. Omit > lie.
          ...(tool.last_verified_at
            ? { datePublished: tool.last_verified_at, dateModified: tool.last_verified_at }
            : {}),
        })}</script>
        {/* Breadcrumbs — Home > Tools > [tool] > Alternatives, four
            hops, last one is current page. */}
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai-compass.in/' },
            { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://ai-compass.in/tools' },
            { '@type': 'ListItem', position: 3, name: tool.name, item: `https://ai-compass.in/tools/${tool.slug}` },
            { '@type': 'ListItem', position: 4, name: 'Alternatives', item: canonical },
          ],
        })}</script>
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
            <Link to={`/tools/${tool.slug}`} {...toolHoverHandlers(tool.slug)} className="hover:text-ink-2">{tool.name}</Link>
            <span className="mx-2">/</span>
            <span className="text-ink-2">Alternatives</span>
          </nav>

          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>{`Top ${count} ${tool.name} Alternatives in 2026`}</WordReveal>
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            Hand-tested alternatives to {tool.name}, ranked by similarity across
            category, use case, and feature set. Every tool on this list is in
            our curated catalog of {catalogCount} AI tools.
          </p>
          {formatVerifiedMonth(tool.last_verified_at) ? (
            <p className="mt-4 text-sm text-muted">
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1 text-xs font-medium text-ink-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                Last reviewed: {formatVerifiedMonth(tool.last_verified_at)}
              </span>
            </p>
          ) : null}
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
                {...toolHoverHandlers(tool.slug)}
                className="hidden shrink-0 items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-sm font-medium text-ink-2 hover:border-line-strong hover:text-ink sm:inline-flex"
              >
                See full review
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </MotionDiv>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="mx-auto max-w-5xl px-4 mb-12"
        >
          <div className="rounded-2xl bg-accent-soft/30 border border-accent/20 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
             <div>
               <h2 className="text-lg font-semibold text-ink">Not sure which alternative is right for you?</h2>
               <p className="text-sm text-muted mt-1">Use our quick wizard to find the perfect tool for your workflow.</p>
             </div>
             <Link to="/ai-tool-finder" className="whitespace-nowrap rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90">
                Find the best alternative →
             </Link>
          </div>
        </MotionDiv>

        <MotionDiv
          variants={staggerParent}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-5% 0px' }}
          className="mx-auto max-w-3xl px-4 mb-16"
        >
          <h2 className="mb-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            The {count} best alternatives
          </h2>
          {alternatives.some(a => a.affiliate_url) && (
            <p className="mb-6 text-xs text-muted-2">
              Some "Try" buttons below are affiliate links — we may earn a small commission if you sign up. Ranking and review content are unaffected. <Link to="/terms" className="underline hover:text-ink-2">Disclosure</Link>.
            </p>
          )}
          <div className="space-y-6">
            {alternatives.map((alt, i) => (
              <MotionDiv
                key={alt.slug}
                id={alt.slug}
                variants={staggerChild}
                custom={i * 0.04}
                className="group rounded-3xl border border-line bg-bg-elev p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
              >
                <div className="flex flex-col sm:flex-row items-start gap-5">
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-serif font-bold text-4xl leading-none text-muted-2 w-10 shrink-0 text-center sm:text-left">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <BrandIcon tool={alt} />
                  </div>
                  <div className="min-w-0 flex-1 font-sans">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-xl font-bold tracking-tight text-ink">
                        {alt.name}
                      </h3>
                      {(alt.pricing_tier || alt.pricing) && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
                          {alt.pricing_tier || alt.pricing}
                        </span>
                      )}
                    </div>
                    <p className="mb-4 text-base leading-relaxed text-muted font-serif">
                      {alt.tagline || alt.description || ''}
                    </p>
                    
                    {alt.why_alternative && (
                      <div className="mb-5 rounded-2xl bg-accent-soft/20 border border-accent/10 p-4 text-[13px] leading-relaxed text-ink-2 relative overflow-hidden pl-7">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent/40" />
                        <span className="block font-semibold text-xs uppercase tracking-wider text-accent-ink mb-1">
                          Why we recommend it as an alternative:
                        </span>
                        {alt.why_alternative}
                      </div>
                    )}

                    {(() => {
                      const altUrl = outboundUrl(alt)
                      return (
                        <div className="flex flex-wrap items-center gap-3">
                          {altUrl && altUrl !== '#' && (
                            <a
                              href={altUrl}
                              target="_blank"
                              rel={OUTBOUND_REL}
                              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-semibold text-bg transition-all hover:gap-2 hover:bg-ink-2"
                            >
                              Try {alt.name}
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <Link
                            to={`/tools/${alt.slug}`}
                            {...toolHoverHandlers(alt.slug)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-ink"
                          >
                            Read Review →
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
              Use our 30-second wizard to find the right AI tool for your specific needs, or browse the full catalog of {catalogCount} hand-curated tools.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/ai-tool-finder"
                className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg hover:bg-ink-2"
              >
                Use the wizard
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
