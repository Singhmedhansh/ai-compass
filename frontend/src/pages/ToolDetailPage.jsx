import clsx from 'clsx'
import { motion } from 'framer-motion'
import { BadgeCheck, Heart, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import RatingWidget from '../components/ui/RatingWidget'
import ReviewsSection from '../components/ui/ReviewsSection'
import { Badge, Button, PricingSection, SkeletonToolDetail, ToolLogo } from '../components/ui'
import ErrorState from '../components/ErrorState'
import { sectionReveal, staggerChild, staggerParent } from '../lib/motion'
import { outboundUrl, OUTBOUND_REL } from '../utils/outbound'
import { inferErrorVariant } from '../utils/errorState'

const MotionDiv = motion.div

const pricingBadgeClasses = {
  free: 'bg-accent-soft text-accent-ink',
  freemium: 'bg-bg-sunk text-ink-2',
  paid: 'bg-bg-sunk text-ink-2',
}

function toSlug(value = '') {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function formatDate(value) {
  if (!value) {
    return new Date().toLocaleDateString()
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toLocaleDateString()
  }

  return parsed.toLocaleDateString()
}

// Kept for future use — not currently called. Prefixed to satisfy
// no-unused-vars (the repo's ESLint rule allows underscore-prefixed names).
function _buildStarNodes(rating, className = 'h-4 w-4') {
  const clamped = Math.max(0, Math.min(5, Number(rating) || 0))

  return Array.from({ length: 5 }, (_, index) => {
    const active = index < Math.round(clamped)

    return (
      <Star
        key={`star-${index}`}
        className={clsx(className, active ? 'fill-amber-400 text-amber-400' : 'text-line-strong')}
      />
    )
  })
}

function normalizeTool(rawTool) {
  const name = rawTool?.name || 'Unknown Tool'
  const pricing = rawTool?.pricing || rawTool?.price || rawTool?.pricingType || rawTool?.pricing_type || 'Free'
  const category = rawTool?.category || rawTool?.subCategory || 'General'

  return {
    slug: rawTool?.slug || toSlug(name),
    name,
    category,
    pricing,
    logo_url: rawTool?.logo_url || rawTool?.logoUrl || rawTool?.logo,
    logo_emoji: rawTool?.logo_emoji || rawTool?.emoji,
    accent_color: rawTool?.accent_color,
    shortDescription: rawTool?.shortDescription || rawTool?.tagline || rawTool?.summary || rawTool?.description || '',
    description: rawTool?.description || rawTool?.summary || rawTool?.shortDescription || 'No description available yet.',
    tags: Array.isArray(rawTool?.tags) ? rawTool.tags : [],
    rating: Number(rawTool?.rating || rawTool?.averageRating || rawTool?.average_rating || 0),
    ratingCount: Number(rawTool?.ratingCount || rawTool?.reviewCount || rawTool?.reviews || rawTool?.total_reviews || 0),
    ratingDistribution: rawTool?.rating_distribution || rawTool?.ratingDistribution || null,
    url: rawTool?.affiliate_url || rawTool?.url || rawTool?.website || rawTool?.link || '#',
    website: rawTool?.website || rawTool?.url || rawTool?.link,
    isAffiliateLink: Boolean(rawTool?.affiliate_url),
    platform: rawTool?.platform || (Array.isArray(rawTool?.platforms) ? rawTool.platforms.join(', ') : null),
    lastUpdated: rawTool?.last_updated || rawTool?.updatedAt || rawTool?.updated_at || rawTool?.lastUpdated,
    // ISO date string of the most recent hand-test pass. Drives the
    // "Verified <Month Year>" chip; missing = chip hidden.
    lastVerifiedAt: rawTool?.last_verified_at || rawTool?.lastVerifiedAt || null,
    studentFriendly: Boolean(rawTool?.student_friendly ?? rawTool?.studentPerk ?? rawTool?.student_perk),
    pricing_tiers: rawTool?.pricing_tiers || null,
  }
}

// "2026-05-21" -> "Verified May 2026". Returns null for missing or
// unparseable values so the chip can be conditionally rendered.
function formatVerifiedDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return `Verified ${d.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`
}

function ToolDetailPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const [tool, setTool] = useState(null)
  const [relatedTools, setRelatedTools] = useState([])
  const [isFavorite, setIsFavorite] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return Boolean(JSON.parse(localStorage.getItem('user') || 'null'))
    } catch {
      return false
    }
  })
  const [loading, setLoading] = useState(true)
  // error is null when fine, otherwise one of 'offline' | 'server' |
  // 'notfound' — see utils/errorState.js. retryNonce re-triggers the
  // effect when the user hits "Try again" without reloading the page.
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    const toolController = new AbortController()

    async function loadPageData() {
      setLoading(true)
      setError(null)

      try {
        const toolResponse = await fetch(`/api/v1/tools/${slug}`, { signal: toolController.signal })

        if (!toolResponse.ok) {
          // Tag the error with its HTTP status so inferErrorVariant can
          // distinguish a real 404 (bad slug) from a 5xx (server hiccup).
          const httpErr = new Error(`Unable to load tool (${toolResponse.status})`)
          httpErr.status = toolResponse.status
          throw httpErr
        }

        const toolPayload = await toolResponse.json()
        const normalizedTool = normalizeTool(toolPayload)
        setTool(normalizedTool)

        if (Array.isArray(toolPayload.similar_tools) && toolPayload.similar_tools.length > 0) {
          setRelatedTools(
            toolPayload.similar_tools
              .map(normalizeTool)
              .filter((item) => item.slug !== normalizedTool.slug)
          )
        } else {
          setRelatedTools([])
        }
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(inferErrorVariant(requestError))
          setTool(null)
          setRelatedTools([])
        }
      } finally {
        if (!toolController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadPageData()

    return () => {
      toolController.abort()
    }
  }, [slug, retryNonce])

  useEffect(() => {
    const syncUserState = () => {
      try {
        setIsLoggedIn(Boolean(JSON.parse(localStorage.getItem('user') || 'null')))
      } catch {
        setIsLoggedIn(false)
      }
    }

    window.addEventListener('storage', syncUserState)
    window.addEventListener('userLoggedIn', syncUserState)

    return () => {
      window.removeEventListener('storage', syncUserState)
      window.removeEventListener('userLoggedIn', syncUserState)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function syncFavoriteStatus() {
      if (!isLoggedIn || !tool?.slug) {
        setIsFavorite(false)
        return
      }

      try {
        const response = await fetch('/api/v1/favorites')
        if (!response.ok) {
          return
        }

        const payload = await response.json()
        const favorites = Array.isArray(payload) ? payload : []
        const favoriteSlugs = new Set(
          favorites
            .map((item) => toSlug(item?.slug || item?.name || ''))
            .filter(Boolean),
        )

        if (!cancelled) {
          setIsFavorite(favoriteSlugs.has(toSlug(tool.slug)))
        }
      } catch {
        if (!cancelled) {
          setIsFavorite(false)
        }
      }
    }

    syncFavoriteStatus()

    return () => {
      cancelled = true
    }
  }, [isLoggedIn, tool?.slug])

  useEffect(() => {
    const normalizedSlug = String(slug || '').trim().toLowerCase()
    if (!normalizedSlug) {
      return
    }

    try {
      const raw = localStorage.getItem('recentlyViewed')
      const parsed = raw ? JSON.parse(raw) : []
      const existing = Array.isArray(parsed)
        ? parsed
            .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
            .filter(Boolean)
        : []

      const deduped = [normalizedSlug, ...existing.filter((item) => item !== normalizedSlug)].slice(0, 10)
      localStorage.setItem('recentlyViewed', JSON.stringify(deduped))
    } catch {
      localStorage.setItem('recentlyViewed', JSON.stringify([normalizedSlug]))
    }
  }, [slug])

  const priceKey = (tool?.pricing || 'free').toLowerCase().includes('paid')
    ? 'paid'
    : (tool?.pricing || '').toLowerCase().includes('freemium')
      ? 'freemium'
      : 'free'

  const handleFavoriteToggle = async () => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true)
      return
    }

    try {
      const response = await fetch('/api/v1/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug: tool?.slug }),
      })

      if (!response.ok) {
        throw new Error('Failed to toggle favorite')
      }

      const payload = await response.json().catch(() => ({}))
      if (typeof payload?.favorited === 'boolean') {
        setIsFavorite(payload.favorited)
      } else {
        setIsFavorite((previous) => !previous)
      }

      window.dispatchEvent(new Event('favoritesUpdated'))
    } catch {
      // Keep previous UI state when request fails.
    }
  }

  // Gate Helmet on `tool` being present so we don't briefly render a generic
  // title before the fetch completes (which would otherwise flicker in tab title).
  const helmetDescription = tool
    ? (tool.tagline
        ? `${tool.name}: ${tool.tagline}. Read our review, pricing breakdown, and alternatives on AI Compass.`
        : `${tool.name} review on AI Compass: pricing, features, and alternatives. Hand-curated for students.`
      ).slice(0, 160)
    : null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {tool ? (
        <Helmet>
          <title>{`${tool.name} — Review, Pricing & Alternatives | AI Compass`}</title>
          <meta name="description" content={helmetDescription} />
          <link rel="canonical" href={`https://ai-compass.in/tools/${tool.slug}`} />
          <meta property="og:type" content="article" />
          <meta property="og:title" content={`${tool.name} — Review & Alternatives`} />
          <meta property="og:description" content={tool.tagline || `${tool.name} on AI Compass`} />
          <meta property="og:url" content={`https://ai-compass.in/tools/${tool.slug}`} />
          <meta property="og:image" content={`https://ai-compass.in/og/${tool.slug}.png`} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={`${tool.name} — AI Compass`} />
          <meta name="twitter:description" content={tool.tagline || `${tool.name} on AI Compass`} />
          <meta name="twitter:image" content={`https://ai-compass.in/og/${tool.slug}.png`} />
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: tool.name,
              description: tool.description || tool.tagline,
              applicationCategory: tool.category,
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: tool.pricing === 'free' ? '0' : undefined,
                priceCurrency: 'USD',
              },
              ...(Number(tool.rating) > 0
                ? {
                    aggregateRating: {
                      '@type': 'AggregateRating',
                      ratingValue: Number(tool.rating),
                      reviewCount: Number(tool.review_count) || 1,
                    },
                  }
                : {}),
              url: `https://ai-compass.in/tools/${tool.slug}`,
              image: `https://ai-compass.in/og/${tool.slug}.png`,
            })}
          </script>
        </Helmet>
      ) : null}
      {loading ? (
        <SkeletonToolDetail />
      ) : error || !tool ? (
        <ErrorState
          variant={error || 'server'}
          onRetry={() => setRetryNonce((n) => n + 1)}
          secondaryAction={{ label: 'Browse all tools', to: '/tools' }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex-1 space-y-6">
          <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
          <section className="rounded-2xl border border-line bg-bg-elev p-6 shadow-lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-bg-sunk">
                <ToolLogo tool={tool} size={64} />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl lg:text-4xl">{tool.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge label={tool.category} variant={tool.category} />
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
                      pricingBadgeClasses[priceKey],
                    )}
                  >
                    {tool.pricing}
                  </span>
                  {/* Trust signal: when the tool was last hand-tested.
                      Distinct from the pricing/category badges so users
                      read it as editorial provenance, not metadata. */}
                  {formatVerifiedDate(tool.lastVerifiedAt) && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-ink"
                      title={`Hand-tested on ${tool.lastVerifiedAt}`}
                    >
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatVerifiedDate(tool.lastVerifiedAt)}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-muted">{tool.shortDescription}</p>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <a
                    href={outboundUrl(tool)}
                    target="_blank"
                    rel={OUTBOUND_REL}
                    className="w-full"
                  >
                    <Button className="w-full">Visit Tool</Button>
                  </a>
                  <Button variant="ghost" className="w-full gap-2" onClick={handleFavoriteToggle}>
                    <Heart className={clsx('h-4 w-4', isFavorite ? 'fill-danger text-danger' : 'text-muted')} />
                    {isFavorite ? 'Saved to Favorites' : 'Save to Favorites'}
                  </Button>
                </div>
                {tool.isAffiliateLink ? (
                  <p className="mt-2 text-xs text-muted-2">
                    AI Compass may earn a commission when you sign up through this link, at no extra cost to you.
                  </p>
                ) : null}
                <Link
                  to={`/alternatives/${tool.slug}`}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:gap-2 hover:text-ink"
                >
                  See alternatives to {tool.name} →
                </Link>

                {showLoginPrompt ? (
                  <div className="mt-4 rounded-xl border border-accent bg-accent-soft p-3 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-medium text-accent-ink">Log in to save favorites</p>
                      <button
                        type="button"
                        className="self-start text-xs font-semibold text-accent-ink hover:underline"
                        onClick={() => setShowLoginPrompt(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        to="/login"
                        state={{ from: location.pathname }}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90"
                      >
                        Log In
                      </Link>
                      <Link
                        to="/register"
                        state={{ from: location.pathname }}
                        className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-bg-elev"
                      >
                        Register Free
                      </Link>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {tool.tags.length > 0 ? (
                tool.tags.map((tag) => (
                  <span
                    key={`${tool.slug}-tag-${tag}`}
                    className="rounded-full border border-line bg-bg-sunk px-2.5 py-1 text-xs font-medium text-muted"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-2">No tags yet</span>
              )}
            </div>
          </section>
          </MotionDiv>

          <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
          <section className="rounded-2xl border border-line bg-bg-elev p-6">
            <h2 className="text-lg font-semibold text-ink">About this tool</h2>
            <p className="mt-3 leading-relaxed text-ink-2">{tool.description}</p>
          </section>
          </MotionDiv>

          <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
            <PricingSection tool={tool} />
          </MotionDiv>

          <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
            <RatingWidget slug={tool.slug} isLoggedIn={isLoggedIn} />
          </MotionDiv>
          <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
            <ReviewsSection slug={tool.slug} isLoggedIn={isLoggedIn} />
          </MotionDiv>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit lg:w-80">
          <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
          <section className="rounded-2xl border border-line bg-bg-elev p-5">
            <h3 className="text-base font-semibold text-ink">Quick info</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Pricing</dt>
                <dd className="text-ink">{tool.pricing}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Platform</dt>
                <dd className="text-ink">{tool.platform || 'Web'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Category</dt>
                <dd className="text-ink">{tool.category}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Last updated</dt>
                <dd className="text-ink">{formatDate(tool.lastUpdated)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Student friendly</dt>
                <dd>
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                      tool.studentFriendly
                        ? 'bg-accent-soft text-accent-ink'
                        : 'bg-bg-sunk text-ink-2',
                    )}
                  >
                    {tool.studentFriendly ? 'Yes' : 'No'}
                  </span>
                </dd>
              </div>
            </dl>
          </section>
          </MotionDiv>

          <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
          <section className="rounded-2xl border border-line bg-bg-elev p-5">
            <h3 className="text-base font-semibold text-ink">Related Tools</h3>

            {relatedTools.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No related tools found.</p>
            ) : (
              <MotionDiv
                variants={staggerParent}
                initial="initial"
                animate="animate"
                className="mt-4 space-y-3"
              >
                {relatedTools.map((relatedTool, i) => (
                  <MotionDiv
                    key={relatedTool.slug}
                    variants={staggerChild}
                    custom={Math.min(i, 5) * 0.04}
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/tools/${relatedTool.slug}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-bg-elev p-3 text-left transition hover:border-accent hover:bg-bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg-sunk">
                        <ToolLogo tool={relatedTool} size={40} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{relatedTool.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {relatedTool.category || relatedTool.pricing || 'Curated pick'}
                        </p>
                      </div>
                    </button>
                  </MotionDiv>
                ))}
              </MotionDiv>
            )}
          </section>
          </MotionDiv>
        </aside>
        </div>
      )}
    </div>
  )
}

export default ToolDetailPage
