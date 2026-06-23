import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, Check, Folder, Heart, Star, Shield, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import RatingWidget from '../components/ui/RatingWidget'
import ReviewsSection from '../components/ui/ReviewsSection'
import { Badge, Button, PricingSection, SkeletonToolDetail, ToolLogo } from '../components/ui'
import ErrorState from '../components/ErrorState'
import { sectionReveal, staggerChild, staggerParent } from '../lib/motion'
import { classifyStudentOffer } from '../utils/student'
import {
  toolHoverHandlers,
  alternativesHoverHandlers,
  compareHoverHandlers,
} from '../lib/prefetch'
import { outboundUrl, OUTBOUND_REL } from '../utils/outbound'
import { inferErrorVariant } from '../utils/errorState'

const MotionDiv = motion.div

// Shown to users who arrive directly on a tool page (empty referrer or external
// referrer). Gives cold visitors instant site context before they bounce.
// Dismissed per-session via sessionStorage so repeat visitors never see it.
function DirectLandingStrip() {
  const [show, setShow] = useState(() => {
    // Don't re-show after dismissal within the same session
    if (typeof sessionStorage !== 'undefined') {
      if (sessionStorage.getItem('ai_compass_strip_dismissed')) return false
    }
    // Show if referrer is empty (direct link) or from an external domain
    try {
      const ref = document.referrer
      if (!ref) return true
      const refHost = new URL(ref).hostname
      return !refHost.includes('ai-compass.in')
    } catch {
      return true
    }
  })

  const dismiss = () => {
    setShow(false)
    try { sessionStorage.setItem('ai_compass_strip_dismissed', '1') } catch { /* ignore */ }
  }

  if (!show) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-2.5 text-sm"
      >
        <p className="text-accent-ink">
          You&rsquo;re on{' '}
          <Link to="/" className="font-bold text-accent hover:underline underline-offset-2">
            AI Compass
          </Link>
          {' '}— 400+ free AI tools, hand-tested for students.{' '}
          <Link
            to="/tools"
            className="font-semibold text-accent hover:underline underline-offset-2"
          >
            Browse all →
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-0.5 text-accent hover:bg-accent/10 transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

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
    student_friendly: rawTool?.student_friendly,
    student_perk: rawTool?.student_perk || rawTool?.studentPerk,
    pricingDetail: rawTool?.pricingDetail || rawTool?.pricing_detail || '',
    uniHack: rawTool?.uniHack || '',
    pricing_tiers: rawTool?.pricing_tiers || null,
    // Fields below feed structured data (SoftwareApplication JSON-LD).
    // They're surfaced here so the JSON-LD block doesn't have to dig into
    // raw payload shapes — and so we have one source of truth for what
    // the SERP sees vs. what the visible UI renders.
    maker: rawTool?.maker || rawTool?.company || null,
    features: Array.isArray(rawTool?.features) ? rawTool.features : [],
    useCases: Array.isArray(rawTool?.use_cases) ? rawTool.use_cases : [],
    // Cheapest non-zero tier from pricing_tiers.tiers[], if any. Powers
    // a real Offer in JSON-LD — Google requires a numeric `price`, so
    // labels like "Freemium" alone aren't enough.
    academic_integrity_rating: rawTool?.academic_integrity_rating || null,
    academic_warning: rawTool?.academic_warning || null,
    lowestPaidTier: (() => {
      const tiers = rawTool?.pricing_tiers?.tiers
      if (!Array.isArray(tiers)) return null
      const paid = tiers.filter((t) => typeof t?.price_amount === 'number' && t.price_amount > 0)
      if (paid.length === 0) return null
      return paid.reduce((a, b) => (a.price_amount <= b.price_amount ? a : b))
    })(),
    pricingCurrency: rawTool?.pricing_tiers?.currency || 'USD',
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
  const [folders, setFolders] = useState([])
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
  const [activeTab, setActiveTab] = useState('info')
  const tabs = [
    { id: 'info', label: 'Information' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'reviews', label: 'Community' }
  ]

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
    if (!isLoggedIn) {
      setFolders([])
      return
    }

    let cancelled = false
    async function loadFolders() {
      try {
        const res = await fetch('/api/v1/profile/favorites/folders')
        if (res.ok && !cancelled) {
          const data = await res.json()
          setFolders(data)
        }
      } catch (err) {
        console.error('Failed to load folders', err)
      }
    }
    loadFolders()

    return () => {
      cancelled = true
    }
  }, [isLoggedIn])

  const handleFolderClick = async (folderName, isMember) => {
    if (!isMember) {
      try {
        const res = await fetch(`/api/v1/profile/favorites/folders/${encodeURIComponent(folderName)}/tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool_id: tool?.slug }),
          credentials: 'include'
        })
        if (!res.ok) {
          console.error('Failed to add to folder')
        }
      } catch (err) {
        console.error('Error adding to folder', err)
      }
    }
    // Navigate to dashboard and activate this folder
    navigate(`/dashboard?folder=${encodeURIComponent(folderName)}`)
  }

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

      const deduped = [normalizedSlug, ...existing.filter((item) => item !== normalizedSlug)].slice(0, 50)
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
      {/* Context strip for direct / external-referrer landings — renders even
          during skeleton load so cold visitors see site value immediately */}
      <DirectLandingStrip />
      {tool ? (
        <Helmet>
          <title>{`${tool.name} Review 2026: Is It Free? Pricing & Verdict | AI Compass`}</title>
          <meta name="description" content={helmetDescription} />
          <link rel="canonical" href={`https://ai-compass.in/tools/${tool.slug}`} />
          <meta property="og:type" content="article" />
          <meta property="og:title" content={`${tool.name} Review 2026: Is It Free? Pricing & Verdict`} />
          <meta property="og:description" content={tool.tagline || `${tool.name} on AI Compass`} />
          <meta property="og:url" content={`https://ai-compass.in/tools/${tool.slug}`} />
          <meta property="og:image" content={`https://ai-compass.in/og/${tool.slug}.png`} />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={`${tool.name} Review 2026: Is It Free? Pricing & Verdict`} />
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
              ...(tool.maker
                ? { brand: { '@type': 'Brand', name: tool.maker } }
                : {}),
              // featureList capped at 12 to keep payload reasonable and
              // avoid Google's "keyword-stuffed structured data" flag.
              ...(tool.features.length > 0
                ? { featureList: tool.features.slice(0, 12) }
                : {}),
              // Offer logic, in priority order:
              //   1. If pricing_tiers has a real paid tier with a numeric
              //      price_amount, emit Offer at the cheapest paid tier.
              //      Google needs a number; "Freemium" alone won't render.
              //   2. Else if pricingTier label is "Free" (case-insensitive),
              //      emit a $0 Offer. Earlier code used `=== 'free'` which
              //      never matched the API's capitalised labels — Offer has
              //      effectively been dead on every tool until now.
              //   3. Else omit Offer entirely (better no Offer than a wrong
              //      one — Google penalises misleading price markup).
              ...(tool.lowestPaidTier
                ? {
                    offers: {
                      '@type': 'Offer',
                      price: String(tool.lowestPaidTier.price_amount),
                      priceCurrency: tool.pricingCurrency,
                      ...(tool.lowestPaidTier.cta_url
                        ? { url: tool.lowestPaidTier.cta_url }
                        : {}),
                      availability: 'https://schema.org/InStock',
                    },
                  }
                : String(tool.pricing || '').toLowerCase() === 'free'
                  ? {
                      offers: {
                        '@type': 'Offer',
                        price: '0',
                        priceCurrency: 'USD',
                        availability: 'https://schema.org/InStock',
                      },
                    }
                  : {}),
              // AggregateRating: previously referenced tool.review_count
              // (undefined on the normalised object) so reviewCount always
              // fell through to the hardcoded 1. Use tool.ratingCount and
              // gate on both fields being real numbers so we don't claim
              // "1 review" when there are zero.
              ...(Number(tool.rating) > 0 && Number(tool.ratingCount) > 0
                ? {
                    aggregateRating: {
                      '@type': 'AggregateRating',
                      ratingValue: Number(tool.rating),
                      reviewCount: Number(tool.ratingCount),
                    },
                  }
                : {}),
              url: `https://ai-compass.in/tools/${tool.slug}`,
              image: `https://ai-compass.in/og/${tool.slug}.png`,
            })}
          </script>
          {/* Breadcrumb structured data — Google renders this as the
              breadcrumb trail under the SERP title. Two visible hops
              (Home > Tools) plus the current tool. */}
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai-compass.in/' },
                { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://ai-compass.in/tools' },
                { '@type': 'ListItem', position: 3, name: tool.name, item: `https://ai-compass.in/tools/${tool.slug}` },
              ],
            })}
          </script>
        </Helmet>
      ) : null}
      {tool && !loading && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 text-sm border-b border-line pb-4">
          <nav className="flex items-center space-x-2 text-muted" aria-label="Breadcrumb">
            <Link to="/" className="hover:text-ink transition-colors font-medium">AI Compass</Link>
            <span className="text-muted-2">/</span>
            <Link to={`/tools?category=${encodeURIComponent(tool.category)}`} className="hover:text-ink transition-colors font-medium">{tool.category}</Link>
            <span className="text-muted-2">/</span>
            <span className="text-ink font-semibold" aria-current="page">{tool.name}</span>
          </nav>
 
          <Link
            to="/tools"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg-elev px-4 py-2 text-xs font-semibold text-ink-2 hover:bg-bg-sunk hover:text-ink transition"
          >
            ← Back to Directory
          </Link>
        </div>
      )}
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
                  <span className="inline-flex items-center rounded-full bg-accent-soft/50 px-2.5 py-1 text-xs font-semibold text-accent-ink border border-accent/20">
                    👍 Recommended for Students
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    ⚡ Free tier available
                  </span>
                  {(() => {
                    const studentTag = classifyStudentOffer(tool)
                    return studentTag && (
                      <span className={clsx(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide border",
                        studentTag === 'Student Discount' && 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
                        studentTag === 'Student Perks' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                        studentTag === 'Student Hacks' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                      )}>
                        {studentTag}
                      </span>
                    )
                  })()}
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

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <a
                    href={outboundUrl(tool)}
                    target="_blank"
                    rel={OUTBOUND_REL}
                    className="w-full"
                  >
                    <Button className="w-full font-bold">Visit Tool</Button>
                  </a>
                  <Button variant="ghost" className="w-full gap-2" onClick={handleFavoriteToggle}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={isFavorite ? 'fav-on' : 'fav-off'}
                        initial={{ opacity: 0, scale: 0.7, rotate: -12 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.8, rotate: 12 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        className="flex items-center justify-center"
                      >
                        <Heart className={clsx('h-4 w-4', isFavorite ? 'fill-danger text-danger' : 'text-muted')} />
                      </motion.span>
                    </AnimatePresence>
                    {isFavorite ? 'Saved' : 'Save'}
                  </Button>
                </div>

                <p className="mt-5 text-sm leading-relaxed text-ink-2">{tool.shortDescription}</p>

                {isFavorite && isLoggedIn && (
                  <div className="mt-4 rounded-xl border border-line bg-bg-elev/40 p-4 shadow-sm backdrop-blur-md">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                      <Folder className="h-3.5 w-3.5" /> Organize to Folder
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {folders.length === 0 ? (
                        <div className="text-xs text-muted flex flex-col gap-1.5">
                          <span>You don't have any folders yet. Create folders on your Dashboard to organize favorites.</span>
                          <Link to="/dashboard" className="text-accent hover:underline font-semibold w-fit">Go to Dashboard →</Link>
                        </div>
                      ) : (
                        folders.map((folder) => {
                          const isMember = Array.isArray(folder.tools) && folder.tools.map(t => String(t).toLowerCase()).includes(String(tool?.slug).toLowerCase())
                          
                          return (
                            <button
                              key={folder.name}
                              type="button"
                              onClick={() => handleFolderClick(folder.name, isMember)}
                              className={clsx(
                                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer",
                                isMember 
                                  ? "bg-accent/10 border-accent/30 text-accent hover:bg-accent/20"
                                  : "bg-bg-sunk/50 border-line text-ink-2 hover:bg-bg-sunk hover:text-ink"
                              )}
                            >
                              <span>{folder.name}</span>
                              {isMember && <Check className="h-3 w-3" />}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
                {tool.isAffiliateLink ? (
                  <p className="mt-2 text-xs text-muted-2">
                    AI Compass may earn a commission when you sign up through this link, at no extra cost to you.
                  </p>
                ) : null}
                <Link
                  to={`/alternatives/${tool.slug}`}
                  {...alternativesHoverHandlers(tool.slug)}
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

          {/* Interactive Horizontal Tabs */}
          <div className="relative border-b border-line pb-px flex gap-8">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "relative py-3 text-sm font-semibold transition-colors duration-200 cursor-pointer focus-visible:outline-none",
                    isActive ? "text-accent" : "text-ink-2 hover:text-ink"
                  )}
                >
                  {tab.label}
                  {isActive && (
                    <motion.div
                      layoutId="active-tab-line"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              )
            })}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'info' && (
              <motion.div
                key="info"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                className="space-y-6"
              >
                {tool.academic_integrity_rating && (
                  <section className={clsx(
                    "rounded-2xl border p-6 shadow-sm relative overflow-hidden backdrop-blur-sm",
                    tool.academic_integrity_rating === 'Safe' && 'bg-emerald-500/5 border-emerald-500/20 text-ink-2',
                    tool.academic_integrity_rating === 'Use with Caution' && 'bg-amber-500/5 border-amber-500/20 text-ink-2',
                    tool.academic_integrity_rating === 'High Risk' && 'bg-rose-500/5 border-rose-500/20 text-ink-2'
                  )}>
                    <h3 className="text-base font-bold flex items-center gap-2 mb-3">
                      <Shield className="h-5 w-5 text-accent" />
                      <span>Academic Integrity:</span>
                      <span className={clsx(
                        "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                        tool.academic_integrity_rating === 'Safe' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        tool.academic_integrity_rating === 'Use with Caution' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                        tool.academic_integrity_rating === 'High Risk' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                      )}>
                        {tool.academic_integrity_rating}
                      </span>
                    </h3>
                    <p className="text-sm leading-relaxed">{tool.academic_warning}</p>
                  </section>
                )}

                <section className="rounded-2xl border border-line bg-bg-elev p-6">
                  <h2 className="text-lg font-semibold text-ink">About this tool</h2>
                  <p className="mt-3 leading-relaxed text-ink-2">{tool.description}</p>
                </section>
              </motion.div>
            )}

            {activeTab === 'pricing' && (
              <motion.div
                key="pricing"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
              >
                <PricingSection tool={tool} />
              </motion.div>
            )}

            {activeTab === 'reviews' && (
              <motion.div
                key="reviews"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                className="space-y-6"
              >
                <RatingWidget slug={tool.slug} isLoggedIn={isLoggedIn} />
                <ReviewsSection slug={tool.slug} isLoggedIn={isLoggedIn} />
              </motion.div>
            )}
          </AnimatePresence>
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
                  {(() => {
                    const studentTag = classifyStudentOffer(tool)
                    return (
                      <span
                        className={clsx(
                          'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                          studentTag
                            ? 'bg-accent-soft text-accent-ink'
                            : 'bg-bg-sunk text-ink-2',
                        )}
                      >
                        {studentTag || 'No'}
                      </span>
                    )
                  })()}
                </dd>
              </div>
            </dl>
          </section>
          </MotionDiv>

          {/* Compare-with-X link list. Surfaces the /compare/<a>-vs-<b>
              route so users can jump from a tool page straight into a
              side-by-side view, AND so crawlers find the dynamic compare
              pages via an editorial link (not just the sitemap). Anchor
              text contains both tool names — exactly the long-tail query
              shape ("X vs Y") we're targeting. */}
          {relatedTools.length > 0 ? (
            <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
              <section className="rounded-2xl border border-line bg-bg-elev p-5">
                <h3 className="text-base font-semibold text-ink">Compare {tool.name} with</h3>
                <ul className="mt-3 space-y-1.5">
                  {relatedTools.slice(0, 4).map((rt) => (
                    <li key={`compare-${rt.slug}`}>
                      <Link
                        to={`/compare/${tool.slug}-vs-${rt.slug}`}
                        {...compareHoverHandlers()}
                        className="inline-flex items-center gap-1 text-sm text-ink-2 hover:gap-2 hover:text-ink transition-all"
                      >
                        {tool.name} vs {rt.name} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </MotionDiv>
          ) : null}

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
                      {...toolHoverHandlers(relatedTool.slug)}
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
