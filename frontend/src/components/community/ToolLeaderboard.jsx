import { ArrowDown, ArrowUp, Minus, MessageSquare, Sparkles, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'

import ToolLogo from '../ui/ToolLogo'

// Rank 1-3 get a metal treatment; everything below is a plain tabular number.
// Three medals is the whole point — a board where twenty rows all look
// special has nothing left to award.
const MEDALS = {
  1: { ring: 'ring-amber-400/60', bg: 'bg-amber-400/15', text: 'text-amber-700 dark:text-amber-300', label: 'Gold' },
  2: { ring: 'ring-slate-400/50', bg: 'bg-slate-400/15', text: 'text-slate-600 dark:text-slate-300', label: 'Silver' },
  3: { ring: 'ring-orange-500/45', bg: 'bg-orange-500/12', text: 'text-orange-700 dark:text-orange-300', label: 'Bronze' },
}

function RankBadge({ rank }) {
  const medal = MEDALS[rank]
  if (!medal) {
    return (
      <span className="w-8 shrink-0 text-center text-sm font-bold tabular-nums text-muted-2">
        {rank}
      </span>
    )
  }
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold tabular-nums ring-2 ${medal.ring} ${medal.bg} ${medal.text}`}
      title={`${medal.label} — #${rank} this period`}
    >
      {rank}
    </span>
  )
}

function Movement({ movement, isNew }) {
  if (isNew) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
        <Sparkles className="h-3 w-3" aria-hidden="true" /> New
      </span>
    )
  }
  if (!movement) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted-2" title="No change since last period">
        <Minus className="h-3 w-3" aria-hidden="true" />
      </span>
    )
  }
  const up = movement > 0
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(movement)} ${Math.abs(movement) === 1 ? 'place' : 'places'} since last period`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {Math.abs(movement)}
    </span>
  )
}

function LeaderRow({ row, topScore }) {
  // Score bar is relative to the leader, so the shape of the week is legible
  // at a glance — a runaway winner looks different from a tight race.
  const share = topScore > 0 ? Math.max(4, Math.round((row.score / topScore) * 100)) : 0
  const isPodium = row.rank <= 3

  return (
    <li
      className={`relative overflow-hidden rounded-2xl border transition ${
        isPodium
          ? 'border-line-strong bg-bg-elev shadow-sm'
          : 'border-line bg-bg-elev/60 hover:border-line-strong'
      }`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-accent/[0.07]"
        style={{ width: `${share}%` }}
      />
      <div className="relative flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
        <RankBadge rank={row.rank} />
        <ToolLogo tool={row} size={isPodium ? 44 : 36} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/tools/${row.slug}`}
              className={`truncate font-bold text-ink transition hover:text-accent ${isPodium ? 'text-base' : 'text-sm'}`}
            >
              {row.name}
            </Link>
            <Movement movement={row.movement} isNew={row.is_new} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {row.tagline || row.category || 'No description yet.'}
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-4 text-xs text-muted sm:flex">
          <span className="inline-flex items-center gap-1 tabular-nums" title="Community upvotes this period">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
            {row.upvotes}
          </span>
          <Link
            to={`/community?tool_slug=${encodeURIComponent(row.slug)}`}
            className="inline-flex items-center gap-1 tabular-nums transition hover:text-accent"
            title="Discussion on this tool"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {row.comments}
          </Link>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-extrabold tabular-nums text-ink">{row.score}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">pts</div>
        </div>
      </div>
    </li>
  )
}

export default function ToolLeaderboard({ rows = [], sponsoredRows = [], loading = false, SponsorRow }) {
  if (loading) {
    return (
      <ul className="space-y-2" aria-busy="true" aria-label="Loading leaderboard">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <li key={`lb-skeleton-${i}`} className="h-16 animate-pulse rounded-2xl border border-line bg-bg-sunk" />
        ))}
      </ul>
    )
  }

  const topScore = rows.length ? rows[0].score : 0

  return (
    <div className="space-y-2">
      {/* Paid rows live above the list, never inside it — see SponsorUnits. */}
      {SponsorRow && sponsoredRows.map((unit) => (
        <SponsorRow key={`sponsor-board-${unit.slot_id ?? unit.slug}`} unit={unit} />
      ))}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk px-6 py-12 text-center">
          <h3 className="text-base font-semibold text-ink">No ranked activity yet this period</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            The board fills up from real votes, comments and click-throughs. Post about a tool you
            use and it appears here.
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => (
            <LeaderRow key={row.slug} row={row} topScore={topScore} />
          ))}
        </ol>
      )}
    </div>
  )
}
