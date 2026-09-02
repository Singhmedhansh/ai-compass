import { Fragment } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { Sparkles, Check, X, Minus, ShieldCheck } from 'lucide-react'

import {
  COMPARISON_COLUMNS,
  COMPARISON_GROUPS,
  PRICING_TIERS,
  TIER_HIGHLIGHTS,
} from '../config/pricingTiers'

// The four cards used to render the FULL perk list — 5, 4, 12 and 6 bullets
// side by side. One column ran to nearly twice the height of its neighbours,
// which made the page read as a single long ragged column rather than as a
// grid, and made the cheapest tier look like the biggest offer.
//
// A price grid is scanned, not read. So every card now shows the same four
// lines (TIER_HIGHLIGHTS), the cards are equal height by construction, and
// everything that was cut lives in the comparison matrix below — which is
// where someone genuinely choosing between two tiers goes anyway.

function TierCard({ tier }) {
  const isSponsor = tier.id === 'sponsor'
  const highlights = TIER_HIGHLIGHTS[tier.id] || []

  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border p-6 ${
        isSponsor
          ? 'border-accent bg-accent-soft/15 shadow-lg ring-1 ring-accent/20'
          : 'border-line bg-bg-elev'
      }`}
    >
      {/* One recommendation, stated plainly. A grid with no recommended
          column makes the reader do the ranking, and most of them resolve
          that by choosing the cheapest thing or nothing at all.

          whitespace-nowrap because the pill is absolutely positioned and
          sits half outside the card: if its text ever wrapped it would grow
          UPWARD into the card above it in the grid rather than pushing
          anything down. max-w guards the same failure at the narrowest
          column width by clipping instead. */}
      {isSponsor && (
        <span className="absolute -top-3 left-6 inline-flex max-w-[calc(100%-3rem)] items-center gap-1 overflow-hidden whitespace-nowrap rounded-full bg-accent px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
          <Sparkles className="h-2.5 w-2.5 shrink-0" /> Most founders pick this
        </span>
      )}

      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
          tier.id === 'free'
            ? 'border border-line bg-bg-sunk text-ink-2'
            : 'bg-accent-soft text-accent'
        }`}
      >
        {tier.badgeLabel}
      </span>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tracking-tight text-ink">{tier.priceLabel}</span>
        {tier.price > 0 && <span className="text-xs font-medium text-ink-2">one-time</span>}
      </div>
      <p className="mt-1 text-[11px] font-medium text-muted">
        {tier.price > 0 ? 'Paid once. Nothing renews.' : 'Free forever. Nothing to renew.'}
      </p>

      <h2 className="mt-4 text-base font-bold text-ink">{tier.name}</h2>
      {/* Fixed min-height on the tagline, so a two-line and a three-line
          tagline do not push their neighbours' bullet lists out of alignment. */}
      <p className="mt-1.5 min-h-[64px] text-sm font-normal leading-relaxed text-ink-2">
        {tier.tagline}
      </p>

      <div className="mt-4 rounded-xl border border-line/70 bg-bg/60 px-3 py-2 text-[11px] font-semibold leading-snug text-ink-2">
        {tier.reviewEta}
      </div>

      <ul className="mt-5 space-y-2.5 text-sm">
        {highlights.map((line) => (
          <li key={line} className="flex items-start gap-2 text-ink-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span className="leading-snug">{line}</span>
          </li>
        ))}
      </ul>

      {/* mt-auto is what actually equalises the cards: the button is pinned
          to the bottom of whichever card is tallest, instead of floating
          directly under a short list. */}
      <Link
        to={`/submit?tier=${tier.id}`}
        className={`mt-auto pt-6 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition ${
          isSponsor
            ? 'bg-accent text-white hover:bg-accent/90'
            : 'border border-line bg-bg-elev text-ink hover:border-line-strong hover:bg-bg-sunk'
        }`}
      >
        {tier.id === 'free' ? 'Submit for free' : `Get ${tier.badgeLabel}`}
      </Link>
    </div>
  )
}

function Cell({ value }) {
  if (value === true) {
    return (
      <span className="inline-flex" aria-label="Included">
        <Check className="h-4 w-4 text-accent" />
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="inline-flex" aria-label="Not included">
        <Minus className="h-4 w-4 text-muted-2" />
      </span>
    )
  }
  return <span className="text-xs font-semibold text-ink">{value}</span>
}

export default function PricingPage() {
  return (
    <>
      <Helmet>
        <title>Pricing — List Your AI Tool | AI Compass</title>
        <meta
          name="description"
          content="Four ways to list your AI tool on AI Compass: a permanent free listing, $19 Listing + Analytics for a dashboard and a monthly report, $49 Fast-Track for labelled placement above free listings, or $79 Reviewed, which adds a written hands-on review on your own indexed page. One-time payments, no subscription. Editorial picks and leaderboard ranks are never for sale."
        />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-12 md:py-20">
          <section className="mx-auto max-w-2xl text-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-accent">Pricing</span>
            <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">Four ways to get listed</h1>
            <p className="mt-3 text-sm font-normal leading-relaxed text-ink-2">
              Every tool is welcome for free, and every listing gets the same page, the same search
              index and the same digest announcement. What the paid tiers buy is <strong>what you
              can see</strong>, <strong>where you sit</strong> and <strong>work we do for
              you</strong> — never a better verdict, an editorial pick, or a rank.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-semibold text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" /> One-time — nothing renews
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Every paid unit is labelled
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Claiming your listing is free
              </span>
            </div>
          </section>

          {/* items-stretch + h-full on the card: four equal columns, whatever
              is in them. This is the fix for the ragged single-column look. */}
          <div className="mt-14 grid grid-cols-1 items-stretch gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_TIERS.map((tier) => (
              <TierCard key={tier.id} tier={tier} />
            ))}
          </div>

          {/* -------------------------------------------------------------
              The comparison matrix. This is where the twelve bullets that
              used to make the $49 card twice as tall as its neighbours went.
              ------------------------------------------------------------- */}
          <section className="mt-16">
            <h2 className="text-xl font-bold text-ink">Compare every tier</h2>
            <p className="mt-1.5 max-w-2xl text-sm font-normal leading-relaxed text-ink-2">
              Everything each tier includes, line by line. A dash means it is not part of that
              tier — not that it is unavailable, and never that it is worse.
            </p>

            {/* The table scrolls inside its own container rather than making
                the page scroll sideways on a phone. */}
            <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-bg-elev">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="w-2/5 px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-muted">
                      Feature
                    </th>
                    {COMPARISON_COLUMNS.map((id) => {
                      const tier = PRICING_TIERS.find((t) => t.id === id)
                      if (!tier) return null
                      return (
                        <th
                          key={id}
                          className={`px-4 py-4 text-center ${id === 'sponsor' ? 'bg-accent-soft/20' : ''}`}
                        >
                          <div className="text-xs font-bold text-ink">{tier.badgeLabel}</div>
                          <div className="mt-0.5 text-[11px] font-semibold text-ink-2">{tier.priceLabel}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_GROUPS.map((group) => (
                    // Fragment, not an array: a group renders one header row
                    // plus N feature rows, and wrapping them keeps the key on
                    // the group rather than needing a synthetic one per row.
                    <Fragment key={group.title}>
                      <tr className="bg-bg-sunk/60">
                        <td
                          colSpan={COMPARISON_COLUMNS.length + 1}
                          className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-accent-ink"
                        >
                          {group.title}
                        </td>
                      </tr>
                      {group.rows.map(([label, ...cells]) => (
                        <tr key={`${group.title}-${label}`} className="border-t border-line/60">
                          <td className="px-5 py-3 text-xs font-medium leading-snug text-ink-2">{label}</td>
                          {cells.map((value, index) => (
                            <td
                              key={COMPARISON_COLUMNS[index]}
                              className={`px-4 py-3 text-center ${
                                COMPARISON_COLUMNS[index] === 'sponsor' ? 'bg-accent-soft/10' : ''
                              }`}
                            >
                              <Cell value={value} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  <tr className="border-t border-line bg-bg-sunk/40">
                    <td className="px-5 py-4" />
                    {COMPARISON_COLUMNS.map((id) => {
                      const tier = PRICING_TIERS.find((t) => t.id === id)
                      if (!tier) return null
                      return (
                        <td key={id} className={`px-3 py-4 text-center ${id === 'sponsor' ? 'bg-accent-soft/20' : ''}`}>
                          <Link
                            to={`/submit?tier=${id}`}
                            className={`inline-flex w-full items-center justify-center rounded-lg px-2 py-2 text-[11px] font-bold transition ${
                              id === 'sponsor'
                                ? 'bg-accent text-white hover:bg-accent/90'
                                : 'border border-line bg-bg-elev text-ink hover:bg-bg-sunk'
                            }`}
                          >
                            {tier.price > 0 ? `Get ${tier.badgeLabel}` : 'Submit free'}
                          </Link>
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* The paid perks that are not obvious from a matrix cell, each
              stated as the mechanism that delivers it — this is the section a
              founder reads to decide whether the price is real. */}
          <section className="mt-12 rounded-2xl border border-line bg-bg-elev p-6 sm:p-8">
            <h2 className="text-base font-bold text-ink">What the paid tiers actually do for you</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {[
                [
                  'Your numbers, every month',
                  <>
                    Views, click-throughs, CTR, saves and a 14-day trend on your own dashboard —
                    and a report emailed to you monthly, this month beside last month. Clicks are
                    counted by the same redirect that powers our own analytics, so your figures
                    and ours can never disagree. This is the whole of the $19 tier.
                  </>,
                ],
                [
                  'Placed above free listings',
                  <>
                    In your category and in keyword search, for as long as the listing stands —
                    plus the homepage{' '}
                    <Link to="/" className="font-semibold text-accent hover:underline">
                      &quot;Featured on AI Compass&quot;
                    </Link>{' '}
                    strip. Every one of those units carries the &quot;Sponsored&quot; label.
                  </>,
                ],
                [
                  'A month on the community rail',
                  <>
                    A Featured card on{' '}
                    <Link to="/community" className="font-semibold text-accent hover:underline">
                      /community
                    </Link>{' '}
                    for 30 days from approval, with impressions, clicks and CTR reported back to
                    you — the denominator most directories never give you.
                  </>,
                ],
                [
                  'On the pages that rank',
                  <>
                    A labelled Partner card on the best-of guide for your category — like{' '}
                    <Link to="/best-coding-tools-for-students" className="font-semibold text-accent hover:underline">
                      Best Coding Tools
                    </Link>{' '}
                    — and on the alternatives page of every tool in it. Beside those pages&apos;
                    picks, never inside them, and only where your tool honestly belongs.
                  </>,
                ],
                [
                  'First in the weekly digest',
                  <>
                    New listings are emailed to subscribers as they go live. Paid ones go first in
                    that email, labelled &quot;Sponsored&quot;. Free listings are still in it — the
                    position is what you bought, not the mention.
                  </>,
                ],
                [
                  'A launch date you choose',
                  <>
                    Fast-Track and Reviewed let you pick the day it all starts — placement, rail
                    card and digest spot together — so you can tell your own audience about it in
                    advance. We run one launch a day, so the day is yours.
                  </>,
                ],
              ].map(([term, detail]) => (
                <div key={term} className="rounded-xl border border-line bg-bg p-4">
                  <dt className="text-xs font-bold uppercase tracking-wider text-accent-ink">{term}</dt>
                  <dd className="mt-1.5 text-xs font-normal leading-relaxed text-ink-2">{detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* The constraints, stated as plainly as the perks. A directory that
              sells its own top ten is worth nothing to read, which makes it
              worth nothing to be listed in either — so these limits are the
              reason the paid units have any value at all. */}
          <section className="mt-6 rounded-2xl border border-line bg-bg-sunk p-6 sm:p-8">
            <h2 className="text-base font-bold text-ink">What no amount of money buys</h2>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {[
                'An editorial pick. The “featured” curation flag is ours and is never granted on payment.',
                'A community leaderboard rank. Those are scored from votes, comments and click-throughs only.',
                'A rating or a review score. Ratings come from readers; commissioned reviews are written by us.',
                'An unlabelled placement. Every paid unit on the site says that it is paid, on its face.',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm font-normal leading-relaxed text-ink-2">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-2" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Deliberately below the ladder and visually separate: a review is
              not a faster listing, it is a different thing to buy, and
              stacking it as a fifth column would imply it competes with them
              on speed. */}
          <section className="mt-6 rounded-2xl border border-accent/35 bg-bg-elev p-6 sm:p-8">
            <h2 className="text-base font-bold text-ink">Just the review, for a tool already listed</h2>
            <p className="mt-2 max-w-2xl text-sm font-normal leading-relaxed text-ink-2">
              Already listed and just want the review? It is <strong>$39</strong> on its own — we
              actually use your tool and publish a 300–500 word hands-on review, with screenshots,
              pros, cons and a scored verdict, on your own indexed{' '}
              <span className="font-mono text-xs">/tools/</span> page, bylined and dated. It is a
              third-party URL you can cite from your site, your launch post and your investor
              update, and it does not expire. (Submitting a new tool? The{' '}
              <strong>$79 Reviewed</strong> tier above includes it.)
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted">
              The verdict is ours, every review states on its face that it was commissioned, and if
              we cannot review your tool fairly we refund you. That is what makes it worth citing.
            </p>
            <Link
              to="/sponsor#review"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Commission a review
            </Link>
          </section>

          {/* Money questions, answered before they have to be asked. Every
              one of these is a reason a founder closes the tab instead of
              paying, and none of them was answered anywhere on this page. */}
          <section className="mt-6 rounded-2xl border border-line bg-bg-elev p-6 sm:p-8">
            <h2 className="text-base font-bold text-ink">Before you pay</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {[
                [
                  'Is this a subscription?',
                  <>
                    No. Every price on this page is charged once. There is nothing to cancel and
                    nothing that expires — if you stop paying, nothing happens, because there is
                    nothing to stop paying.
                  </>,
                ],
                [
                  'How do I pay?',
                  <>
                    PayPal, in USD — card or PayPal balance, through PayPal&apos;s own checkout. We
                    never see or store your card details. Your receipt and invoice arrive by email
                    the moment the payment clears.
                  </>,
                ],
                [
                  'What if my tool is rejected?',
                  <>
                    You are refunded in full. We only list tools that honestly fit the catalogue,
                    and we would rather return $49 than publish a listing our readers do not
                    trust. See the{' '}
                    <Link to="/refunds" className="font-semibold text-accent hover:underline">
                      refund policy
                    </Link>.
                  </>,
                ],
                [
                  'Can I upgrade later?',
                  <>
                    Yes. Email{' '}
                    <a href="mailto:help@ai-compass.in" className="font-semibold text-accent hover:underline">
                      help@ai-compass.in
                    </a>{' '}
                    and you pay the difference, not the full price again. Your listing, its page and
                    its URL stay exactly as they are.
                  </>,
                ],
                [
                  'Charged twice?',
                  <>
                    Write to{' '}
                    <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">
                      admin@ai-compass.in
                    </a>{' '}
                    with the PayPal reference. A duplicate charge is refunded in full, always, and
                    it is the one thing we treat as urgent.
                  </>,
                ],
                [
                  'Which tier should I buy?',
                  <>
                    If you have never been in a directory before, start free — it costs nothing and
                    it is permanent. If you are launching and want the day to count, Fast-Track.
                    Unsure? Ask{' '}
                    <a href="mailto:help@ai-compass.in" className="font-semibold text-accent hover:underline">
                      help@ai-compass.in
                    </a>{' '}
                    and we will tell you honestly, including when the answer is &quot;stay free&quot;.
                  </>,
                ],
              ].map(([q, a]) => (
                <div key={q}>
                  <dt className="text-sm font-bold text-ink">{q}</dt>
                  <dd className="mt-1 text-xs font-normal leading-relaxed text-ink-2">{a}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="mt-8 text-center text-xs text-muted">
            Questions about which tier fits your launch?{' '}
            <a href="mailto:help@ai-compass.in" className="font-semibold text-accent hover:underline">
              help@ai-compass.in
            </a>
            {' '}· Payment or billing?{' '}
            <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">
              admin@ai-compass.in
            </a>
          </p>
        </div>
      </div>
    </>
  )
}
