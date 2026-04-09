import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CheckCircle2, Download, Loader2, ShieldAlert, Trash2, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PageTransition from '../components/PageTransition'
import { Button } from '../components/ui'

const MotionDiv = motion.div

const THEME_STORAGE_KEY = 'ai-compass-theme'
const NOTIFICATIONS_STORAGE_KEY = 'ai-compass-email-notifications'
const STUDENT_MODE_STORAGE_KEY = 'ai-compass-student-mode'

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

function avatarBackground(name = '') {
  const variants = [
    'bg-gradient-to-br from-indigo-500 to-cyan-500',
    'bg-gradient-to-br from-emerald-500 to-teal-600',
    'bg-gradient-to-br from-amber-500 to-orange-600',
    'bg-gradient-to-br from-rose-500 to-pink-600',
    'bg-gradient-to-br from-sky-500 to-indigo-600',
  ]

  const index = Math.abs(name.split('').reduce((total, character) => total + character.charCodeAt(0), 0)) % variants.length
  return variants[index]
}

function ToggleSwitch({ checked, onChange, label, description }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-indigo-500 dark:hover:bg-slate-900"
      aria-pressed={checked}
    >
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>

      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  )
}

function ProfilePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [favoritesDownloading, setFavoritesDownloading] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [preferences, setPreferences] = useState(() => ({
    theme: getStoredTheme(),
    emailNotifications: readStoredBoolean(NOTIFICATIONS_STORAGE_KEY, true),
    studentMode: readStoredBoolean(STUDENT_MODE_STORAGE_KEY, false),
  }))

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
    document.documentElement.classList.toggle('dark', preferences.theme === 'dark')
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
    localStorage.setItem(STUDENT_MODE_STORAGE_KEY, String(preferences.studentMode))
  }, [preferences.studentMode])

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

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      showToast('Type DELETE to confirm.', 'error')
      return
    }

    setDeletingAccount(true)

    try {
      const response = await fetch('/api/v1/profile', { method: 'DELETE' })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Unable to delete your account.')
      }

      localStorage.removeItem('user')
      window.dispatchEvent(new Event('userLoggedIn'))
      navigate('/', { replace: true })
    } catch (error) {
      showToast(error.message || 'Unable to delete your account.', 'error')
      setDeletingAccount(false)
    }
  }

  if (loading) {
    return (
      <PageTransition>
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
            Loading your profile...
          </div>
        </main>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 p-6 shadow-sm dark:border-indigo-500/20 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Profile &amp; Settings</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Manage your AI Compass account</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Update your display name, keep your preferences in sync, and manage your personal data from one place.
          </p>
        </div>

        <section className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className={`mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full ${profile?.picture ? 'bg-slate-100 dark:bg-slate-800' : avatarBackground(profile?.name || profile?.email || '')}`}>
              {profile?.picture && profile.picture.length > 10 ? (
                <img
                  src={profile.picture}
                  alt={profile?.name || 'Profile avatar'}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-3xl font-bold text-white">{avatarLetter}</span>
              )}
            </div>

            <div className="mt-5 text-center">
              {isEditing ? (
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-center text-lg font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  placeholder="Display name"
                />
              ) : (
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{profile?.name || 'Your profile'}</h2>
              )}

              <p className="mt-2 break-all text-sm text-slate-500 dark:text-slate-400">{profile?.email || ''}</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Member since {profile?.member_since || 'New member'}</p>
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
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Account Settings</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Update your display name and review your account email.</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Display Name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    disabled={!isEditing}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
                    placeholder="Your display name"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Email</span>
                  <input
                    value={profile?.email || ''}
                    readOnly
                    disabled
                    className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
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

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Preferences</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Keep your appearance and notifications aligned with how you use AI Compass.</p>
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

                <ToggleSwitch
                  checked={preferences.studentMode}
                  onChange={(checked) => setPreferences((current) => ({ ...current, studentMode: checked }))}
                  label="Student mode"
                  description="Tailor recommendations for study workflows."
                />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">My Data</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Export or clear your personal activity from this account.</p>
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

                <Button
                  variant="secondary"
                  size="md"
                  className="border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  onClick={() => {
                    setDeleteConfirmation('')
                    setDeleteModalOpen(true)
                  }}
                >
                  Delete account
                </Button>
              </div>
            </section>

            <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-rose-900 dark:text-rose-100">Danger Zone</h3>
                  <p className="text-sm text-rose-700 dark:text-rose-200">Deleting your account permanently removes your profile and logs you out.</p>
                </div>
              </div>

              <p className="mt-4 text-sm text-rose-700 dark:text-rose-200">
                This action is irreversible. Use the confirmation modal below to finish deletion.
              </p>
            </section>
          </div>
        </section>

        <AnimatePresence>
          {deleteModalOpen ? (
            <MotionDiv
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm"
              onClick={() => {
                if (!deletingAccount) {
                  setDeleteModalOpen(false)
                  setDeleteConfirmation('')
                }
              }}
            >
              <MotionDiv
                initial={{ scale: 0.96, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">Delete Account</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Type DELETE to confirm permanent account removal.</p>
                  </div>
                </div>

                <label className="mt-6 block">
                  <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Confirmation</span>
                  <input
                    value={deleteConfirmation}
                    onChange={(event) => setDeleteConfirmation(event.target.value)}
                    placeholder="DELETE"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </label>

                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      if (!deletingAccount) {
                        setDeleteModalOpen(false)
                        setDeleteConfirmation('')
                      }
                    }}
                    disabled={deletingAccount}
                  >
                    Cancel
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 disabled:bg-rose-400"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || deleteConfirmation !== 'DELETE'}
                  >
                    {deletingAccount ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Deleting...
                      </span>
                    ) : (
                      'Delete Account'
                    )}
                  </Button>
                </div>
              </MotionDiv>
            </MotionDiv>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {toast ? (
            <MotionDiv
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className={`fixed bottom-6 right-6 z-[70] flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl ${toast.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100' : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100'}`}
            >
              <CheckCircle2 className={`mt-0.5 h-5 w-5 ${toast.type === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-300'}`} />
              <p className="text-sm font-medium">{toast.message}</p>
            </MotionDiv>
          ) : null}
        </AnimatePresence>
      </main>
    </PageTransition>
  )
}

export default ProfilePage