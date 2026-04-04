import { Calendar, Eye, Grid3X3, Heart, Home, Sparkles, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Card } from '../components/ui'

function readUserFromLocalStorage() {
  try {
    const stored = localStorage.getItem('user')
    if (!stored) {
      return null
    }

    const parsed = JSON.parse(stored)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

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
  return {
    slug: rawTool?.slug,
    name: rawTool?.name || 'Unknown Tool',
    description: rawTool?.description || rawTool?.shortDescription || rawTool?.summary || '',
    shortDescription: rawTool?.shortDescription || rawTool?.description || rawTool?.summary || '',
    category: rawTool?.category || 'General',
    rating: Number(rawTool?.rating || rawTool?.averageRating || rawTool?.average_rating || 0),
    pricing: rawTool?.pricing || rawTool?.price || rawTool?.pricingType || rawTool?.pricing_type || 'Free',
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

  const [user, setUser] = useState(() => readUserFromLocalStorage())
  const [recommendations, setRecommendations] = useState([])
  const [favorites, setFavorites] = useState([])
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
        const storedUser = readUserFromLocalStorage()
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
              picture: fullUserData.picture || mergedUser.picture,
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

        setUser(mergedUser)

        const [recommendationsResponse, favoritesResponse] = await Promise.all([
          fetch('/api/v1/recommendations', { signal: controller.signal }),
          fetch('/api/v1/favorites', { signal: controller.signal }),
        ])

        const recommendationsPayload = recommendationsResponse.ok ? await recommendationsResponse.json() : []
        const favoritesPayload = favoritesResponse.ok ? await favoritesResponse.json() : []

        const normalizedRecommendations = Array.isArray(recommendationsPayload)
          ? recommendationsPayload.map(normalizeTool).slice(0, 6)
          : []
        const normalizedFavorites = Array.isArray(favoritesPayload) ? favoritesPayload.map(normalizeTool) : []

        setRecommendations(normalizedRecommendations)
        setFavorites(normalizedFavorites)

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
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          Loading your dashboard...
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-24 lg:h-fit">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Dashboard</p>
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
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Grid3X3 className="h-4 w-4" />
              Browse Tools
            </button>
            <button
              type="button"
              onClick={() => navigate('/ai-tool-finder')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Wand2 className="h-4 w-4" />
              Tool Finder
            </button>
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Heart className="h-4 w-4" />
              Favorites
            </button>
          </nav>
        </aside>

        <div className="space-y-6">
          <section className="rounded-2xl bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-500/20 p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {greeting}, {displayName}!
                </h1>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  Here are your personalized AI tool recommendations
                </p>
              </div>

              <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-indigo-600 text-lg font-bold text-white">
                {avatarLetter}
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt="Profile"
                    className="absolute inset-0 h-11 w-11 rounded-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                <Heart className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tools Saved</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{favorites.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <Grid3X3 className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categories Explored</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{categoriesExplored}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <Eye className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tools Visited</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{recentlyViewedSlugs.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
                <Calendar className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Member Since</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {user?.member_since || formatMemberSince(user?.created_at) || 'Unknown'}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/5 px-4 py-3 text-left transition hover:bg-indigo-500/10"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-indigo-200">
                <Grid3X3 className="h-4 w-4" />
                Browse Tools
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/ai-tool-finder')}
              className="flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/5 px-4 py-3 text-left transition hover:bg-indigo-500/10"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-indigo-200">
                <Sparkles className="h-4 w-4" />
                Find My AI Stack
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/submit')}
              className="flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/5 px-4 py-3 text-left transition hover:bg-indigo-500/10"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-indigo-200">
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
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recommended for You</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Based on your interests</p>
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
                <p className="text-sm text-slate-500 dark:text-slate-400">No recommendations yet.</p>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">My Favorites</h2>

            {favorites.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/60">
                <p className="text-sm text-slate-600 dark:text-slate-400">No favorites yet</p>
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
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Recently Viewed</h2>

            {recentlyViewedTools.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Start browsing tools to see your history</p>
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
  )
}

export default DashboardPage
