import { Calendar, Eye, Grid3X3, Heart, Home, Sparkles, Wand2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PageTransition from '../components/PageTransition'
import { Button, Card } from '../components/ui'

const MotionSection = motion.section
const MotionDiv = motion.div

function readRecentlyViewedSlugs() {
  try {
    const stored = localStorage.getItem('recentlyViewed')
    if (!stored) {
      return []
    }

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean)
      .slice(0, 10)
  } catch {
    return []
  }
}

function normalizeTool(rawTool) {
  const resolvedUrl = rawTool?.url || rawTool?.website || rawTool?.link || rawTool?.homepage || ''

  return {
    slug: rawTool?.slug,
    name: rawTool?.name || 'Unknown Tool',
    description: rawTool?.description || rawTool?.shortDescription || rawTool?.summary || '',
    shortDescription: rawTool?.shortDescription || rawTool?.description || rawTool?.summary || '',
    category: rawTool?.category || 'General',
    rating: Number(rawTool?.rating || rawTool?.averageRating || rawTool?.average_rating || 0),
    pricing: rawTool?.pricing || rawTool?.price || rawTool?.pricingType || rawTool?.pricing_type || 'Free',
    url: resolvedUrl,
    website: rawTool?.website || resolvedUrl,
    link: rawTool?.link || resolvedUrl,
  }
}

function getGreetingLabel(date = new Date()) {
  const hour = date.getHours()

  if (hour < 12) {
    return 'Good morning'
  }

  if (hour < 18) {
    return 'Good afternoon'
  }

  return 'Good evening'
}

function formatMemberSince(value) {
  if (!value) {
    return 'Unknown'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }

  return parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function toProperCase(text) {
  if (!text) return ''
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function DashboardPage() {
  const navigate = useNavigate()

  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const [recommendations, setRecommendations] = useState([])
  const [favorites, setFavorites] = useState([])
  const [savedStack, setSavedStack] = useState(null)
  const [recentlyViewedTools, setRecentlyViewedTools] = useState([])
  const [recentlyViewedSlugs, setRecentlyViewedSlugs] = useState(() => readRecentlyViewedSlugs())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadDashboard() {
      setLoading(true)
      setError('')

      try {
        // Check auth using only localStorage - no fetch to /api/v1/auth/me
        const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
        if (!storedUser) {
          navigate('/login', { replace: true })
          return
        }

        let mergedUser = { ...storedUser }

        // Fetch full user profile in background to get created_at/member_since
        try {
          const authMeResponse = await fetch('/api/v1/auth/me', { signal: controller.signal })
          if (authMeResponse.ok) {
            const fullUserData = await authMeResponse.json()
            // Merge the full user data, keeping localStorage data as base
            mergedUser = {
              ...mergedUser,
              created_at: fullUserData.created_at || storedUser.created_at,
              member_since: fullUserData.member_since || storedUser.member_since,
            }
            // Update localStorage with the merged data
            localStorage.setItem('user', JSON.stringify(mergedUser))
          }
        } catch (authMeError) {
          // If auth/me fails (401 or network error), just use localStorage data
          // This is intentional - we don't redirect, just use what we have
          if (authMeError.name !== 'AbortError') {
            // Silently ignore auth/me errors
          }
        }

        const userIdForStack = mergedUser?.id || storedUser?.id || ''

        const [recommendationsResponse, favoritesResponse, stackResponse] = await Promise.all([
          fetch('/api/v1/recommendations', { signal: controller.signal }),
          fetch('/api/v1/favorites', { signal: controller.signal }),
          fetch(`/api/v1/stack?user_id=${encodeURIComponent(userIdForStack)}`, { signal: controller.signal }),
        ])

        const recommendationsPayload = recommendationsResponse.ok ? await recommendationsResponse.json() : []
        const favoritesPayload = favoritesResponse.ok ? await favoritesResponse.json() : []
        const stackPayload = stackResponse.ok ? await stackResponse.json() : { stack: null }

        const normalizedRecommendations = Array.isArray(recommendationsPayload)
          ? recommendationsPayload.map(normalizeTool).slice(0, 6)
          : []
        const normalizedFavorites = Array.isArray(favoritesPayload) ? favoritesPayload.map(normalizeTool) : []
        const resolvedStack = stackPayload?.stack || null

        setRecommendations(normalizedRecommendations)
        setFavorites(normalizedFavorites)
        setSavedStack(resolvedStack)

        const recentSlugs = readRecentlyViewedSlugs()
        setRecentlyViewedSlugs(recentSlugs)

        if (recentSlugs.length > 0) {
          const toolsResponse = await fetch('/api/v1/tools', { signal: controller.signal })
          if (toolsResponse.ok) {
            const allToolsPayload = await toolsResponse.json()
            const allTools = Array.isArray(allToolsPayload) ? allToolsPayload.map(normalizeTool) : []
            const toolBySlug = new Map(allTools.map((tool) => [String(tool.slug || '').toLowerCase(), tool]))

            const recentTools = recentSlugs
              .map((slug) => toolBySlug.get(slug))
              .filter(Boolean)
              .slice(0, 4)

            setRecentlyViewedTools(recentTools)
          } else {
            setRecentlyViewedTools([])
          }
        } else {
          setRecentlyViewedTools([])
        }
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(requestError.message || 'Failed to load dashboard data.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadDashboard()

    return () => controller.abort()
  }, [navigate])

  const greeting = useMemo(() => getGreetingLabel(), [])
  const displayName = toProperCase(user?.name || 'there')
  const avatarLetter = (displayName || 'U').charAt(0).toUpperCase()
  const categoriesExplored = useMemo(() => {
    const categories = new Set()
    for (const tool of [...recommendations, ...favorites, ...recentlyViewedTools]) {
      if (tool?.category) {
        categories.add(String(tool.category).trim().toLowerCase())
      }
    }
    return categories.size
  }, [favorites, recommendations, recentlyViewedTools])

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-7xl bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          Loading your dashboard...
        </div>
      </main>
    )
  }

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-7xl bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white lg:sticky lg:top-24 lg:h-fit">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Dashboard</p>
          <nav className="mt-3 space-y-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl bg-indigo-100 px-3 py-2 text-left text-sm font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
            >
              <Home className="h-4 w-4" />
              Overview
            </button>
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Grid3X3 className="h-4 w-4" />
              Browse Tools
            </button>
            <button
              type="button"
              onClick={() => navigate('/ai-tool-finder')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Wand2 className="h-4 w-4" />
              Tool Finder
            </button>
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              <Heart className="h-4 w-4" />
              Favorites
            </button>
          </nav>
        </aside>

        <div className="space-y-6">
          <MotionSection
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {greeting}, {displayName}!
                </h1>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Here are your personalized AI tool recommendations
                </p>
              </div>

              <div className="relative w-12 h-12">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-indigo-400"
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div
                  style={{ display: user?.picture ? 'none' : 'flex' }}
                  className="w-12 h-12 rounded-full bg-indigo-600 items-center justify-center text-white text-lg font-bold"
                >
                  {avatarLetter}
                </div>
              </div>
            </div>
          </MotionSection>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                key: 'saved',
                icon: <Heart className="h-4 w-4" />,
                iconClass: 'bg-red-500/10 text-red-500',
                label: 'Tools Saved',
                value: favorites.length,
              },
              {
                key: 'categories',
                icon: <Grid3X3 className="h-4 w-4" />,
                iconClass: 'bg-blue-500/10 text-blue-500',
                label: 'Categories Explored',
                value: categoriesExplored,
              },
              {
                key: 'visited',
                icon: <Eye className="h-4 w-4" />,
                iconClass: 'bg-emerald-500/10 text-emerald-500',
                label: 'Tools Visited',
                value: recentlyViewedSlugs.length,
              },
              {
                key: 'member',
                icon: <Calendar className="h-4 w-4" />,
                iconClass: 'bg-purple-500/10 text-purple-500',
                label: 'Member Since',
                value: user?.member_since || formatMemberSince(user?.created_at) || 'Unknown',
              },
            ].map((item, index) => (
              <MotionDiv
                key={item.key}
                className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1, type: 'spring' }}
              >
                <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${item.iconClass}`}>
                  {item.icon}
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{item.label}</p>
                <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{item.value}</p>
              </MotionDiv>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/5 px-4 py-3 text-left transition hover:bg-indigo-500/10"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                <Grid3X3 className="h-4 w-4" />
                Browse Tools
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/ai-tool-finder')}
              className="flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/5 px-4 py-3 text-left transition hover:bg-indigo-500/10"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                <Sparkles className="h-4 w-4" />
                Find My AI Stack
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/submit')}
              className="flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/5 px-4 py-3 text-left transition hover:bg-indigo-500/10"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                <Wand2 className="h-4 w-4" />
                Submit a Tool
              </span>
            </button>
          </section>

          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recommended for You</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Based on your interests</p>
              </div>
              <Sparkles className="h-5 w-5 text-indigo-500" />
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2">
              {recommendations.length > 0 ? (
                recommendations.map((tool) => (
                  <div key={tool.slug || tool.name} className="min-w-[17rem] flex-1 sm:min-w-[18rem]">
                    <Card tool={tool} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No recommendations yet.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">My Favorites</h2>

            {favorites.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-900">
                <p className="text-sm text-gray-600 dark:text-gray-400">No favorites yet</p>
                <Button className="mt-4" onClick={() => navigate('/tools')}>
                  Explore Tools
                </Button>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {favorites.map((tool) => (
                  <Card key={tool.slug || tool.name} tool={tool} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">My AI Stack</h2>

            {!savedStack ? (
              <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-900">
                <p className="text-sm text-gray-600 dark:text-gray-400">No stack saved yet</p>
                <Button className="mt-4" onClick={() => navigate('/ai-tool-finder')}>
                  Build My Stack
                </Button>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                    Goal: {savedStack.goal || 'N/A'}
                  </span>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                    Budget: {savedStack.budget || 'N/A'}
                  </span>
                  <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                    Level: {savedStack.level || 'N/A'}
                  </span>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Saved tools</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Array.isArray(savedStack.tools) && savedStack.tools.length > 0 ? (
                      savedStack.tools.map((toolName, index) => (
                        <span
                          key={`saved-stack-tool-${index}`}
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-300"
                        >
                          {toolName}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-gray-600 dark:text-gray-400">No tools in saved stack</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Recently Viewed</h2>

            {recentlyViewedTools.length === 0 ? (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Start browsing tools to see your history</p>
            ) : (
              <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
                {recentlyViewedTools.map((tool) => (
                  <div key={tool.slug || tool.name} className="min-w-[17rem] flex-1 sm:min-w-[18rem]">
                    <Card tool={tool} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      </main>
    </PageTransition>
  )
}

export default DashboardPage
