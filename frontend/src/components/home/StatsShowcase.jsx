import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, useTransform } from 'framer-motion'
import {
  Users, MousePointerClick, Eye, Activity, BarChart3,
  UserPlus, Sparkles, CalendarDays, TrendingUp
} from 'lucide-react'

import { useCatalogStats } from '../../hooks/useCatalogStats'
import { useCountUp, useScrollReveal } from '../../lib/motion'
import SectionHeader from './SectionHeader'

// Chart geometry. The SVG is a fixed 500x200 viewBox; points are spread
// evenly across PLOT_X and scaled into PLOT_Y against the largest month, so
// the line redraws itself whenever PostHog returns a new series.
const PLOT_X = { start: 50, end: 450 }
const PLOT_Y = { top: 28, bottom: 186 }

function compactNumber(n) {
  if (n === null || n === undefined) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(2).replace(/\.?0+$/, '')}K`
  return String(n)
}

// Growth badge: first month of the series vs. the running total.
function growthLabel(series) {
  if (!series || series.length < 2) return 'Growth'
  const first = series[0].visitors
  const last = series[series.length - 1].visitors
  if (!first || last <= first) return 'Growth'
  const pct = ((last - first) / first) * 100
  return pct >= 1000 ? `+${(pct / 1000).toFixed(1)}k%` : `+${Math.round(pct)}%`
}

// Spread a series evenly across PLOT_X and scale `pick` into PLOT_Y against
// the series' own peak, so each line fills the box regardless of its units.
function toScaledPoints(series, pick) {
  if (!series || series.length === 0) return []
  const peak = Math.max(...series.map(pick), 1)
  const span = series.length > 1 ? series.length - 1 : 1
  return series.map((point, idx) => ({
    x: PLOT_X.start + ((PLOT_X.end - PLOT_X.start) * idx) / span,
    y: PLOT_Y.bottom - (PLOT_Y.top < PLOT_Y.bottom
      ? (PLOT_Y.bottom - PLOT_Y.top) * (pick(point) / peak)
      : 0)
  }))
}

function linePath(points) {
  return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ')
}

function areaPath(points, path) {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `M ${first.x.toFixed(1)} 200 ${path.replace(/^M/, 'L')} L ${last.x.toFixed(1)} 200 Z`
}

function toChartPoints(series) {
  if (!series || series.length === 0) return []
  return toScaledPoints(series, (s) => s.visitors).map((pt, idx) => ({
    ...pt,
    label: series[idx].label,
    value: `${series[idx].visitors.toLocaleString()} visitors`
  }))
}

// One trust-bar tile. Each tile owns its own count-up, so the number ticks
// gradually into place the way the catalog figure in CurationDiscipline does —
// and re-animates from wherever it is when the live fetch replaces the
// fallback, rather than snapping.
// Icon is rendered as <Icon /> below; eslint-plugin-react is missing from the
// config, so the JSX usage isn't seen and the param reads as unused.
// eslint-disable-next-line no-unused-vars
function CountStat({ label, value, suffix = '', hint, icon: Icon, inView }) {
  const count = useCountUp(value, { enabled: inView, duration: 1.8 })
  const formatted = useTransform(count, (v) => Math.round(v).toLocaleString())

  return (
    <div className="bg-bg p-4 md:p-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-normal uppercase tracking-wider text-muted-2">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-muted-2" />
      </div>
      <div className="text-[26px] font-semibold leading-none tracking-tight tabular-nums text-ink md:text-[32px]">
        <motion.span aria-label={`${value.toLocaleString()}${suffix}`}>{formatted}</motion.span>
        {suffix}
      </div>
      <div className="mt-1.5 text-[12px] leading-[1.45] text-muted">{hint}</div>
    </div>
  )
}

// Last hand-recorded snapshot. Rendered for the instant before the fetch
// resolves, and kept if the API is unreachable, so the section is never blank.
const FALLBACK_STATS = {
  totals: {
    visitors: 11800,
    views: 16600,
    sessions: 12700,
    monthly_visitors: 5088,
    avg_daily_visitors: 269
  },
  series: [
    { label: 'May', visitors: 300 },
    { label: 'June', visitors: 900 },
    { label: 'July', visitors: 2000 },
    { label: 'August', visitors: 5088 },
    { label: 'September', visitors: 3497 }
  ],
  paths: [
    { path: '/', visitors: 1919, views: 2257 },
    { path: '/alternatives/chatgpt', visitors: 1043, views: 1095 },
    { path: '/ai-tool-finder', visitors: 743, views: 1108 },
    { path: '/best-free-ai-tools', visitors: 401, views: 438 },
    { path: '/tools', visitors: 350, views: 422 }
  ]
}

// Google Search Console, the same 3-month window the Performance report shows
// (11 Jun - 10 Sep 2026). Each point is the average day of a ~15-day slice, so
// the six of them add back up to the 6.87K clicks / 225K impressions in the
// headline tiles. Hand-recorded; GSC has no live feed here the way PostHog does.
const GSC_SERIES = [
  { label: 'Jun', clicks: 25, impressions: 800 },
  { label: 'Late Jun', clicks: 30, impressions: 1000 },
  { label: 'Mid Jul', clicks: 50, impressions: 1800 },
  { label: 'Late Jul', clicks: 70, impressions: 2400 },
  { label: 'Mid Aug', clicks: 85, impressions: 2900 },
  { label: 'Sep', clicks: 175, impressions: 5400 }
]

export default function StatsShowcase() {
  const [activeTab, setActiveTab] = useState('posthog') // 'posthog' | 'gsc'
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const [stats, setStats] = useState(FALLBACK_STATS)

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || ''
    let cancelled = false
    async function fetchStats() {
      try {
        const response = await fetch(`${API}/api/v1/platform-stats`)
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled && data && data.totals) setStats(data)
      } catch {
        // Keep the fallback snapshot on any network failure.
      }
    }
    fetchStats()
    return () => { cancelled = true }
  }, [])

  const growth = useMemo(() => growthLabel(stats.series), [stats.series])

  // Trust bar: the four numbers a first-time visitor actually weighs — how
  // many people signed up, how big the catalog is, and how much traffic the
  // site carries. Users and tools come from our own database via the same
  // payload; the two audience figures are PostHog's rolling 30 days.
  const [trustRef, trustInView] = useScrollReveal({ threshold: 0.25 })
  const { totalTools: catalogTools } = useCatalogStats()

  const trustStats = useMemo(() => {
    const t = stats.totals || {}
    const tools = t.total_tools ?? catalogTools
    return [
      t.registered_users
        ? {
            key: 'users',
            label: 'Registered members',
            value: t.registered_users,
            hint: 'accounts with saved stacks & favourites',
            icon: UserPlus
          }
        : null,
      tools
        ? {
            key: 'tools',
            label: 'Tools live',
            value: tools,
            hint: 'hand-tested, none pay to rank',
            icon: Sparkles
          }
        : null,
      t.monthly_visitors
        ? {
            key: 'monthly',
            label: 'Monthly visitors',
            value: t.monthly_visitors,
            hint: 'unique people · rolling 30 days',
            icon: TrendingUp
          }
        : null,
      t.avg_daily_visitors
        ? {
            key: 'daily',
            label: 'Avg. daily readers',
            value: t.avg_daily_visitors,
            hint: 'average of the last 30 days',
            icon: CalendarDays
          }
        : null
    ].filter(Boolean)
  }, [stats.totals, catalogTools])

  const posthogMetrics = [
    { label: 'Unique Visitors', value: compactNumber(stats.totals.visitors), change: growth, icon: Users },
    { label: 'Page Views', value: compactNumber(stats.totals.views), change: growth, icon: Eye },
    { label: 'Sessions', value: compactNumber(stats.totals.sessions), change: growth, icon: Activity }
  ]

  const posthogPaths = useMemo(() => {
    const paths = stats.paths || []
    const peak = Math.max(...paths.map((p) => p.visitors), 1)
    return paths.map((p) => ({ ...p, pct: Math.round((p.visitors / peak) * 100) }))
  }, [stats.paths])

  const posthogChartPoints = useMemo(() => toChartPoints(stats.series), [stats.series])

  const posthogLinePath = useMemo(() => linePath(posthogChartPoints), [posthogChartPoints])

  const posthogAreaPath = useMemo(
    () => areaPath(posthogChartPoints, posthogLinePath),
    [posthogChartPoints, posthogLinePath]
  )

  // Google Search Console Data
  const gscMetrics = [
    { label: 'Total Clicks', value: '6.87K', change: 'Growth', icon: MousePointerClick },
    { label: 'Total Impressions', value: '225K', change: 'High', icon: Eye },
    { label: 'Average CTR', value: '3.1%', change: 'Healthy', icon: Users },
    { label: 'Average Position', value: '12.2', change: 'Top 12', icon: BarChart3 }
  ]

  const gscQueries = [
    { query: 'compass ai chatgpt', clicks: 541, impressions: 2761, pct: 100 },
    { query: 'compass chatgpt alternative', clicks: 152, impressions: 691, pct: 28 },
    { query: 'compass chatgpt', clicks: 136, impressions: 1114, pct: 25 },
    { query: 'compass chatgpt alternative free', clicks: 113, impressions: 399, pct: 21 },
    { query: 'compass like chatgpt', clicks: 75, impressions: 419, pct: 14 }
  ]

  // Clicks drive the solid line and the hover nodes; impressions get their own
  // scale, so the dashed line stays readable next to a much smaller number.
  const gscChartPoints = useMemo(
    () => toScaledPoints(GSC_SERIES, (p) => p.clicks).map((pt, idx) => ({ ...pt, ...GSC_SERIES[idx] })),
    []
  )

  const gscLinePath = useMemo(() => linePath(gscChartPoints), [gscChartPoints])

  const gscAreaPath = useMemo(() => areaPath(gscChartPoints, gscLinePath), [gscChartPoints, gscLinePath])

  const gscImpressionPath = useMemo(
    () => linePath(toScaledPoints(GSC_SERIES, (p) => p.impressions)),
    []
  )

  return (
    <section id="stats-showcase" className="py-16 md:py-24 bg-bg-sunk/15 border-t border-b border-line/45">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <SectionHeader
            index="05"
            label="Growth & trust"
            title="Verification and platform growth."
            lede="Transparency builds trust. Instead of listing arbitrary rankings, we display our verified, interactive platform metrics compiled from PostHog Analytics and Google Search Console."
          />

          {/* Toggle buttons */}
          <div className="flex rounded-xl bg-bg-sunk border border-line p-1 self-start md:self-auto shrink-0">
            <button
              onClick={() => {
                setActiveTab('posthog')
                setHoveredPoint(null)
              }}
              className={`rounded-lg px-4 py-1.5 text-xs transition duration-200 ${
                activeTab === 'posthog'
                  ? 'bg-bg text-ink shadow-sm font-medium'
                  : 'text-muted hover:text-ink font-normal'
              }`}
            >
              PostHog Web Analytics
            </button>
            <button
              onClick={() => {
                setActiveTab('gsc')
                setHoveredPoint(null)
              }}
              className={`rounded-lg px-4 py-1.5 text-xs transition duration-200 ${
                activeTab === 'gsc'
                  ? 'bg-bg text-ink shadow-sm font-medium'
                  : 'text-muted hover:text-ink font-normal'
              }`}
            >
              Google Search Console
            </button>
          </div>
        </div>

        {/* Trust bar — headline counters, counted up on scroll */}
        {trustStats.length > 0 && (
          <div
            ref={trustRef}
            aria-label="Platform totals"
            className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4"
          >
            {trustStats.map((stat) => (
              <CountStat key={stat.key} {...stat} inView={trustInView} />
            ))}
          </div>
        )}

        {/* Dashboard wrapper */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Metric Cards */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span className="text-[10px] font-medium text-muted tracking-wider uppercase">
                {activeTab === 'posthog' ? 'Live Audience Metrics' : 'Organic Traffic Stats'}
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4"
              >
                {(activeTab === 'posthog' ? posthogMetrics : gscMetrics).map((m, idx) => {
                  const Icon = m.icon
                  return (
                    <div 
                      key={idx} 
                      className="rounded-2xl border border-line bg-bg-elev p-4 shadow-sm hover:border-accent/40 transition-colors"
                    >
                      <div className="flex items-center justify-between text-muted mb-2">
                        <span className="text-xs font-normal text-muted-2 truncate pr-1">{m.label}</span>
                        <Icon className="h-4 w-4 shrink-0 text-muted-2" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-semibold text-ink">{m.value}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          m.change.startsWith('+') || m.change === 'Growth' ? 'bg-accent-soft text-accent-ink' : 'bg-bg-sunk text-muted'
                        }`}>
                          {m.change}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right Column: Interactive Chart and Table */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            
            {/* Interactive SVG Chart */}
            <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-semibold text-ink tracking-wider">
                  {activeTab === 'posthog' ? 'Monthly Unique Visitors' : 'Google Search Click Growth'}
                </span>
                <span className="text-[10px] text-muted font-normal">Hover nodes for insights</span>
              </div>

              <div className="relative h-48 w-full border-b border-l border-line/75 rounded-bl-lg bg-bg-sunk/10 p-2">
                <svg className="w-full h-full" viewBox="0 0 500 200" preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="50" x2="500" y2="50" stroke="var(--line)" strokeWidth="0.5" strokeDasharray="4 4" />
                  <line x1="0" y1="100" x2="500" y2="100" stroke="var(--line)" strokeWidth="0.5" strokeDasharray="4 4" />
                  <line x1="0" y1="150" x2="500" y2="150" stroke="var(--line)" strokeWidth="0.5" strokeDasharray="4 4" />

                  {activeTab === 'posthog' ? (
                    <>
                      {/* PostHog Line Path — derived from the live series */}
                      <path
                        d={posthogLinePath}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Gradient Fill under line */}
                      <path
                        d={posthogAreaPath}
                        fill="url(#posthog-grad)"
                        opacity="0.1"
                      />
                    </>
                  ) : (
                    <>
                      {/* GSC clicks */}
                      <path
                        d={gscLinePath}
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* GSC impressions, on their own scale */}
                      <path
                        d={gscImpressionPath}
                        fill="none"
                        stroke="purple"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        opacity="0.65"
                      />
                      {/* Gradient Fill under line */}
                      <path
                        d={gscAreaPath}
                        fill="url(#posthog-grad)"
                        opacity="0.08"
                      />
                    </>
                  )}

                  {/* Gradient Definition */}
                  <defs>
                    <linearGradient id="posthog-grad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="var(--accent)" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Nodes rendering */}
                {(activeTab === 'posthog' ? posthogChartPoints : gscChartPoints).map((pt, idx) => (
                  <div
                    key={idx}
                    className="absolute group/node cursor-pointer transform -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${(pt.x / 500) * 100}%`, top: `${(pt.y / 200) * 100}%` }}
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-accent bg-bg shadow-sm transition hover:scale-125 hover:bg-accent" />
                    <span className="absolute top-5 left-1/2 transform -translate-x-1/2 text-[9px] font-medium text-muted bg-bg px-1 rounded shadow-sm border border-line whitespace-nowrap">
                      {pt.label}
                    </span>
                  </div>
                ))}

                {/* Custom Tooltip */}
                {hoveredPoint && (
                  <div className="absolute top-2 left-1/2 transform -translate-x-1/2 rounded-lg bg-ink text-bg px-3 py-1.5 text-xs shadow-xl flex flex-col items-center gap-0.5 border border-line z-30">
                    <span className="font-medium text-bg">{hoveredPoint.label}</span>
                    <span className="text-[10px] opacity-90">
                      {activeTab === 'posthog' 
                        ? hoveredPoint.value 
                        : `${hoveredPoint.clicks} clicks / ${hoveredPoint.impressions.toLocaleString()} imps · avg day`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Top Pages/Queries lists */}
            <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-ink tracking-wider mb-4">
                {activeTab === 'posthog' ? 'Most Visited Path Details' : 'Primary Organic Keywords'}
              </h3>

              <div className="space-y-4">
                {(activeTab === 'posthog' ? posthogPaths : gscQueries).map((row, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-normal">
                      <span className="font-sans text-ink-2 truncate pr-4">
                        {activeTab === 'posthog' ? row.path : row.query}
                      </span>
                      <span className="text-muted-2 shrink-0">
                        {activeTab === 'posthog' 
                          ? `${row.visitors} visitors · ${row.views} views`
                          : `${row.clicks} clicks · ${row.impressions} imps`}
                      </span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-2 w-full bg-bg-sunk rounded-full overflow-hidden border border-line/30">
                      <div 
                        className="h-full bg-accent rounded-full opacity-85 transition-all duration-500" 
                        style={{ width: `${row.pct}%` }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  )
}
