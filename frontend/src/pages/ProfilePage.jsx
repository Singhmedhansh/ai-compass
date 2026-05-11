import { Bell, CheckCircle2, Download, Loader2, ShieldAlert, Trash2, UserRound } from 'lucide-react'
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
          <div className={`mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full ${profile?.picture && profile.picture.length > 10 ? 'bg-bg-sunk' : 'bg-accent'}`}>
            {profile?.picture && profile.picture.length > 10 ? (
              <img
                src={profile.picture}
                alt={profile?.name || 'Profile avatar'}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-3xl font-bold text-bg">{avatarLetter}</span>
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
              <h2 className="text-2xl font-bold tracking-tight text-ink">{profile?.name || 'Your profile'}</h2>
            )}

            <p className="mt-2 break-all text-sm text-muted">{profile?.email || ''}</p>
            <p className="mt-2 text-sm text-muted">Member since {profile?.member_since || 'New member'}</p>
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
