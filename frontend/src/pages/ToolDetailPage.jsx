import clsx from 'clsx'
import { Heart, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import PageTransition from '../components/PageTransition'
import RatingWidget from '../components/ui/RatingWidget'
import ReviewsSection from '../components/ui/ReviewsSection'
import { Badge, Button, ToolLogo } from '../components/ui'

const pricingBadgeClasses = {
  free: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
  freemium: 'bg-amber-500/20 text-amber-300 ring-amber-500/30',
  paid: 'bg-rose-500/20 text-rose-300 ring-rose-500/30',
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

function buildStarNodes(rating, className = 'h-4 w-4') {
  const clamped = Math.max(0, Math.min(5, Number(rating) || 0))

  return Array.from({ length: 5 }, (_, index) => {
    const active = index < Math.round(clamped)

    return (
      <Star
        key={`star-${index}`}
        className={clsx(className, active ? 'fill-amber-400 text-amber-400' : 'text-gray-500 dark:text-gray-500')}
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
    url: rawTool?.url || rawTool?.link || rawTool?.website || '#',
    platform: rawTool?.platform || (Array.isArray(rawTool?.platforms) ? rawTool.platforms.join(', ') : null),
    lastUpdated: rawTool?.last_updated || rawTool?.updatedAt || rawTool?.updated_at || rawTool?.lastUpdated,
    studentFriendly: Boolean(rawTool?.student_friendly ?? rawTool?.studentPerk ?? rawTool?.student_perk),
  }
}

function ToolDetailPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()

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
  const [error, setError] = useState('')

  useEffect(() => {
    const toolController = new AbortController()

    async function loadPageData() {
      setLoading(true)
      setError('')

      try {
        const toolResponse = await fetch(`/api/v1/tools/${slug}`, { signal: toolController.signal })

        if (!toolResponse.ok) {
          throw new Error(`Unable to load tool (${toolResponse.status})`)
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
          setError(requestError.message || 'Unable to load tool details.')
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
  }, [slug])

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

    const nextValue = !isFavorite
    setIsFavorite(nextValue)

    try {
      await fetch('/api/v1/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug: tool?.slug, favorite: nextValue }),
      })
    } catch {
      setIsFavorite(!nextValue)
    }
  }

  if (loading) {
    return (
      <PageTransition>
        <main className="mx-auto w-full max-w-7xl bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">Loading tool details...</div>
        </main>
      </PageTransition>
    )
  }

  if (error || !tool) {
    return (
      <PageTransition>
        <main className="mx-auto w-full max-w-7xl bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-700 dark:text-red-200">
            {error || 'Tool not found.'}
          </div>
        </main>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-7xl bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex-1 space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
                <ToolLogo tool={tool} size={64} />
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{tool.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge label={tool.category} variant={tool.category} />
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset',
                      pricingBadgeClasses[priceKey],
                    )}
                  >
                    {tool.pricing}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{tool.shortDescription}</p>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <a href={tool.url} target="_blank" rel="noreferrer" className="w-full">
                    <Button className="w-full">Visit Tool</Button>
                  </a>
                  <Button variant="ghost" className="w-full gap-2" onClick={handleFavoriteToggle}>
                    <Heart className={clsx('h-4 w-4', isFavorite ? 'fill-red-500 text-red-500' : 'text-gray-300 dark:text-gray-600')} />
                    Save to Favorites
                  </Button>
                </div>

                {showLoginPrompt ? (
                  <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm dark:border-indigo-500/30 dark:bg-indigo-500/10">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-medium text-indigo-800 dark:text-indigo-200">Log in to save favorites</p>
                      <button
                        type="button"
                        className="self-start text-xs font-semibold text-indigo-700 hover:text-indigo-900 dark:text-indigo-200 dark:hover:text-white"
                        onClick={() => setShowLoginPrompt(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href="/login" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">Log In</a>
                      <a href="/register" className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-400/40 dark:text-indigo-200 dark:hover:bg-indigo-500/20">Register Free</a>
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
                    className="rounded-full border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-500">No tags yet</span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">About this tool</h2>
            <p className="mt-3 leading-relaxed text-gray-600 dark:text-gray-400">{tool.description}</p>
          </section>

          <RatingWidget slug={tool.slug} isLoggedIn={isLoggedIn} />
          <ReviewsSection slug={tool.slug} isLoggedIn={isLoggedIn} />
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit lg:w-80">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Quick info</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600 dark:text-gray-400">Pricing</dt>
                <dd className="text-gray-900 dark:text-gray-100">{tool.pricing}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600 dark:text-gray-400">Platform</dt>
                <dd className="text-gray-900 dark:text-gray-100">{tool.platform || 'Web'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600 dark:text-gray-400">Category</dt>
                <dd className="text-gray-900 dark:text-gray-100">{tool.category}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600 dark:text-gray-400">Last updated</dt>
                <dd className="text-gray-900 dark:text-gray-100">{formatDate(tool.lastUpdated)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-600 dark:text-gray-400">Student friendly</dt>
                <dd>
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset',
                      tool.studentFriendly
                        ? 'bg-emerald-500/20 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300'
                        : 'bg-gray-200 text-gray-700 ring-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600',
                    )}
                  >
                    {tool.studentFriendly ? 'Yes' : 'No'}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Related Tools</h3>

            {relatedTools.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">No related tools found.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {relatedTools.map((relatedTool) => {
                  return (
                    <button
                      key={relatedTool.slug}
                      type="button"
                      onClick={() => navigate(`/tools/${relatedTool.slug}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-indigo-500 dark:hover:bg-gray-800"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <ToolLogo tool={relatedTool} size={40} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{relatedTool.name}</p>
                        <div className="mt-1 flex items-center gap-0.5">{buildStarNodes(relatedTool.rating, 'h-3.5 w-3.5')}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
      </main>
    </PageTransition>
  )
}

export default ToolDetailPage
