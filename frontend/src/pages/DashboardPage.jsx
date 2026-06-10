import { motion } from 'framer-motion'
import { Calendar, Check, Edit3, Eye, FolderPlus, Grid3X3, Heart, Home, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

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
    pricing_tiers: rawTool?.pricing_tiers || null,
    url: resolvedUrl,
    website: rawTool?.website || resolvedUrl,
    link: rawTool?.link || resolvedUrl,
    relevance_reason: rawTool?.relevance_reason || rawTool?.reason || '',
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
  const location = useLocation()

  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const [recommendations, setRecommendations] = useState([])
  const [favorites, setFavorites] = useState([])
  const [folders, setFolders] = useState([])
  const [activeFolder, setActiveFolder] = useState('all')
  const [showCreateFolderInput, setShowCreateFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolderName, setEditingFolderName] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [folderActionError, setFolderActionError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const folderParam = params.get('folder')
    if (folderParam) {
      setActiveFolder(folderParam)
    } else if (location.state?.activeFolder) {
      setActiveFolder(location.state.activeFolder)
    }
  }, [location])

  const [savedStack, setSavedStack] = useState(null)
  const [editingStack, setEditingStack] = useState(false)
  const [draftTools, setDraftTools] = useState([])
  const [stackBusy, setStackBusy] = useState(false)
  const [recentlyViewedTools, setRecentlyViewedTools] = useState([])
  const [recentlyViewedSlugs, setRecentlyViewedSlugs] = useState(() => readRecentlyViewedSlugs())
  const [allTools, setAllTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedStack, setCopiedStack] = useState(false)

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

        const [recommendationsResponse, favoritesResponse, stackResponse, toolsResponse, foldersResponse] = await Promise.all([
          fetch('/api/v1/dashboard/recommendations', { signal: controller.signal }),
          fetch('/api/v1/favorites', { signal: controller.signal }),
          fetch(`/api/v1/stack?user_id=${encodeURIComponent(userIdForStack)}`, { signal: controller.signal }),
          fetch('/api/v1/tools', { signal: controller.signal }),
          fetch('/api/v1/profile/favorites/folders', { signal: controller.signal })
        ])

        const recommendationsPayload = recommendationsResponse.ok ? await recommendationsResponse.json() : []
        const favoritesPayload = favoritesResponse.ok ? await favoritesResponse.json() : []
        const stackPayload = stackResponse.ok ? await stackResponse.json() : { stack: null }
        const foldersPayload = foldersResponse.ok ? await foldersResponse.json() : []

        const allToolsPayload = toolsResponse.ok ? await toolsResponse.json() : []
        const rawTools = Array.isArray(allToolsPayload)
          ? allToolsPayload
          : allToolsPayload?.results || allToolsPayload?.tools || []
        const normalizedAllTools = rawTools.map(normalizeTool)
        setAllTools(normalizedAllTools)

        const normalizedRecommendations = Array.isArray(recommendationsPayload)
          ? recommendationsPayload.map(normalizeTool).slice(0, 6)
          : []
        const normalizedFavorites = Array.isArray(favoritesPayload) ? favoritesPayload.map(normalizeTool) : []
        const resolvedStack = stackPayload?.stack || null

        setRecommendations(normalizedRecommendations)
        setFavorites(normalizedFavorites)
        setSavedStack(resolvedStack)
        setFolders(foldersPayload)

        const recentSlugs = readRecentlyViewedSlugs()
        setRecentlyViewedSlugs(recentSlugs)

        const toolBySlug = new Map(normalizedAllTools.map((tool) => [String(tool.slug || '').toLowerCase(), tool]))

        if (recentSlugs.length > 0) {
          const recentTools = recentSlugs
            .map((slug) => toolBySlug.get(slug))
            .filter(Boolean)
            .slice(0, 4)

          setRecentlyViewedTools(recentTools)
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

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/v1/profile/favorites/folders')
      if (res.ok) {
        const data = await res.json()
        setFolders(data)
      }
    } catch (err) {
      console.error('Failed to fetch folders', err)
    }
  }

  const handleCreateFolder = async (e) => {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setFolderActionError('')
    try {
      const res = await fetch('/api/v1/profile/favorites/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create folder')
      }
      const newFolder = await res.json()
      setFolders(prev => [...prev, newFolder])
      setActiveFolder(name)
      setNewFolderName('')
      setShowCreateFolderInput(false)
    } catch (err) {
      setFolderActionError(err.message)
    }
  }

  const handleRenameFolder = async () => {
    const newName = renameValue.trim()
    if (!newName || newName === activeFolder) {
      setEditingFolderName(null)
      return
    }
    setFolderActionError('')
    try {
      const res = await fetch(`/api/v1/profile/favorites/folders/${encodeURIComponent(activeFolder)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to rename folder')
      }
      const updatedFolder = await res.json()
      setFolders(prev => prev.map(f => f.name === activeFolder ? updatedFolder : f))
      setActiveFolder(newName)
      setEditingFolderName(null)
    } catch (err) {
      setFolderActionError(err.message)
    }
  }

  const handleDeleteFolder = async () => {
    if (!window.confirm(`Are you sure you want to delete the folder "${activeFolder}"? The tools inside will remain favorited.`)) {
      return
    }
    setFolderActionError('')
    try {
      const res = await fetch(`/api/v1/profile/favorites/folders/${encodeURIComponent(activeFolder)}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete folder')
      }
      setFolders(prev => prev.filter(f => f.name !== activeFolder))
      setActiveFolder('all')
    } catch (err) {
      setFolderActionError(err.message)
    }
  }

  const displayedFavorites = useMemo(() => {
    if (activeFolder === 'all') {
      return favorites
    }
    const folder = folders.find(f => f.name === activeFolder)
    if (!folder) return []
    return favorites.filter(tool => {
      const toolSlug = String(tool.slug || '').toLowerCase()
      return folder.tools.map(t => String(t).toLowerCase()).includes(toolSlug)
    })
  }, [activeFolder, favorites, folders])

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

  const stackCost = useMemo(() => {
    if (!savedStack?.tools || allTools.length === 0) return 0
    let total = 0
    for (const toolName of savedStack.tools) {
      const tool = allTools.find((t) => String(t.name).toLowerCase() === String(toolName).toLowerCase())
      if (tool && tool.pricing_tiers && tool.pricing_tiers.tiers) {
        const paidTiers = tool.pricing_tiers.tiers.filter((t) => typeof t.price_amount === 'number' && t.price_amount > 0)
        if (paidTiers.length > 0) {
          total += Math.min(...paidTiers.map((t) => t.price_amount))
        }
      }
    }
    return total
  }, [savedStack?.tools, allTools])

  const recommendationsTitle = savedStack?.goal ? `Trending for ${toProperCase(savedStack.goal)}` : 'Recommended for You'
  const recommendationsSubtitle = savedStack?.goal ? 'Based on your saved stack' : 'Based on your interests'

  const shareStack = () => {
    if (!user?.id) return
    try {
      navigator.clipboard.writeText(window.location.origin + `/stacks/${user.id}`)
      setCopiedStack(true)
      setTimeout(() => setCopiedStack(false), 2000)
    } catch (err) {
      // noop
    }
  }

  const startEditStack = () => {
    setDraftTools(Array.isArray(savedStack?.tools) ? [...savedStack.tools] : [])
    setEditingStack(true)
  }

  const cancelEditStack = () => {
    setEditingStack(false)
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
        <aside className="py-2 text-ink lg:sticky lg:top-24 lg:h-fit">
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted">Dashboard</p>
          <nav className="mt-3 space-y-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl bg-bg-sunk px-3 py-2 text-left text-sm font-semibold text-ink"
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
              AI Stack Architect
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
            className="rounded-xl border border-line bg-bg-elev p-6 shadow-sm"
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
                className="rounded-xl border border-line bg-bg-elev p-5 shadow-sm transition hover:border-line-strong"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-bg-sunk text-ink">
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

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <button
              type="button"
              onClick={() => navigate('/tools')}
              className="flex items-center justify-between rounded-xl border border-line bg-bg-elev px-4 py-3.5 text-left shadow-sm transition hover:border-line-strong hover:bg-bg-sunk"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Grid3X3 className="h-4 w-4 text-muted" />
                Browse Tools
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/ai-tool-finder')}
              className="flex items-center justify-between rounded-xl border border-line bg-bg-elev px-4 py-3.5 text-left shadow-sm transition hover:border-line-strong hover:bg-bg-sunk"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles className="h-4 w-4 text-accent" />
                AI Stack Architect
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/submit')}
              className="flex items-center justify-between rounded-xl border border-line bg-bg-elev px-4 py-3.5 text-left shadow-sm transition hover:border-line-strong hover:bg-bg-sunk"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Wand2 className="h-4 w-4 text-muted" />
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
            className="rounded-xl border border-line bg-bg-elev p-5 shadow-sm"
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">{recommendationsTitle}</h2>
                <p className="text-sm text-muted">{recommendationsSubtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-bg-sunk px-2.5 py-1 text-xs font-semibold text-ink-2">
                  {recommendations.length} picks
                </span>
                <Sparkles className="h-4 w-4 text-accent" />
              </div>
            </div>

            {recommendations.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {recommendations.map((tool) => (
                  <Card key={tool.slug || tool.name} tool={tool} glass={true} />
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
            className="rounded-xl border border-line bg-bg-elev p-5 shadow-sm"
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink">My Favorites</h2>
                <p className="text-sm text-muted">Tools you saved for quick access</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-bg-sunk px-2.5 py-1 text-xs font-semibold text-ink-2">
                  {favorites.length} saved
                </span>
                {favorites.length > 0 && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-7 px-2.5 py-0 text-xs"
                    onClick={() => navigate('/compare')}
                  >
                    Compare Tools
                  </Button>
                )}
              </div>
            </div>

            {/* Folder sub-navigation pills */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-line pb-3">
              <button
                type="button"
                onClick={() => {
                  setActiveFolder('all')
                  setFolderActionError('')
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  activeFolder === 'all'
                    ? 'bg-accent text-bg shadow-sm'
                    : 'bg-bg-sunk text-ink-2 hover:bg-bg-sunk/80'
                }`}
              >
                All Favorites
              </button>

              {folders.map((folder) => (
                <button
                  key={folder.name}
                  type="button"
                  onClick={() => {
                    setActiveFolder(folder.name)
                    setFolderActionError('')
                  }}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    activeFolder === folder.name
                      ? 'bg-accent text-bg shadow-sm'
                      : 'bg-bg-sunk text-ink-2 hover:bg-bg-sunk/80'
                  }`}
                >
                  <span>{folder.name}</span>
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${
                    activeFolder === folder.name ? 'bg-bg/25 text-bg' : 'bg-line text-ink-2'
                  }`}>
                    {Array.isArray(folder.tools) ? folder.tools.length : 0}
                  </span>
                </button>
              ))}

              {showCreateFolderInput ? (
                <form 
                  onSubmit={handleCreateFolder}
                  className="flex items-center gap-1.5 ml-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name..."
                    autoFocus
                    className="h-7 rounded-lg border border-line-strong bg-transparent px-2.5 text-xs font-medium text-ink outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-accent bg-accent text-bg hover:bg-accent/90"
                    aria-label="Save folder"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateFolderInput(false)
                      setNewFolderName('')
                      setFolderActionError('')
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-line-strong bg-bg-elev text-muted hover:text-ink"
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateFolderInput(true)}
                  className="rounded-full border border-dashed border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:border-line-strong/80 hover:text-ink transition flex items-center gap-1"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  New Folder
                </button>
              )}
            </div>

            {folderActionError && (
              <p className="mt-2 text-xs text-danger">{folderActionError}</p>
            )}

            {/* Folder Actions (Rename / Delete) */}
            {activeFolder !== 'all' && (
              <div className="mt-3 mb-4 flex items-center justify-between rounded-lg bg-bg-sunk/40 px-3 py-2 border border-line text-xs">
                {editingFolderName === activeFolder ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="h-6 rounded border border-line-strong bg-bg-elev px-2 text-xs font-medium text-ink outline-none focus:border-accent"
                      autoFocus
                    />
                    <button
                      onClick={handleRenameFolder}
                      className="text-accent hover:text-accent/80 font-semibold flex items-center gap-0.5"
                    >
                      <Check className="h-3.5 w-3.5" /> Save
                    </button>
                    <button
                      onClick={() => setEditingFolderName(null)}
                      className="text-muted hover:text-ink font-semibold flex items-center gap-0.5"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-ink-2">Folder: <span className="text-ink">{activeFolder}</span></span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingFolderName(activeFolder)
                          setRenameValue(activeFolder)
                        }}
                        className="text-muted hover:text-accent flex items-center gap-0.5"
                        title="Rename folder"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Rename
                      </button>
                      <button
                        onClick={handleDeleteFolder}
                        className="text-muted hover:text-danger flex items-center gap-0.5"
                        title="Delete folder"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              {displayedFavorites.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line-strong bg-bg-sunk p-6 text-center">
                  <p className="text-sm text-muted">
                    {activeFolder === 'all' 
                      ? 'No favorites yet' 
                      : `No tools in folder "${activeFolder}". Assign tools using the folder icon on favorite cards.`
                    }
                  </p>
                  {activeFolder === 'all' && (
                    <Button className="mt-4" onClick={() => navigate('/tools')}>
                      Explore Tools
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {displayedFavorites.map((tool) => (
                    <Card 
                      key={tool.slug || tool.name} 
                      tool={tool} 
                      folders={folders}
                      onFoldersUpdated={fetchFolders}
                    />
                  ))}
                </div>
              )}
            </div>
          </MotionSection>

          <MotionSection
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-10% 0px' }}
          >
            <h2 className="text-xl font-bold text-ink">AI Stack Architect</h2>

            {!savedStack ? (
              <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-bg-sunk p-6 text-center">
                <p className="text-sm text-muted">No stack saved yet</p>
                <Button className="mt-4" onClick={() => navigate('/ai-tool-finder')}>
                  Launch AI Stack Architect
                </Button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-line bg-bg-elev p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Saved preferences</p>
                    <p className="mt-1 text-xs text-muted">Your latest finder profile used to build this stack.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingStack ? (
                      <>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-line-strong px-4 text-xs font-semibold text-ink-2 transition hover:bg-bg-sunk"
                          onClick={cancelEditStack}
                        >
                          Cancel
                        </button>
                        <Button
                          type="button"
                          className="h-9 rounded-lg px-4 text-xs shadow-md"
                          disabled={stackBusy}
                          onClick={saveStackEdits}
                        >
                          {stackBusy ? 'Saving…' : 'Save Changes'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-accent px-3 text-xs font-semibold text-accent shadow-sm transition hover:bg-accent-soft"
                          onClick={shareStack}
                        >
                          {copiedStack ? 'Link Copied!' : 'Share stack'}
                        </button>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-line-strong px-3 text-xs font-semibold text-ink-2 shadow-sm transition hover:bg-bg-sunk"
                          onClick={startEditStack}
                        >
                          Edit stack
                        </button>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-line-strong px-3 text-xs font-semibold text-ink-2 shadow-sm transition hover:bg-bg-sunk"
                          onClick={() => navigate('/ai-tool-finder')}
                        >
                          Rebuild
                        </button>
                        <button
                          type="button"
                          className="h-9 rounded-lg border border-danger/40 px-3 text-xs font-semibold text-danger shadow-sm transition hover:bg-danger-soft"
                          disabled={stackBusy}
                          onClick={clearStack}
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="border-l-2 border-accent pl-3 first:border-l-0 first:pl-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Goal</p>
                    <p className="mt-1 text-sm font-bold text-ink">{toProperCase(savedStack.goal || 'N/A')}</p>
                  </div>
                  <div className="border-l-2 border-line pl-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Budget</p>
                    <p className="mt-1 text-sm font-bold text-ink">{toProperCase(savedStack.budget || 'N/A')}</p>
                  </div>
                  <div className="border-l-2 border-line pl-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Level</p>
                    <p className="mt-1 text-sm font-bold text-ink">{toProperCase(savedStack.level || 'N/A')}</p>
                  </div>
                  <div className="border-l-2 border-line pl-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Est. Pro Cost</p>
                    <p className="mt-1 text-sm font-bold text-ink">${stackCost}/mo</p>
                  </div>
                  <div className="border-l-2 border-line pl-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Saved Tools</p>
                    <p className="mt-1 text-sm font-bold text-ink">{editingStack ? draftTools.length : (Array.isArray(savedStack.tools) ? savedStack.tools.length : 0)}</p>
                  </div>
                </div>

                <div className={`mt-6 border-t border-line pt-5 transition-all ${editingStack ? 'scale-[1.01]' : ''}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    {editingStack ? 'Manage Stack Tools' : 'Saved tools'}
                  </p>
                  <div className={`mt-2 flex flex-wrap items-center gap-2 ${editingStack ? 'rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4 shadow-inner' : ''}`}>
                    {editingStack ? (
                      <>
                        {draftTools.map((toolSlug, index) => {
                          const tool = allTools.find((t) => String(t.slug || t.name).toLowerCase() === String(toolSlug).toLowerCase())
                          return (
                            <span
                              key={`draft-tool-${index}`}
                              className="group inline-flex cursor-default items-center gap-1.5 rounded-md border border-accent/30 bg-bg-elev px-3 py-1.5 text-sm font-medium text-ink shadow-sm transition-all hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
                            >
                              {tool ? tool.name : toolSlug}
                              <button
                                type="button"
                                aria-label={`Remove ${tool ? tool.name : toolSlug}`}
                                onClick={() => setDraftTools((d) => d.filter((_, i) => i !== index))}
                                className="ml-1 text-muted opacity-60 transition group-hover:text-danger group-hover:opacity-100"
                              >
                                ×
                              </button>
                            </span>
                          )
                        })}
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setDraftTools((prev) => [...prev, e.target.value])
                            }
                          }}
                          className="h-9 min-w-[140px] cursor-pointer rounded-md border border-dashed border-line-strong bg-transparent px-3 py-1.5 text-sm font-medium text-ink-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent hover:border-accent hover:text-ink"
                        >
                          <option value="" disabled>+ Add tool...</option>
                          {allTools
                            .filter((t) => !draftTools.includes(t.slug))
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((t) => (
                              <option key={t.slug} value={t.slug}>
                                {t.name}
                              </option>
                            ))}
                        </select>
                      </>
                    ) : Array.isArray(savedStack.tools) && savedStack.tools.length > 0 ? (
                      savedStack.tools.map((toolSlug, index) => {
                        const tool = allTools.find((t) => String(t.slug || t.name).toLowerCase() === String(toolSlug).toLowerCase())
                        return (
                          <span
                            key={`saved-stack-tool-${index}`}
                            className="rounded-md border border-line bg-bg-elev px-3 py-1.5 text-sm font-medium text-ink shadow-sm"
                          >
                            {tool ? tool.name : toolSlug}
                          </span>
                        )
                      })
                    ) : (
                      <p className="text-sm text-muted">No tools saved in stack.</p>
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
