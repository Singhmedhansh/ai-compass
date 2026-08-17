import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, X, Sparkles } from 'lucide-react'

const SESSION_KEY = 'aic-escape-bar-dismissed'

/**
 * StickyEscapeBar — a scroll-triggered sticky bar at the bottom of the viewport.
 *
 * Appears after the user has scrolled past `scrollThreshold` (default 40%) of the page.
 * Dismissed state persists in sessionStorage so it doesn't re-appear on the same tab session.
 *
 * Props:
 *   scrollThreshold  — fraction of page scroll to trigger (default 0.4 = 40%)
 *   title            — main CTA text
 *   to               — link destination (default "/ai-tool-finder")
 *   storageKey       — sessionStorage key for dismiss state (allows per-page keys)
 */
export default function StickyEscapeBar({
  scrollThreshold = 0.4,
  title = 'Still deciding? Find the perfect tool for you in 60 seconds',
  to = '/ai-tool-finder',
  storageKey = SESSION_KEY,
}) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (dismissed) return

    const handleScroll = () => {
      const scrolled = window.scrollY
      const total = document.documentElement.scrollHeight - window.innerHeight
      if (total <= 0) return
      const ratio = scrolled / total
      setVisible(ratio >= scrollThreshold)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    // Run once on mount in case page is already scrolled
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [dismissed, scrollThreshold])

  const handleDismiss = () => {
    setDismissed(true)
    setVisible(false)
    try {
      sessionStorage.setItem(storageKey, '1')
    } catch {
      // sessionStorage not available — silently ignore
    }
  }

  if (dismissed || !visible) return null

  return (
    <div
      role="complementary"
      aria-label="Tool finder prompt"
      className="fixed bottom-0 left-0 right-0 z-40 animate-in slide-in-from-bottom-2 duration-300"
    >
      <div className="border-t border-line bg-bg-elev/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-bg">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="truncate text-sm font-medium text-ink">{title}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to={to}
              className="group inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-bold text-bg transition-all hover:scale-105 hover:opacity-90"
            >
              Find my match
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss this prompt"
              className="rounded-full p-1.5 text-muted transition-colors hover:bg-bg-sunk hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
