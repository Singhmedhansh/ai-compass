import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, RefreshCw, Users } from 'lucide-react'

// Traffic counted on our own server, for the Overview tab.
//
// This is the panel that answers "how many people visited today" without
// asking GA4 or PostHog, both of which only see a visitor after they click
// Accept on the cookie banner. When that gate shipped (2026-09-13) reported
// traffic fell ~77% overnight while Cloudflare's edge numbers stayed flat:
// nothing had happened to the traffic, only to the measurement. See
// app/traffic.py for the counter and why it needs no consent.
//
// Two series on ONE y-axis. Views and unique visitors are the same unit
// (counts of the same population) and always within a small factor of each
// other, so they share a scale honestly — a second axis would let the lines
// cross wherever the scales happened to put them and invent a story.
//
// Unique visitors takes the accent because it is the number decisions get
// made on; views takes a neutral ink tone. Deliberately not a second hue:
// this app's design system defines one categorical accent, the same call
// TrendChart on the founder dashboard already made. Checked rather than
// assumed — the accent/neutral pair separates at ΔE 24.4 (light) and 12.0
// (dark) under simulated colour-vision deficiency, both well clear of the
// 8 threshold, and both clear 3:1 against their surface.

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

const CHART_HEIGHT = 220
const CHART_WIDTH = 720
const PAD = { top: 14, right: 14, bottom: 26, left: 38 }

function fmtDay(iso) {
  // "Sep 14" — the axis needs a date, not a timestamp.
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// `icon` is a rendered element, not a component reference: eslint's
// no-unused-vars does not see `<Icon />` as a use of a destructured prop
// (the same blind spot AdminPage documents for <MotionDiv>), and passing
// the element sidesteps it without a disable comment.
function StatTile({ icon, label, value, hint }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted">
        {icon} {label}
      </p>
      <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-2">{hint}</p>}
    </div>
  )
}

function TrafficChart({ data }) {
  const [hoverIdx, setHoverIdx] = useState(null)

  const { visitorsPath, viewsPath, points, maxVal, ticks } = useMemo(() => {
    const n = data.length
    const max = Math.max(1, ...data.map((d) => Math.max(d.unique_visitors, d.views)))
    const innerW = CHART_WIDTH - PAD.left - PAD.right
    const innerH = CHART_HEIGHT - PAD.top - PAD.bottom
    const x = (i) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = (v) => PAD.top + innerH - (v / max) * innerH
    const toPath = (key) =>
      data
        .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`)
        .join(' ')

    // Three gridlines is enough to read a level off without the grid
    // competing with the data.
    const tickVals = [0, Math.round(max / 2), max]
    return {
      visitorsPath: toPath('unique_visitors'),
      viewsPath: toPath('views'),
      points: data.map((d, i) => ({
        ...d,
        cx: x(i),
        cyVisitors: y(d.unique_visitors),
        cyViews: y(d.views),
      })),
      maxVal: max,
      ticks: [...new Set(tickVals)].map((v) => ({ v, y: y(v) })),
    }
  }, [data])

  const hovered = hoverIdx != null ? points[hoverIdx] : null
  const bandW = CHART_WIDTH / Math.max(points.length, 1)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Unique visitors and page views per day over the last ${data.length} days`}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {ticks.map((t) => (
          <g key={t.v}>
            <line
              x1={PAD.left}
              x2={CHART_WIDTH - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--line)"
              strokeWidth="1"
            />
            <text x={PAD.left - 8} y={t.y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted-2)">
              {t.v}
            </text>
          </g>
        ))}

        <path d={viewsPath} fill="none" stroke="var(--ink-2)" strokeWidth="2" strokeOpacity="0.45" strokeLinejoin="round" />
        <path d={visitorsPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />

        {points.map((p, i) => (
          <rect
            key={p.day}
            x={p.cx - bandW / 2}
            y={0}
            width={bandW}
            height={CHART_HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
          />
        ))}

        {hovered && (
          <>
            <line
              x1={hovered.cx}
              x2={hovered.cx}
              y1={PAD.top}
              y2={CHART_HEIGHT - PAD.bottom}
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
            {/* 2px surface ring so an overlapping pair stays two marks. */}
            <circle cx={hovered.cx} cy={hovered.cyViews} r="4.5" fill="var(--ink-2)" fillOpacity="0.55" stroke="var(--bg-elev)" strokeWidth="2" />
            <circle cx={hovered.cx} cy={hovered.cyVisitors} r="4.5" fill="var(--accent)" stroke="var(--bg-elev)" strokeWidth="2" />
          </>
        )}

        {points.length > 0 && (
          <>
            <text x={PAD.left} y={CHART_HEIGHT - 8} fontSize="10" fill="var(--muted-2)">
              {fmtDay(points[0].day)}
            </text>
            {points.length > 1 && (
              <text x={CHART_WIDTH - PAD.right} y={CHART_HEIGHT - 8} textAnchor="end" fontSize="10" fill="var(--muted-2)">
                {fmtDay(points[points.length - 1].day)}
              </text>
            )}
          </>
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-line bg-bg-elev px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `min(${(hovered.cx / CHART_WIDTH) * 100}%, 74%)` }}
        >
          <p className="font-semibold text-ink">{fmtDay(hovered.day)}</p>
          {/* The dot carries identity; the number stays in ink. A value
              painted in the series colour reads as a status, not a series. */}
          <p className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
            {hovered.unique_visitors} visitors
          </p>
          <p className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full opacity-50" style={{ backgroundColor: 'var(--ink-2)' }} />
            {hovered.views} views
          </p>
        </div>
      )}

      <div className="mt-2 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} /> Unique visitors
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full opacity-50" style={{ backgroundColor: 'var(--ink-2)' }} /> Page views
        </span>
        <span className="ml-auto">Peak {maxVal}/day</span>
      </div>
    </div>
  )
}

export default function TrafficPanel({ api }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  // Every setState here happens after an await, never synchronously in the
  // effect body — that is what react-hooks/set-state-in-effect is guarding
  // against. The spinner is switched on by whatever triggered the reload
  // (see request()) rather than by the effect. Same shape as the loader in
  // AdminPage itself.
  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const d = await api(`/api/v1/admin/traffic?days=${days}`)
        if (!on) return
        setData(d)
        setErr('')
      } catch (e) {
        if (!on) return
        setData(null)
        setErr(e.message || 'Could not load traffic.')
      } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [api, days, reloadKey])

  // A failed load must not leave the panel showing the previous window's
  // numbers under the new range label.
  const request = useCallback((nextDays) => {
    setLoading(true)
    if (nextDays != null && nextDays !== days) setDays(nextDays)
    else setReloadKey((k) => k + 1)
  }, [days])

  const daily = data?.daily || []

  // Today is a PARTIAL day and must never be compared against whole ones.
  // Reading a part-day as a full one is the exact mistake that made this
  // panel necessary: a 22-vs-97 "collapse" on /best-free-ai-tools was partly
  // a day that was only a few hours old.
  const todayIso = new Date().toISOString().slice(0, 10)
  const complete = daily.filter((d) => d.day !== todayIso)
  const today = daily.find((d) => d.day === todayIso)
  const lastFull = complete[complete.length - 1]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Traffic</h2>
          <p className="text-xs text-muted">
            Counted on our server — includes visitors who declined cookies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => request(r.days)}
                className={`rounded-md px-3 py-1 text-xs font-medium ${
                  days === r.days ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => request()}
            disabled={loading}
            title="Refresh"
            className="rounded-md border border-line-strong p-1.5 text-ink-2 transition hover:bg-bg-sunk disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {err && (
        <p className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          {err}
        </p>
      )}

      {!err && !loading && daily.length === 0 && (
        <p className="rounded-lg border border-line bg-bg px-3 py-6 text-center text-sm text-muted">
          No traffic recorded yet. The counter starts with the next page view;
          the first full day of data lands tomorrow.
        </p>
      )}

      {daily.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              icon={<Users className="h-3.5 w-3.5" />}
              label="Visitors yesterday"
              value={lastFull ? lastFull.unique_visitors : '—'}
              hint={lastFull ? `${fmtDay(lastFull.day)} · last complete day` : 'No complete day yet'}
            />
            <StatTile
              icon={<Users className="h-3.5 w-3.5" />}
              label="Visitors today"
              value={today ? today.unique_visitors : '—'}
              hint="Partial — day still running"
            />
            <StatTile
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Views yesterday"
              value={lastFull ? lastFull.views : '—'}
              hint={lastFull && lastFull.unique_visitors
                ? `${(lastFull.views / lastFull.unique_visitors).toFixed(1)} pages per visitor`
                : null}
            />
            <StatTile
              icon={<Eye className="h-3.5 w-3.5" />}
              label={`Views · ${days}d`}
              value={data?.totals?.views ?? '—'}
              hint="Whole window, today included"
            />
          </div>

          <div className="rounded-xl border border-line bg-bg p-4">
            <TrafficChart data={daily} />
          </div>

          {data?.top_paths?.length > 0 && (
            <div className="rounded-xl border border-line bg-bg p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">
                Top pages · last {Math.min(days, 30)} days
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="px-3 py-2 font-semibold">Page</th>
                      <th className="px-3 py-2 text-right font-semibold">Visitors</th>
                      <th className="px-3 py-2 text-right font-semibold">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_paths.map((p) => (
                      <tr key={p.path} className="border-b border-line/60">
                        <td className="px-3 py-2 font-medium text-ink">
                          <a
                            href={p.path}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-accent hover:underline"
                          >
                            {p.path}
                          </a>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-2">{p.unique_visitors}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-ink-2">{p.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-2">
            No cookie, no localStorage, no third party. Addresses are hashed with
            a salt that rotates at midnight UTC and never stored, so a visitor
            cannot be followed across days — which is also why daily figures
            cannot be summed into a unique total for the window.
          </p>
        </>
      )}
    </div>
  )
}
