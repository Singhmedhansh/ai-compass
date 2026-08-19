import { ArrowRight, CircleSlash, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

/**
 * The sidebar panel that turns a reader into a sponsor.
 *
 * The mechanism is honest scarcity: real capacity, real remaining count, and
 * a sold-out state that says so. A "featured" section with unlimited slots is
 * wallpaper nobody pays for; four slots with two left is a decision.
 */
export default function SponsorInventoryPanel({ inventory = [], loading = false }) {
  // Only count what is actually buyable — advertising "5 open" or a price
  // drawn from a placement that isn't on sale sends people to a dead button.
  const forSale = inventory.filter((row) => row.for_sale !== false)
  const totalOpen = forSale.reduce((sum, row) => sum + (row.available || 0), 0)
  const cheapest = forSale.reduce(
    (min, row) => (row.price_weekly && (!min || row.price_weekly < min) ? row.price_weekly : min),
    null
  )

  return (
    <section
      aria-labelledby="sponsor-inventory-heading"
      className="rounded-2xl border border-line bg-bg-elev p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sponsor-inventory-heading" className="text-sm font-bold text-ink">
          Sponsor this community
        </h2>
        {!loading && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
            {totalOpen > 0 ? `${totalOpen} open` : 'Sold out'}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        Capped, labelled placements beside the leaderboard. Ranks are never for sale — which is
        exactly why the board is worth being next to.
      </p>

      <ul className="mt-3 space-y-1.5">
        {loading
          ? [1, 2, 3].map((i) => (
              <li key={`inv-skeleton-${i}`} className="h-9 animate-pulse rounded-lg bg-bg-sunk" />
            ))
          : inventory.map((row) => (
              <li
                key={row.placement}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 ${
                  row.coming_soon ? 'border-line bg-bg-sunk/60' : 'border-line bg-bg'
                }`}
              >
                <div className="min-w-0">
                  <div className={`truncate text-xs font-semibold ${row.coming_soon ? 'text-muted' : 'text-ink'}`}>
                    {row.label}
                  </div>
                  <div className="text-[10px] text-muted">
                    ${row.price_weekly}/week · {row.capacity} {row.capacity === 1 ? 'slot' : 'slots'}
                  </div>
                </div>
                {row.coming_soon ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">
                    <Clock className="h-3 w-3" aria-hidden="true" /> Soon
                  </span>
                ) : row.sold_out ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-bg-sunk px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">
                    <CircleSlash className="h-3 w-3" aria-hidden="true" /> Full
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-accent/35 bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                    {row.available} left
                  </span>
                )}
              </li>
            ))}
      </ul>

      <Link
        to="/sponsor"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        {cheapest ? `See placements from $${cheapest}` : 'See placements'}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  )
}
