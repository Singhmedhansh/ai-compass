import clsx from 'clsx'
import { Heart, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { Badge, Button } from '../components/ui'
import { getAvatarClass, getToolDomain } from '../utils/toolBranding'

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
        className={clsx(className, active ? 'fill-amber-400 text-amber-400' : 'text-slate-600')}
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

function getRatingPercentages(distribution, fallbackRating, fallbackCount) {
  const safeCount = Math.max(0, Number(fallbackCount) || 0)

  if (distribution && typeof distribution === 'object') {
    const counts = [5, 4, 3, 2, 1].map((key) => {
      const value = distribution[String(key)] ?? distribution[key]
      return Math.max(0, Number(value) || 0)
    })

    const total = counts.reduce((sum, current) => sum + current, 0)
    if (total > 0) {
      return counts.map((count) => Math.round((count / total) * 100))
    }
  }

  if (safeCount <= 0) {
    return [0, 0, 0, 0, 0]
  }

  const rounded = Math.max(1, Math.min(5, Math.round(Number(fallbackRating) || 0)))
  return [5, 4, 3, 2, 1].map((bucket) => (bucket === rounded ? 100 : 0))
}

function ToolDetailPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()

  const [tool, setTool] = useState(null)
  const [reviews, setReviews] = useState([])
  const [relatedTools, setRelatedTools] = useState([])
  const [relatedImgErrors, setRelatedImgErrors] = useState({})
  const [isFavorite, setIsFavorite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [slug])

  useEffect(() => {
    setRelatedImgErrors({})
  }, [relatedTools])

  useEffect(() => {
    const toolController = new AbortController()
    const reviewsController = new AbortController()

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

        const reviewResponse = await fetch(`/api/v1/tools/${slug}/reviews`, { signal: reviewsController.signal })
        if (reviewResponse.ok) {
          const reviewPayload = await reviewResponse.json()
          setReviews(Array.isArray(reviewPayload) ? reviewPayload : [])
        } else {
          setReviews([])
        }

        const categoryQuery = encodeURIComponent(normalizedTool.category || '')
        const relatedResponse = await fetch(`/api/v1/tools?category=${categoryQuery}`, { signal: toolController.signal })
        if (relatedResponse.ok) {
          const relatedPayload = await relatedResponse.json()
          const toolsList = Array.isArray(relatedPayload) ? relatedPayload : []

          const related = toolsList
            .map(normalizeTool)
            .filter((item) => item.slug !== normalizedTool.slug)
            .slice(0, 4)

          setRelatedTools(related)
        } else {
          setRelatedTools([])
        }
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Unable to load tool details.')
          setTool(null)
          setReviews([])
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
      reviewsController.abort()
    }
  }, [slug])

  const priceKey = (tool?.pricing || 'free').toLowerCase().includes('paid')
    ? 'paid'
    : (tool?.pricing || '').toLowerCase().includes('freemium')
      ? 'freemium'
      : 'free'

  const ratingBars = useMemo(
    () => getRatingPercentages(tool?.ratingDistribution, tool?.rating, tool?.ratingCount),
    [tool?.ratingDistribution, tool?.rating, tool?.ratingCount],
  )

  const logoUrl = tool ? `https://logo.clearbit.com/${getToolDomain(tool.name)}` : ''

  const handleFavoriteToggle = async () => {
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
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300">Loading tool details...</div>
      </main>
    )
  }

  if (error || !tool) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-red-200">
          {error || 'Tool not found.'}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex-1 space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-800">
                {!imgError ? (
                  <img
                    src={logoUrl}
                    alt={`${tool.name} logo`}
                    className="h-14 w-14 rounded-xl bg-white p-2 object-contain"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <div
                    className={clsx(
                      'flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold',
                      getAvatarClass(tool.name),
                    )}
                  >
                    {tool.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-white">{tool.name}</h1>
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
                <p className="mt-3 text-sm text-slate-400">{tool.shortDescription}</p>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <a href={tool.url} target="_blank" rel="noreferrer" className="w-full">
                    <Button className="w-full">Visit Tool</Button>
                  </a>
                  <Button variant="ghost" className="w-full gap-2" onClick={handleFavoriteToggle}>
                    <Heart className={clsx('h-4 w-4', isFavorite ? 'fill-red-500 text-red-500' : 'text-slate-300')} />
                    Save to Favorites
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {tool.tags.length > 0 ? (
                tool.tags.map((tag) => (
                  <span
                    key={`${tool.slug}-tag-${tag}`}
                    className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-300"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">No tags yet</span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">About this tool</h2>
            <p className="mt-3 leading-relaxed text-slate-300">{tool.description}</p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">Community Rating</h2>
            <div className="mt-4 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-5xl font-bold text-white">{(Number(tool.rating) || 0).toFixed(1)}</p>
                <div className="mt-2 flex items-center gap-1">{buildStarNodes(tool.rating, 'h-5 w-5')}</div>
                <p className="mt-2 text-sm text-slate-400">Based on {tool.ratingCount || 0} ratings</p>
              </div>

              <div className="w-full max-w-md space-y-3">
                {[5, 4, 3, 2, 1].map((label, index) => (
                  <div key={`rating-bar-${label}`} className="flex items-center gap-3">
                    <span className="w-10 text-sm text-slate-300">{label}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${ratingBars[index]}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-xs text-slate-400">{ratingBars[index]}%</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white">Reviews</h2>

            {reviews.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No reviews yet. Be the first!</p>
            ) : (
              <div className="mt-4 space-y-4">
                {reviews.map((review, index) => {
                  const username = review.username || review.user || 'Anonymous'
                  const reviewRating = Number(review.rating || 0)
                  const reviewDate = formatDate(review.date || review.created_at || review.createdAt)
                  const reviewText = review.text || review.review || review.comment || ''

                  return (
                    <article key={`${username}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600/30 text-sm font-bold text-indigo-200">
                          {username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-white">{username}</p>
                            <p className="text-xs text-slate-500">{reviewDate}</p>
                          </div>
                          <div className="mt-1 flex items-center gap-1">{buildStarNodes(reviewRating)}</div>
                          <p className="mt-2 text-sm leading-relaxed text-slate-300">{reviewText}</p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit lg:w-80">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-base font-semibold text-white">Quick info</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Pricing</dt>
                <dd className="text-slate-200">{tool.pricing}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Platform</dt>
                <dd className="text-slate-200">{tool.platform || 'Web'}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Category</dt>
                <dd className="text-slate-200">{tool.category}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Last updated</dt>
                <dd className="text-slate-200">{formatDate(tool.lastUpdated)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Student friendly</dt>
                <dd>
                  <span
                    className={clsx(
                      'inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ring-inset',
                      tool.studentFriendly
                        ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30'
                        : 'bg-slate-700 text-slate-200 ring-slate-600',
                    )}
                  >
                    {tool.studentFriendly ? 'Yes' : 'No'}
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-base font-semibold text-white">Related Tools</h3>

            {relatedTools.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No related tools found.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {relatedTools.map((relatedTool) => {
                  const relatedLogo = `https://logo.clearbit.com/${getToolDomain(relatedTool.name)}`
                  const relatedImgError = Boolean(relatedImgErrors[relatedTool.slug])

                  return (
                    <button
                      key={relatedTool.slug}
                      type="button"
                      onClick={() => navigate(`/tools/${relatedTool.slug}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-left transition hover:border-indigo-400/40 hover:bg-slate-950"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-800">
                        {!relatedImgError ? (
                          <img
                            src={relatedLogo}
                            alt={`${relatedTool.name} logo`}
                            className="h-8 w-8 rounded-full bg-white object-contain"
                            onError={() => {
                              setRelatedImgErrors((previous) => ({
                                ...previous,
                                [relatedTool.slug]: true,
                              }))
                            }}
                          />
                        ) : (
                          <div
                            className={clsx(
                              'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold',
                              getAvatarClass(relatedTool.name),
                            )}
                          >
                            {relatedTool.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{relatedTool.name}</p>
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
  )
}

export default ToolDetailPage
