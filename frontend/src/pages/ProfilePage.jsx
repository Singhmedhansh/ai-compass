import { Bell, Check, CheckCircle2, Download, GraduationCap, Loader2, ShieldAlert, Sparkles, Trash2, UserRound, Copy, Globe, Lock, Edit2, X, Library } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '../components/ui'

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
  { id: 'Audio & Voice', label: 'Audio & Voice' }
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
    showToast('Recently viewed items cleared.')
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
                        className="group relative flex flex-col gap-4 rounded-2xl border border-line bg-bg-sunk/50 p-4 transition hover:border-accent hover:bg-bg-elev md:flex-row md:items-center md:justify-between animate-fade-in"
                      >
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
                    )
                  })}
                </div>
              )}
            </div>
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
