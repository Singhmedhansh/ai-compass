import { Link } from 'react-router-dom'

import AnimatedCompass from '../ui/AnimatedCompass'
import CompassMark from '../ui/CompassMark'

const VALUE_POINTS = [
  '399 AI tools, each opened and used for at least an hour',
  'A written reason for every pick — no scraped descriptions',
  'Free to browse · no account required to use the wizard',
]

/**
 * Split-panel shell for the auth pages. Left: interactive branded panel
 * (the same cursor-following compass as the homepage) to fill the space
 * and reinforce the product. Right: the form, passed as children.
 * Below lg the brand panel is hidden and a compact logo header is shown
 * instead, so mobile stays a clean single column.
 */
export default function AuthLayout({ children, eyebrow, title, subtitle }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] w-full grid-cols-1 lg:grid-cols-2">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden border-r border-line bg-bg-sunk lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 70% 30%, color-mix(in oklab, var(--accent) 14%, transparent) 0%, transparent 55%)',
          }}
        />

        <Link to="/" className="relative z-10 inline-flex items-center gap-2 self-start">
          <CompassMark size={28} />
          <span className="text-base font-semibold text-ink">AI Compass</span>
        </Link>

        <div className="relative z-10 flex flex-1 items-center justify-center py-8">
          <AnimatedCompass size={300} />
        </div>

        <div className="relative z-10">
          <p className="max-w-[34ch] text-balance text-xl font-semibold leading-snug text-ink">
            A hand-picked AI finder. Made for students.
          </p>
          <ul className="mt-5 space-y-2.5">
            {VALUE_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm text-ink-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form column */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          {/* Compact brand header — shown only when the panel is hidden */}
          <Link
            to="/"
            className="mb-8 flex items-center justify-center gap-2 lg:hidden"
          >
            <CompassMark size={36} />
            <span className="text-lg font-semibold text-ink">AI Compass</span>
          </Link>

          <div className="text-center">
            {eyebrow ? (
              <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-accent">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-2xl font-bold text-ink">{title}</h1>
            {subtitle ? (
              <p className="mt-2 text-sm text-muted">{subtitle}</p>
            ) : null}
          </div>

          {children}
        </div>
      </main>
    </div>
  )
}
