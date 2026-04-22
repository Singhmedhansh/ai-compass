import { ChevronDown, LayoutDashboard, LogOut, Moon, Shield, Sparkles, Sun, UserCircle2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import Button from './Button'
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
  const [searchValue, setSearchValue] = useState('')
  const [isDark, setIsDark] = useState(getInitialTheme)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isGuidesMenuOpen, setIsGuidesMenuOpen] = useState(false)
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
    document.documentElement.classList.toggle('dark', isDark)
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
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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

  const handleLogout = () => {
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
          ? 'border-b border-gray-100 bg-white/95 shadow-lg shadow-black/5 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/95 dark:shadow-black/20'
          : 'border-b border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-950'
      }`}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="shrink-0 text-lg font-bold tracking-tight text-gray-900 transition-colors hover:text-indigo-700 dark:text-white dark:hover:text-indigo-300"
        >
          AI Compass
        </Link>

        <div className="order-3 w-full sm:order-2 sm:flex-1">
          <SearchInput
            value={searchValue}
            onChange={setSearchValue}
            onClear={() => setSearchValue('')}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search tools, categories, and tags"
          />
        </div>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          <Link to="/collections">
            <Button variant="ghost" size="sm" className="text-gray-700 dark:text-gray-300">
              Collections
            </Button>
          </Link>

          <div
            className="relative"
            ref={guidesMenuRef}
            onMouseEnter={() => setIsGuidesMenuOpen(true)}
            onMouseLeave={() => setIsGuidesMenuOpen(false)}
          >
            <Button variant="ghost" size="sm" className="text-gray-700 dark:text-gray-300">
              Guides
              <ChevronDown className="h-4 w-4 ml-1 transition-transform" style={{ transform: isGuidesMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </Button>

            {isGuidesMenuOpen ? (
              <div
                role="menu"
                aria-label="Guides menu"
                className="absolute left-0 mt-1 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg shadow-black/10 dark:border-gray-700 dark:bg-gray-800"
              >
                <Link
                  to="/best-ai-tools-for-students"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  role="menuitem"
                >
                  Best AI Tools for Students
                </Link>
                <Link
                  to="/best-free-ai-tools"
                  onClick={() => setIsGuidesMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  role="menuitem"
                >
                  Best Free AI Tools
                </Link>
              </div>
            ) : null}
          </div>

          {isAdmin ? (
            <Link to="/admin" className="px-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
              Admin
            </Link>
          ) : null}

          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {user && isAuthenticated ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((value) => !value)}
                className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-1.5 py-1 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <div className="relative h-8 w-8 overflow-hidden rounded-full ring-2 ring-indigo-500">
                  {user?.picture && user.picture.length > 10 ? (
                    <img
                      src={user.picture}
                      alt={user?.name || 'Profile'}
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                        const fallback = event.currentTarget.parentNode?.querySelector('.avatar-fallback')
                        if (fallback) {
                          fallback.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div
                    id="nav-avatar-fallback"
                    style={{ display: user?.picture && user.picture.length > 10 ? 'none' : 'flex' }}
                    className="avatar-fallback h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white"
                  >
                    {avatarLetter}
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </button>

              {isProfileMenuOpen ? (
                <div
                  role="menu"
                  aria-label="Profile menu"
                  className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl shadow-black/10 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{user?.name || 'My account'}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user?.email || ''}</p>
                  </div>

                  <div className="my-2 border-t border-gray-100 dark:border-gray-800" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false)
                      navigate('/dashboard')
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
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
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
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
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
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
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
                      role="menuitem"
                    >
                      <Shield className="h-4 w-4" />
                      Admin Panel
                    </button>
                  ) : null}

                  <div className="my-2 border-t border-gray-100 dark:border-gray-800" />

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
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
                <Button variant="ghost" size="sm" className="text-gray-700 dark:text-gray-300">
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
      </div>
    </header>
  )
}

export default Navbar
