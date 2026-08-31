import { Helmet } from 'react-helmet-async'
import { CheckCircle2, Clock, ExternalLink, Heart, MousePointerClick, Percent, Sparkles, Star, Trophy, TrendingUp, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

function Card({ children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-line bg-bg-elev p-5 shadow-sm ${className}`}>
      {children}
    </section>
  )
}

function StatTile({ label, value }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value ?? 0}</p>
    </Card>
  )
}

// Two-series (clicks/views) 14-day trend line chart. Clicks use the brand
// accent (the metric that maps to revenue); views use a neutral ink tone —
// deliberately not a second hue, since this app's design system only
// defines one categorical accent color.
const CHART_WIDTH = 640
const CHART_HEIGHT = 200
const CHART_PADDING = { top: 12, right: 12, bottom: 24, left: 12 }

function TrendChart({ data }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const width = CHART_WIDTH
  const height = CHART_HEIGHT
  const padding = CHART_PADDING

  const { clicksPath, viewsPath, points, maxVal } = useMemo(() => {
    const n = data.length
    const max = Math.max(1, ...data.map((d) => Math.max(d.clicks, d.views)))
    const innerW = width - padding.left - padding.right
    const innerH = height - padding.top - padding.bottom
    const x = (i) => padding.left + (n <= 1 ? 0 : (i / (n - 1)) * innerW)
    const y = (v) => padding.top + innerH - (v / max) * innerH

    const toPath = (key) =>
      data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')

    return {
      clicksPath: toPath('clicks'),
      viewsPath: toPath('views'),
      points: data.map((d, i) => ({ ...d, cx: x(i), cyClicks: y(d.clicks), cyViews: y(d.views) })),
      maxVal: max,
    }
  }, [data])

  const hovered = hoverIdx != null ? points[hoverIdx] : null

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Clicks and views over the last 14 days"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <path d={clicksPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        <path d={viewsPath} fill="none" stroke="var(--ink-2)" strokeWidth="2" strokeOpacity="0.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <rect
            key={p.date}
            x={p.cx - (width / points.length) / 2}
            y={0}
            width={width / points.length}
            height={height}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}
        {hovered && (
          <>
            <line x1={hovered.cx} x2={hovered.cx} y1={padding.top} y2={height - padding.bottom} stroke="var(--line-strong)" strokeWidth="1" />
            <circle cx={hovered.cx} cy={hovered.cyClicks} r="4" fill="var(--accent)" />
            <circle cx={hovered.cx} cy={hovered.cyViews} r="4" fill="var(--ink-2)" fillOpacity="0.6" />
          </>
        )}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-xs shadow-md" style={{ left: `min(${(hovered.cx / width) * 100}%, 78%)` }}>
          <p className="font-semibold text-ink">{hovered.date}</p>
          <p className="text-accent">{hovered.clicks} clicks</p>
          <p className="text-ink-2 opacity-70">{hovered.views} views</p>
        </div>
      )}
      <div className="mt-2 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} /> Clicks</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full opacity-50" style={{ backgroundColor: 'var(--ink-2)' }} /> Views</span>
        <span className="ml-auto">Peak day: {maxVal}</span>
      </div>
    </div>
  )
}

// Views→clicks conversion, favorites (saves), and rating — the three
// engagement signals not already covered by the raw click/view counts.
// CTR shows "—" (not 0%) when there's no view data, since a 0% would
// misleadingly read as "nobody who saw it clicked."
function EngagementRow({ analytics }) {
  const { ctr, favorites, rating } = analytics
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted">
          <Percent className="h-3.5 w-3.5" /> Click-through rate
        </p>
        <p className="mt-2 text-2xl font-bold text-ink">{typeof ctr === 'number' ? `${ctr}%` : '—'}</p>
        <p className="mt-1 text-[11px] text-muted-2">Of views that clicked through</p>
      </Card>
      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted">
          <Heart className="h-3.5 w-3.5" /> Saved by students
        </p>
        <p className="mt-2 text-2xl font-bold text-ink">{favorites ?? 0}</p>
        <p className="mt-1 text-[11px] text-muted-2">Added to a favorites list</p>
      </Card>
      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted">
          <Star className="h-3.5 w-3.5" /> Rating
        </p>
        <p className="mt-2 text-2xl font-bold text-ink">
          {rating?.count > 0 ? `${rating.average.toFixed(1)}★` : '—'}
        </p>
        <p className="mt-1 text-[11px] text-muted-2">
          {rating?.count > 0 ? `${rating.count} rating${rating.count === 1 ? '' : 's'}` : 'No ratings yet'}
        </p>
      </Card>
    </div>
  )
}

function StatusBanner({ submission }) {
  const { status, live_at: liveAt, is_live: isLive } = submission

  if (status === 'rejected') {
    return (
      <Card className="border-danger/30 bg-danger-soft/40">
        <div className="flex items-start gap-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div>
            <h2 className="font-semibold text-ink">This submission wasn&apos;t approved</h2>
            <p className="mt-1 text-sm text-ink-2">
              If you have questions, reach out at{' '}
              <a href="mailto:help@ai-compass.in" className="text-accent font-semibold hover:underline">help@ai-compass.in</a>.
            </p>
          </div>
        </div>
      </Card>
    )
  }

  if (status === 'pending') {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div>
            <h2 className="font-semibold text-ink">Under review</h2>
            <p className="mt-1 text-sm text-ink-2">We&apos;ll email you as soon as it&apos;s approved.</p>
          </div>
        </div>
      </Card>
    )
  }

  // approved
  return (
    <Card>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <h2 className="font-semibold text-ink">Approved{isLive ? ' and live' : ''}</h2>
          <p className="mt-1 text-sm text-ink-2">
            {isLive
              ? 'Your listing is live on AI Compass.'
              : liveAt
                ? `Your listing goes live on ${new Date(liveAt).toLocaleDateString()}.`
                : 'Your listing has been approved.'}
          </p>
          {submission.slug && (
            <Link to={`/tools/${submission.slug}`} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
              View your listing <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}

function ResendForm() {
  const [email, setEmail] = useState('')
  const [toolName, setToolName] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !toolName.trim()) return
    setSubmitting(true)
    try {
      await fetch('/api/v1/submissions/dashboard/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), tool_name: toolName.trim() }),
      })
    } catch {
      // best-effort — the endpoint always responds success to avoid leaking match state
    } finally {
      setSubmitting(false)
      setSent(true)
    }
  }

  if (sent) {
    return (
      <Card>
        <p className="text-sm text-ink-2">If that email and tool name match a submission on file, a fresh dashboard link is on its way.</p>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="font-semibold text-ink">Get a new dashboard link</h2>
      <p className="mt-1 text-sm text-muted">This link has expired or wasn&apos;t valid. Enter the email and tool name you submitted with.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <input
          type="text"
          required
          placeholder="Tool name"
          value={toolName}
          onChange={(e) => setToolName(e.target.value)}
          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? 'Sending…' : 'Send me the link'}
        </button>
      </form>
    </Card>
  )
}

function UpsellCard() {
  return (
    <Card className="border-accent/30 bg-accent-soft/15">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <h2 className="font-semibold text-ink">Unlock click &amp; view analytics</h2>
          <p className="mt-1 text-sm text-ink-2">
            Quick Review and Fast-Track submissions get real analytics on this dashboard — how many students clicked through,
            how many viewed your listing, and (Fast-Track) how you compare to the category average.
          </p>
          <Link
            to="/pricing"
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-accent/90"
          >
            See paid tiers
          </Link>
        </div>
      </div>
    </Card>
  )
}

function BenchmarkCard({ benchmark }) {
  if (!benchmark?.available) {
    return (
      <Card>
        <h2 className="font-semibold text-ink">Category benchmark</h2>
        <p className="mt-1 text-sm text-muted">Not enough other tools with click data in your category yet to compare against.</p>
      </Card>
    )
  }

  const {
    pct_vs_average: pct,
    your_clicks_30d: yours,
    category_avg_clicks_30d: avg,
    category,
    your_rank: rank,
    total_tools_in_category: totalTools,
  } = benchmark
  const positive = typeof pct === 'number' && pct >= 0

  return (
    <Card className={positive ? 'border-accent/30 bg-accent-soft/15' : ''}>
      <h2 className="font-semibold text-ink">Category benchmark — {category}</h2>
      {typeof rank === 'number' && totalTools && (
        <p className="mt-2 flex items-center gap-1.5 text-lg font-bold text-ink">
          <Trophy className="h-4.5 w-4.5 text-accent" /> #{rank} of {totalTools} in {category}
        </p>
      )}
      {typeof pct === 'number' ? (
        <p className="mt-2 text-2xl font-bold text-accent">
          {positive ? '+' : ''}{pct}% {positive ? 'more' : 'fewer'} clicks
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink-2">Category average is currently 0 clicks — nothing to compare against yet.</p>
      )}
      <p className="mt-1 text-xs text-muted">
        You: {yours} clicks (30d) &middot; Category average: {avg} clicks (30d)
      </p>
    </Card>
  )
}

function FeaturedStatusCard({ featured }) {
  // Keys come from resp["perks"], derived live from the catalog record — a
  // lapsed sponsorship greys these out instead of continuing to claim them.
  const items = [
    ['sponsored_badge', 'A labelled "Sponsored" badge on your card'],
    ['homepage_strip', 'Eligible for the homepage "Featured on AI Compass" strip'],
    ['above_free_placement', 'Placed above free listings in your category'],
  ]
  return (
    <Card>
      <h2 className="font-semibold text-ink">Fast-Track perks active</h2>
      <ul className="mt-3 space-y-2">
        {items.map(([key, label]) => (
          <li key={key} className="flex items-start gap-2 text-sm text-ink-2">
            <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${featured?.[key] ? 'text-accent' : 'text-muted-2'}`} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * Community placement delivery.
 *
 * Impressions are the number most directories never give a sponsor — without
 * them clicks have no denominator and there is nothing to judge a renewal on.
 * When there are no placements this card sells one instead of rendering
 * empty, because a submitter reading their own analytics is the warmest
 * possible audience for a slot.
 */
function SponsorshipCard({ sponsorship }) {
  if (!sponsorship) return null
  const { placements = [], impressions, clicks, ctr, window_days: windowDays } = sponsorship

  if (placements.length === 0) {
    return (
      <Card>
        <h2 className="flex items-center gap-1.5 font-semibold text-ink">
          <Sparkles className="h-4 w-4 text-accent" /> Community placements
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          You don&apos;t have an active placement on the community leaderboard page right now.
          Placements are capped and clearly labelled, and you get impressions, clicks and CTR back
          for every one.
        </p>
        <Link
          to="/sponsor"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          See placements &amp; availability
        </Link>
      </Card>
    )
  }

  return (
    <Card>
      <h2 className="flex items-center gap-1.5 font-semibold text-ink">
        <Sparkles className="h-4 w-4 text-accent" /> Community placements
      </h2>

      <ul className="mt-3 space-y-2">
        {placements.map((p) => (
          <li
            key={`${p.placement}-${p.starts_at}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-bg px-3 py-2.5"
          >
            <span className="text-sm font-semibold text-ink">{p.label}</span>
            <span className="text-xs text-muted">
              until {new Date(p.ends_at).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-bg px-3 py-3 text-center">
          <p className="text-lg font-extrabold tabular-nums text-ink">{impressions}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Impressions
          </p>
        </div>
        <div className="rounded-xl border border-line bg-bg px-3 py-3 text-center">
          <p className="text-lg font-extrabold tabular-nums text-ink">{clicks}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Clicks
          </p>
        </div>
        <div className="rounded-xl border border-line bg-bg px-3 py-3 text-center">
          <p className="text-lg font-extrabold tabular-nums text-ink">{ctr}%</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">CTR</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Last {windowDays} days. An impression is counted once per visitor when your unit actually
        enters the viewport — not once per page load — so this CTR is the real one.
      </p>
    </Card>
  )
}

export default function SubmissionDashboardPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  // Session-based access (Prompt 3), additive to the token link the welcome
  // email sends — the Growth Hub's tool list links here with submission_id
  // instead of a token, and the backend authorizes it against the logged-in
  // session's founder_user_id (GET /api/v1/submissions/dashboard).
  const submissionId = searchParams.get('submission_id') || ''
  const hasAccess = !!token || !!submissionId
  const [state, setState] = useState({ loading: hasAccess, error: hasAccess ? null : 'missing_token', data: null })

  useEffect(() => {
    if (!hasAccess) {
      return
    }
    let cancelled = false
    setState({ loading: true, error: null, data: null })
    const query = token
      ? `token=${encodeURIComponent(token)}`
      : `submission_id=${encodeURIComponent(submissionId)}`
    fetch(`/api/v1/submissions/dashboard?${query}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setState({ loading: false, error: body.error || 'error', data: null })
          return
        }
        setState({ loading: false, error: null, data: body })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: 'network', data: null })
      })
    return () => {
      cancelled = true
    }
  }, [token, submissionId, hasAccess])

  const { loading, error, data } = state

  return (
    <>
      <Helmet>
        <title>Your submission dashboard | AI Compass</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Submission dashboard</span>
          <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
            {data?.submission?.name || 'Your listing'}
          </h1>

          <div className="mt-8 space-y-5">
            {loading && (
              <Card><p className="text-sm text-muted">Loading…</p></Card>
            )}

            {!loading && error && <ResendForm />}

            {!loading && !error && data && (
              <>
                <StatusBanner submission={data.submission} />

                {data.tier === 'free' && <UpsellCard />}

                {data.analytics && (
                  <>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <StatTile label="Total clicks" value={data.analytics.total_clicks} />
                      <StatTile label="Total views" value={data.analytics.total_views} />
                      <StatTile label="Clicks (30d)" value={data.analytics.clicks_30d} />
                      <StatTile label="Views (30d)" value={data.analytics.views_30d} />
                    </div>
                    <EngagementRow analytics={data.analytics} />
                    <Card>
                      <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-ink">
                        <TrendingUp className="h-4 w-4 text-accent" /> Last 14 days
                      </h2>
                      <TrendChart data={data.analytics.daily_trend} />
                    </Card>
                  </>
                )}

                {data.tier === 'sponsored' && (
                  <>
                    <BenchmarkCard benchmark={data.benchmark} />
                    <FeaturedStatusCard featured={data.perks} />
                  </>
                )}

                <SponsorshipCard sponsorship={data.sponsorship} />

                {data.tier === 'quick' && !data.analytics && (
                  <Card>
                    <div className="flex items-start gap-3">
                      <MousePointerClick className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                      <p className="text-sm text-ink-2">Analytics will appear here once your listing is approved and live.</p>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>

          <p className="mt-10 text-center text-xs text-muted">
            Questions?{' '}
            <Link to="/contact" className="text-accent font-semibold hover:underline">Contact us</Link>.
          </p>
        </div>
      </div>
    </>
  )
}
