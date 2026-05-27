import { motion } from 'framer-motion'
import { Calendar, Eye, Grid3X3, Heart, Home, Sparkles, Wand2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Card, CompassLoader, CountUp } from '../components/ui'

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}
const MotionSection = motion.section

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
  const resolvedUrl = rawTool?.affiliate_url || rawTool?.url || rawTool?.website || rawTool?.link || rawTool?.homepage || ''

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
  const [editingStack, setEditingStack] = useState(false)
  const [draftTools, setDraftTools] = useState([])
  const [stackBusy, setStackBusy] = useState(false)
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
            // /api/v1/tools returns { results: [...] } — the old code only
            // accepted a bare array, so Recently Viewed was always empty.
            const rawTools = Array.isArray(allToolsPayload)
              ? allToolsPayload
              : allToolsPayload?.results || allToolsPayload?.tools || []
            const allTools = rawTools.map(normalizeTool)
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

  const startEditStack = () => {
    setDraftTools(Array.isArray(savedStack?.tools) ? [...savedStack.tools] : [])
    setEditingStack(true)
  }

  const saveStackEdits = async () => {
    if (!user?.id) return
    setStackBusy(true)
    try {
      const res = await fetch('/api/v1/stack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: user.id,
          goal: savedStack?.goal,
          budget: savedStack?.budget,
          platform: savedStack?.platform,
          level: savedStack?.level,
          tools: draftTools,
        }),
      })
      if (!res.ok) throw new Error('save failed')
      const data = await res.json()
      setSavedStack(data.stack || { ...savedStack, tools: draftTools })
      setEditingStack(false)
    } catch {
      setError('Could not save your stack. Try again.')
    } finally {
      setStackBusy(false)
    }
  }

  const clearStack = async () => {
    if (!user?.id || !window.confirm('Clear your saved stack?')) return
    setStackBusy(true)
    try {
      const res = await fetch(`/api/v1/stack?user_id=${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('clear failed')
      setSavedStack(null)
      setEditingStack(false)
    } catch {
      setError('Could not clear your stack. Try again.')
    } finally {
      setStackBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <CompassLoader full size={64} label="Loading your dashboard…" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-line bg-bg-elev p-4 text-ink shadow-sm lg:sticky lg:top-24 lg:h-fit">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted">Dashboard</p>
          <nav className="mt-3 space-y-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-left text-sm font-semibold text-accent-ink"
            >
              <Home className="h-4 w-4" />
              Overview
            </button>
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
            >
              <Grid3X3 className="h-4 w-4" />
              Browse Tools
            </button>
            <button
              type="button"
              onClick={() => navigate('/ai-tool-finder')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
            >
              <Wand2 className="h-4 w-4" />
              Tool Finder
            </button>
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
            >
              <Heart className="h-4 w-4" />
              Favorites
            </button>
          </nav>
        </aside>

        <div className="space-y-6">
          <MotionSection
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="rounded-2xl border border-line bg-bg-elev p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-ink">
                  {greeting}, {displayName}!
                </h1>
                <p className="mt-2 text-sm text-muted">
                  Here are your personalized AI tool recommendations
                </p>
              </div>

              <div className="relative w-12 h-12">
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || 'Your avatar'}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-accent"
                    width="48"
                    height="48"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.target.style.display = 'none'
                      e.target.nextSibling.style.display = 'flex'
                    }}
                  />
                ) : null}
                <div
                  style={{ display: user?.picture ? 'none' : 'flex' }}
                  className="w-12 h-12 rounded-full bg-accent items-center justify-center text-bg text-lg font-bold"
                  role="img"
                  aria-label={`Avatar for ${displayName || 'your account'}`}
                >
                  <span aria-hidden="true">{avatarLetter}</span>
                </div>
              </div>
            </div>
          </MotionSection>

          <motion.section
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {[
              { key: 'saved', icon: <Heart className="h-4 w-4" />, label: 'Tools Saved', value: favorites.length, numeric: true },
              { key: 'categories', icon: <Grid3X3 className="h-4 w-4" />, label: 'Categories Explored', value: categoriesExplored, numeric: true },
              { key: 'visited', icon: <Eye className="h-4 w-4" />, label: 'Tools Visited', value: recentlyViewedSlugs.length, numeric: true },
              { key: 'member', icon: <Calendar className="h-4 w-4" />, label: 'Member Since', value: user?.member_since || formatMemberSince(user?.created_at) || 'Unknown', numeric: false },
            ].map((item) => (
              <motion.div
                key={item.key}
                variants={fadeUp}
                whileHover={{ y: -3 }}
                className="rounded-2xl border border-line bg-bg-elev p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  {item.icon}
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{item.label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
                  {item.numeric
                    ? <CountUp end={Number(item.value) || 0} duration={1.1} />
                    : item.value}
                </p>
              </motion.div>
            ))}
          </motion.section>

          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex items-center justify-between rounded-xl border border-accent bg-accent-soft px-4 py-3 text-left transition hover:bg-accent-soft/80"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-accent-ink">
                <Grid3X3 className="h-4 w-4" />
                Browse Tools
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/ai-tool-finder')}
              className="flex items-center justify-between rounded-xl border border-accent bg-accent-soft px-4 py-3 text-left transition hover:bg-accent-soft/80"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-accent-ink">
                <Sparkles className="h-4 w-4" />
                Find My AI Stack
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/submit')}
              className="flex items-center justify-between rounded-xl border border-accent bg-accent-soft px-4 py-3 text-left transition hover:bg-accent-soft/80"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-accent-ink">
                <Wand2 className="h-4 w-4" />
                Submit a Tool
              </span>
            </button>
          </section>

          {error && (
            <div className="rounded-xl border border-danger bg-danger-soft p-4 text-sm text-danger">
              {error}
            </div>
          )}

          <MotionSection
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-10% 0px' }}
            className="rounded-2xl border border-line bg-bg-elev/80 p-4 shadow-sm sm:p-5"
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">Recommended for You</h2>
                <p className="text-sm text-muted">Based on your interests</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">
                  {recommendations.length} picks
                </span>
                <Sparkles className="h-5 w-5 text-accent" />
              </div>
            </div>

            {recommendations.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recommendations.map((tool) => (
                  <Card key={tool.slug || tool.name} tool={tool} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line-strong bg-bg-sunk p-5 text-sm text-muted">
                No recommendations yet.
              </div>
            )}
          </MotionSection>

          <MotionSection
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-10% 0px' }}
            className="rounded-2xl border border-line bg-bg-elev/80 p-4 shadow-sm sm:p-5"
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">My Favorites</h2>
                <p className="text-sm text-muted">Tools you saved for quick access</p>
              </div>
              <span className="rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">
                {favorites.length} saved
              </span>
            </div>

            {favorites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk p-6 text-center">
                <p className="text-sm text-muted">No favorites yet</p>
                <Button className="mt-4" onClick={() => navigate('/tools')}>
                  Explore Tools
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {favorites.map((tool) => (
                  <Card key={tool.slug || tool.name} tool={tool} />
                ))}
              </div>
            )}
          </MotionSection>

          <MotionSection
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-10% 0px' }}
          >
            <h2 className="text-xl font-bold text-ink">My AI Stack</h2>

            {!savedStack ? (
              <div className="mt-3 rounded-2xl border border-dashed border-line-strong bg-bg-sunk p-6 text-center">
                <p className="text-sm text-muted">No stack saved yet</p>
                <Button className="mt-4" onClick={() => navigate('/ai-tool-finder')}>
                  Build My Stack
                </Button>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-line bg-gradient-to-br from-bg-elev to-accent-soft p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Saved preferences</p>
                    <p className="mt-1 text-xs text-muted">Your latest finder profile used to build this stack.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingStack ? (
                      <>
                        <Button
                          type="button"
                          className="h-9 rounded-lg px-3 text-xs"
                          disabled={stackBusy}
                          onClick={saveStackEdits}
                        >
                          {stackBusy ? 'Saving…' : 'Save changes'}
                        </Button>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-line-strong px-3 text-xs font-semibold text-ink-2 transition hover:bg-bg-sunk"
                          onClick={() => setEditingStack(false)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-line-strong px-3 text-xs font-semibold text-ink-2 transition hover:bg-bg-sunk"
                          onClick={startEditStack}
                        >
                          Edit stack
                        </button>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-line-strong px-3 text-xs font-semibold text-ink-2 transition hover:bg-bg-sunk"
                          onClick={() => navigate('/ai-tool-finder')}
                        >
                          Rebuild
                        </button>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-danger/40 px-3 text-xs font-semibold text-danger transition hover:bg-danger-soft"
                          disabled={stackBusy}
                          onClick={clearStack}
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-line/80 bg-bg-elev/70 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Goal</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{toProperCase(savedStack.goal || 'N/A')}</p>
                  </div>
                  <div className="rounded-xl border border-line/80 bg-bg-elev/70 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Budget</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{toProperCase(savedStack.budget || 'N/A')}</p>
                  </div>
                  <div className="rounded-xl border border-line/80 bg-bg-elev/70 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Level</p>
                    <p className="mt-1 text-sm font-semibold text-ink">{toProperCase(savedStack.level || 'N/A')}</p>
                  </div>
                  <div className="rounded-xl border border-accent/80 bg-accent-soft px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-ink">Saved Tools</p>
                    <p className="mt-1 text-sm font-semibold text-accent-ink">{editingStack ? draftTools.length : (Array.isArray(savedStack.tools) ? savedStack.tools.length : 0)}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-sm font-semibold text-ink">
                    {editingStack ? 'Edit tools — tap × to remove' : 'Saved tools'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {editingStack ? (
                      draftTools.length > 0 ? (
                        draftTools.map((toolName, index) => (
                          <span
                            key={`draft-tool-${index}`}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-bg-elev px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm"
                          >
                            {toolName}
                            <button
                              type="button"
                              aria-label={`Remove ${toolName}`}
                              onClick={() => setDraftTools((d) => d.filter((_, i) => i !== index))}
                              className="text-muted transition hover:text-danger"
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-muted">No tools — Cancel, or Clear the stack.</p>
                      )
                    ) : Array.isArray(savedStack.tools) && savedStack.tools.length > 0 ? (
                      savedStack.tools.map((toolName, index) => (
                        <span
                          key={`saved-stack-tool-${index}`}
                          className="rounded-full border border-line/80 bg-bg-elev px-3 py-1.5 text-xs font-medium text-ink-2 shadow-sm"
                        >
                          {toolName}
                        </span>
                      ))
                    ) : (
                      <p className="text-sm text-muted">No tools in saved stack</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </MotionSection>

          <MotionSection
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-10% 0px' }}
          >
            <h2 className="text-xl font-bold text-ink">Recently Viewed</h2>

            {recentlyViewedTools.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Start browsing tools to see your history</p>
            ) : (
              <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
                {recentlyViewedTools.map((tool) => (
                  <div key={tool.slug || tool.name} className="min-w-[17rem] flex-1 sm:min-w-[18rem]">
                    <Card tool={tool} />
                  </div>
                ))}
              </div>
            )}
          </MotionSection>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
