import { Crown, MessageSquare, PenLine, ThumbsUp } from 'lucide-react'
import { Link } from 'react-router-dom'

// Rank names, not raw reputation, are what people screenshot. Colours ascend so a
// promotion is visible at a glance in the list.
const RANK_STYLES = {
  explorer: 'border-line bg-bg-sunk text-muted',
  navigator: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  cartographer: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  pathfinder: 'border-accent/40 bg-accent-soft text-accent-ink',
  keeper: 'border-amber-500/40 bg-amber-500/12 text-amber-700 dark:text-amber-300',
}

function Avatar({ builder, size = 36 }) {
  const initial = String(builder.name || '?').trim().charAt(0).toUpperCase()
  if (builder.avatar) {
    return (
      <img
        src={builder.avatar}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full border border-line bg-bg-sunk text-xs font-bold text-ink-2"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  )
}

function BuilderName({ builder }) {
  // Only link out when the member chose to make their profile public.
  if (builder.is_public && builder.username) {
    return (
      <Link to={`/u/${builder.username}`} className="truncate font-semibold text-ink transition hover:text-accent">
        {builder.name}
      </Link>
    )
  }
  return <span className="truncate font-semibold text-ink">{builder.name}</span>
}

function BuilderRow({ builder }) {
  const rankStyle = RANK_STYLES[builder.rank_badge?.key] || RANK_STYLES.explorer
  const isLead = builder.rank === 1

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-bg-elev/60 px-3 py-2.5 transition hover:border-line-strong">
      <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-muted-2">
        {isLead ? <Crown className="mx-auto h-4 w-4 text-amber-500" aria-label="Top builder" /> : builder.rank}
      </span>
      <Avatar builder={builder} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <BuilderName builder={builder} />
          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${rankStyle}`}>
            {builder.rank_badge?.label}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1 tabular-nums" title="Posts">
            <PenLine className="h-3 w-3" aria-hidden="true" /> {builder.posts}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums" title="Comments">
            <MessageSquare className="h-3 w-3" aria-hidden="true" /> {builder.comments}
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums" title="Upvotes received">
            <ThumbsUp className="h-3 w-3" aria-hidden="true" /> {builder.upvotes}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-sm font-extrabold tabular-nums text-ink">{builder.reputation}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-2">reputation</div>
      </div>
    </li>
  )
}

/** "You're 24 reputation from Navigator" — the one line that drives repeat posting. */
export function YourStanding({ you, weights }) {
  if (!you) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk p-4">
        <h3 className="text-sm font-bold text-ink">You&apos;re not on the board yet</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Reputation comes from posting ({weights?.post ?? 6} pts), commenting ({weights?.comment ?? 2} pts),
          and upvotes other members give your contributions ({weights?.upvote_received ?? 3} pts each).
        </p>
      </div>
    )
  }

  const next = you.next_rank
  const remaining = next ? Math.max(0, next.at - you.reputation) : 0
  const progress = next && next.at > 0 ? Math.min(100, Math.round((you.reputation / next.at) * 100)) : 100

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft/60 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">
          You&apos;re #{you.rank} · {you.rank_badge?.label}
        </h3>
        <span className="text-sm font-extrabold tabular-nums text-accent-ink">{you.reputation}</span>
      </div>
      {next ? (
        <>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-bg-elev">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-xs text-ink-2">
            {remaining} reputation to <strong className="font-semibold">{next.label}</strong>.
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-ink-2">Top rank reached. Nothing left to climb.</p>
      )}
    </div>
  )
}

export default function BuilderBoard({ rows = [], loading = false, compact = false }) {
  if (loading) {
    return (
      <ul className="space-y-2" aria-busy="true" aria-label="Loading builders">
        {(compact ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6]).map((i) => (
          <li key={`bb-skeleton-${i}`} className="h-14 animate-pulse rounded-2xl border border-line bg-bg-sunk" />
        ))}
      </ul>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk px-6 py-10 text-center">
        <h3 className="text-base font-semibold text-ink">No builders ranked yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Post, comment, or get upvoted and you&apos;ll be first on this board.
        </p>
      </div>
    )
  }

  return (
    <>
      <ol className="space-y-2">
        {rows.map((builder) => (
          <BuilderRow key={builder.user_id} builder={builder} />
        ))}
      </ol>

      {/* A board with one or two names on it reads as broken rather than
          new. Rather than padding it out with people who aren't there, say
          plainly that it's early and show what it takes to appear — the
          open positions are the invitation. */}
      {rows.length < 3 && !compact && (
        <div className="mt-3 rounded-2xl border border-dashed border-line-strong bg-bg-sunk px-5 py-6 text-center">
          <h3 className="text-sm font-bold text-ink">
            {rows.length === 1 ? 'One builder so far' : `${rows.length} builders so far`}
          </h3>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted">
            This board is new and the top places are genuinely open. Reputation comes from posting,
            commenting, and the upvotes other members give your contributions.
          </p>
        </div>
      )}
    </>
  )
}
