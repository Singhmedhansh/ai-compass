import { ArrowLeft, ChevronDown, LayoutDashboard, LogOut, Menu, Moon, Shield, Sparkles, Sun, UserCircle2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import Button from './Button'
import CompassMark from './CompassMark'
import SearchInput from './SearchInput'
import useClickOutside from '../../hooks/useClickOutside'
import { useCurrency } from '../../context/CurrencyContext'

const MotionDiv = motion.div

const STORAGE_KEY = 'ai-compass-theme'
const ADMIN_EMAILS = ['singhmedhansh07@gmail.com']
const dropdownTransition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] }

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return false
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY)

  if (storedTheme) {
    return storedTheme === 'dark'
  }

  return false
}

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedCurrency, setSelectedCurrency, currencies } = useCurrency()
  // /tools has its own page-level search; suppress the navbar one to avoid duplication
  const hideSearchOnRoute = location.pathname === '/tools'
  const [searchValue, setSearchValue] = useState('')
  const [isDark, setIsDark] = useState(getInitialTheme)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isGuidesMenuOpen, setIsGuidesMenuOpen] = useState(false)
  const [isStudentHubMenuOpen, setIsStudentHubMenuOpen] = useState(false)
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false)
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState(false)
  const [failedAvatarUrl, setFailedAvatarUrl] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authRefreshKey, setAuthRefreshKey] = useState(0)
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      return null
    }
  })
  const avatarFailed = failedAvatarUrl != null && failedAvatarUrl === user?.picture
  const [scrolled, setScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCurrencyMenuOpen, setIsCurrencyMenuOpen] = useState(false)
  const menuRef = useClickOutside(() => setIsProfileMenuOpen(false))
  const guidesMenuRef = useClickOutside(() => setIsGuidesMenuOpen(false))
  const studentHubMenuRef = useClickOutside(() => setIsStudentHubMenuOpen(false))
  const currencyMenuRef = useClickOutside(() => setIsCurrencyMenuOpen(false))
  const toolsMenuRef = useClickOutside(() => setIsToolsMenuOpen(false))
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
    setIsDark(storedTheme === 'dark')
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
          if (window.posthog) {
            window.posthog.reset();
          }
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
        if (window.posthog && mergedUser) {
          window.posthog.identify(mergedUser.id, {
            email: mergedUser.email,
            is_verified: mergedUser.is_verified
          });
        }

        if (active) {
          setUser(mergedUser)
          setIsAuthenticated(true)
        }
      } catch {
        if (active) {
          setUser(storedUser)
          setIsAuthenticated(Boolean(storedUser))
        }
        if (window.posthog && storedUser) {
          window.posthog.identify(storedUser.id, {
            email: storedUser.email,
            is_verified: storedUser.is_verified
          });
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
    if (window.posthog) {
      window.posthog.reset();
    }
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
          ? 'border-b border-line glass-nav shadow-lg backdrop-blur-md'
          : 'border-b border-line bg-bg-elev'
      }`}
    >
      <div
        className={`mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 transition-all duration-200 sm:px-6 lg:px-8 ${
          scrolled ? 'py-2' : 'py-3'
        }`}
      >
        {location.pathname !== '/' && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-bg-elev text-ink-2 shadow-sm transition-all duration-300 hover:border-accent hover:text-accent hover:scale-105 active:scale-95"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
          </button>
        )}

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

        <nav aria-label="Primary" className="order-2 ml-auto hidden items-center gap-2 sm:order-3 lg:flex">
          <div
            className="relative"
            ref={toolsMenuRef}
            onMouseEnter={() => setIsToolsMenuOpen(true)}
            onMouseLeave={() => setIsToolsMenuOpen(false)}
          >
            <Button variant="ghost" size="sm" className="text-ink-2">
              Tools
              <ChevronDown className="h-4 w-4 ml-1 transition-transform" style={{ transform: isToolsMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </Button>

            <AnimatePresence initial={false}>
              {isToolsMenuOpen && (
                <MotionDiv
                  key="tools-menu"
                  role="menu"
                  aria-label="Tools menu"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={dropdownTransition}
                  className="absolute left-0 mt-1 w-56 origin-top-left overflow-hidden rounded-xl border border-line bg-bg-elev shadow-lg z-50"
                >
                  <Link
                    to="/tools"
                    onClick={() => setIsToolsMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                    role="menuitem"
                  >
                    Catalog
                  </Link>
                  <Link
                    to="/collections"
                    onClick={() => setIsToolsMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                    role="menuitem"
                  >
                    Collections
                  </Link>
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>

          <Link to="/model-comparison">
            <Button variant="ghost" size="sm" className="text-ink-2">
              Model Comparison
            </Button>
          </Link>

          <div
            className="relative"
            ref={studentHubMenuRef}
            onMouseEnter={() => setIsStudentHubMenuOpen(true)}
            onMouseLeave={() => setIsStudentHubMenuOpen(false)}
          >
            <Button variant="ghost" size="sm" className="text-ink-2">
              Student Hub
              <ChevronDown className="h-4 w-4 ml-1 transition-transform" style={{ transform: isStudentHubMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </Button>

            <AnimatePresence initial={false}>
              {isStudentHubMenuOpen && (
                <MotionDiv
                  key="student-hub-menu"
                  role="menu"
                  aria-label="Student Hub menu"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={dropdownTransition}
                  className="absolute left-0 mt-1 w-56 origin-top-left overflow-hidden rounded-xl border border-line bg-bg-elev shadow-lg"
                >
                  <Link
                    to="/syllabus-parser"
                    onClick={() => setIsStudentHubMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                    role="menuitem"
                  >
                    Syllabus Parser
                  </Link>
                  <Link
                    to="/student-discounts"
                    onClick={() => setIsStudentHubMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                    role="menuitem"
                  >
                    Student Discounts
                  </Link>

                </MotionDiv>
              )}
            </AnimatePresence>
          </div>

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

            <AnimatePresence initial={false}>
              {isGuidesMenuOpen ? (
              <MotionDiv
                key="guides-menu"
                role="menu"
                aria-label="Guides menu"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={dropdownTransition}
                className="absolute left-0 mt-1 w-56 origin-top-left overflow-hidden rounded-xl border border-line bg-bg-elev shadow-lg"
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
                  to="/best-ai-tools-for-teachers"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
                  role="menuitem"
                >
                  Best AI Tools for Teachers
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
              </MotionDiv>
              ) : null}
            </AnimatePresence>
          </div>

          {isAdmin ? (
            <Link to="/admin" className="px-1 text-xs font-medium text-muted hover:text-ink-2">
              Admin
            </Link>
          ) : null}

          {/* Currency Dropdown (Desktop) */}
          <div className="relative" ref={currencyMenuRef}>
            <button
              type="button"
              onClick={() => setIsCurrencyMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 h-10 rounded-lg border border-line-strong bg-bg-elev px-3 text-xs font-semibold text-ink-2 transition-colors hover:bg-bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent select-none"
              aria-haspopup="listbox"
              aria-expanded={isCurrencyMenuOpen}
            >
              <span>{selectedCurrency} ({currencies.find(c => c.code === selectedCurrency)?.symbol})</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted transition-transform duration-200" style={{ transform: isCurrencyMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>

            <AnimatePresence initial={false}>
              {isCurrencyMenuOpen && (
                <MotionDiv
                  key="currency-menu"
                  role="listbox"
                  aria-label="Currency selection"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={dropdownTransition}
                  className="absolute right-0 mt-2 w-40 origin-top-right overflow-hidden rounded-xl border border-line bg-bg-elev p-1 shadow-lg z-50"
                >
                  {currencies.map((curr) => (
                    <button
                      key={curr.code}
                      type="button"
                      onClick={() => {
                        setSelectedCurrency(curr.code)
                        setIsCurrencyMenuOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                        selectedCurrency === curr.code
                          ? 'bg-accent-soft text-accent-ink'
                          : 'text-ink-2 hover:bg-bg-sunk hover:text-ink'
                      }`}
                      role="option"
                      aria-selected={selectedCurrency === curr.code}
                    >
                      <span>{curr.name}</span>
                      <span className="font-semibold text-muted">{curr.symbol}</span>
                    </button>
                  ))}
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>

          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-bg-elev text-ink-2 transition-colors hover:bg-bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isDark ? 'sun' : 'moon'}
                initial={{ opacity: 0, scale: 0.7, rotate: -30 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.7, rotate: 30 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center justify-center"
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
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

              <AnimatePresence initial={false}>
                {isProfileMenuOpen ? (
                <MotionDiv
                  key="profile-menu"
                  role="menu"
                  aria-label="Profile menu"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={dropdownTransition}
                  className="absolute right-0 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-line bg-bg-elev p-2 shadow-2xl"
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
                    AI Stack Architect
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
                </MotionDiv>
                ) : null}
              </AnimatePresence>
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
        </nav>

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
        <AnimatePresence initial={false} mode="wait">
          {isMobileMenuOpen && (
            <MotionDiv
              key="mobile-menu"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <nav aria-label="Mobile" className="flex flex-col px-4 py-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsMobileToolsOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk text-left"
                  >
                    <span>Tools</span>
                    <ChevronDown className="h-4 w-4 transition-transform duration-200" style={{ transform: isMobileToolsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                  {isMobileToolsOpen && (
                    <div className="pl-4 space-y-1 mt-0.5">
                      <Link
                        to="/tools"
                        onClick={() => {
                          setIsMobileMenuOpen(false)
                          setIsMobileToolsOpen(false)
                        }}
                        className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                      >
                        Catalog
                      </Link>
                      <Link
                        to="/collections"
                        onClick={() => {
                          setIsMobileMenuOpen(false)
                          setIsMobileToolsOpen(false)
                        }}
                        className="block rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                      >
                        Collections
                      </Link>
                    </div>
                  )}
                </div>

                <Link
                  to="/model-comparison"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  Model Comparison
                </Link>
                <Link
                  to="/syllabus-parser"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  Syllabus Parser
                </Link>
                <Link
                  to="/student-discounts"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  Student Discounts
                </Link>

                <Link
                  to="/best-ai-tools-for-students"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  Best AI Tools for Students
                </Link>
                <Link
                  to="/best-ai-tools-for-teachers"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-bg-sunk"
                >
                  Best AI Tools for Teachers
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

                {/* Currency Selector (Mobile) */}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm font-medium text-ink-2">Currency</span>
                  <select
                    value={selectedCurrency}
                    onChange={(e) => {
                      setSelectedCurrency(e.target.value)
                      setIsMobileMenuOpen(false)
                    }}
                    className="rounded-xl border border-line bg-bg-sunk px-3 py-2 text-xs font-semibold text-ink-2 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer"
                  >
                    {currencies.map((curr) => (
                      <option key={curr.code} value={curr.code}>
                        {curr.code} ({curr.symbol})
                      </option>
                    ))}
                  </select>
                </div>

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
                      AI Stack Architect
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
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}

export default Navbar
