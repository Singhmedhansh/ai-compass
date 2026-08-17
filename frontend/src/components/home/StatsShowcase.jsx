import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, MousePointerClick, Eye, Activity, BarChart3 } from 'lucide-react'

export default function StatsShowcase() {
  const [activeTab, setActiveTab] = useState('posthog') // 'posthog' | 'gsc'
  const [hoveredPoint, setHoveredPoint] = useState(null)

  // PostHog Data (Session Duration & Bounce Rate removed)
  const posthogMetrics = [
    { label: 'Unique Visitors', value: '5.12K', change: '+402.2k%', icon: Users },
    { label: 'Page Views', value: '6.77K', change: '+85.2k%', icon: Eye },
    { label: 'Sessions', value: '5.4K', change: '+419.9k%', icon: Activity }
  ]

  const posthogPaths = [
    { path: '/', visitors: 1068, views: 1221, pct: 100 },
    { path: '/alternatives/chatgpt', visitors: 713, views: 717, pct: 67 },
    { path: '/ai-tool-finder', visitors: 432, views: 602, pct: 40 },
    { path: '/tools', visitors: 259, views: 314, pct: 24 },
    { path: '/best-free-ai-tools', visitors: 187, views: 194, pct: 18 }
  ]

  const posthogChartPoints = [
    { x: 50, y: 176, label: 'May', value: '300 visitors' },
    { x: 180, y: 120, label: 'June', value: '1,000 visitors' },
    { x: 310, y: 36, label: 'July', value: '2,050 visitors' },
    { x: 450, y: 52, label: 'August', value: '1,821 visitors' }
  ]

  // Google Search Console Data
  const gscMetrics = [
    { label: 'Total Clicks', value: '3.28K', change: 'Growth', icon: MousePointerClick },
    { label: 'Total Impressions', value: '132K', change: 'High', icon: Eye },
    { label: 'Average CTR', value: '2.5%', change: 'Healthy', icon: Users },
    { label: 'Average Position', value: '12.4', change: 'Top 12', icon: BarChart3 }
  ]

  const gscQueries = [
    { query: 'compass ai chatgpt', clicks: 303, impressions: 2310, pct: 100 },
    { query: 'compass chatgpt alternative', clicks: 142, impressions: 672, pct: 47 },
    { query: 'compass chatgpt alternative free', clicks: 88, impressions: 343, pct: 29 },
    { query: 'compass like chatgpt', clicks: 48, impressions: 380, pct: 16 },
    { query: 'compass ai chatgpt alternative', clicks: 45, impressions: 280, pct: 15 }
  ]

  const gscChartPoints = [
    { x: 50, y: 175, label: 'May', clicks: 45, impressions: 2200 },
    { x: 130, y: 155, label: 'Early Jun', clicks: 85, impressions: 4500 },
    { x: 210, y: 130, label: 'Late Jun', clicks: 140, impressions: 8900 },
    { x: 290, y: 85, label: 'Early Jul', clicks: 420, impressions: 24000 },
    { x: 370, y: 50, label: 'Late Jul', clicks: 890, impressions: 38000 },
    { x: 450, y: 22, label: 'August', clicks: 1070, impressions: 32400 }
  ]

  return (
    <section id="stats-showcase" className="py-12 md:py-20 bg-bg-sunk/15 border-t border-b border-line/45">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          04 / Growth & trust
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Verification & Platform Growth
            </h2>
            <p className="mt-2 text-sm text-ink-2 max-w-2xl font-normal leading-relaxed">
              Transparency builds trust. Instead of listing arbitrary rankings, we display our verified, interactive platform metrics compiled from PostHog Analytics and Google Search Console.
            </p>
          </div>

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
                      {/* PostHog Line Path */}
                      <path
                        d="M 50 176 L 180 120 L 310 36 L 450 52"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Gradient Fill under line */}
                      <path
                        d="M 50 200 L 50 176 L 180 120 L 310 36 L 450 52 L 450 200 Z"
                        fill="url(#posthog-grad)"
                        opacity="0.1"
                      />
                    </>
                  ) : (
                    <>
                      {/* GSC Line Path */}
                      <path
                        d="M 50 175 L 130 155 L 210 130 L 290 85 L 370 50 L 450 22"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* GSC Impressions Path */}
                      <path
                        d="M 50 160 L 130 140 L 210 110 L 290 60 L 370 30 L 450 15"
                        fill="none"
                        stroke="purple"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        opacity="0.65"
                      />
                      {/* Gradient Fill under line */}
                      <path
                        d="M 50 200 L 50 175 L 130 155 L 210 130 L 290 85 L 370 50 L 450 22 L 450 200 Z"
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
                        : `${hoveredPoint.clicks} clicks / ${hoveredPoint.impressions} imps`}
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
