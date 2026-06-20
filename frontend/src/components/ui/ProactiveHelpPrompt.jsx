import { useState, useEffect, useRef } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, X, Sparkles, ArrowRight } from 'lucide-react'

const MotionDiv = motion.div

const KEY_PAGES = ['/tools', '/ai-tool-finder', '/compare', '/collections']
const DWELL_TIMEOUT_MS = 40000 // 40 seconds

const PAGE_MESSAGES = {
  '/tools': 'Looking for a specific AI tool? Browse our categories or visit our FAQ & Support for tips.',
  '/ai-tool-finder': 'Stuck building your stack? Try our predefined presets, or check the FAQ & Support for a step-by-step guide.',
  '/compare': 'Comparing multiple tools? Visit the FAQ & Support to learn how the comparison matrix and tray operate.',
  '/collections': 'Exploring curated tool collections? Read our FAQ & Support guides to understand rating and curation criteria.'
}

export default function ProactiveHelpPrompt() {
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState('')
  const timerRef = useRef(null)

  const isWizardPage = location.pathname === '/ai-tool-finder'
  const isKeyPage = KEY_PAGES.includes(location.pathname)

  // Function to dismiss prompt for the current page session-wide
  const handleDismiss = () => {
    setVisible(false)
    try {
      sessionStorage.setItem(`ai-compass-help-dismissed-${location.pathname}`, 'true')
    } catch (e) {
      // ignore
    }
  }

  // Open feedback modal programmatically and hide help prompt
  const handleOpenFeedback = () => {
    setVisible(false)
    const event = new CustomEvent('ai-compass-open-feedback')
    window.dispatchEvent(event)
  }

  useEffect(() => {
    // Hide whenever the page changes
    setVisible(false)
    setMessage('')

    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }

    if (!isKeyPage) return

    // Check if dismissed in this session
    let isDismissed = false
    try {
      isDismissed = sessionStorage.getItem(`ai-compass-help-dismissed-${location.pathname}`) === 'true'
    } catch (e) {
      // ignore
    }

    if (isDismissed) return

    // Time-based automatic popup disabled to eliminate distraction/friction.
    // Proactive help is now purely reactive (e.g., when search yields zero results).
    return () => {}
  }, [location.pathname, isKeyPage])

  // Listen for custom trigger events from pages (e.g. empty results)
  useEffect(() => {
    const handleProactiveHelpEvent = (e) => {
      let isDismissed = false
      try {
        isDismissed = sessionStorage.getItem(`ai-compass-help-dismissed-${location.pathname}`) === 'true'
      } catch (err) {
        // ignore
      }

      if (isDismissed) return

      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      if (e.detail?.message) {
        setMessage(e.detail.message)
        setVisible(true)
      }
    }

    window.addEventListener('ai-compass-proactive-help', handleProactiveHelpEvent)
    return () => {
      window.removeEventListener('ai-compass-proactive-help', handleProactiveHelpEvent)
    }
  }, [location.pathname])

  return (
    <AnimatePresence>
      {visible && (
        <MotionDiv
          initial={{ opacity: 0, y: 15, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 15, scale: 0.95 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`fixed bottom-20 z-50 w-[calc(100vw-2rem)] max-w-xs rounded-2xl border border-line glass-card p-4 shadow-xl ${
            isWizardPage ? 'right-4 sm:right-6' : 'left-4 sm:left-6'
          }`}
          style={{
            borderColor: 'rgba(230, 229, 222, 0.4)'
          }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss help suggestion"
            className="absolute right-3 top-3 rounded-full p-1 text-muted hover:bg-bg-sunk hover:text-ink transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {/* Prompt Content */}
          <div className="flex gap-2.5 items-start">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 pr-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-accent-ink">
                Need Help?
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                {message}
              </p>
              
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <Link
                  to="/help"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                  onClick={() => setVisible(false)}
                >
                  FAQ & Support <ArrowRight className="h-3 w-3" />
                </Link>
                <span className="text-line-strong text-xs">|</span>
                <button
                  type="button"
                  onClick={handleOpenFeedback}
                  className="text-[11px] font-semibold text-muted hover:text-ink hover:underline"
                >
                  Send Feedback
                </button>
              </div>
            </div>
          </div>
        </MotionDiv>
      )}
    </AnimatePresence>
  )
}
