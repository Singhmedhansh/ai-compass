import { useLayoutEffect, useRef, useState, useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import {
  ArrowLeft,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Moon,
  Shield,
  Sparkles,
  Sun,
  UserCircle2,
  ArrowUpRight
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import CompassMark from './CompassMark'
import SearchInput from './SearchInput'
import useClickOutside from '../../hooks/useClickOutside'
import { useCurrency } from '../../context/CurrencyContext'
import './CardNav.css'

const MotionDiv = motion.div
const STORAGE_KEY = 'ai-compass-theme'
const ADMIN_EMAILS = ['singhmedhansh07@gmail.com']
const dropdownTransition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] }

function getInitialTheme() {
  if (typeof window === 'undefined') return false
  const storedTheme = window.localStorage.getItem(STORAGE_KEY)
  return storedTheme === 'dark'
}

const CardNav = ({ className = '', ease = 'power3.out' }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedCurrency, setSelectedCurrency, currencies } = useCurrency()

  const hideSearchOnRoute = location.pathname === '/tools'
  const [searchValue, setSearchValue] = useState('')
  const [isDark, setIsDark] = useState(getInitialTheme)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [isCurrencyMenuOpen, setIsCurrencyMenuOpen] = useState(false)
  const [failedAvatarUrl, setFailedAvatarUrl] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authRefreshKey, setAuthRefreshKey] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      return null
    }
  })

  const avatarFailed = failedAvatarUrl != null && failedAvatarUrl === user?.picture
  const menuRef = useClickOutside(() => setIsProfileMenuOpen(false))
  const currencyMenuRef = useClickOutside(() => setIsCurrencyMenuOpen(false))
  const isAdmin = Boolean(user && (user.is_admin || ADMIN_EMAILS.includes(user.email)))
  const avatarLetter = useMemo(
    () => String(user?.name || user?.email || 'U').charAt(0).toUpperCase(),
    [user?.email, user?.name]
  )

  // CardNav animation states
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const navRef = useRef(null)
  const cardsRef = useRef([])
  const tlRef = useRef(null)

  // Navigation Items list structured into columns
  const items = [
    {
      label: 'Explore',
      bgColor: isDark ? 'rgba(22, 27, 25, 0.45)' : 'rgba(255, 255, 255, 0.45)',
      textColor: 'var(--ink)',
      links: [
        { label: 'Catalog', ariaLabel: 'Browse All AI Tools', href: '/tools' },
        { label: 'Collections', ariaLabel: 'AI Tool Collections', href: '/collections' },
        { label: 'Compare', ariaLabel: 'Compare AI Tools Side-by-Side', href: '/compare' },
        { label: 'Cost Calculator', ariaLabel: 'LLM cost calculation', href: '/model-comparison' }
      ]
    },
    {
      label: 'Student Hub',
      bgColor: isDark ? 'rgba(10, 14, 12, 0.45)' : 'rgba(242, 241, 235, 0.45)',
      textColor: 'var(--ink)',
      links: [
        { label: 'Syllabus Parser', ariaLabel: 'Parse syllabus with AI', href: '/syllabus-parser' },
        { label: 'Student Discounts', ariaLabel: 'Claim student discounts', href: '/student-discounts' },
        { label: 'Tool Architect', ariaLabel: 'Find matching tools', href: '/ai-tool-finder' },
        { label: 'Submit Tool', ariaLabel: 'Submit a new tool', href: '/submit' }
      ]
    },
    {
      label: 'Guides',
      bgColor: isDark ? 'rgba(18, 42, 34, 0.45)' : 'rgba(228, 242, 236, 0.45)',
      textColor: 'var(--ink)',
      links: [
        { label: 'For Students', ariaLabel: 'Best tools for students', href: '/best-ai-tools-for-students' },
        { label: 'For Teachers', ariaLabel: 'Best tools for teachers', href: '/best-ai-tools-for-teachers' },
        { label: 'Free AI Tools', ariaLabel: 'Best free tools', href: '/best-free-ai-tools' },
        { label: 'Coding Tools', ariaLabel: 'Best coding tools', href: '/best-coding-tools-for-students' }
      ]
    }
  ]

  // Theme synchronization logic
  const syncThemeFromStorage = () => {
    if (typeof window === 'undefined') return
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

  // Throttled Scroll logic (improves rendering performance)
  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 50
      setScrolled(prev => {
        if (prev !== isScrolled) return isScrolled
        return prev
      })
    }
    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Authentication State synchronization
  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
        setUser(storedUser)
        setIsAuthenticated(Boolean(storedUser))
        setAuthRefreshKey(value => value + 1)
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
          if (window.posthog) window.posthog.reset()
          if (active) {
            setUser(null)
            setIsAuthenticated(false)
          }
          return
        }

        const fullUser = await response.json()
        const mergedUser = { ...storedUser, ...fullUser }
        localStorage.setItem('user', JSON.stringify(mergedUser))
        if (window.posthog && mergedUser) {
          window.posthog.identify(mergedUser.id, {
            email: mergedUser.email,
            is_verified: mergedUser.is_verified
          })
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
          })
        }
      }
    }

    verifyAuthState()
    return () => {
      active = false
    }
  }, [authRefreshKey])

  const toggleDarkMode = () => {
    setIsDark(!isDark)
  }

  const handleSearchKeyDown = event => {
    if (event.key !== 'Enter') return
    const query = searchValue.trim()
    if (!query) {
      navigate('/tools')
      return
    }
    navigate(`/tools?q=${encodeURIComponent(query)}`)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    localStorage.removeItem('user')
    if (window.posthog) window.posthog.reset()
    setUser(null)
    setIsAuthenticated(false)
    window.dispatchEvent(new Event('userLoggedIn'))
    setIsProfileMenuOpen(false)
    navigate('/')
  }

  // GPU-Accelerated GSAP animation timeline
  const createTimeline = () => {
    if (cardsRef.current.length === 0) return null
    gsap.set(cardsRef.current, { y: 15, opacity: 0 })
    const tl = gsap.timeline({ paused: true })
    tl.to(cardsRef.current, {
      y: 0,
      opacity: 1,
      duration: 0.3,
      ease,
      stagger: 0.04
    })
    return tl
  }

  useLayoutEffect(() => {
    const tl = createTimeline()
    tlRef.current = tl
    return () => {
      tl?.kill()
      tlRef.current = null
    }
  }, [items.length])

  const toggleMenu = () => {
    const tl = tlRef.current
    if (!isExpanded) {
      setIsHamburgerOpen(true)
      setIsExpanded(true)
      if (tl) tl.play(0)
    } else {
      setIsHamburgerOpen(false)
      if (tl) {
        tl.eventCallback('onReverseComplete', () => setIsExpanded(false))
        tl.reverse()
      } else {
        setIsExpanded(false)
      }
    }
  }

  const setCardRef = i => el => {
    if (el) cardsRef.current[i] = el
  }

  return (
    <div className={`card-nav-container ${scrolled ? 'scrolled' : ''} ${className}`}>
      <nav ref={navRef} className={`card-nav ${isExpanded ? 'open' : ''}`}>
        <div className="card-nav-top">
          <div
            className={`hamburger-menu ${isHamburgerOpen ? 'open' : ''}`}
            onClick={toggleMenu}
            role="button"
            aria-label={isExpanded ? 'Close menu' : 'Open menu'}
            tabIndex={0}
          >
            <div className="hamburger-line" />
            <div className="hamburger-line" />
          </div>

          {location.pathname !== '/' && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-bg-elev text-ink-2 shadow-sm transition hover:scale-105 active:scale-95"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            </button>
          )}

          <Link to="/" className="logo-container" onClick={() => isExpanded && toggleMenu()}>
            <CompassMark size={28} />
            <span>AI Compass</span>
          </Link>

          {hideSearchOnRoute ? null : (
            <div className="flex-1 max-w-xs hide-mobile">
              <SearchInput
                value={searchValue}
                onChange={setSearchValue}
                onClear={() => setSearchValue('')}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search tools..."
              />
            </div>
          )}

          <div className="right-controls">
            {/* Currency Selector Trigger */}
            <div className="relative hide-mobile">
              <button
                type="button"
                onClick={() => setIsCurrencyMenuOpen(prev => !prev)}
                className="flex items-center gap-1.5 h-10 rounded-lg border border-line-strong bg-bg-elev px-3 text-xs font-semibold text-ink-2 transition-colors hover:bg-bg-sunk select-none"
                aria-haspopup="listbox"
                aria-expanded={isCurrencyMenuOpen}
              >
                <span>{selectedCurrency} ({currencies.find(c => c.code === selectedCurrency)?.symbol})</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted transition-transform duration-200" style={{ transform: isCurrencyMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </button>
            </div>

            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong bg-bg-elev text-ink-2 transition hover:bg-bg-sunk"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Authentication Avatar or CTA */}
            {user && isAuthenticated ? (
              <div>
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen(val => !val)}
                  className="flex items-center gap-2 rounded-full border border-line-strong bg-bg-elev px-1.5 py-1 text-left shadow-sm transition hover:border-accent hover:shadow-md focus-visible:outline-none"
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
              </div>
            ) : (
              <button
                type="button"
                className="card-nav-cta-button"
                onClick={() => navigate('/login')}
              >
                Get Started
              </button>
            )}
          </div>
        </div>

        <div className="card-nav-content" aria-hidden={!isExpanded}>
          {items.map((item, idx) => (
            <div
              key={`${item.label}-${idx}`}
              className="nav-card"
              ref={setCardRef(idx)}
              style={{ backgroundColor: item.bgColor }}
            >
              <div className="nav-card-label" style={{ color: item.textColor }}>{item.label}</div>
              <div className="nav-card-links">
                {item.links?.map((lnk, i) => (
                  <Link
                    key={`${lnk.label}-${i}`}
                    className="nav-card-link"
                    to={lnk.href}
                    aria-label={lnk.ariaLabel}
                    onClick={toggleMenu}
                  >
                    <ArrowUpRight className="nav-card-link-icon" aria-hidden="true" size={14} />
                    {lnk.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Render Dropdowns in transparent overlay to prevent overflow:hidden clipping */}
      <div className="dropdowns-overlay-container">
        {/* Currency Menu Dropdown */}
        <AnimatePresence>
          {isCurrencyMenuOpen && (
            <MotionDiv
              ref={currencyMenuRef}
              role="listbox"
              aria-label="Currency selection"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={dropdownTransition}
              className="overlay-dropdown-wrapper currency-dropdown-pos w-40 overflow-hidden rounded-xl border border-line bg-bg-elev p-1 shadow-lg"
            >
              {currencies.map(curr => (
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

        {/* Profile Menu Dropdown */}
        <AnimatePresence>
          {isProfileMenuOpen && user && isAuthenticated && (
            <MotionDiv
              ref={menuRef}
              role="menu"
              aria-label="Profile menu"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={dropdownTransition}
              className="overlay-dropdown-wrapper profile-dropdown-pos w-64 overflow-hidden rounded-2xl border border-line bg-bg-elev p-2 shadow-2xl"
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

              {isAdmin && (
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
              )}

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
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default CardNav
