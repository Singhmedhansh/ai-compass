import { useEffect, useState } from 'react'
import { useCatalogStats } from '../../hooks/useCatalogStats'

/**
 * Brand loading state: a compass whose needle sweeps while the dial
 * stays fixed. Used by the lazy-route Suspense fallback and any
 * page-level "loading" view, so a navigating user sees the AI Compass
 * mark searching rather than a blank gap.
 *
 * Colors use the --accent token so it adapts to light/dark. The spin
 * lives in index.css (.compass-needle) and respects reduced-motion.
 *
 * @param {number}  size      - SVG size in px. Default 56.
 * @param {string}  label     - Fixed caption (overrides rotating messages).
 * @param {boolean} full      - If true, fills a tall centered region.
 * @param {boolean} messages  - Show rotating witty loading messages (default true when full).
 * @param {string}  className - Extra Tailwind classes.
 */

const LOADING_MESSAGES = [
  'Finding your tools…',
  'Scanning the AI universe…',
  'Hold on a sec ✦',
  'Almost there…',
  'Ranking the best picks…',
  'Sorting through 400+ tools…',
  'Your results are brewing ☕',
  'Nearly done…',
  'Polishing the results…',
  'Just a moment…',
]

function CompassLoader({ size = 56, label = '', full = false, messages, className = '' }) {
  const { roundedToolsText } = useCatalogStats() // {/* Dynamic — do not hardcode */}
  const showMessages = messages !== undefined ? messages : full
  const [msgIndex, setMsgIndex] = useState(() => Math.floor(Math.random() * LOADING_MESSAGES.length))
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!showMessages) return
    const interval = setInterval(() => {
      // Fade out → swap text → fade in
      setVisible(false)
      setTimeout(() => {
        setMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length)
        setVisible(true)
      }, 300)
    }, 2200)
    return () => clearInterval(interval)
  }, [showMessages])

  const rawMsg = label || (showMessages ? LOADING_MESSAGES[msgIndex] : '')
  const currentMsg = rawMsg.includes('400+') 
    ? rawMsg.replace('400+', roundedToolsText) // {/* Dynamic — do not hardcode */}
    : rawMsg

  const compass = (
    <span
      role="status"
      aria-label={currentMsg || 'Loading'}
      className={`inline-flex flex-col items-center gap-3 ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        width={size}
        height={size}
        aria-hidden="true"
      >
        <circle
          cx="32" cy="32" r="23"
          fill="none" stroke="var(--accent)" strokeOpacity="0.9" strokeWidth="2.5"
        />
        <circle
          cx="32" cy="32" r="16"
          fill="none" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1"
        />
        <g className="compass-needle">
          <polygon points="32,12 27,33 32,31 37,33" fill="var(--accent)" />
          <polygon points="32,52 28,31 32,33 36,31" fill="var(--accent)" fillOpacity="0.4" />
          <circle cx="32" cy="32" r="2.6" fill="var(--bg-elev)" stroke="var(--accent)" strokeWidth="1" />
        </g>
      </svg>
      {currentMsg ? (
        <span
          className="text-sm font-medium text-muted transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
          aria-live="polite"
          aria-atomic="true"
        >
          {currentMsg}
        </span>
      ) : null}
    </span>
  )

  if (full) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        {compass}
      </div>
    )
  }

  return compass
}

export default CompassLoader
