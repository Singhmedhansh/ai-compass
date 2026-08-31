import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Check,
  CircleSlash,
  Clock,
  Mail,
  PenLine,
  ShieldCheck,
  Trophy,
} from 'lucide-react'

import CountUp from '../components/ui/CountUp'
import ReviewCheckout from '../components/community/ReviewCheckout'
import SponsorCheckout from '../components/community/SponsorCheckout'
import { REVIEW_PRODUCT, SPONSOR_PLACEMENTS, SPONSOR_PROMISES } from '../config/sponsorTiers'

const SPONSOR_EMAIL = 'admin@ai-compass.in'

function reserveHref(placement) {
  const subject = encodeURIComponent(`Sponsorship: ${placement.name} (${placement.priceLabel}/week)`)
  const body = encodeURIComponent(
    [
      `I'd like to reserve the ${placement.name} placement (${placement.priceLabel}/week).`,
      '',
      'Tool name:',
      'Website:',
      'Weeks requested:',
      'Preferred start (Monday):',
      'Headline / blurb copy (optional):',
      '',
      'Send me the invoice and I will confirm.',
    ].join('\n')
  )
  return `mailto:${SPONSOR_EMAIL}?subject=${subject}&body=${body}`
}

function PlacementCard({ placement, availability, onBook }) {
  // The server's LIVE_PLACEMENTS is the real gate; this only decides how the
  // card looks. Trust the API's answer when it arrives, fall back to the
  // static config before then.
  const comingSoon = availability ? availability.coming_soon : placement.comingSoon
  const soldOut = availability?.sold_out
  const left = availability?.available

  return (
    <article
      className={`relative flex flex-col rounded-3xl border p-6 transition ${
        comingSoon
          ? 'border-line bg-bg-sunk/60'
          : placement.highlight
            ? 'border-accent/45 bg-bg-elev shadow-md'
            : 'border-line bg-bg-elev hover:border-line-strong'
      }`}
    >
      {placement.highlight && !comingSoon && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Available now
        </span>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-base font-bold ${comingSoon ? 'text-ink-2' : 'text-ink'}`}>
            {placement.name}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{placement.tagline}</p>
        </div>
        {comingSoon ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            <Clock className="h-3 w-3" aria-hidden="true" /> Coming soon
          </span>
        ) : availability && (
          soldOut ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-bg-sunk px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-2">
              <CircleSlash className="h-3 w-3" aria-hidden="true" /> Full
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-accent/35 bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
              {left} of {placement.capacity} left
            </span>
          )
        )}
      </div>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className={`text-3xl font-extrabold tracking-tight ${comingSoon ? 'text-muted-2' : 'text-ink'}`}>
          {placement.priceLabel}
        </span>
        <span className="text-xs font-semibold text-muted">{placement.cadence}</span>
      </div>
      {comingSoon && (
        <p className="mt-1 text-[11px] text-muted-2">Indicative — not final until this opens.</p>
      )}

      <ul className="mt-5 space-y-2">
        {placement.includes.map((line) => (
          <li key={line} className="flex gap-2 text-xs leading-relaxed text-ink-2">
            <Check
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${comingSoon ? 'text-muted-2' : 'text-accent'}`}
              aria-hidden="true"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 rounded-xl border border-line bg-bg-sunk px-3 py-2 text-[11px] leading-relaxed text-muted">
        <strong className="font-semibold text-ink-2">Best for:</strong> {placement.best}
      </p>

      <div className="mt-5 flex flex-col">
        {comingSoon ? (
          <>
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-muted-2"
            >
              Not open yet
            </button>
            <a
              href={reserveHref(placement)}
              className="mt-2 text-center text-[11px] font-medium text-muted transition hover:text-accent"
            >
              Ask to be told when it opens
            </a>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onBook(placement)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                soldOut
                  ? 'border border-line bg-bg text-ink-2 hover:border-line-strong'
                  : 'bg-accent text-white hover:opacity-90'
              }`}
            >
              {soldOut ? 'Book the next open week' : 'Book this slot'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <a
              href={reserveHref(placement)}
              className="mt-2 text-center text-[11px] font-medium text-muted transition hover:text-accent"
            >
              or arrange it by email
            </a>
          </>
        )}
      </div>
    </article>
  )
}

function StatTile({ label, value, suffix = '' }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-elev px-4 py-4 text-center">
      <div className="text-2xl font-extrabold tabular-nums text-ink">
        <CountUp end={value} duration={1} />
        {suffix}
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
    </div>
  )
}

export default function SponsorPage() {
  const [inventory, setInventory] = useState([])
  const [stats, setStats] = useState(null)
  const [booking, setBooking] = useState(null)
  const [reviewAvailability, setReviewAvailability] = useState(null)
  const [commissioning, setCommissioning] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const [invRes, statsRes, reviewRes] = await Promise.all([
          fetch('/api/v1/community/sponsors/inventory', { signal: controller.signal }),
          fetch('/api/v1/community/stats', { signal: controller.signal }),
          fetch('/api/v1/reviews/pricing', { signal: controller.signal }),
        ])
        if (invRes.ok) setInventory((await invRes.json()).inventory || [])
        if (statsRes.ok) setStats(await statsRes.json())
        if (reviewRes.ok) setReviewAvailability(await reviewRes.json())
      } catch {
        // The rate card is static; live availability is a bonus, not a blocker.
      }
    }

    load()
    return () => controller.abort()
  }, [])

  const availabilityById = useMemo(
    () => Object.fromEntries(inventory.map((row) => [row.placement, row])),
    [inventory]
  )

  // Only tiers actually on sale count toward the headline price, otherwise
  // the page advertises a number nobody can pay.
  const liveCount = SPONSOR_PLACEMENTS.filter(
    (p) => !(availabilityById[p.id] ? availabilityById[p.id].coming_soon : p.comingSoon)
  ).length

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Helmet>
        <title>Sponsor AI Compass — Commissioned Reviews & Labelled Placements</title>
        <meta
          name="description"
          content="Commission a hands-on editorial review of your tool ($49, published on its own indexed page), or take a capped, clearly labelled placement beside the AI Compass leaderboard. Verdicts and ranks are never for sale."
        />
        <link rel="canonical" href="https://ai-compass.in/sponsor" />
      </Helmet>

      {/* Hero */}
      <header className="relative overflow-hidden rounded-3xl border border-line bg-bg-elev px-6 py-10 sm:px-10 sm:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-ink">
            <Trophy className="h-3 w-3" aria-hidden="true" /> Sponsorship
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Put your tool beside a leaderboard people trust
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2 sm:text-base">
            The AI Compass tool board is scored entirely from community votes, comments and
            click-throughs. Nobody can buy a rank on it. What you can buy is the labelled unit right
            next to it — and a report that tells you exactly what it delivered.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <a
              href="#placements"
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              See placements & availability
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link
              to="/community"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              Look at the surface first
            </Link>
          </div>
        </div>
      </header>

      {/* Live audience numbers — the same figures the community page shows,
          so a sponsor can verify the pitch against the public page. */}
      <section aria-labelledby="audience-heading" className="mt-8">
        <h2 id="audience-heading" className="text-lg font-bold tracking-tight text-ink">
          What you&apos;re sponsoring, in real numbers
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Pulled live from the same endpoint the public community page uses. If a number here looks
          small, that is the number — we would rather quote $39 honestly than $390 on invented reach.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Members" value={stats?.members ?? 0} />
          <StatTile label="Posts" value={stats?.posts ?? 0} />
          <StatTile label="Comments" value={stats?.comments ?? 0} />
          <StatTile label="Tools discussed" value={stats?.tools_discussed ?? 0} />
        </div>
      </section>

      {/* The editorial review — the one thing here that outlives the week
          you bought it in, so it leads. */}
      <section id="review" aria-labelledby="review-heading" className="mt-12 scroll-mt-24">
        <div className="rounded-3xl border border-accent/40 bg-bg-elev p-6 shadow-md sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-ink">
                <PenLine className="h-3 w-3" aria-hidden="true" /> Most useful thing we sell
              </span>
              <h2 id="review-heading" className="mt-3 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {REVIEW_PRODUCT.name}: buy the artifact, not the impressions
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
                A placement rents you attention for a week. A review is a page that keeps
                existing: we use your tool properly, write {REVIEW_PRODUCT.includes[0].toLowerCase()},
                and publish it on your own indexed <span className="font-mono text-xs">/tools/</span>
                page with screenshots, pros, cons and a scored verdict. It is a third-party URL you
                can cite from your site, your launch post and your investor update.
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-extrabold tracking-tight text-ink">
                {REVIEW_PRODUCT.priceLabel}
              </div>
              <div className="text-xs font-semibold text-muted">{REVIEW_PRODUCT.cadence}</div>
            </div>
          </div>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {REVIEW_PRODUCT.includes.map((line) => (
              <li key={line} className="flex gap-2 text-xs leading-relaxed text-ink-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 rounded-xl border border-line bg-bg-sunk px-3 py-2.5 text-[11px] leading-relaxed text-muted">
            <strong className="font-semibold text-ink-2">What you are not buying:</strong> the
            verdict. We publish what we find, the review says on its face that it was commissioned,
            and if we cannot review your tool fairly we refund you and say why. That is precisely
            what makes the link worth linking.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCommissioning(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Commission a review
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            {/* Writing throughput is the real constraint, so it is quoted
                rather than hidden — a queue is a reason to book now, and an
                oversold month is a refund. */}
            {reviewAvailability && (
              <p className="text-xs text-muted">
                {reviewAvailability.slots_left > 0
                  ? `${reviewAvailability.slots_left} of ${reviewAvailability.capacity_per_month} review slots left this month · published within ${reviewAvailability.turnaround_days} days`
                  : `This month is full — new orders publish in about ${reviewAvailability.turnaround_days * 2} days`}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Placements */}
      <section id="placements" aria-labelledby="placements-heading" className="mt-12 scroll-mt-24">
        <h2 id="placements-heading" className="text-lg font-bold tracking-tight text-ink">
          Placements
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Slots run Monday to Sunday. Availability below is live — when a placement is full the page
          says so instead of quietly overselling it.
        </p>
        {liveCount < SPONSOR_PLACEMENTS.length && (
          <p className="mt-3 max-w-2xl rounded-xl border border-line bg-bg-sunk px-4 py-3 text-xs leading-relaxed text-ink-2">
            We&apos;re opening these one at a time rather than all at once, so that every placement we
            sell is one we can actually deliver and report on. <strong>Featured Tool is live today</strong>;
            the larger units open as the community grows into them.
          </p>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {SPONSOR_PLACEMENTS.map((placement) => (
            <PlacementCard
              key={placement.id}
              placement={placement}
              availability={availabilityById[placement.id]}
              onBook={setBooking}
            />
          ))}
        </div>
      </section>

      {/* Reporting */}
      <section aria-labelledby="reporting-heading" className="mt-12">
        <div className="rounded-3xl border border-line bg-bg-elev p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <h2 id="reporting-heading" className="text-lg font-bold tracking-tight text-ink">
                You get the denominator, not just the clicks
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
                Most directories report clicks only, which tells you nothing about whether the
                placement was seen. We record an impression server-side each time your unit actually
                enters a reader&apos;s viewport, and clicks come from the same tracked redirect that
                powers our own analytics — so your CTR and ours can never disagree.
              </p>
              <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ['Impressions', 'Viewport-verified renders of your unit, deduplicated per visitor.'],
                  ['Clicks', 'Outbound click-throughs on your tracked link.'],
                  ['CTR', 'Clicks ÷ impressions, computed from those two rows and nothing else.'],
                ].map(([term, detail]) => (
                  <div key={term} className="rounded-2xl border border-line bg-bg p-3.5">
                    <dt className="text-xs font-bold uppercase tracking-wider text-accent-ink">{term}</dt>
                    <dd className="mt-1.5 text-xs leading-relaxed text-muted">{detail}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-muted-2">
                Reports are private to the account that owns the listing. Spotlight sponsors get theirs
                emailed weekly; everyone else can pull it on request at any time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Promises */}
      <section aria-labelledby="promises-heading" className="mt-12">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <h2 id="promises-heading" className="text-lg font-bold tracking-tight text-ink">
              The rules we hold ourselves to
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm text-muted">
              These are constraints on us, not features for you — but they are the reason a placement
              here is worth more than a link on a directory that sells its own top ten.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {SPONSOR_PROMISES.map((promise) => (
            <div key={promise.title} className="rounded-2xl border border-line bg-bg-elev p-4">
              <h3 className="text-sm font-bold text-ink">{promise.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{promise.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Self-serve alternative */}
      <section aria-labelledby="listing-heading" className="mt-12">
        <div className="rounded-3xl border border-line bg-bg-sunk p-6 sm:p-8">
          <h2 id="listing-heading" className="text-lg font-bold tracking-tight text-ink">
            Not sure yet? Start with a listing instead.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            A weekly placement is rented attention. A catalogue listing is permanent, self-serve, and
            costs a one-time $49 on the Fast-Track tier — which also earns a Featured rail card for
            30 days, so you can measure this audience before committing to a slot. $79 adds a written
            hands-on review of your tool.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              to="/submit"
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Submit your tool
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              Compare listing tiers
            </Link>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section aria-labelledby="contact-heading" className="mt-12 text-center">
        <h2 id="contact-heading" className="text-lg font-bold tracking-tight text-ink">
          Questions before you book?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
          Ask for last month&apos;s delivery numbers on any placement, or a custom multi-week package.
          A real person answers.
        </p>
        <a
          href={`mailto:${SPONSOR_EMAIL}?subject=${encodeURIComponent('Sponsorship enquiry')}`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg-elev px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink"
        >
          <Mail className="h-4 w-4" aria-hidden="true" /> {SPONSOR_EMAIL}
        </a>
      </section>

      {commissioning && (
        <ReviewCheckout
          product={REVIEW_PRODUCT}
          availability={reviewAvailability}
          onClose={() => {
            setCommissioning(false)
            // The queue just got longer if they ordered — requote it rather
            // than leaving a stale "4 slots left" on screen.
            fetch('/api/v1/reviews/pricing')
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => d && setReviewAvailability(d))
              .catch(() => {})
          }}
        />
      )}

      {booking && (
        <SponsorCheckout
          placement={booking}
          availability={availabilityById[booking.id]}
          onClose={() => {
            setBooking(null)
            // Availability may have just changed — refetch so the card the
            // buyer returns to shows the slot they took as gone.
            fetch('/api/v1/community/sponsors/inventory')
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => d && setInventory(d.inventory || []))
              .catch(() => {})
          }}
        />
      )}
    </div>
  )
}
