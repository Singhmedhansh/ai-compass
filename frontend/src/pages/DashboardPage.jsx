import { motion } from 'framer-motion'
import { Calendar, Check, Edit3, Eye, FolderPlus, Grid3X3, Heart, Home, Sparkles, Trash2, Wand2, X, AlertCircle, BarChart3, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { Button, Card, CompassLoader, CountUp, ToolLogo, ChromaGrid } from '../components/ui'

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

// Cheapest paid tier for a tool, in that tool's own currency.
// `min_paid_price` is what /api/v1/tools?fields=card sends; the
// pricing_tiers branch is the fallback for any full tool record.
function resolveMinPaidPrice(rawTool) {
  if (typeof rawTool?.min_paid_price === 'number') {
    return rawTool.min_paid_price
  }
  const tiers = rawTool?.pricing_tiers?.tiers
  if (!Array.isArray(tiers)) return null
  const paid = tiers
    .map((tier) => tier?.price_amount)
    .filter((amount) => typeof amount === 'number' && amount > 0)
  return paid.length > 0 ? Math.min(...paid) : null
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
    // The server derives the cheapest paid tier for us (?fields=card), so
    // the 400 KB pricing_tiers blob never has to cross the wire. Falling
    // back to a local scan keeps this working for any caller still handed
    // a full tool record.
    minPaidPrice: resolveMinPaidPrice(rawTool),
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

  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'))
  const [recommendations, setRecommendations] = useState([])
  const [favorites, setFavorites] = useState([])
  const [folders, setFolders] = useState([])
  
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [isCalibrating, setIsCalibrating] = useState(false)
  const [editInterests, setEditInterests] = useState([])
  const [editGoals, setEditGoals] = useState([])
  const [editSkill, setEditSkill] = useState('intermediate')
  const [editPricing, setEditPricing] = useState('freemium')
  const [savingCalib, setSavingCalib] = useState(false)
  const [calibError, setCalibError] = useState('')
  const [activeFolder, setActiveFolder] = useState('all')
  const [showCreateFolderInput, setShowCreateFolderInput] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [editingFolderName, setEditingFolderName] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [folderActionError, setFolderActionError] = useState('')
  const [resendingEmail, setResendingEmail] = useState(false)

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
  const [analyticsData, setAnalyticsData] = useState(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [analyticsError, setAnalyticsError] = useState(null)

  useEffect(() => {
    const handleUserChange = () => {
      setUser(JSON.parse(localStorage.getItem('user') || 'null'))
      setRefreshTrigger(prev => prev + 1)
    }
    window.addEventListener('userLoggedIn', handleUserChange)
    window.addEventListener('onboardingCompleted', handleUserChange)
    return () => {
      window.removeEventListener('userLoggedIn', handleUserChange)
      window.removeEventListener('onboardingCompleted', handleUserChange)
    }
  }, [])

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
        
        // Pre-initialize edit states from local storage values
        setEditInterests(Array.isArray(mergedUser.interests) ? mergedUser.interests : [])
        setEditGoals(Array.isArray(mergedUser.goals) ? mergedUser.goals : [])
        setEditSkill(mergedUser.skill_level || 'intermediate')
        setEditPricing(mergedUser.pricing_pref || 'freemium')

        // Fetch full user profile in background to get created_at/member_since and preferences
        try {
          const authMeResponse = await fetch('/api/v1/auth/me', { signal: controller.signal })
          if (authMeResponse.ok) {
            const fullUserData = await authMeResponse.json()
            // Merge the full user data, keeping localStorage data as base
            mergedUser = {
              ...mergedUser,
              created_at: fullUserData.created_at || storedUser.created_at,
              member_since: fullUserData.member_since || storedUser.member_since,
              interests: fullUserData.interests || storedUser.interests || [],
              goals: fullUserData.goals || storedUser.goals || [],
              skill_level: fullUserData.skill_level || storedUser.skill_level || 'intermediate',
              pricing_pref: fullUserData.pricing_pref || storedUser.pricing_pref || 'freemium',
            }
            // Update localStorage with the merged data
            localStorage.setItem('user', JSON.stringify(mergedUser))
            setUser(mergedUser)
            
            // Sync to edit state
            setEditInterests(mergedUser.interests)
            setEditGoals(mergedUser.goals)
            setEditSkill(mergedUser.skill_level)
            setEditPricing(mergedUser.pricing_pref)
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
          fetch('/api/v1/tools?fields=card', { signal: controller.signal }),
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
  }, [navigate, refreshTrigger])

  const handleFetchWorkflowAnalytics = async (signal) => {
    setLoadingAnalytics(true)
    setAnalyticsError(null)
    try {
      const recentSlugsList = readRecentlyViewedSlugs()
      const recentParam = recentSlugsList.join(',')
      const response = await fetch(`/api/v1/profile/workflow-analytics?recent=${encodeURIComponent(recentParam)}&_t=${Date.now()}`, { signal })
      
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to fetch workflow insights.')
      }
      
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setAnalyticsData(data)
    } catch (error) {
      if (error.name !== 'AbortError') {
        setAnalyticsError(error.message || 'Unable to analyze workflow.')
      }
    } finally {
      setLoadingAnalytics(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    handleFetchWorkflowAnalytics(controller.signal)
    return () => controller.abort()
  }, [])

  const handleSavePreferences = async (e) => {
    e.preventDefault()
    setSavingCalib(true)
    setCalibError('')
    try {
      const res = await fetch('/api/v1/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests: editInterests,
          goals: editGoals,
          skill_level: editSkill,
          pricing_pref: editPricing,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Failed to save preferences')
      }

      const updatedUser = await res.json()
      const localUser = JSON.parse(localStorage.getItem('user') || '{}')
      localStorage.setItem('user', JSON.stringify({ ...localUser, ...updatedUser }))

      // Re-fetch recommendations and workflow analytics
      setRefreshTrigger(prev => prev + 1)
      setIsCalibrating(false)
      toast.success('Preferences updated! Calibrating your workspace...')
    } catch (err) {
      setCalibError(err.message || 'Failed to update preferences.')
      toast.error(err.message || 'Failed to update preferences.')
    } finally {
      setSavingCalib(false)
    }
  }

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/v1/profile/favorites/folders')
      if (res.ok) {
        const data = await res.json()
        setFolders(data)
      }
    } catch {
      // Non-critical background fetch — silently ignore; folders show empty state
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
      if (tool && typeof tool.minPaidPrice === 'number') {
        total += tool.minPaidPrice
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
      {user && user.is_verified === false && (
        <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-300 animate-fade-in flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-semibold text-amber-900 dark:text-amber-200">Verify your email address:</span> We sent a verification link to <span className="font-semibold">{user.email}</span>. Please verify your email to unlock all features (like saving stacks, custom calibrations, and voting).
            </div>
          </div>
          <button
            disabled={resendingEmail}
            onClick={async () => {
              setResendingEmail(true)
              try {
                const res = await fetch('/api/auth/resend-verification', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: user.email })
                })
                if (res.ok) {
                  toast.success('Verification link resent! Check your inbox.')
                } else {
                  const data = await res.json()
                  toast.error(data.error || 'Failed to resend. Try again.')
                }
              } catch {
                toast.error('Failed to resend verification link.')
              } finally {
                setResendingEmail(false)
              }
            }}
            className="shrink-0 text-xs font-bold uppercase tracking-wider bg-bg border border-line px-3 py-1.5 rounded-lg text-ink hover:bg-bg-sunk transition disabled:opacity-50"
          >
            {resendingEmail ? 'Resending...' : 'Resend Email'}
          </button>
        </div>
      )}
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

          {/* Personalization Calibrator Card */}
          <MotionSection
            variants={fadeUp}
            initial="hidden"
            animate="show"
            className="rounded-xl border border-line bg-bg-elev p-5 shadow-sm overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-ink">Personalization Calibration</h2>
                  <p className="text-[11px] text-muted">Fine-tune the AI recommendation engine to your specific needs.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCalibrating(!isCalibrating)
                  if (!isCalibrating) {
                    setEditInterests(Array.isArray(user?.interests) ? user.interests : [])
                    setEditGoals(Array.isArray(user?.goals) ? user.goals : [])
                    setEditSkill(user?.skill_level || 'intermediate')
                    setEditPricing(user?.pricing_pref || 'freemium')
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-sunk px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-line"
              >
                <Edit3 className="h-3.5 w-3.5" />
                {isCalibrating ? 'Cancel' : 'Adjust Settings'}
              </button>
            </div>

            {!isCalibrating ? (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-bg-sunk/35 p-3 border border-line/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">Interests</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.isArray(user?.interests) && user.interests.length > 0 ? (
                      user.interests.map(item => (
                        <span key={item} className="inline-block rounded bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink border border-accent/15">
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted">No interests selected</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-bg-sunk/35 p-3 border border-line/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">Active Goals</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.isArray(user?.goals) && user.goals.length > 0 ? (
                      user.goals.map(item => {
                        const labelMap = {
                          'Academic Writing': 'Essay Writing',
                          'Software Projects': 'App Coding',
                          'Visual Design': 'Graphic Design',
                          'Voiceovers & Podcasts': 'Audio Editing',
                          'Study Planning': 'Task Mgmt',
                          'Literature Review': 'Lit Review'
                        }
                        return (
                          <span key={item} className="inline-block rounded bg-bg px-2 py-0.5 text-[10px] font-semibold text-ink-2 border border-line">
                            {labelMap[item] || item}
                          </span>
                        )
                      })
                    ) : (
                      <span className="text-xs text-muted">No goals selected</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-bg-sunk/35 p-3 border border-line/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">Skill Level</span>
                  <span className="inline-block rounded bg-bg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent mt-1 border border-accent/10">
                    {user?.skill_level || 'Intermediate'}
                  </span>
                </div>

                <div className="rounded-xl bg-bg-sunk/35 p-3 border border-line/50">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">Budget Pref</span>
                  <span className="inline-block rounded bg-bg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink mt-1 border border-line">
                    {user?.pricing_pref === 'free' ? 'Free only' : user?.pricing_pref === 'paid' ? 'Paid / Premium' : 'Freemium'}
                  </span>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSavePreferences} className="mt-4 space-y-4 animate-fade-in">
                {calibError && (
                  <div className="rounded-lg bg-danger-soft p-2.5 text-xs text-danger border border-danger/10">
                    {calibError}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Interests */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">What tools are you looking for?</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'Coding', label: 'Coding' },
                        { id: 'Writing & Chat', label: 'Writing & Chat' },
                        { id: 'Research', label: 'Research' },
                        { id: 'Productivity', label: 'Productivity' },
                        { id: 'Image Generation', label: 'Image Gen' },
                        { id: 'Video Generation', label: 'Video Gen' },
                        { id: 'Audio & Voice', label: 'Audio & Voice' },
                        { id: 'Education', label: 'Education' }
                      ].map(cat => {
                        const selected = editInterests.includes(cat.id)
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setEditInterests(prev =>
                                prev.includes(cat.id) ? prev.filter(x => x !== cat.id) : [...prev, cat.id]
                              )
                            }}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-left text-xs font-semibold transition-all ${
                              selected ? 'border-accent bg-accent/5 text-accent' : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink-2'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-accent' : 'bg-transparent border border-line-strong'}`} />
                            {cat.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Goals */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">What are your primary goals?</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'Academic Writing', label: 'Essay Writing' },
                        { id: 'Software Projects', label: 'App Coding' },
                        { id: 'Visual Design', label: 'Graphic Art' },
                        { id: 'Voiceovers & Podcasts', label: 'Audio Editing' },
                        { id: 'Study Planning', label: 'Task Mgmt' },
                        { id: 'Literature Review', label: 'Lit Review' }
                      ].map(goal => {
                        const selected = editGoals.includes(goal.id)
                        return (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() => {
                              setEditGoals(prev =>
                                prev.includes(goal.id) ? prev.filter(x => x !== goal.id) : [...prev, goal.id]
                              )
                            }}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-left text-xs font-semibold transition-all ${
                              selected ? 'border-accent bg-accent/5 text-accent' : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink-2'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-accent' : 'bg-transparent border border-line-strong'}`} />
                            {goal.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-line pt-3.5">
                  {/* Skill level */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted block">Skill Level</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'beginner', label: 'Beginner' },
                        { id: 'intermediate', label: 'Intermediate' },
                        { id: 'advanced', label: 'Advanced' }
                      ].map(lvl => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setEditSkill(lvl.id)}
                          className={`rounded-xl border py-1.5 text-center text-xs font-semibold transition-all ${
                            editSkill === lvl.id ? 'border-accent bg-accent/5 text-accent' : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink-2'
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Budget Preference */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted block">Budget Preference</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'free', label: 'Free only' },
                        { id: 'freemium', label: 'Freemium' },
                        { id: 'paid', label: 'Premium' }
                      ].map(prc => (
                        <button
                          key={prc.id}
                          type="button"
                          onClick={() => setEditPricing(prc.id)}
                          className={`rounded-xl border py-1.5 text-center text-xs font-semibold transition-all ${
                            editPricing === prc.id ? 'border-accent bg-accent/5 text-accent' : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink-2'
                          }`}
                        >
                          {prc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-line pt-3.5">
                  <button
                    type="button"
                    onClick={() => setIsCalibrating(false)}
                    className="rounded-xl border border-line bg-bg-sunk px-4 py-2 text-xs font-semibold text-ink-2 transition hover:bg-line"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCalib}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 shadow-sm disabled:opacity-50"
                  >
                    {savingCalib ? 'Calibrating...' : 'Save & Apply Calibration'}
                  </button>
                </div>
              </form>
            )}
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
              <ChromaGrid items={recommendations} glass={true} />
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
                id="folder-btn-all"
                onClick={() => {
                  setActiveFolder('all')
                  setFolderActionError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' && folders.length > 0) {
                    document.getElementById('folder-btn-0')?.focus();
                  }
                }}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  activeFolder === 'all'
                    ? 'bg-accent text-bg shadow-sm'
                    : 'bg-bg-sunk text-ink-2 hover:bg-bg-sunk/80'
                }`}
              >
                All Favorites
              </button>

              {folders.map((folder, index) => (
                <button
                  key={folder.name}
                  type="button"
                  id={`folder-btn-${index}`}
                  onClick={() => {
                    setActiveFolder(folder.name)
                    setFolderActionError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight' && index < folders.length - 1) {
                      document.getElementById(`folder-btn-${index + 1}`)?.focus();
                    } else if (e.key === 'ArrowLeft') {
                      if (index > 0) document.getElementById(`folder-btn-${index - 1}`)?.focus();
                      else document.getElementById('folder-btn-all')?.focus();
                    }
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
                <ChromaGrid 
                  items={displayedFavorites} 
                  folders={folders} 
                  onFoldersUpdated={fetchFolders}
                  glass={false}
                />
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

          {/* AI Workflow Analytics Section */}
          <MotionSection
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-10% 0px' }}
            className="rounded-xl border border-line bg-bg-elev p-6 shadow-sm animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-ink">AI Workflow Analytics</h2>
                  <p className="text-xs text-muted">A summary of your tool stack's composition and balance.</p>
                </div>
              </div>
              {analyticsData && (
                <button
                  type="button"
                  onClick={() => handleFetchWorkflowAnalytics()}
                  disabled={loadingAnalytics}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-bg-sunk hover:bg-line transition text-ink disabled:opacity-50"
                  title="Re-analyze workflow"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAnalytics ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            {loadingAnalytics ? (
              <div className="mt-6 flex flex-col items-center justify-center py-8 space-y-4 animate-pulse">
                <div className="relative flex items-center justify-center h-12 w-12">
                  <div className="absolute inset-0 rounded-full border-4 border-accent/20 animate-ping"></div>
                  <div className="h-8 w-8 rounded-full border-4 border-t-accent border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                  <Sparkles className="absolute h-4 w-4 text-accent" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-ink">Auditing your workspace...</p>
                </div>
              </div>
            ) : analyticsError ? (
              analyticsError.includes('No tools found') ? (
                <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-bg-sunk/40 p-6 text-center animate-fade-in">
                  <Sparkles className="mx-auto h-8 w-8 text-accent/60 mb-3" />
                  <h4 className="text-sm font-bold text-ink">Unlock your AI Persona</h4>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                    {analyticsError}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-4"
                    onClick={() => navigate('/tools')}
                  >
                    Explore &amp; Favorite Tools
                  </Button>
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-danger/25 bg-danger-soft/10 p-5 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-ink">Analysis Failed</h4>
                      <p className="mt-1 text-xs text-muted">{analyticsError}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3 !border-danger !text-danger hover:!bg-danger-soft"
                        onClick={() => handleFetchWorkflowAnalytics()}
                      >
                        Try Again
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="mt-6 space-y-6 animate-fade-in">
                <div className="rounded-xl border border-accent/20 bg-accent-soft/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                      AI Persona
                    </span>
                    <h4 className="text-lg font-bold text-ink mt-1.5">{analyticsData.persona}</h4>
                    <p className="text-xs text-muted mt-0.5">{analyticsData.persona_description}</p>
                  </div>
                  <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft/20 text-accent border border-accent/10">
                    <Sparkles className="h-6 w-6" />
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-xl border border-line bg-bg-sunk/30 p-6">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">Workflow Audit</h4>
                    <p className="text-sm font-medium text-ink-2 leading-relaxed">{analyticsData.workflow_insights}</p>
                  </div>

                  <div className="rounded-xl border border-line bg-bg-sunk/30 p-6">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-3.5">Category Distribution</h4>
                    <div className="space-y-4">
                      {Object.entries(analyticsData.distribution).map(([category, percentage]) => {
                        let colorClass = 'bg-accent'
                        if (category === 'Coding') colorClass = 'bg-indigo-500'
                        else if (category === 'Research') colorClass = 'bg-violet-500'
                        else if (category === 'Writing & Chat') colorClass = 'bg-emerald-500'
                        else if (category.includes('Gen') || category.includes('Voice')) colorClass = 'bg-rose-500'
                        else if (category === 'Productivity') colorClass = 'bg-amber-500'
                        else if (category === 'Design & Graphics') colorClass = 'bg-pink-500'

                        return (
                          <div key={category} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-ink-2">
                              <span>{category}</span>
                              <span>{percentage}%</span>
                            </div>
                            <div className="h-2.5 w-full rounded-full bg-line/55 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${colorClass} transition-all duration-500`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {analyticsData.recommendations && analyticsData.recommendations.length > 0 && (
                  <div className="border-t border-line/45 pt-5 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Recommended to Balance Your Stack</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {analyticsData.recommendations.map((rec) => {
                        const resolvedTool = allTools.find(
                          (t) => String(t.slug || '').toLowerCase() === String(rec.slug || '').toLowerCase()
                        )

                        return (
                          <div
                            key={rec.slug || rec.name}
                            className="group flex flex-col justify-between rounded-xl border border-line bg-bg-sunk/25 p-4 transition duration-200 hover:border-accent/40 hover:bg-bg-sunk/40"
                          >
                            <div className="flex items-start gap-3">
                              {resolvedTool ? (
                                <div className="shrink-0 mt-0.5">
                                  <ToolLogo tool={resolvedTool} size={36} />
                                </div>
                              ) : (
                                <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent text-xs font-bold">
                                  {rec.name ? rec.name[0].toUpperCase() : 'T'}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {resolvedTool ? (
                                    <button
                                      type="button"
                                      onClick={() => navigate(`/tools/${resolvedTool.slug}`)}
                                      className="text-xs font-bold text-ink hover:text-accent hover:underline text-left truncate"
                                    >
                                      {rec.name}
                                    </button>
                                  ) : (
                                    <span className="text-xs font-bold text-ink truncate">{rec.name}</span>
                                  )}
                                  <span className="inline-block rounded bg-accent-soft px-1.5 py-0.5 text-[8.5px] font-bold text-accent">
                                    {rec.category}
                                  </span>
                                </div>
                                <p className="mt-1 text-[11px] text-muted leading-relaxed">
                                  {rec.reason}
                                </p>
                              </div>
                            </div>

                            {resolvedTool && (
                              <div className="mt-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => navigate(`/tools/${resolvedTool.slug}`)}
                                  className="text-[10px] font-bold text-accent hover:underline flex items-center gap-0.5"
                                >
                                  View Tool Details &rarr;
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
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
