import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams, useLocation } from 'react-router-dom'
import {
  Inbox, Code, MessageSquare, Search, Briefcase, Image as ImageIcon,
  Video, Mic, Flame, ArrowUpRight, Star, TrendingUp, Sparkles,
  ChevronUp, ChevronDown
} from 'lucide-react'
import { toast } from 'sonner'

import { Button, Card, SkeletonCard, ToolLogo } from '../components/ui'
import ErrorState from '../components/ErrorState'
import { inferErrorVariant } from '../utils/errorState'

// Categories metadata for the tabs
const TRENDING_CATEGORIES = [
  { id: 'Coding', label: 'Coding', icon: Code },
  { id: 'Writing & Chat', label: 'Writing & Chat', icon: MessageSquare },
  { id: 'Research', label: 'Research', icon: Search },
  { id: 'Productivity', label: 'Productivity', icon: Briefcase },
  { id: 'Image Generation', label: 'Image Gen', icon: ImageIcon },
  { id: 'Video Generation', label: 'Video Gen', icon: Video },
  { id: 'Audio & Voice', label: 'Audio & Voice', icon: Mic }
]

function CollectionPage() {
  const { slug: urlSlug } = useParams()
  const location = useLocation()
  const slug = urlSlug || (location.pathname === '/trending' ? 'trending' : '')
  
  const [collection, setCollection] = useState(null)
  const [trendingData, setTrendingData] = useState(null)
  const [activeCategory, setActiveCategory] = useState('Coding')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return Boolean(JSON.parse(localStorage.getItem('user') || 'null'))
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (location.state?.category) {
      setActiveCategory(location.state.category)
    }
  }, [location.state])

  const handleVote = async (toolSlug, voteType) => {
    if (!isLoggedIn) {
      toast.error('Please login to vote on trending tools!')
      return
    }

    try {
      const response = await fetch('/api/v1/trending/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: toolSlug, vote_type: voteType })
      })

      if (!response.ok) {
        throw new Error('Failed to submit vote')
      }

      const resData = await response.json()
      
      setTrendingData(prev => {
        if (!prev) return prev
        const next = { ...prev }
        
        for (const cat of Object.keys(next)) {
          next[cat] = next[cat].map(item => {
            if (item.slug === toolSlug) {
              const updatedItem = {
                ...item,
                upvotes: resData.upvotes,
                downvotes: resData.downvotes,
                user_vote: resData.user_vote,
                net_votes: resData.net_votes
              }
              const baseline = 100 - (item.rank * 10)
              updatedItem.final_score = baseline + resData.net_votes
              return updatedItem
            }
            return item
          })
          
          next[cat].sort((a, b) => b.final_score - a.final_score)
          
          next[cat] = next[cat].map((item, idx) => ({
            ...item,
            display_rank: idx + 1
          }))
        }
        
        return next
      })

      if (resData.user_vote === 1) {
        toast.success('Upvoted!')
      } else if (resData.user_vote === -1) {
        toast.success('Downvoted!')
      } else {
        toast.info('Vote cleared')
      }
    } catch (err) {
      toast.error('Error submitting vote. Please try again.')
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    async function loadData() {
      try {
        setLoading(true)
        
        if (slug === 'trending') {
          const response = await fetch('/api/v1/trending', {
            signal: controller.signal,
          })
          if (!response.ok) {
            const httpErr = new Error(`HTTP ${response.status}: ${response.statusText}`)
            httpErr.status = response.status
            throw httpErr
          }
          const data = await response.json()
          setTrendingData(data)
          setError(null)
        } else {
          const response = await fetch(`/api/v1/collections/${encodeURIComponent(slug || '')}`, {
            signal: controller.signal,
          })
          if (!response.ok) {
            const httpErr = new Error(`HTTP ${response.status}: ${response.statusText}`)
            httpErr.status = response.status
            throw httpErr
          }
          const data = await response.json()
          setCollection(data)
          setError(null)
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(inferErrorVariant(err))
          setCollection(null)
          setTrendingData(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => controller.abort()
  }, [slug, retryNonce])

  // Helper to render rank badges with distinct gold/silver/bronze elements
  const getRankBadgeClasses = (rank) => {
    switch (rank) {
      case 1:
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-bold ring-2 ring-amber-500/30'
      case 2:
        return 'bg-slate-400/10 text-slate-500 dark:text-slate-300 border-slate-400/20 font-bold ring-2 ring-slate-400/20'
      case 3:
        return 'bg-amber-700/10 text-amber-700 dark:text-amber-500 border-amber-700/20 font-bold ring-2 ring-amber-700/20'
      default:
        return 'bg-bg-sunk text-muted border-line'
    }
  }

  // ── Render Case: Trending Today ────────────────────────────────────────────
  if (slug === 'trending') {
    const activeList = trendingData?.[activeCategory] || []

    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Helmet>
          <title>Trending Today — Top AI Tools of 2026 | AI Compass</title>
          <meta
            name="description"
            content="Discover the most popular and fastest-growing AI tools of 2026. Hand-tested and ranked by workflow for students and developers."
          />
          <link rel="canonical" href="https://ai-compass.in/trending" />
        </Helmet>

        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl border border-line/40 bg-bg-elev p-6 md:p-8 shadow-xl mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-bold uppercase tracking-wider mb-3">
                <Flame className="h-3.5 w-3.5 animate-pulse" /> Live Leaderboard
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                Trending Today
              </h1>
              <p className="mt-3 text-muted text-sm md:text-base leading-relaxed">
                Discover the 35 fastest-rising, hand-tested AI tools of 2026. Real, consensus-backed rankings updated daily across core student and developer workflows.
              </p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-2 bg-bg-sunk border border-line rounded-2xl p-4 self-start md:self-auto shadow-sm">
              <TrendingUp className="h-5 w-5 text-accent" />
              <div className="text-left">
                <span className="text-[10px] uppercase font-bold text-muted-2 tracking-wider block">Last Updated</span>
                <span className="text-xs font-bold text-ink">June 30, 2026</span>
              </div>
            </div>
          </div>
        </section>

        {/* Category Tabs */}
        <div className="flex overflow-x-auto pb-3 mb-6 gap-2 scrollbar-none">
          {TRENDING_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isSelected = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'border-accent bg-accent text-white shadow-md'
                    : 'border-line bg-bg-elev text-muted hover:border-line-strong hover:bg-bg-sunk hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" />
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* Error State */}
        {error && (
          <ErrorState
            variant={error}
            onRetry={() => setRetryNonce((n) => n + 1)}
          />
        )}

        {/* Leaderboard Cards */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`trending-skeleton-${i}`} className="h-28 rounded-2xl border border-line bg-bg-elev/40 animate-pulse" />
            ))}
          </div>
        ) : activeList.length > 0 ? (
          <div className="space-y-4">
            {activeList.map((item) => {
              const tool = item.tool
              const displayRank = item.display_rank || item.rank
              const isTopThree = displayRank <= 3
              
              // Fallback details if tool is not matched in database cache
              const name = tool?.name || item.slug.toUpperCase()
              const desc = tool?.tagline || tool?.description || item.why_trending
              const pricing = tool?.pricing || 'Freemium'
              const rating = tool?.rating || 4.5
              const studentFriendly = tool?.student_friendly || false

              return (
                <Link
                  key={item.slug}
                  to={`/tools/${item.slug}`}
                  className="group block relative overflow-hidden rounded-2xl border border-line/40 bg-bg-elev/75 hover:bg-bg-elev backdrop-blur-md p-5 shadow-sm hover:shadow-md hover:border-line-strong transition-all"
                  style={{
                    borderColor: isTopThree ? 'rgba(22, 131, 88, 0.15)' : undefined
                  }}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
                    
                    {/* Rank + Icon + Info */}
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Large Rank Indicator */}
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-base ${getRankBadgeClasses(displayRank)}`}>
                        #{displayRank}
                      </div>

                      {/* Tool Logo */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg-sunk border border-line/60">
                        {tool ? (
                          <ToolLogo tool={tool} size={48} />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-accent font-extrabold text-sm">
                            {name.slice(0, 2)}
                          </div>
                        )}
                      </div>

                      {/* Title & Tagline */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-ink group-hover:text-accent transition-colors">
                            {name}
                          </h3>
                          {studentFriendly && (
                            <span className="hidden sm:inline-flex items-center rounded-full bg-accent-soft/70 px-2 py-0.5 text-[10px] font-bold text-accent-ink border border-accent/10">
                              Student Pick
                            </span>
                          )}
                        </div>
                        <p className="text-muted text-xs sm:text-sm mt-0.5 line-clamp-1">
                          {desc}
                        </p>
                      </div>
                    </div>

                    {/* Metadata & Verdict (why trending) */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full sm:w-auto shrink-0 border-t border-line/30 sm:border-0 pt-3 sm:pt-0 justify-between sm:justify-end">
                      
                      {/* Trending Growth Index Bar */}
                      <div className="w-24 sm:w-28 text-left">
                        <div className="flex justify-between text-[10px] font-bold text-muted-2 uppercase tracking-wide mb-1">
                          <span>Trend Velocity</span>
                          <span>{Math.max(10, 100 - (displayRank - 1) * 8)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-bg-sunk rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${Math.max(10, 100 - (displayRank - 1) * 8)}%` }}
                          />
                        </div>
                      </div>

                      {/* Score & Pricing */}
                      <div className="text-right flex items-center sm:flex-col gap-3 sm:gap-0.5">
                        <div className="flex items-center gap-1 text-sm font-bold text-ink">
                          <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                          {Number(rating).toFixed(1)}
                        </div>
                        <span className="text-xs text-muted font-medium">
                          {pricing}
                        </span>
                      </div>

                      {/* Voting Widget */}
                      <div className="flex items-center gap-1 bg-bg-sunk/50 border border-line/50 rounded-xl p-0.5 shrink-0" onClick={(e) => e.preventDefault()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleVote(item.slug, 1)
                          }}
                          className={`p-1 rounded-lg transition-all ${
                            item.user_vote === 1
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold scale-105 shadow-sm'
                              : 'text-muted hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-bg-sunk'
                          }`}
                          title="Upvote"
                        >
                          <ChevronUp className="h-4.5 w-4.5" />
                        </button>
                        <span className="text-xs font-bold text-ink px-1 min-w-[1.25rem] text-center">
                          {item.net_votes || 0}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleVote(item.slug, -1)
                          }}
                          className={`p-1 rounded-lg transition-all ${
                            item.user_vote === -1
                              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold scale-105 shadow-sm'
                              : 'text-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-bg-sunk'
                          }`}
                          title="Downvote"
                        >
                          <ChevronDown className="h-4.5 w-4.5" />
                        </button>
                      </div>

                      <ArrowUpRight className="h-5 w-5 text-muted group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all hidden sm:block" />
                    </div>
                  </div>

                  {/* Why it is trending */}
                  <div className="mt-3.5 pt-3 border-t border-line/20 flex gap-2 items-start text-xs text-muted-2">
                    <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-ink font-semibold">2026 Trend Signal: </strong>
                      {item.why_trending}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-bg-sunk py-14 text-center">
            <Inbox className="h-8 w-8 text-muted mx-auto" />
            <h2 className="mt-4 text-lg font-bold text-ink">No trending tools loaded</h2>
            <p className="text-sm text-muted mt-1">Please try refreshing or check back later.</p>
          </div>
        )}
      </div>
    )
  }

  // ── Render Case: Standard Collection ─────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>{`${collection?.title || 'AI Tools'} — AI Tools Collection | AI Compass`}</title>
        <meta
          name="description"
          content={`Hand-picked AI tools for ${collection?.title || 'this category'}. Curated stack, verified pricing, written rationale. Browse alternatives at AI Compass.`}
        />
        <meta property="og:title" content={`${collection?.title || 'AI Tools'} — AI Tools Collection | AI Compass`} />
        <link rel="canonical" href={`https://ai-compass.in/collections/${slug}`} />
        {collection && collection.tools && collection.tools.length > 0 ? (
          <>
            <script type="application/ld+json">{JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai-compass.in/' },
                { '@type': 'ListItem', position: 2, name: 'Collections', item: 'https://ai-compass.in/collections' },
                { '@type': 'ListItem', position: 3, name: collection.title, item: `https://ai-compass.in/collections/${slug}` },
              ],
            })}</script>
            <script type="application/ld+json">{JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `${collection.title} — AI Tools Collection`,
              description: collection.description,
              url: `https://ai-compass.in/collections/${slug}`,
              mainEntity: {
                '@type': 'ItemList',
                name: collection.title,
                numberOfItems: collection.tools.length,
                itemListElement: collection.tools.map((t, i) => ({
                  '@type': 'ListItem',
                  position: i + 1,
                  name: t.name,
                  url: `https://ai-compass.in/tools/${t.slug || ''}`,
                })),
              },
            })}</script>
          </>
        ) : null}
      </Helmet>

      <section className="mb-6 rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Collection</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">
          {loading ? 'Loading collection...' : collection?.title || 'Collection not found'}
        </h1>
        <p className="mt-2 max-w-3xl text-muted">
          {collection?.description || 'Curated tools to help you discover the right AI stack faster.'}
        </p>
        <div className="mt-4 inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ink">
          {loading ? 'Loading...' : `${collection?.count || 0} tools`}
        </div>
      </section>

      {error ? (
        <ErrorState
          variant={error}
          onRetry={error === 'notfound' ? undefined : () => setRetryNonce((n) => n + 1)}
          secondaryAction={{ label: 'Back to Collections', to: '/collections' }}
        />
      ) : null}

      {loading ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={`collection-skeleton-${index}`} />
          ))}
        </section>
      ) : collection?.tools?.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {collection.tools.map((tool) => (
            <Card key={tool.slug || tool.name} tool={tool} />
          ))}
        </div>
      ) : !error ? (
        <section className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk px-6 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm text-muted-2" aria-hidden="true">
            <Inbox className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink">No tools found in this collection</h2>
          <p className="mt-2 text-sm text-muted">
            Try another collection to discover more tools.
          </p>
          <div className="mt-6">
            <Link to="/collections">
              <Button variant="secondary">Browse all collections</Button>
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default CollectionPage

