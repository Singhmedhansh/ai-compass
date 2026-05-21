import { Link } from 'react-router-dom'
import { WifiOff, ServerCrash, SearchX } from 'lucide-react'

import { Button } from './ui'

// Reusable error card used by data-loading pages (Directory, ToolDetail,
// Alternatives, Collection, Collections). Centralising the look means
// "offline" and "server is sad" feel like the same product, not like a
// patchwork. See utils/errorState.js for variant inference.
//
// Variants:
//   offline  — connection problem (no internet, DNS, etc.)
//   server   — API reached but errored (5xx, parse, generic)
//   notfound — explicit 404 (caller's job to decide this)
//
// Props (all optional except variant):
//   variant          — one of the three above (default 'server')
//   title            — override the headline
//   message          — override the body copy
//   onRetry          — if provided, renders a primary "Try again" button
//   secondaryAction  — { label, to? , onClick? } — link or button
//   className        — extra Tailwind classes to layer on the section
const VARIANTS = {
  offline: {
    Icon: WifiOff,
    iconColor: 'text-amber-500',
    title: 'You appear to be offline',
    message:
      "Check your internet connection and try again. We'll load this as soon as we can reach the server.",
  },
  server: {
    Icon: ServerCrash,
    iconColor: 'text-danger',
    title: "Couldn't load this right now",
    message:
      'Something went wrong on our end. Please try again in a moment — if it keeps happening, send us feedback.',
  },
  notfound: {
    Icon: SearchX,
    iconColor: 'text-muted',
    title: "We couldn't find that",
    message:
      "It might have been removed, or the link might be wrong. Try browsing the directory instead.",
  },
}

export default function ErrorState({
  variant = 'server',
  title,
  message,
  onRetry,
  secondaryAction,
  className = '',
}) {
  const v = VARIANTS[variant] || VARIANTS.server
  const Icon = v.Icon

  return (
    <section
      role="alert"
      className={`rounded-2xl border border-line bg-bg-sunk px-6 py-14 text-center ${className}`}
    >
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm"
        aria-hidden="true"
      >
        <Icon className={`h-7 w-7 ${v.iconColor}`} />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-ink">{title || v.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{message || v.message}</p>

      {(onRetry || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Try again
            </Button>
          )}
          {secondaryAction && (
            secondaryAction.to ? (
              <Link to={secondaryAction.to}>
                <Button variant="secondary">{secondaryAction.label}</Button>
              </Link>
            ) : (
              <Button variant="secondary" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </section>
  )
}
