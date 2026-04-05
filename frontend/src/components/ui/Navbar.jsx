import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import Button from './Button'
import SearchInput from './SearchInput'

const STORAGE_KEY = 'ai-compass-theme'

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
  const [user, setUser] = useState(null)

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem('user')
      if (!rawUser) {
        setUser(null)
        return
      }

      const parsed = JSON.parse(rawUser)
      setUser(parsed && typeof parsed === 'object' ? parsed : null)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    window.localStorage.setItem(STORAGE_KEY, isDark ? 'dark' : 'light')
  }, [isDark])

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
    navigate('/')
  }

  const avatarLetter = String(user?.name || user?.email || 'U').charAt(0).toUpperCase()

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
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
              <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-indigo-600 text-sm font-bold text-white">
                {avatarLetter}
                {user?.picture ? (
                  <img
                    src={user.picture}
                    alt="Profile"
                    className="absolute inset-0 h-8 w-8 rounded-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                ) : null}
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
