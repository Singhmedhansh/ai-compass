import { Component } from 'react'

/**
 * App-level error boundary. Before this existed, any uncaught render
 * error in a single page (e.g. the react-countup interop crash on
 * /dashboard) unmounted the entire React tree, leaving a pure-white
 * screen with no navbar/footer and no clue what broke.
 *
 * Now a failed page renders a recoverable fallback while the rest of
 * the shell (Navbar/Footer) keeps working.
 */
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
    if (this.state.error) {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
          <div className="rounded-2xl border border-line bg-bg-elev p-8 shadow-sm">
            <h1 className="text-xl font-bold text-ink">Something went wrong on this page</h1>
            <p className="mt-2 text-sm text-muted">
              The rest of the site is still working. Try again, or head back home.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition hover:opacity-90"
              >
                Try again
              </button>
              <a
                href="/"
                className="rounded-xl border border-line-strong px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-bg-sunk"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
