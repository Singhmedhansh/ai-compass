import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import Button from './Button'
import SearchInput from './SearchInput'

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
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      return null
    }
  })
  const [scrolled, setScrolled] = useState(false)
  const isAdmin = Boolean(user && ADMIN_EMAILS.includes(user.email))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    window.localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        setUser(JSON.parse(localStorage.getItem('user') || 'null'))
      } catch {
        setUser(null)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('userLoggedIn', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('userLoggedIn', handleStorageChange)
    }
  }, [])

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
    window.dispatchEvent(new Event('userLoggedIn'))
    navigate('/')
  }

  const avatarLetter = String(user?.name || user?.email || 'U').charAt(0).toUpperCase()

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-gray-950/95 backdrop-blur-md shadow-lg shadow-black/20 border-b border-white/5'
          : 'bg-transparent border-b border-transparent'
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
            <Button variant="ghost" size="sm" className="text-gray-900 dark:text-white">
              Collections
            </Button>
          </Link>

          {isAdmin ? (
            <Link to="/admin" className="px-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              Admin
            </Link>
          ) : null}

          <button
            type="button"
            onClick={toggleDarkMode}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {user ? (
            <>
              <div className="relative h-8 w-8">
                {user?.picture && user.picture.length > 10 ? (
                  <img
                    src={user.picture}
                    alt={user?.name || 'Profile'}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-indigo-500"
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
                  className="avatar-fallback h-8 w-8 rounded-full bg-indigo-600 items-center justify-center text-white text-sm font-bold"
                >
                  {avatarLetter}
                </div>
              </div>

              <Link to="/dashboard">
                <Button variant="ghost" size="sm" className="text-gray-900 dark:text-white">
                  Dashboard
                </Button>
              </Link>

              <Button variant="primary" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="text-gray-900 dark:text-white">
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
