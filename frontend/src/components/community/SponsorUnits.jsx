import { ArrowUpRight, BadgeCheck, Megaphone, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import ToolLogo from '../ui/ToolLogo'
import useSponsorImpression from '../../hooks/useSponsorImpression'

// Every sponsored unit in here carries a visible "Sponsored" label. That is
// not decoration: the leaderboard next to it is only worth sponsoring because
// readers trust it, and they only trust it if paid units are obvious.
function SponsoredLabel({ children = 'Sponsored' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
      <Megaphone className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  )
}

function toolHref(unit) {
  return `/tools/${unit.slug}`
}

/**
 * The single full-width unit at the top of /community. One sponsor, no
 * rotation — scarcity is the product, so the component renders nothing at
 * all rather than a house ad when the slot is unsold.
 */
export function SponsorHero({ unit }) {
  const ref = useSponsorImpression({ slug: unit?.slug, placement: 'hero', slotId: unit?.slot_id })
  if (!unit) return null

  return (
    <aside
      ref={ref}
      aria-label="Sponsored spotlight"
      className="group relative overflow-hidden rounded-3xl border border-line bg-bg-elev p-6 shadow-sm transition hover:border-line-strong sm:p-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="shrink-0">
          <div className="rounded-2xl border border-line bg-bg p-2.5 shadow-sm">
            <ToolLogo tool={unit} size={56} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SponsoredLabel>Community Spotlight</SponsoredLabel>
            {unit.category && (
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {unit.category}
              </span>
            )}
          </div>

          <h2 className="mt-3 text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl">
            {unit.headline || unit.name}
          </h2>
          {unit.blurb && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">{unit.blurb}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              to={toolHref(unit)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              {unit.cta_label || 'Visit site'}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to={`/community?tool_slug=${encodeURIComponent(unit.slug)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              Join the discussion
            </Link>
            <span className="text-[11px] text-muted-2">{unit.name} paid for this placement.</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

/**
 * The labelled row pinned above the leaderboard. Sits *outside* the ranked
 * list — a partner buys adjacency to the board, never a position on it.
 */
export function SponsorBoardRow({ unit }) {
  const ref = useSponsorImpression({ slug: unit?.slug, placement: 'board', slotId: unit?.slot_id })
  if (!unit) return null

  return (
    <Link
      ref={ref}
      to={toolHref(unit)}
      aria-label={`Sponsored: ${unit.name}`}
      className="flex items-center gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3.5 transition hover:border-amber-500/50 dark:bg-amber-500/[0.06]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      </div>
      <ToolLogo tool={unit} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-ink">{unit.name}</span>
          <SponsoredLabel />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {unit.headline || unit.blurb || unit.tagline || unit.category}
        </p>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  )
}

/** One card in the sidebar Featured rail. */
export function SponsorRailCard({ unit }) {
  const ref = useSponsorImpression({ slug: unit?.slug, placement: 'rail', slotId: unit?.slot_id })
  if (!unit) return null

  return (
    <Link
      ref={ref}
      to={toolHref(unit)}
      className="block rounded-xl border border-line bg-bg p-3 transition hover:border-line-strong hover:bg-bg-elev"
    >
      <div className="flex items-start gap-3">
        <ToolLogo tool={unit} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{unit.name}</span>
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Sponsored" />
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
            {unit.headline || unit.blurb || unit.tagline || 'Featured on AI Compass.'}
          </p>
        </div>
      </div>
    </Link>
  )
}

export { SponsoredLabel }
