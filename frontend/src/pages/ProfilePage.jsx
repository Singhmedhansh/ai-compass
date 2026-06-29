import { Bell, Check, CheckCircle2, Download, GraduationCap, Loader2, ShieldAlert, Sparkles, Trash2, UserRound, Copy, Globe, Lock, Edit2, X, Library, History, Search, ChevronDown, ChevronUp, BarChart3, RefreshCw, AlertCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, ToolLogo } from '../components/ui'

const THEME_STORAGE_KEY = 'ai-compass-theme'
const NOTIFICATIONS_STORAGE_KEY = 'ai-compass-email-notifications'

function safeParseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function getStoredTheme() {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return storedTheme === 'dark' ? 'dark' : 'light'
}

function readStoredBoolean(key, defaultValue) {
  if (typeof window === 'undefined') {
    return defaultValue
  }

  const storedValue = window.localStorage.getItem(key)
  if (storedValue === null) {
    return defaultValue
  }

  return storedValue === 'true'
}

function formatMemberSince(value) {
  if (!value) {
    return 'New member'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'New member'
  }

  return parsed.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function ToggleSwitch({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-bg-sunk px-4 py-3 text-left transition hover:border-accent hover:bg-bg-elev"
      aria-pressed={checked}
    >
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-muted">{description}</p>
      </div>

      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line-strong'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg-elev shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  )
}

const CATEGORIES = [
  { id: 'Coding', label: 'Coding' },
  { id: 'Writing & Chat', label: 'Writing & Chat' },
  { id: 'Research', label: 'Research' },
  { id: 'Productivity', label: 'Productivity' },
  { id: 'Image Generation', label: 'Image Gen' },
  { id: 'Video Generation', label: 'Video Gen' },
  { id: 'Audio & Voice', label: 'Audio & Voice' },
  { id: 'Design & Graphics', label: 'Design & Graphics' }
]

const GOALS = [
  { id: 'Academic Writing', label: 'Writing papers & essays' },
  { id: 'Software Projects', label: 'Building apps & coding' },
  { id: 'Visual Design', label: 'Creating graphics & art' },
  { id: 'Voiceovers & Podcasts', label: 'Editing audio & speech' },
  { id: 'Study Planning', label: 'Workspace & task management' },
  { id: 'Literature Review', label: 'Reading & scraping citations' }
]

const SKILL_LEVELS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' }
]

const PRICING_PREFS = [
  { id: 'free', label: 'Free' },
  { id: 'freemium', label: 'Freemium' },
  { id: 'paid', label: 'Paid' }
]

function ProfilePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [favoritesDownloading, setFavoritesDownloading] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleteStep, setDeleteStep] = useState(1)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [preferences, setPreferences] = useState(() => ({
    theme: getStoredTheme(),
    emailNotifications: readStoredBoolean(NOTIFICATIONS_STORAGE_KEY, true),
  }))
  const [isEditingPreferences, setIsEditingPreferences] = useState(false)
  const [isSavingPreferences, setIsSavingPreferences] = useState(false)
  const [editInterests, setEditInterests] = useState([])
  const [editGoals, setEditGoals] = useState([])
  const [editSkill, setEditSkill] = useState('intermediate')
  const [editPricing, setEditPricing] = useState('freemium')

  const [stacks, setStacks] = useState([])
  const [loadingStacks, setLoadingStacks] = useState(true)
  const [editingStackId, setEditingStackId] = useState(null)
  const [editingStackName, setEditingStackName] = useState('')
  const [savingStackId, setSavingStackId] = useState(null)
  const [deletingStackId, setDeletingStackId] = useState(null)

  const [schoolEmail, setSchoolEmail] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [gradYear, setGradYear] = useState('2026')
  const [isVerifyingStudent, setIsVerifyingStudent] = useState(false)
  const [isResettingStudent, setIsResettingStudent] = useState(false)
  const [allTools, setAllTools] = useState([])
  const [loadingTools, setLoadingTools] = useState(true)
  const [recentlyViewedSlugs, setRecentlyViewedSlugs] = useState(() => {
    try {
      const stored = localStorage.getItem('recentlyViewed')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false)
  const [expandedStackIds, setExpandedStackIds] = useState([])
  const [analyticsData, setAnalyticsData] = useState(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [analyticsError, setAnalyticsError] = useState(null)
  const [securityData, setSecurityData] = useState(null)
  const [loadingSecurity, setLoadingSecurity] = useState(true)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordFormError, setPasswordFormError] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [unlinkingProvider, setUnlinkingProvider] = useState(null)
  const [revokingSessionUuid, setRevokingSessionUuid] = useState(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  const [publicSettings, setPublicSettings] = useState({
    is_profile_public: false,
    public_username: '',
    bio: '',
    github_username: '',
    linkedin_username: '',
    twitter_username: ''
  })
  const [loadingPublicSettings, setLoadingPublicSettings] = useState(true)
  const [savingPublicSettings, setSavingPublicSettings] = useState(false)
  const [submissions, setSubmissions] = useState([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    
    async function fetchPublicSettings() {
      try {
        const response = await fetch('/api/v1/profile/public-settings', { signal: controller.signal })
        if (response.ok) {
          const data = await response.json()
          setPublicSettings(data)
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to fetch public settings', error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPublicSettings(false)
        }
      }
    }

    async function fetchSubmissions() {
      try {
        const response = await fetch('/api/v1/profile/submissions', { signal: controller.signal })
        if (response.ok) {
          const data = await response.json()
          setSubmissions(data.submissions || [])
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to fetch submissions', error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSubmissions(false)
        }
      }
    }

    const storedUser = safeParseJson(localStorage.getItem('user'))
    if (storedUser) {
      fetchPublicSettings()
      fetchSubmissions()
    } else {
      setLoadingPublicSettings(false)
      setLoadingSubmissions(false)
    }

    return () => controller.abort()
  }, [])

  const handleSavePublicSettings = async () => {
    if (publicSettings.is_profile_public) {
      const usernameClean = String(publicSettings.public_username || '').trim().lower()
      if (!usernameClean) {
        showToast('Public username is required if profile is public.', 'error')
        return
      }
      if (!/^[a-z0-9\-]{3,30}$/.test(usernameClean)) {
        showToast('Username must be 3-30 characters long and contain only lowercase letters, numbers, and dashes.', 'error')
        return
      }
    }

    if (String(publicSettings.bio || '').length > 500) {
      showToast('Bio cannot exceed 500 characters.', 'error')
      return
    }

    setSavingPublicSettings(true)
    try {
      const response = await fetch('/api/v1/profile/public-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publicSettings),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update public settings.')
      }

      setPublicSettings(data)
      showToast('Public profile settings updated successfully.')
    } catch (error) {
      showToast(error.message || 'Failed to update settings.', 'error')
    } finally {
      setSavingPublicSettings(false)
    }
  }

  const studentVerification = useMemo(() => {
    try {
      const prefs = typeof profile?.preferences === 'string'
        ? JSON.parse(profile.preferences)
        : profile?.preferences
      return prefs?.student_verification || null
    } catch {
      return null
    }
  }, [profile?.preferences])

  const recentlyViewedTools = useMemo(() => {
    if (allTools.length === 0 || recentlyViewedSlugs.length === 0) {
      return []
    }
    const toolBySlug = new Map(allTools.map((tool) => [String(tool.slug || '').toLowerCase(), tool]))
    return recentlyViewedSlugs
      .map((slug) => toolBySlug.get(String(slug).toLowerCase()))
      .filter(Boolean)
  }, [allTools, recentlyViewedSlugs])

  const historyCategories = useMemo(() => {
    const cats = new Set()
    for (const tool of recentlyViewedTools) {
      if (tool?.category) {
        cats.add(String(tool.category).trim())
      }
    }
    return Array.from(cats).sort()
  }, [recentlyViewedTools])

  const filteredTools = useMemo(() => {
    let list = recentlyViewedTools

    if (categoryFilter !== 'all') {
      list = list.filter((tool) => String(tool.category).trim() === categoryFilter)
    }

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim()
      list = list.filter(
        (tool) =>
          String(tool.name).toLowerCase().includes(query) ||
          String(tool.description).toLowerCase().includes(query) ||
          String(tool.shortDescription).toLowerCase().includes(query)
      )
    }

    return list
  }, [recentlyViewedTools, categoryFilter, searchTerm])

  useEffect(() => {
    const controller = new AbortController()

    async function loadStacks() {
      try {
        const response = await fetch('/api/v1/profile/stacks', { signal: controller.signal })
        if (response.ok) {
          const data = await response.json()
          setStacks(data)
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to load stacks', error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingStacks(false)
        }
      }
    }

    const storedUser = safeParseJson(localStorage.getItem('user'))
    if (storedUser) {
      loadStacks()
    } else {
      setLoadingStacks(false)
    }

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadAllTools() {
      try {
        const response = await fetch('/api/v1/tools', { signal: controller.signal })
        if (response.ok) {
          const data = await response.json()
          const rawTools = Array.isArray(data)
            ? data
            : data?.results || data?.tools || []
          const normalized = rawTools.map((rawTool) => {
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
          })
          setAllTools(normalized)
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to load tools catalog', error)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingTools(false)
        }
      }
    }

    loadAllTools()

    return () => controller.abort()
  }, [])

  const handleRenameStack = async (stackId) => {
    const nextName = editingStackName.trim()
    if (!nextName) {
      showToast('Toolkit name cannot be empty.', 'error')
      return
    }

    setSavingStackId(stackId)
    try {
      const response = await fetch(`/api/v1/profile/stacks/${stackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to rename toolkit.')
      }

      const updated = await response.json()
      setStacks(prev => prev.map(s => s.id === stackId ? { ...s, name: updated.name } : s))
      setEditingStackId(null)
      showToast('Toolkit renamed successfully.')
    } catch (error) {
      showToast(error.message || 'Failed to rename toolkit.', 'error')
    } finally {
      setSavingStackId(null)
    }
  }

  const toggleStackExpanded = (stackId) => {
    setExpandedStackIds((prev) =>
      prev.includes(stackId) ? prev.filter((id) => id !== stackId) : [...prev, stackId]
    )
  }

  const handleRemoveToolFromStack = async (stackId, toolSlug) => {
    const stack = stacks.find((s) => s.id === stackId)
    if (!stack) return

    const updatedTools = stack.tools.filter((slug) => slug !== toolSlug)

    try {
      const response = await fetch(`/api/v1/profile/stacks/${stackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tools: updatedTools }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to update toolkit tools.')
      }

      const updated = await response.json()
      setStacks((prev) =>
        prev.map((s) => (s.id === stackId ? { ...s, tools: updated.tools } : s))
      )
      showToast('Tool removed from toolkit.')
    } catch (error) {
      showToast(error.message || 'Failed to remove tool.', 'error')
    }
  }

  const handleFetchWorkflowAnalytics = async () => {
    setLoadingAnalytics(true)
    setAnalyticsError(null)

    try {
      const recentParam = recentlyViewedSlugs.join(',')
      const response = await fetch(`/api/v1/profile/workflow-analytics?recent=${encodeURIComponent(recentParam)}`)

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
      setAnalyticsError(error.message || 'Unable to analyze workflow.')
      showToast(error.message || 'Failed to analyze workflow.', 'error')
    } finally {
      setLoadingAnalytics(false)
    }
  }

  const handleTogglePrivacy = async (stackId, currentIsPrivate) => {
    const nextIsPrivate = !currentIsPrivate
    try {
      const response = await fetch(`/api/v1/profile/stacks/${stackId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_private: nextIsPrivate }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to update visibility.')
      }

      const updated = await response.json()
      setStacks(prev => prev.map(s => s.id === stackId ? { ...s, is_private: updated.is_private } : s))
      showToast(`Toolkit is now ${nextIsPrivate ? 'private' : 'public'}.`)
    } catch (error) {
      showToast(error.message || 'Failed to update visibility.', 'error')
    }
  }

  const handleDeleteStack = async (stackId) => {
    if (!window.confirm('Are you sure you want to delete this toolkit?')) {
      return
    }
    setDeletingStackId(stackId)
    try {
      const response = await fetch(`/api/v1/profile/stacks/${stackId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to delete toolkit.')
      }

      setStacks(prev => prev.filter(s => s.id !== stackId))
      showToast('Toolkit deleted successfully.')
    } catch (error) {
      showToast(error.message || 'Failed to delete toolkit.', 'error')
    } finally {
      setDeletingStackId(null)
    }
  }

  const handleShareStack = (stackId, isPrivate) => {
    if (isPrivate) return

    const shareUrl = `${window.location.origin}/stacks/${profile?.id || 'user'}?stack_id=${stackId}`
    navigator.clipboard.writeText(shareUrl)
      .then(() => showToast('Share link copied to clipboard!'))
      .catch(() => showToast('Failed to copy link.', 'error'))
  }

  const avatarLetter = useMemo(
    () => String(profile?.name || profile?.email || 'U').charAt(0).toUpperCase(),
    [profile?.email, profile?.name],
  )

  useEffect(() => {
    const controller = new AbortController()

    async function loadProfile() {
      const storedUser = safeParseJson(localStorage.getItem('user'))

      if (!storedUser) {
        navigate('/login', { replace: true })
        return
      }

      try {
        const response = await fetch('/api/v1/auth/me', { signal: controller.signal })

        if (response.status === 401) {
          navigate('/login', { replace: true })
          return
        }

        if (!response.ok) {
          throw new Error('Unable to load your profile.')
        }

        const payload = await response.json()
        const mergedProfile = {
          ...storedUser,
          ...payload,
          name: payload.name || storedUser.name || '',
          email: payload.email || storedUser.email || '',
          picture: payload.picture || storedUser.picture || '',
          member_since: payload.member_since || storedUser.member_since || formatMemberSince(payload.created_at || storedUser.created_at),
        }

        setProfile(mergedProfile)
        setDisplayName(mergedProfile.name || '')
        localStorage.setItem('user', JSON.stringify(mergedProfile))
        window.dispatchEvent(new Event('userLoggedIn'))
      } catch (error) {
        if (error.name !== 'AbortError') {
          setProfile(storedUser)
          setDisplayName(storedUser.name || '')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadProfile()

    return () => controller.abort()
  }, [navigate])

  useEffect(() => {
    if (preferences.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    localStorage.setItem(THEME_STORAGE_KEY, preferences.theme)
    window.dispatchEvent(new Event('themeChanged'))
  }, [preferences.theme])

  useEffect(() => {
    const syncThemeFromStorage = () => {
      setPreferences((current) => {
        const nextTheme = getStoredTheme()
        return current.theme === nextTheme ? current : { ...current, theme: nextTheme }
      })
    }

    window.addEventListener('storage', syncThemeFromStorage)
    window.addEventListener('themeChanged', syncThemeFromStorage)

    return () => {
      window.removeEventListener('storage', syncThemeFromStorage)
      window.removeEventListener('themeChanged', syncThemeFromStorage)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(preferences.emailNotifications))
  }, [preferences.emailNotifications])

  useEffect(() => {
    if (!toast) {
      return undefined
    }

    const timeout = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const showToast = (message, type = 'success') => {
    setToast({ message, type })
  }

  const handleThemeToggle = (nextTheme) => {
    setPreferences((current) => ({ ...current, theme: nextTheme ? 'dark' : 'light' }))
  }

  const handleSaveProfile = async () => {
    const nextName = displayName.trim()

    if (!nextName) {
      showToast('Display name is required.', 'error')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/v1/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Unable to save profile changes.')
      }

      const updatedUser = await response.json()
      const mergedUser = {
        ...profile,
        ...updatedUser,
      }

      setProfile(mergedUser)
      setDisplayName(mergedUser.name || '')
      setIsEditing(false)
      localStorage.setItem('user', JSON.stringify(mergedUser))
      window.dispatchEvent(new Event('userLoggedIn'))
      showToast('Profile updated successfully.')
    } catch (error) {
      showToast(error.message || 'Unable to save profile changes.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditPreferencesToggle = () => {
    if (isEditingPreferences) {
      setIsEditingPreferences(false)
    } else {
      setEditInterests(profile?.interests || [])
      setEditGoals(profile?.goals || [])
      setEditSkill(profile?.skill_level || 'intermediate')
      setEditPricing(profile?.pricing_pref || 'freemium')
      setIsEditingPreferences(true)
    }
  }

  const handleEditInterestToggle = (id) => {
    setEditInterests(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const handleEditGoalToggle = (id) => {
    setEditGoals(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const handleSavePreferences = async () => {
    setIsSavingPreferences(true)
    try {
      const response = await fetch('/api/v1/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests: editInterests,
          goals: editGoals,
          skill_level: editSkill,
          pricing_pref: editPricing,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Unable to save preferences.')
      }

      const updatedUser = await response.json()
      const mergedUser = {
        ...profile,
        ...updatedUser,
      }

      setProfile(mergedUser)
      setIsEditingPreferences(false)
      localStorage.setItem('user', JSON.stringify(mergedUser))
      window.dispatchEvent(new Event('userLoggedIn'))
      showToast('Recommendation preferences updated successfully.')
    } catch (error) {
      showToast(error.message || 'Unable to save preferences.', 'error')
    } finally {
      setIsSavingPreferences(false)
    }
  }

  const handleExportFavorites = async () => {
    setFavoritesDownloading(true)

    try {
      const response = await fetch('/api/v1/favorites')

      if (!response.ok) {
        throw new Error('Unable to export favorites right now.')
      }

      const favorites = await response.json()
      const blob = new Blob(
        [JSON.stringify({ exportedAt: new Date().toISOString(), favorites }, null, 2)],
        { type: 'application/json' },
      )
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'ai-compass-favorites.json'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
      showToast('Favorites exported successfully.')
    } catch (error) {
      showToast(error.message || 'Unable to export favorites right now.', 'error')
    } finally {
      setFavoritesDownloading(false)
    }
  }

  const handleClearRecentlyViewed = () => {
    localStorage.removeItem('recentlyViewed')
    setRecentlyViewedSlugs([])
    showToast('Recently viewed items cleared.')
  }

  const handleRemoveHistoryItem = (slugToRemove) => {
    const updated = recentlyViewedSlugs.filter((slug) => slug !== slugToRemove)
    setRecentlyViewedSlugs(updated)
    localStorage.setItem('recentlyViewed', JSON.stringify(updated))
    showToast('Removed item from history.')
  }

  const handleVerifyStudent = async (e) => {
    e.preventDefault()
    const email = schoolEmail.trim()
    const school = schoolName.trim()

    if (!email || !school || !gradYear) {
      showToast('All fields are required.', 'error')
      return
    }

    setIsVerifyingStudent(true)
    try {
      const res = await fetch('/api/v1/profile/verify-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_email: email,
          school_name: school,
          grad_year: gradYear
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify student status')
      }

      const mergedUser = {
        ...profile,
        ...data,
      }
      setProfile(mergedUser)
      localStorage.setItem('user', JSON.stringify(mergedUser))
      window.dispatchEvent(new Event('userLoggedIn'))
      showToast('Student status verified successfully!')
      setSchoolEmail('')
      setSchoolName('')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setIsVerifyingStudent(false)
    }
  }

  const handleResetStudentVerification = async () => {
    if (!window.confirm('Are you sure you want to unlink and reset your student verification status?')) {
      return
    }

    setIsResettingStudent(true)
    try {
      const res = await fetch('/api/v1/profile/verify-student', {
        method: 'DELETE'
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset student status')
      }

      const mergedUser = {
        ...profile,
        ...data,
      }
      setProfile(mergedUser)
      localStorage.setItem('user', JSON.stringify(mergedUser))
      window.dispatchEvent(new Event('userLoggedIn'))
      showToast('Student verification reset successfully.')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setIsResettingStudent(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Enter your password')
      return
    }

    setDeletingAccount(true)
    setDeleteError('')

    try {
      const response = await fetch('/api/v1/profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: deletePassword }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Unable to delete your account.')
      }

      localStorage.removeItem('user')
      window.dispatchEvent(new Event('userLoggedIn'))
      navigate('/', { replace: true })
    } catch (error) {
      setDeleteError(error.message || 'Unable to delete your account.')
      setDeletingAccount(false)
    }
  }

  const fetchSecurityInfo = async (signal) => {
    try {
      const response = await fetch('/api/v1/profile/security/info', { signal })
      if (response.ok) {
        const data = await response.json()
        setSecurityData(data)
      } else {
        const errData = await response.json().catch(() => ({}))
        console.error('Failed to load security info:', errData.error || response.statusText)
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Failed to load security info', error)
      }
    } finally {
      setLoadingSecurity(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetchSecurityInfo(controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const linked = params.get('linked')
    const error = params.get('error')
    const detail = params.get('detail')

    if (linked) {
      const providerName = linked.charAt(0).toUpperCase() + linked.slice(1)
      showToast(`Successfully connected ${providerName} account!`)
      navigate(window.location.pathname, { replace: true })
      fetchSecurityInfo()
    } else if (error === 'link_failed') {
      let message = 'Failed to link account.'
      if (detail === 'email_already_linked') {
        message = 'This email address is already connected to another AI Compass account.'
      } else if (detail === 'unauthorized') {
        message = 'Authorization failed or timed out. Please try again.'
      }
      showToast(message, 'error')
      navigate(window.location.pathname, { replace: true })
    }
  }, [navigate])

  const handleUnlinkProvider = async (provider) => {
    if (!window.confirm(`Are you sure you want to unlink your ${provider} account?`)) {
      return
    }

    setUnlinkingProvider(provider.toLowerCase())
    try {
      const response = await fetch(`/api/v1/profile/security/unlink/${provider.toLowerCase()}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || `Failed to unlink ${provider}.`)
      }

      showToast(`Successfully unlinked ${provider}.`)
      await fetchSecurityInfo()
    } catch (error) {
      showToast(error.message || `Failed to unlink ${provider}.`, 'error')
    } finally {
      setUnlinkingProvider(null)
    }
  }

  const handleRevokeSession = async (sessionUuid) => {
    if (!window.confirm('Are you sure you want to revoke this session? You will be logged out of that device.')) {
      return
    }

    setRevokingSessionUuid(sessionUuid)
    try {
      const response = await fetch(`/api/v1/profile/security/sessions/${sessionUuid}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to revoke session.')
      }

      const data = await response.json()
      if (data.logged_out) {
        localStorage.removeItem('user')
        window.dispatchEvent(new Event('userLoggedIn'))
        navigate('/login', { replace: true })
        return
      }

      showToast('Session revoked successfully.')
      await fetchSecurityInfo()
    } catch (error) {
      showToast(error.message || 'Failed to revoke session.', 'error')
    } finally {
      setRevokingSessionUuid(null)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordFormError('')

    const { currentPassword, newPassword, confirmPassword } = passwordForm
    const needsCurrentPassword = securityData?.has_password

    if (needsCurrentPassword && !currentPassword) {
      setPasswordFormError('Current password is required.')
      return
    }

    if (!newPassword || newPassword.length < 8) {
      setPasswordFormError('New password must be at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordFormError('Passwords do not match.')
      return
    }

    setIsChangingPassword(true)
    try {
      const body = { new_password: newPassword }
      if (needsCurrentPassword) {
        body.current_password = currentPassword
      }

      const response = await fetch('/api/v1/profile/security/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to update password.')
      }

      showToast(needsCurrentPassword ? 'Password updated successfully!' : 'Password set successfully!')
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
      setShowPasswordForm(false)
      await fetchSecurityInfo()
    } catch (error) {
      setPasswordFormError(error.message || 'Failed to update password.')
    } finally {
      setIsChangingPassword(false)
    }
  }


  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-line bg-bg-elev p-6 text-ink-2 shadow-sm">
          Loading your profile...
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 rounded-3xl border border-line bg-gradient-to-r from-bg-elev to-accent-soft p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-ink">Profile &amp; Settings</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Manage your AI Compass account</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Update your display name, keep your preferences in sync, and manage your personal data from one place.
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
          <div
            className={`mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full ${profile?.picture && profile.picture.length > 10 ? 'bg-bg-sunk' : 'bg-accent'}`}
            role="img"
            aria-label={`Avatar for ${profile?.name || 'your profile'}`}
          >
            {profile?.picture && profile.picture.length > 10 ? (
              <img
                src={profile.picture}
                alt=""
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="h-full w-full object-cover"
                width="96"
                height="96"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="text-3xl font-bold text-bg" aria-hidden="true">{avatarLetter}</span>
            )}
          </div>

          <div className="mt-5 text-center">
            {isEditing ? (
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-2xl border border-line bg-bg-elev px-4 py-3 text-center text-lg font-semibold text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                placeholder="Display name"
              />
            ) : (
              <h2 className="text-2xl font-bold tracking-tight text-ink flex items-center justify-center gap-1.5">
                <span>{profile?.name || 'Your profile'}</span>
                {profile?.student_status && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 fill-emerald-500/10 shrink-0" title="Verified Student Plus" />
                )}
              </h2>
            )}

            <p className="mt-2 break-all text-sm text-muted">{profile?.email || ''}</p>
            <p className="mt-2 text-sm text-muted">Member since {profile?.member_since || 'New member'}</p>
            
            {profile?.student_status && (
              <div className="mt-3 flex justify-center">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500 shadow-sm">
                  <GraduationCap className="h-3.5 w-3.5" />
                  Student Plus
                </span>
              </div>
            )}
          </div>

          <Button
            variant="secondary"
            size="md"
            className="mt-6 w-full"
            onClick={() => {
              if (isEditing) {
                setDisplayName(profile?.name || '')
              }
              setIsEditing((value) => !value)
            }}
          >
            {isEditing ? 'Cancel Edit' : 'Edit Profile'}
          </Button>
        </aside>

        <div className="space-y-6">
          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Account Settings</h3>
                <p className="text-sm text-muted">Update your display name and review your account email.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-ink-2">Display Name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={!isEditing}
                  className="w-full rounded-2xl border border-line bg-bg-elev px-4 py-3 text-ink transition placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:bg-bg-sunk disabled:text-muted"
                  placeholder="Your display name"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-ink-2">Email</span>
                <input
                  value={profile?.email || ''}
                  readOnly
                  disabled
                  className="w-full rounded-2xl border border-line bg-bg-sunk px-4 py-3 text-muted"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="md" onClick={handleSaveProfile} disabled={isSaving || !isEditing}>
                {isSaving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </Button>

              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setDisplayName(profile?.name || '')
                  setIsEditing(false)
                }}
              >
                Reset
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Preferences</h3>
                <p className="text-sm text-muted">Keep your appearance and notifications aligned with how you use AI Compass.</p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <ToggleSwitch
                checked={preferences.theme === 'dark'}
                onChange={handleThemeToggle}
                label="Default theme"
                description="Syncs with the app's dark mode setting."
              />

              <ToggleSwitch
                checked={preferences.emailNotifications}
                onChange={(checked) => setPreferences((current) => ({ ...current, emailNotifications: checked }))}
                label="Email notifications"
                description="Receive product updates and account notices."
              />

            </div>
          </section>

          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Recommendation Preferences</h3>
                <p className="text-sm text-muted">Customize the types of tools, skill level, and budget Gemini suggests on your dashboard.</p>
              </div>
            </div>

            {!isEditingPreferences ? (
              <div className="mt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Primary Interests</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {profile?.interests && profile.interests.length > 0 ? (
                        profile.interests.map(interest => (
                          <span key={interest} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink border border-accent/20 animate-fade-in">
                            {interest}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted">No interests selected yet. Customize them to tune recommendations.</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Target Goals</h4>
                    <div className="space-y-1">
                      {profile?.goals && profile.goals.length > 0 ? (
                        profile.goals.map(goal => (
                          <div key={goal} className="flex items-center gap-1.5 text-xs text-ink-2">
                            <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-accent-soft text-accent-ink">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                            <span>{goal}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-muted">No goals specified yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 pt-2 border-t border-line/40 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Skill Level</h4>
                    <p className="text-sm font-semibold mt-1 text-ink capitalize">{profile?.skill_level || 'Intermediate'}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted">Pricing Calibration</h4>
                    <p className="text-sm font-semibold mt-1 text-ink capitalize">{profile?.pricing_pref || 'Freemium'}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <Button variant="secondary" size="md" onClick={handleEditPreferencesToggle}>
                    Edit Preferences
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {/* Interests Pills */}
                <div>
                  <h4 className="text-sm font-bold text-ink-2 mb-2">Interests</h4>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => {
                      const isSelected = editInterests.includes(cat.id)
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleEditInterestToggle(cat.id)}
                          className={`px-3 py-1.5 rounded-full border text-xs transition-all ${
                            isSelected 
                              ? 'border-accent bg-accent-soft/20 text-accent-ink font-semibold' 
                              : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink'
                          }`}
                        >
                          {cat.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Goals */}
                <div>
                  <h4 className="text-sm font-bold text-ink-2 mb-2">Goals</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {GOALS.map((goal) => {
                      const isSelected = editGoals.includes(goal.id)
                      return (
                        <button
                          key={goal.id}
                          type="button"
                          onClick={() => handleEditGoalToggle(goal.id)}
                          className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                            isSelected 
                              ? 'border-accent bg-accent-soft/10 text-accent-ink font-semibold' 
                              : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink'
                          }`}
                        >
                          <span className="text-xs">{goal.label}</span>
                          <div className={`flex h-4 w-4 items-center justify-center rounded-full border transition-all ${
                            isSelected ? 'border-accent bg-accent text-white' : 'border-line-strong'
                          }`}>
                            {isSelected && <Check className="h-2.5 w-2.5" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Skill Level & Pricing Grid */}
                <div className="grid gap-4 md:grid-cols-2 border-t border-line/40 pt-4">
                  <div>
                    <h4 className="text-sm font-bold text-ink-2 mb-2">Skill Level</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {SKILL_LEVELS.map((level) => (
                        <button
                          key={level.id}
                          type="button"
                          onClick={() => setEditSkill(level.id)}
                          className={`p-2 rounded-xl border text-center transition-all ${
                            editSkill === level.id 
                              ? 'border-accent bg-accent-soft/20 text-accent-ink font-bold text-xs' 
                              : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink text-xs'
                          }`}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-ink-2 mb-2">Pricing Preference</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {PRICING_PREFS.map((pref) => (
                        <button
                          key={pref.id}
                          type="button"
                          onClick={() => setEditPricing(pref.id)}
                          className={`p-2 rounded-xl border text-center transition-all ${
                            editPricing === pref.id 
                              ? 'border-accent bg-accent-soft/20 text-accent-ink font-bold text-xs' 
                              : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink text-xs'
                          }`}
                        >
                          {pref.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-line/40">
                  <Button variant="primary" size="md" onClick={handleSavePreferences} disabled={isSavingPreferences}>
                    {isSavingPreferences ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      'Save Preferences'
                    )}
                  </Button>
                  <Button variant="ghost" size="md" onClick={handleEditPreferencesToggle} disabled={isSavingPreferences}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Student Verification</h3>
                <p className="text-sm text-muted">Verify your academic status to unlock student discounts and exclusive perks.</p>
              </div>
            </div>

            {profile?.student_status ? (
              <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 animate-fade-in">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-ink-2">Verified Student Plus</h4>
                    <p className="mt-1 text-xs text-muted">Your student verification is active and verified.</p>
                    
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs border-t border-line/40 pt-4">
                      <div>
                        <span className="block text-muted font-medium uppercase tracking-wider text-[10px]">Institution / School</span>
                        <span className="mt-1 block font-bold text-ink truncate">{studentVerification?.school_name || 'Academic Institution'}</span>
                      </div>
                      <div>
                        <span className="block text-muted font-medium uppercase tracking-wider text-[10px]">Graduation Year</span>
                        <span className="mt-1 block font-bold text-ink">{studentVerification?.grad_year || 'N/A'}</span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="block text-muted font-medium uppercase tracking-wider text-[10px]">Verified Email</span>
                        <span className="mt-1 block font-bold text-ink truncate">{studentVerification?.school_email || 'student@school.edu'}</span>
                      </div>
                    </div>

                    <div className="mt-5 flex justify-end">
                      <button
                        type="button"
                        onClick={handleResetStudentVerification}
                        disabled={isResettingStudent}
                        className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                      >
                        {isResettingStudent ? 'Resetting...' : 'Reset Student Verification'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleVerifyStudent} className="mt-6 space-y-4 animate-fade-in">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-ink-2">Institution / School</span>
                    <input
                      type="text"
                      required
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="e.g. Stanford University"
                      className="w-full rounded-2xl border border-line bg-bg-elev px-4 py-3 text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-ink-2">Graduation Year</span>
                    <select
                      value={gradYear}
                      onChange={(e) => setGradYear(e.target.value)}
                      className="w-full rounded-2xl border border-line bg-bg-elev px-4 py-3 text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                      {['2026', '2027', '2028', '2029', '2030', '2031', '2032'].map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="mb-2 block text-sm font-medium text-ink-2">Academic Email Address</span>
                    <input
                      type="email"
                      required
                      value={schoolEmail}
                      onChange={(e) => setSchoolEmail(e.target.value)}
                      placeholder="student@school.edu"
                      className="w-full rounded-2xl border border-line bg-bg-elev px-4 py-3 text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </label>
                </div>

                <div className="pt-2">
                  <Button type="submit" variant="primary" size="md" disabled={isVerifyingStudent}>
                    {isVerifyingStudent ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Verifying...
                      </span>
                    ) : (
                      'Verify Student Status'
                    )}
                  </Button>
                </div>
              </form>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Library className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Saved Toolkits (Stacks)</h3>
                <p className="text-sm text-muted">Manage your saved AI toolkits, rename them, toggle privacy settings, or copy share links.</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {loadingStacks ? (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  Loading toolkits...
                </div>
              ) : stacks.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk p-6 text-center text-sm text-muted animate-fade-in">
                  <p>You don&apos;t have any saved toolkits yet.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate('/ai-tool-finder')}
                  >
                    Build your first toolkit
                  </Button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {stacks.map((stack) => {
                    const isEditingThisStack = editingStackId === stack.id
                    const isSavingThisStack = savingStackId === stack.id
                    const isDeletingThisStack = deletingStackId === stack.id

                    return (
                      <div
                        key={stack.id}
                        className="group relative flex flex-col gap-3 rounded-2xl border border-line bg-bg-sunk/50 p-4 transition hover:border-accent hover:bg-bg-elev animate-fade-in"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div className="flex-1 space-y-1">
                            {isEditingThisStack ? (
                              <div className="flex max-w-md items-center gap-2">
                                <input
                                  value={editingStackName}
                                  onChange={(e) => setEditingStackName(e.target.value)}
                                  className="w-full rounded-xl border border-line bg-bg-elev px-3 py-1.5 text-sm font-semibold text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                                  placeholder="Toolkit name"
                                  disabled={isSavingThisStack}
                                  autoFocus
                                />
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handleRenameStack(stack.id)}
                                  disabled={isSavingThisStack}
                                  className="h-9 px-3 shrink-0"
                                >
                                  {isSavingThisStack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setEditingStackId(null)}
                                  disabled={isSavingThisStack}
                                  className="h-9 px-3 shrink-0"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-base font-bold text-ink truncate max-w-[200px] sm:max-w-xs">{stack.name}</h4>
                                <button
                                  onClick={() => {
                                    setEditingStackId(stack.id)
                                    setEditingStackName(stack.name)
                                  }}
                                  className="text-muted hover:text-ink transition p-1 rounded hover:bg-line/20"
                                  title="Rename toolkit"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted pt-1">
                              <span>{new Date(stack.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              <span className="w-1 h-1 rounded-full bg-line-strong" />
                              <span className="font-medium text-ink-2">{stack.tools.length} tool{stack.tools.length === 1 ? '' : 's'}</span>
                              {stack.goal && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-line-strong" />
                                  <span className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent-ink">{stack.goal}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Toolkit controls */}
                          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                            {/* Privacy Pill Toggle */}
                            <button
                              type="button"
                              onClick={() => handleTogglePrivacy(stack.id, stack.is_private)}
                              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
                                stack.is_private
                                  ? 'border-amber-500/20 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                              }`}
                              title="Click to toggle visibility"
                            >
                              {stack.is_private ? (
                                <>
                                  <Lock className="h-3 w-3" />
                                  Private
                                </>
                              ) : (
                                <>
                                  <Globe className="h-3 w-3" />
                                  Public
                                </>
                              )}
                            </button>

                            {/* Share Copy Button with tooltip */}
                            <div className="group relative">
                              <button
                                disabled={stack.is_private}
                                onClick={() => handleShareStack(stack.id, stack.is_private)}
                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-bg-elev text-ink transition hover:border-accent hover:bg-accent-soft/20 hover:text-accent-ink disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bg-elev disabled:hover:text-ink disabled:hover:border-line"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                              {stack.is_private && (
                                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/90 px-2.5 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 shadow-md">
                                  Make toolkit public to share link
                                </span>
                              )}
                            </div>

                            {/* Expand/Collapse Tool list */}
                            <button
                              type="button"
                              onClick={() => toggleStackExpanded(stack.id)}
                              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-bg-elev text-ink transition hover:border-accent hover:bg-accent-soft/20 hover:text-accent-ink"
                              title={expandedStackIds.includes(stack.id) ? "Hide tools" : "Show tools"}
                            >
                              {expandedStackIds.includes(stack.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>

                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteStack(stack.id)}
                              disabled={isDeletingThisStack}
                              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-bg-elev text-muted transition hover:border-danger hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                              title="Delete toolkit"
                            >
                              {isDeletingThisStack ? (
                                <Loader2 className="h-4 w-4 animate-spin text-danger" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Tool List */}
                        {expandedStackIds.includes(stack.id) && (
                          <div className="mt-2 border-t border-line/45 pt-4 space-y-2 animate-fade-in">
                            <h5 className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Tools in Toolkit</h5>
                            {stack.tools.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-line bg-bg-sunk/30 p-4 text-center text-xs text-muted">
                                This toolkit has no tools yet.
                              </div>
                            ) : (
                              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                                {stack.tools.map((slug) => {
                                  const resolvedTool = allTools.find(
                                    (t) => String(t.slug || '').toLowerCase() === String(slug).toLowerCase()
                                  )

                                  if (!resolvedTool) {
                                    return (
                                      <div
                                        key={slug}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-sunk/20 p-2 text-xs text-muted"
                                      >
                                        <span className="truncate">{slug} (Unknown Tool)</span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveToolFromStack(stack.id, slug)}
                                          className="text-muted hover:text-danger p-1 transition"
                                          title="Remove from toolkit"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    )
                                  }

                                  return (
                                    <div
                                      key={resolvedTool.slug}
                                      className="group/tool flex items-center justify-between gap-3 rounded-xl border border-line bg-bg-sunk/20 p-2.5 transition hover:border-accent/30 hover:bg-bg-sunk/40"
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="shrink-0">
                                          <ToolLogo tool={resolvedTool} size={32} />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <button
                                              type="button"
                                              onClick={() => navigate(`/tools/${resolvedTool.slug}`)}
                                              className="text-xs font-bold text-ink hover:text-accent hover:underline text-left truncate"
                                            >
                                              {resolvedTool.name}
                                            </button>
                                            <span className="inline-block rounded bg-accent-soft px-1.5 py-0.5 text-[9px] font-bold text-accent">
                                              {resolvedTool.category}
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-muted truncate max-w-[200px] sm:max-w-md">
                                            {resolvedTool.shortDescription || resolvedTool.description}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveToolFromStack(stack.id, resolvedTool.slug)}
                                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger transition"
                                          title="Remove from toolkit"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ink">AI Workflow Analytics</h3>
                  <p className="text-sm text-muted">Audit your AI tool stack, analyze your persona, and discover gaps.</p>
                </div>
              </div>
              {analyticsData && (
                <button
                  type="button"
                  onClick={handleFetchWorkflowAnalytics}
                  disabled={loadingAnalytics}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-bg-sunk hover:bg-line transition text-ink disabled:opacity-50"
                  title="Re-analyze workflow"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAnalytics ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            {loadingAnalytics ? (
              <div className="mt-8 flex flex-col items-center justify-center py-10 space-y-4 animate-pulse">
                <div className="relative flex items-center justify-center h-16 w-16">
                  <div className="absolute inset-0 rounded-full border-4 border-accent/20 animate-ping"></div>
                  <div className="h-12 w-12 rounded-full border-4 border-t-accent border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                  <Sparkles className="absolute h-5 w-5 text-accent animate-pulse" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-ink">Auditing your workspace...</p>
                  <p className="text-xs text-muted mt-1">Gemini is mapping your toolkit strengths and identifying gaps.</p>
                </div>
              </div>
            ) : analyticsError ? (
              analyticsError.includes('No tools found') ? (
                <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-bg-sunk/40 p-6 text-center animate-fade-in">
                  <Sparkles className="mx-auto h-8 w-8 text-accent/60 mb-3" />
                  <h4 className="text-sm font-bold text-ink">Unlock your AI Persona</h4>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                    {analyticsError}
                  </p>
                  <Button
                    variant="primary"
                    size="md"
                    className="mt-4"
                    onClick={() => navigate('/tools')}
                  >
                    Explore &amp; Favorite Tools
                  </Button>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-danger/25 bg-danger-soft/10 p-5 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-danger shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-ink">Analysis Failed</h4>
                      <p className="mt-1 text-xs text-muted">{analyticsError}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-3 !border-danger !text-danger hover:!bg-danger-soft"
                        onClick={handleFetchWorkflowAnalytics}
                      >
                        Try Again
                      </Button>
                    </div>
                  </div>
                </div>
              )
            ) : !analyticsData ? (
              <div className="mt-6 rounded-2xl border border-dashed border-line-strong bg-bg-sunk/40 p-6 text-center animate-fade-in">
                <Sparkles className="mx-auto h-8 w-8 text-accent/60 mb-3" />
                <h4 className="text-sm font-bold text-ink">Unlock your AI Persona</h4>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
                  Get a Gemini-powered audit showing your dominant workspace category, workflow gap analysis, and tailored balance suggestions.
                </p>
                <Button
                  variant="primary"
                  size="md"
                  className="mt-4"
                  onClick={handleFetchWorkflowAnalytics}
                >
                  Analyze My Workflow
                </Button>
              </div>
            ) : (
              <div className="mt-6 space-y-6 animate-fade-in">
                {/* Persona Badge Header */}
                <div className="rounded-2xl border border-accent/20 bg-accent-soft/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                      AI Persona
                    </span>
                    <h4 className="text-lg font-bold text-ink mt-1.5">{analyticsData.persona}</h4>
                    <p className="text-xs text-muted mt-0.5">{analyticsData.persona_description}</p>
                  </div>
                  <div className="shrink-0 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft/20 text-accent border border-accent/10">
                    <Sparkles className="h-7 w-7" />
                  </div>
                </div>

                {/* Audit & Distribution Grid */}
                <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
                  {/* Insights Card */}
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-line bg-bg-sunk/30 p-6">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted mb-2.5">Workflow Audit</h4>
                      <p className="text-sm font-medium text-ink-2 leading-relaxed">{analyticsData.workflow_insights}</p>
                    </div>
                  </div>

                  {/* Category Distribution bars */}
                  <div className="rounded-2xl border border-line bg-bg-sunk/30 p-6">
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

                {/* Gap Recommendations */}
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
                            className="group flex flex-col justify-between rounded-2xl border border-line bg-bg-sunk/25 p-4 transition duration-200 hover:border-accent/40 hover:bg-bg-sunk/40"
                          >
                            <div className="flex items-start gap-3">
                              {resolvedTool ? (
                                <div className="shrink-0 mt-0.5">
                                  <ToolLogo tool={resolvedTool} size={36} />
                                </div>
                              ) : (
                                <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent text-xs font-bold font-sans">
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
          </section>

          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Security &amp; Connected Accounts</h3>
                <p className="text-sm text-muted">Manage your connected social login providers, active sessions, and password security.</p>
              </div>
            </div>

            <div className="mt-6 space-y-6">
              {/* Connected Accounts Badges */}
              <div>
                <h4 className="text-sm font-bold text-ink-2 mb-3">Login Providers</h4>
                <p className="text-xs text-muted mb-4">Click to link a provider or unlink an existing one. Unlinking is only allowed if you have a password or other connected methods.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {/* Google */}
                  {securityData?.linked_accounts?.some(a => a.provider === 'google') ? (
                    <div className="flex items-center justify-between p-3 rounded-2xl border border-line bg-bg-sunk/30 animate-fade-in">
                      <span className="text-xs font-semibold text-ink">Google</span>
                      <button
                        type="button"
                        onClick={() => handleUnlinkProvider('Google')}
                        disabled={unlinkingProvider !== null}
                        className="text-xs font-bold text-danger hover:underline disabled:opacity-50"
                      >
                        {unlinkingProvider === 'google' ? 'Unlinking...' : 'Unlink'}
                      </button>
                    </div>
                  ) : (
                    <a
                      href="/auth/google"
                      className="flex items-center justify-center p-3 rounded-2xl border border-dashed border-line-strong hover:border-accent hover:bg-accent-soft/10 text-xs font-semibold text-muted hover:text-accent transition animate-fade-in"
                    >
                      Connect Google
                    </a>
                  )}

                  {/* GitHub */}
                  {securityData?.linked_accounts?.some(a => a.provider === 'github') ? (
                    <div className="flex items-center justify-between p-3 rounded-2xl border border-line bg-bg-sunk/30 animate-fade-in">
                      <span className="text-xs font-semibold text-ink">GitHub</span>
                      <button
                        type="button"
                        onClick={() => handleUnlinkProvider('GitHub')}
                        disabled={unlinkingProvider !== null}
                        className="text-xs font-bold text-danger hover:underline disabled:opacity-50"
                      >
                        {unlinkingProvider === 'github' ? 'Unlinking...' : 'Unlink'}
                      </button>
                    </div>
                  ) : (
                    <a
                      href="/auth/github"
                      className="flex items-center justify-center p-3 rounded-2xl border border-dashed border-line-strong hover:border-accent hover:bg-accent-soft/10 text-xs font-semibold text-muted hover:text-accent transition animate-fade-in"
                    >
                      Connect GitHub
                    </a>
                  )}

                  {/* LinkedIn */}
                  {securityData?.linked_accounts?.some(a => a.provider === 'linkedin') ? (
                    <div className="flex items-center justify-between p-3 rounded-2xl border border-line bg-bg-sunk/30 animate-fade-in">
                      <span className="text-xs font-semibold text-ink">LinkedIn</span>
                      <button
                        type="button"
                        onClick={() => handleUnlinkProvider('LinkedIn')}
                        disabled={unlinkingProvider !== null}
                        className="text-xs font-bold text-danger hover:underline disabled:opacity-50"
                      >
                        {unlinkingProvider === 'linkedin' ? 'Unlinking...' : 'Unlink'}
                      </button>
                    </div>
                  ) : (
                    <a
                      href="/auth/linkedin"
                      className="flex items-center justify-center p-3 rounded-2xl border border-dashed border-line-strong hover:border-accent hover:bg-accent-soft/10 text-xs font-semibold text-muted hover:text-accent transition animate-fade-in"
                    >
                      Connect LinkedIn
                    </a>
                  )}
                </div>
              </div>

              {/* Password Management */}
              <div className="border-t border-line/40 pt-4">
                <h4 className="text-sm font-bold text-ink-2 mb-2">Password Security</h4>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-muted">
                    {securityData?.has_password 
                      ? 'Secure your account with a custom password.' 
                      : 'You currently log in using social providers. Set a password to enable email/password sign-in.'}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowPasswordForm(!showPasswordForm)
                      setPasswordFormError('')
                    }}
                  >
                    {showPasswordForm ? 'Cancel' : (securityData?.has_password ? 'Change Password' : 'Set Password')}
                  </Button>
                </div>

                {showPasswordForm && (
                  <form onSubmit={handleChangePassword} className="mt-4 space-y-4 rounded-2xl bg-bg-sunk/30 p-4 border border-line animate-fade-in">
                    {securityData?.has_password && (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-ink-2">Current Password</span>
                        <input
                          type="password"
                          required
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-ink-2">New Password</span>
                        <input
                          type="password"
                          required
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-ink-2">Confirm New Password</span>
                        <input
                          type="password"
                          required
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                        />
                      </label>
                    </div>

                    {passwordFormError && (
                      <p className="text-xs text-danger font-medium">{passwordFormError}</p>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={isChangingPassword}
                      >
                        {isChangingPassword ? 'Saving...' : (securityData?.has_password ? 'Update Password' : 'Set Password')}
                      </Button>
                    </div>
                  </form>
                )}
              </div>

              {/* Active Sessions */}
              <div className="border-t border-line/40 pt-4">
                <h4 className="text-sm font-bold text-ink-2 mb-2">Active Sessions</h4>
                <p className="text-xs text-muted mb-4">Review all devices that are currently logged in to your account. You can revoke any session to force log out that device.</p>
                
                {loadingSecurity ? (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                    Loading active sessions...
                  </div>
                ) : !securityData?.sessions || securityData.sessions.length === 0 ? (
                  <div className="text-xs text-muted py-2">No active sessions found.</div>
                ) : (
                  <div className="space-y-3">
                    {securityData.sessions.map((sess) => (
                      <div
                        key={sess.session_uuid}
                        className="flex items-center justify-between gap-4 p-3 rounded-2xl border border-line bg-bg-sunk/30 animate-fade-in"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-ink truncate max-w-[150px] sm:max-w-xs">{sess.user_agent}</span>
                            {sess.is_current && (
                              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-500 border border-emerald-500/20">
                                Current Device
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted mt-1">
                            <span>IP: {sess.ip_address}</span>
                            <span className="w-1 h-1 rounded-full bg-line-strong" />
                            <span>Location: {sess.location}</span>
                            <span className="w-1 h-1 rounded-full bg-line-strong" />
                            <span>Last Active: {new Date(sess.last_active_at).toLocaleString()}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRevokeSession(sess.session_uuid)}
                          disabled={revokingSessionUuid !== null}
                          className="text-xs font-bold text-danger hover:underline shrink-0 disabled:opacity-50"
                        >
                          {revokingSessionUuid === sess.session_uuid ? 'Revoking...' : (sess.is_current ? 'Log out' : 'Revoke')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ink font-sans">Recent Activity Log</h3>
                  <p className="text-sm text-muted">Manage your search history and recently viewed tools.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {recentlyViewedSlugs.length > 0 && !isHistoryCollapsed && (
                  <button
                    type="button"
                    onClick={handleClearRecentlyViewed}
                    className="text-xs font-semibold text-muted hover:text-danger hover:underline transition"
                  >
                    Clear All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-bg-sunk hover:bg-line transition text-ink"
                  aria-label={isHistoryCollapsed ? "Expand history" : "Collapse history"}
                >
                  {isHistoryCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {!isHistoryCollapsed && (
              <div className="mt-6 space-y-4 animate-fade-in">
                {/* Filter Bar */}
                {recentlyViewedTools.length > 0 && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-2" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search history..."
                        className="w-full rounded-2xl border border-line bg-bg-sunk/40 pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    {historyCategories.length > 0 && (
                      <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="rounded-2xl border border-line bg-bg-sunk/40 px-4 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                      >
                        <option value="all">All Categories</option>
                        {historyCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* List Container */}
                {loadingTools ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    Loading activity history...
                  </div>
                ) : recentlyViewedSlugs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk p-6 text-center text-sm text-muted">
                    <p>Your browsing history is currently empty.</p>
                  </div>
                ) : filteredTools.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk p-6 text-center text-sm text-muted">
                    <p>No tools matched your search filters.</p>
                  </div>
                ) : (
                  <div className="max-h-[380px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                    {filteredTools.map((tool) => (
                      <div
                        key={tool.slug}
                        className="group flex items-center justify-between gap-4 rounded-2xl border border-line bg-bg-sunk/35 p-3.5 transition duration-200 hover:border-accent/40 hover:bg-bg-elev"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="shrink-0">
                            <ToolLogo tool={tool} size={40} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => navigate(`/tools/${tool.slug}`)}
                                className="text-sm font-semibold text-ink hover:text-accent hover:underline text-left truncate"
                              >
                                {tool.name}
                              </button>
                              <span className="inline-block rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">
                                {tool.category}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted truncate max-w-[200px] sm:max-w-md md:max-w-lg">
                              {tool.shortDescription || tool.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => navigate(`/tools/${tool.slug}`)}
                            className="hidden sm:inline-flex items-center rounded-xl bg-bg-sunk px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line transition"
                          >
                            View Details
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveHistoryItem(tool.slug)}
                            className="flex h-8.5 w-8.5 items-center justify-center rounded-xl text-muted hover:bg-danger-soft hover:text-danger transition"
                            title="Remove from history"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Public Developer Portfolio Section (Phase 9) */}
          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ink">Public Developer Portfolio</h3>
                  <p className="text-sm text-muted">Share your profile, curated stacks, and favorite tools with others.</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-2">
                  {publicSettings.is_profile_public ? 'Public' : 'Private'}
                </span>
                <span
                  onClick={() => setPublicSettings(prev => ({ ...prev, is_profile_public: !prev.is_profile_public }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out ${
                    publicSettings.is_profile_public ? 'bg-accent' : 'bg-line-strong'
                  }`}
                  role="checkbox"
                  aria-checked={publicSettings.is_profile_public}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-bg-elev shadow ring-0 transition duration-200 ease-in-out ${
                      publicSettings.is_profile_public ? 'translate-x-5' : 'translate-x-0.5'
                    } top-0.5 relative`}
                  />
                </span>
              </div>
            </div>

            {loadingPublicSettings ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Loading public portfolio settings...
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block mb-1.5 text-sm font-semibold text-ink-2">
                      Portfolio Slug (ai-compass.in/u/...)
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-3.5 text-sm font-medium text-muted-2">/u/</span>
                      <input
                        type="text"
                        value={publicSettings.public_username}
                        onChange={(e) => setPublicSettings(prev => ({ ...prev, public_username: e.target.value }))}
                        placeholder="your-username"
                        className="w-full rounded-2xl border border-line bg-bg-sunk/40 pl-10 pr-4 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1.5 text-sm font-semibold text-ink-2">
                      Bio (Max 500 characters)
                    </label>
                    <textarea
                      value={publicSettings.bio || ''}
                      onChange={(e) => setPublicSettings(prev => ({ ...prev, bio: e.target.value }))}
                      placeholder="Tell the community about yourself, your goals, or what stacks you build..."
                      rows={2}
                      maxLength={500}
                      className="w-full rounded-2xl border border-line bg-bg-sunk/40 px-4 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
                    />
                    <div className="text-right text-[10px] text-muted-2 mt-1">
                      {(publicSettings.bio || '').length}/500
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block mb-1.5 text-sm font-semibold text-ink-2">GitHub Username</label>
                    <input
                      type="text"
                      value={publicSettings.github_username || ''}
                      onChange={(e) => setPublicSettings(prev => ({ ...prev, github_username: e.target.value }))}
                      placeholder="github-profile"
                      className="w-full rounded-2xl border border-line bg-bg-sunk/40 px-4 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                  <div>
                    <label className="block mb-1.5 text-sm font-semibold text-ink-2">LinkedIn Username</label>
                    <input
                      type="text"
                      value={publicSettings.linkedin_username || ''}
                      onChange={(e) => setPublicSettings(prev => ({ ...prev, linkedin_username: e.target.value }))}
                      placeholder="linkedin-profile"
                      className="w-full rounded-2xl border border-line bg-bg-sunk/40 px-4 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                  <div>
                    <label className="block mb-1.5 text-sm font-semibold text-ink-2">Twitter/X Username</label>
                    <input
                      type="text"
                      value={publicSettings.twitter_username || ''}
                      onChange={(e) => setPublicSettings(prev => ({ ...prev, twitter_username: e.target.value }))}
                      placeholder="twitter-profile"
                      className="w-full rounded-2xl border border-line bg-bg-sunk/40 px-4 py-2.5 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-line">
                  <div className="flex flex-wrap gap-2">
                    {publicSettings.is_profile_public && publicSettings.public_username && (
                      <>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => {
                            const url = `${window.location.origin}/u/${publicSettings.public_username}`
                            navigator.clipboard.writeText(url)
                            showToast('Portfolio URL copied to clipboard!')
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Link
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          onClick={() => window.open(`/u/${publicSettings.public_username}`, '_blank')}
                        >
                          <Globe className="mr-2 h-4 w-4" />
                          View Portfolio
                        </Button>
                      </>
                    )}
                  </div>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleSavePublicSettings}
                    disabled={savingPublicSettings}
                  >
                    {savingPublicSettings ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      'Save Settings'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Catalog Submissions History Log (Phase 10) */}
          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                  <Library className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-ink">Catalog Submission Logs</h3>
                  <p className="text-sm text-muted">Track the moderation status and feedback of your submitted AI tools.</p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate('/submit-tool')}
                className="shrink-0"
              >
                Submit New Tool
              </Button>
            </div>

            {loadingSubmissions ? (
              <div className="flex items-center gap-2 mt-6 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Loading submissions...
              </div>
            ) : submissions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk/35 p-6 text-center text-sm text-muted mt-6">
                <p>You haven't submitted any AI tools yet.</p>
                <button
                  onClick={() => navigate('/submit-tool')}
                  className="mt-2 text-accent font-semibold hover:underline"
                >
                  Submit your first tool to get started!
                </button>
              </div>
            ) : (
              <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-bg-sunk/30">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line bg-bg-sunk/50 text-ink-2 font-medium">
                        <th className="p-4">Tool Name</th>
                        <th className="p-4">Category</th>
                        <th className="p-4">Date Submitted</th>
                        <th className="p-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {submissions.map((sub) => {
                        let badgeColor = 'bg-line-strong text-ink-2'
                        if (sub.status === 'approved') badgeColor = 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        else if (sub.status === 'rejected') badgeColor = 'bg-danger-soft text-danger border border-danger/20'
                        else if (sub.status === 'pending') badgeColor = 'bg-amber-500/10 text-amber-500 border border-amber-500/20'

                        return (
                          <tr key={sub.id} className="hover:bg-bg-elev/40 transition">
                            <td className="p-4">
                              <div className="font-semibold text-ink">{sub.name}</div>
                              <div className="text-xs text-muted truncate max-w-[200px] sm:max-w-xs">
                                <a href={sub.website} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                                  {sub.website}
                                </a>
                              </div>
                            </td>
                            <td className="p-4 text-ink-2">{sub.category}</td>
                            <td className="p-4 text-muted">
                              {new Date(sub.submitted_at).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="p-4 text-right">
                              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${badgeColor}`}>
                                {sub.status || 'pending'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">My Data</h3>
                <p className="text-sm text-muted">Export or clear your personal activity from this account.</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="secondary" size="md" onClick={handleExportFavorites} disabled={favoritesDownloading}>
                {favoritesDownloading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </span>
                ) : (
                  'Export my favorites'
                )}
              </Button>

              <Button variant="secondary" size="md" onClick={handleClearRecentlyViewed}>
                Clear recently viewed
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-danger bg-danger-soft p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-danger">Danger Zone</h3>
                <p className="text-sm text-danger">Deleting your account permanently removes your profile and logs you out.</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-danger">
              This action is irreversible. Use the confirmation modal below to finish deletion.
            </p>

            <div className="mt-6">
              <Button
                variant="secondary"
                size="md"
                className="!border-danger !text-danger hover:!bg-danger-soft"
                onClick={() => {
                  setShowDeleteModal(true)
                  setDeleteStep(1)
                  setDeletePassword('')
                  setDeleteError('')
                }}
              >
                Delete account
              </Button>
            </div>
          </section>
        </div>
      </section>

      {showDeleteModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
          onClick={() => {
            if (!deletingAccount) {
              setShowDeleteModal(false)
              setDeleteStep(1)
              setDeletePassword('')
              setDeleteError('')
            }
          }}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-line bg-bg-elev p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-ink">Delete Account</h3>
                <p className="text-sm text-muted">
                  {deleteStep === 1
                    ? 'Enter your password to continue with account deletion.'
                    : 'Final confirmation before permanent account removal.'}
                </p>
              </div>
            </div>

            {deleteStep === 1 ? (
              <>
                <label className="mt-6 block">
                  <span className="mb-2 block text-sm font-medium text-ink-2">Password</span>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    placeholder="Your password"
                    style={{ fontSize: 16 }}
                    className="w-full rounded-2xl border border-line bg-bg-elev px-4 py-3 text-ink placeholder:text-muted-2 focus:border-danger focus:outline-none focus:ring-2 focus:ring-danger/30"
                  />
                </label>

                {deleteError ? <p className="mt-3 text-sm text-danger">{deleteError}</p> : null}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      setShowDeleteModal(false)
                      setDeleteStep(1)
                      setDeletePassword('')
                      setDeleteError('')
                    }}
                  >
                    Cancel
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      if (!deletePassword) {
                        setDeleteError('Enter your password')
                        return
                      }
                      setDeleteStep(2)
                      setDeleteError('')
                    }}
                  >
                    Continue
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-6 text-sm text-ink-2">
                  You will lose all your favorites, ratings, and reviews. This cannot be undone.
                </p>

                {deleteError ? <p className="mt-3 text-sm text-danger">{deleteError}</p> : null}

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      if (!deletingAccount) {
                        setShowDeleteModal(false)
                        setDeleteStep(1)
                        setDeletePassword('')
                        setDeleteError('')
                      }
                    }}
                    disabled={deletingAccount}
                  >
                    Cancel
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    className="!bg-danger !text-bg hover:!opacity-90"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount}
                  >
                    {deletingAccount ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deleting...
                      </span>
                    ) : (
                      'Yes, permanently delete my account'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[70] flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl ${toast.type === 'error' ? 'border-danger bg-danger-soft text-danger' : 'border-accent bg-accent-soft text-accent-ink'}`}
        >
          <CheckCircle2 className={`mt-0.5 h-5 w-5 ${toast.type === 'error' ? 'text-danger' : 'text-accent'}`} />
          <p className="text-sm font-medium">{toast.message}</p>
        </div>
      ) : null}
    </div>
  )
}

export default ProfilePage
