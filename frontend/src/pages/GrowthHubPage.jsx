import { Helmet } from 'react-helmet-async'
import { ArrowRight, Rocket } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const TIER_LABELS = {
  free: 'Free Listing',
  sponsored: 'Fast-Track',
  reviewed: 'Reviewed Listing',
  // Retired tier — kept so rows bought under it still label correctly.
  quick: 'Quick Review',
}
const STATUS_LABELS = { pending: 'In review', approved: 'Live', rejected: 'Not approved' }

function ToolRow({ tool }) {
  return (
    <Link
      to={`/dashboard/submission?submission_id=${tool.submission_id}`}
      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-bg-elev p-4 shadow-sm transition hover:border-accent hover:shadow-md"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{tool.name}</p>
        <p className="mt-1 text-xs text-muted">
          {TIER_LABELS[tool.tier] || tool.tier} &middot; {STATUS_LABELS[tool.status] || tool.status}
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  )
}

// Landing view for a founder-account (see Navbar.jsx's isFounder check).
// One tool -> straight into that tool's dashboard, no extra click. Multiple
// (a repeat founder, per the account-linking behavior in
// get_or_create_founder_account) -> a picker. Reads /api/v1/founder/tools,
// which scopes to the logged-in session's founder_user_id server-side.
export default function GrowthHubPage() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: null, tools: null })

  useEffect(() => {
    let storedUser = null
    try {
      storedUser = JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      storedUser = null
    }
    if (!storedUser) {
      navigate('/login', { replace: true })
      return
    }
    if (storedUser.must_change_password) {
      navigate('/account/change-password', { replace: true })
      return
    }

    let cancelled = false
    fetch('/api/v1/founder/tools')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setState({ loading: false, error: body.error || 'error', tools: null })
          return
        }
        const tools = body.tools || []
        if (tools.length === 1) {
          navigate(`/dashboard/submission?submission_id=${tools[0].submission_id}`, { replace: true })
          return
        }
        setState({ loading: false, error: null, tools })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: 'network', tools: null })
      })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const { loading, error, tools } = state

  return (
    <>
      <Helmet>
        <title>Growth Hub | AI Compass</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-2xl px-4 py-12 md:py-16">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-accent uppercase tracking-widest">
            <Rocket className="h-3 w-3" /> Growth Hub
          </span>
          <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">Your listings</h1>
          <p className="mt-2 text-sm text-muted">
            Pick a tool to open its dashboard — clicks, views, and (for paid tiers) how it's performing.
          </p>

          <div className="mt-8 space-y-3">
            {loading && (
              <div className="rounded-2xl border border-line bg-bg-elev p-4 shadow-sm">
                <p className="text-sm text-muted">Loading your listings…</p>
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-danger bg-danger-soft p-4">
                <p className="text-sm text-danger">We couldn't load your listings right now. Please try again shortly.</p>
              </div>
            )}

            {!loading && !error && tools && tools.length === 0 && (
              <div className="rounded-2xl border border-line bg-bg-elev p-4 shadow-sm">
                <p className="text-sm text-muted">No listings linked to this account yet.</p>
              </div>
            )}

            {!loading && !error && tools && tools.length > 1 &&
              tools.map((tool) => <ToolRow key={tool.submission_id} tool={tool} />)}
          </div>
        </div>
      </div>
    </>
  )
}
