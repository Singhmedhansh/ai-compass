/**
 * Brand loading state: a compass whose needle sweeps while the dial
 * stays fixed. Used by the lazy-route Suspense fallback and any
 * page-level "loading" view, so a navigating user sees the AI Compass
 * mark searching rather than a blank gap.
 *
 * Colors use the --accent token so it adapts to light/dark. The spin
 * lives in index.css (.compass-needle) and respects reduced-motion.
 *
 * @param {number} size - SVG size in px. Default 56.
 * @param {string} label - Optional caption shown under the compass.
 * @param {boolean} full - If true, fills a tall centered region
 *   (used as a route fallback). Otherwise renders inline.
 */
function CompassLoader({ size = 56, label = '', full = false, className = '' }) {
  const compass = (
    <span
      role="status"
      aria-label={label || 'Loading'}
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
      {label ? (
        <span className="text-sm font-medium text-muted">{label}</span>
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
