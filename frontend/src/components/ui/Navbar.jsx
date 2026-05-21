import { ChevronDown, LayoutDashboard, LogOut, Menu, Moon, Shield, Sparkles, Sun, UserCircle2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import Button from './Button'
import CompassMark from './CompassMark'
import SearchInput from './SearchInput'
import useClickOutside from '../../hooks/useClickOutside'

const STORAGE_KEY = 'ai-compass-theme'
const ADMIN_EMAILS = ['singhmedhansh07@gmail.com']

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return false
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY)

  if (storedTheme) {
    return storedTheme === 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  // /tools has its own page-level search; suppress the navbar one to avoid duplication
  const hideSearchOnRoute = location.pathname === '/tools'
  const [searchValue, setSearchValue] = useState('')
  const [isDark, setIsDark] = useState(getInitialTheme)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isGuidesMenuOpen, setIsGuidesMenuOpen] = useState(false)
  // Track the failed URL rather than a plain boolean so a new picture URL
  // (after re-login as a different user) implicitly resets the failure state —
  // no effect needed to compare prev/next prop values.
  const [failedAvatarUrl, setFailedAvatarUrl] = useState(null)
  const avatarFailed = failedAvatarUrl != null && failedAvatarUrl === user?.picture
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authRefreshKey, setAuthRefreshKey] = useState(0)
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      return null
    }
  })
  const [scrolled, setScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const menuRef = useClickOutside(() => setIsProfileMenuOpen(false))
  const guidesMenuRef = useClickOutside(() => setIsGuidesMenuOpen(false))
  const isAdmin = Boolean(user && (user.is_admin || ADMIN_EMAILS.includes(user.email)))
  const avatarLetter = useMemo(
    () => String(user?.name || user?.email || 'U').charAt(0).toUpperCase(),
    [user?.email, user?.name],
  )

  const syncThemeFromStorage = () => {
    if (typeof window === 'undefined') {
      return
    }

    const storedTheme = window.localStorage.getItem(STORAGE_KEY)
    setIsDark(storedTheme ? storedTheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches)
  }

  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    window.localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    const handleThemeChange = () => syncThemeFromStorage()

    window.addEventListener('storage', handleThemeChange)
    window.addEventListener('themeChanged', handleThemeChange)

    return () => {
      window.removeEventListener('storage', handleThemeChange)
      window.removeEventListener('themeChanged', handleThemeChange)
    }
  }, [])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    handleScroll() // initialize on mount in case page loads scrolled
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!isMobileMenuOpen) return
    const handleEsc = (e) => {
      if (e.key === 'Escape') setIsMobileMenuOpen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined
    // Threshold is relative to where the page was when the menu opened, so a
    // page that's already scrolled doesn't close the menu the instant it opens.
    const openedAtY = window.scrollY
    const handleScrollClose = () => {
      if (Math.abs(window.scrollY - openedAtY) > 40) setIsMobileMenuOpen(false)
    }
    window.addEventListener('scroll', handleScrollClose, { passive: true })
    return () => window.removeEventListener('scroll', handleScrollClose)
  }, [isMobileMenuOpen])

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
        setUser(storedUser)
        setIsAuthenticated(Boolean(storedUser))
        setAuthRefreshKey((value) => value + 1)
      } catch {
        setUser(null)
        setIsAuthenticated(false)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('userLoggedIn', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('userLoggedIn', handleStorageChange)
    }
  }, [])

  useEffect(() => {
    let active = true

    const verifyAuthState = async () => {
      let storedUser = null

      try {
        storedUser = JSON.parse(localStorage.getItem('user') || 'null')
      } catch {
        storedUser = null
      }

      if (!storedUser) {
        if (active) {
          setUser(null)
          setIsAuthenticated(false)
        }
        return
      }

      try {
        const response = await fetch('/api/v1/auth/me', { credentials: 'include' })

        if (!response.ok) {
          localStorage.removeItem('user')
          if (active) {
            setUser(null)
            setIsAuthenticated(false)
          }
          return
        }

        const fullUser = await response.json()
        const mergedUser = {
          ...storedUser,
          ...fullUser,
        }
        localStorage.setItem('user', JSON.stringify(mergedUser))

        if (active) {
          setUser(mergedUser)
          setIsAuthenticated(true)
        }
      } catch {
        if (active) {
          setUser(storedUser)
          setIsAuthenticated(Boolean(storedUser))
        }
      }
    }

    verifyAuthState()

    return () => {
      active = false
    }
  }, [authRefreshKey])

  const toggleDarkMode = () => {
    const nextMode = !isDark

    setIsDark(nextMode)
  }

  const handleSearchKeyDown = (event) => {
    if (event.key !== 'Enter') {
      return
    }

    const query = searchValue.trim()
    if (!query) {
      navigate('/tools')
      return
    }

    navigate(`/tools?q=${encodeURIComponent(query)}`)
  }

  const handleLogout = async () => {
    // Clear the server session + Flask-Login remember cookie so the user
    // stays logged out (otherwise the remember cookie would re-auth them).
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // best-effort — still clear client state below
    }
    localStorage.removeItem('user')
    setUser(null)
    setIsAuthenticated(false)
    window.dispatchEvent(new Event('userLoggedIn'))
    setIsProfileMenuOpen(false)
    navigate('/')
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-line bg-bg-elev/95 shadow-lg backdrop-blur-md'
          : 'border-b border-line bg-bg-elev'
      }`}
    >
      <div
        className={`mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 transition-all duration-200 sm:px-6 lg:px-8 ${
          scrolled ? 'py-2' : 'py-3'
        }`}
      >
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight text-ink transition-colors hover:text-accent-ink"
        >
          <CompassMark size={28} />
          AI Compass
        </Link>

        {hideSearchOnRoute ? null : (
          <div className="order-3 w-full sm:order-2 sm:flex-1">
            <SearchInput
              value={searchValue}
              onChange={setSearchValue}
              onClear={() => setSearchValue('')}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search or describe what you need..."
            />
          </div>
        )}

        <div className="order-2 ml-auto hidden items-center gap-2 sm:order-3 lg:flex">
          <Link to="/collections">
            <Button variant="ghost" size="sm" className="text-ink-2">
              Collections
            </Button>
          </Link>

          <div
            className="relative"
            ref={guidesMenuRef}
            onMouseEnter={() => setIsGuidesMenuOpen(true)}
            onMouseLeave={() => setIsGuidesMenuOpen(false)}
          >
            <Button variant="ghost" size="sm" className="text-ink-2">
              Guides
              <ChevronDown className="h-4 w-4 ml-1 transition-transform" style={{ transform: isGuidesMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </Button>

            {isGuidesMenuOpen ? (
              <div
                role="menu"
                aria-label="Guides menu"
                className="absolute left-0 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-bg-elev shadow-lg"
              >
                <Link
                  to="/best-ai-tools-for-students"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                  role="menuitem"
                >
                  Best AI Tools for Students
                </Link>
                <Link
                  to="/best-free-ai-tools"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                  role="menuitem"
                >
                  Best Free AI Tools
                </Link>
                <Link
                  to="/best-coding-tools-for-students"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                  role="menuitem"
                >
                  Best Coding Tools for Students
                </Link>
                <Link
                  to="/best-jasper-alternatives"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                  role="menuitem"
                >
                  Best Jasper Alternatives
                </Link>
                <Link
                  to="/best-murf-alternatives"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                  role="menuitem"
                >
                  Best Murf Alternatives
                </Link>
                <Link
                  to="/best-synthesia-alternatives"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                  role="menuitem"
                >
                  Best Synthesia Alternatives
                </Link>
              </div>
            ) : null}
          </div>

          {isAdmin ? (
            <Link to="/admin" className="px-1 text-xs font-medium text-muted hover:text-ink-2">
              Admin
            </Link>
          ) : null}

          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-bg-elev text-ink-2 transition-colors hover:bg-bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {user && isAuthenticated ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((value) => !value)}
                className="flex items-center gap-2 rounded-full border border-line-strong bg-bg-elev px-1.5 py-1 text-left shadow-sm transition hover:border-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <div className="relative h-8 w-8 overflow-hidden rounded-full ring-2 ring-accent">
                  {user?.picture && user.picture.length > 10 && !avatarFailed ? (
                    <img
                      src={user.picture}
                      alt={user?.name || 'Profile'}
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      className="h-full w-full object-cover"
                      width="32"
                      height="32"
                      loading="lazy"
                      decoding="async"
                      onError={() => setFailedAvatarUrl(user.picture)}
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                      {avatarLetter}
                    </div>
                  )}
                </div>
                <ChevronDown className="h-4 w-4 text-muted" />
              </button>

              {isProfileMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Profile menu"
                  className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-bg-elev p-2 shadow-2xl"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-ink">{user?.name || 'My account'}</p>
                    <p className="truncate text-xs text-muted">{user?.email || ''}</p>
                  </div>

                  <div className="my-2 border-t border-line" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false)
                      navigate('/dashboard')
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                    role="menuitem"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    My Dashboard
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false)
                      navigate('/profile')
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                    role="menuitem"
                  >
                    <UserCircle2 className="h-4 w-4" />
                    Profile &amp; Settings
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false)
                      navigate('/ai-tool-finder')
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                    role="menuitem"
                  >
                    <Sparkles className="h-4 w-4" />
                    My AI Stack
                  </button>

                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false)
                        navigate('/admin')
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                      role="menuitem"
                    >
                      <Shield className="h-4 w-4" />
                      Admin Panel
                    </button>
                  ) : null}

                  <div className="my-2 border-t border-line" />

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-danger transition hover:bg-danger-soft"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="text-ink-2">
                  Login
                </Button>
              </Link>

              <Link to="/register">
                <Button variant="primary" size="sm">
                  Register
                </Button>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="order-2 ml-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-bg-elev text-ink-2 transition-colors hover:bg-bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:order-3 lg:hidden"
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu"
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div id="mobile-menu" className="border-t border-line bg-bg-elev lg:hidden">
        {isMobileMenuOpen && (
          <nav className="flex flex-col px-4 py-3">
            <Link
              to="/collections"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
            >
              Collections
            </Link>
            <Link
              to="/best-ai-tools-for-students"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
            >
              Best AI Tools for Students
            </Link>
            <Link
              to="/best-free-ai-tools"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
            >
              Best Free AI Tools
            </Link>
            <Link
              to="/best-coding-tools-for-students"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
            >
              Best Coding Tools for Students
            </Link>
            <Link
              to="/best-jasper-alternatives"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
            >
              Best Jasper Alternatives
            </Link>
            <Link
              to="/best-murf-alternatives"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
            >
              Best Murf Alternatives
            </Link>
            <Link
              to="/best-synthesia-alternatives"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
            >
              Best Synthesia Alternatives
            </Link>
            {isAdmin ? (
              <Link
                to="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-bg-sunk"
              >
                Admin
              </Link>
            ) : null}

            <div className="my-2 border-t border-line" />

            <button
              type="button"
              onClick={toggleDarkMode}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? 'Light mode' : 'Dark mode'}
            </button>

            <div className="my-2 border-t border-line" />

            {user && isAuthenticated ? (
              <>
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-ink">{user?.name || 'User'}</p>
                  <p className="truncate text-xs text-muted">{user?.email}</p>
                </div>
                <Link
                  to="/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  My Dashboard
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  <UserCircle2 className="h-4 w-4" />
                  Profile &amp; Settings
                </Link>
                <Link
                  to="/ai-tool-finder"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  <Sparkles className="h-4 w-4" />
                  My AI Stack
                </Link>
                {isAdmin ? (
                  <Link
                    to="/admin"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                  >
                    <Shield className="h-4 w-4" />
                    Admin Panel
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    handleLogout()
                    setIsMobileMenuOpen(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-bg-sunk"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        )}
      </div>
    </header>
  )
}

export default Navbar
