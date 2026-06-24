import { Component } from 'react'

/**
 * App-level error boundary. Before this existed, any uncaught render
 * error in a single page (e.g. the react-countup interop crash on
 * /dashboard) unmounted the entire React tree, leaving a pure-white
 * screen with no navbar/footer and no clue what broke.
 *
 * Now a failed page renders a recoverable fallback while the rest of
 * the shell (Navbar/Footer) keeps working.
 *
 * The fallback has two modes:
 *  - "maintenance" — shown when VITE_MAINTENANCE_MODE=true is set at
 *    build time. Tells users the site will be right back.
 *  - "error" (default) — shown when a runtime render error is caught.
 */

const IS_MAINTENANCE = import.meta.env.VITE_MAINTENANCE_MODE === 'true'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface to the console and PostHog so prod crashes are diagnosable
    console.error('ErrorBoundary caught:', error, info)
    try {
      const ph = typeof window !== 'undefined' ? window.posthog : null
      if (ph) {
        ph.captureException(error, { extra: info })
        ph.capture('frontend_error_boundary', {
          message: String(error?.message || error),
          stack: String(error?.stack || ''),
        })
      }
    } catch {
      /* never let telemetry break the fallback */
    }
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    // ── Maintenance mode ──────────────────────────────────────────────
    if (IS_MAINTENANCE) {
      return <MaintenancePage />
    }

    // ── Runtime error fallback ────────────────────────────────────────
    if (this.state.error) {
      return <ErrorFallback onReset={this.handleReset} error={this.state.error} />
    }

    return this.props.children
  }
}

// ── Maintenance page ─────────────────────────────────────────────────────────
function MaintenancePage() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4 py-20 text-center">
      {/* Animated compass */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        width="72"
        height="72"
        aria-hidden="true"
        className="mb-6 opacity-80"
      >
        <circle cx="32" cy="32" r="23" fill="none" stroke="var(--accent)" strokeOpacity="0.9" strokeWidth="2.5" />
        <circle cx="32" cy="32" r="16" fill="none" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1" />
        <g className="compass-needle">
          <polygon points="32,12 27,33 32,31 37,33" fill="var(--accent)" />
          <polygon points="32,52 28,31 32,33 36,31" fill="var(--accent)" fillOpacity="0.4" />
          <circle cx="32" cy="32" r="2.6" fill="var(--bg-elev)" stroke="var(--accent)" strokeWidth="1" />
        </g>
      </svg>

      <h1 className="text-2xl font-bold text-ink sm:text-3xl">
        We'll be right back
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted leading-relaxed">
        AI Compass is undergoing a quick update. We're working on it and will
        be back online shortly. Thanks for your patience! 🛠️
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a
          href="/"
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          Try the homepage
        </a>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink-2 transition hover:bg-bg-sunk"
        >
          Refresh page
        </button>
      </div>

      <p className="mt-10 text-xs text-muted-2">
        Other pages may still be working —{' '}
        <a href="/tools" className="underline underline-offset-2 hover:text-ink transition-colors">
          Browse tools
        </a>{' '}
        ·{' '}
        <a href="/ai-tool-finder" className="underline underline-offset-2 hover:text-ink transition-colors">
          AI Stack Architect
        </a>
      </p>
    </div>
  )
}

// ── Runtime error fallback ────────────────────────────────────────────────────
function ErrorFallback({ onReset }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <div className="rounded-2xl border border-line bg-bg-elev p-8 shadow-sm">
        {/* Mini compass so it looks branded not broken */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 64 64"
          width="48"
          height="48"
          aria-hidden="true"
          className="mx-auto mb-4 opacity-60"
        >
          <circle cx="32" cy="32" r="23" fill="none" stroke="var(--accent)" strokeOpacity="0.9" strokeWidth="2.5" />
          <circle cx="32" cy="32" r="16" fill="none" stroke="var(--accent)" strokeOpacity="0.3" strokeWidth="1" />
          <polygon points="32,12 27,33 32,31 37,33" fill="var(--accent)" opacity="0.5" />
          <polygon points="32,52 28,31 32,33 36,31" fill="var(--accent)" fillOpacity="0.25" />
          <circle cx="32" cy="32" r="2.6" fill="var(--bg-elev)" stroke="var(--accent)" strokeWidth="1" />
        </svg>

        <h1 className="text-xl font-bold text-ink">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-muted">
          The rest of the site is still working. Try again, or feel free to explore other pages.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-bg-sunk"
          >
            Go home
          </a>
          <a
            href="/tools"
            className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-bg-sunk"
          >
            Browse tools
          </a>
        </div>
      </div>
    </div>
  )
}

export default ErrorBoundary
