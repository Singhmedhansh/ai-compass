import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { Sparkles, Check, X } from 'lucide-react'

import { PRICING_TIERS } from '../config/pricingTiers'

function TierColumn({ tier }) {
  const isSponsor = tier.id === 'sponsor'

  return (
    <div
      className={`flex flex-col rounded-2xl border p-6 ${
        isSponsor
          ? 'border-accent bg-accent-soft/15 shadow-md ring-1 ring-accent/20'
          : 'border-line bg-bg-elev'
      }`}
    >
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
          tier.id === 'free'
            ? 'bg-bg-sunk text-ink-2 border border-line'
            : 'bg-accent-soft text-accent shadow-sm'
        }`}
      >
        {isSponsor && <Sparkles className="h-2.5 w-2.5" />}
        {tier.badgeLabel}
      </span>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-ink">{tier.priceLabel}</span>
        {tier.price > 0 && <span className="text-xs font-medium text-ink-2">one-time</span>}
      </div>

      <h2 className="mt-2 text-base font-bold text-ink">{tier.name}</h2>
      <p className="mt-1.5 text-sm text-ink-2 leading-relaxed font-normal">{tier.tagline}</p>

      <div className="mt-4 rounded-xl border border-line/70 bg-bg/60 px-3 py-2 text-xs font-semibold text-ink-2">
        {tier.reviewEta}
      </div>

      <ul className="mt-5 space-y-2.5 text-sm">
        {tier.perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-ink-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>{perk}</span>
          </li>
        ))}
        {tier.notIncluded.map((item) => (
          <li key={item} className="flex items-start gap-2 text-muted-2">
            <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-2" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <Link
        to="/submit"
        className={`mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition ${
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
        <div className="mx-auto max-w-5xl px-4 py-12 md:py-20">
          <section className="text-center max-w-2xl mx-auto">
            <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Pricing</span>
            <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">Four ways to get listed</h1>
            <p className="mt-3 text-sm text-ink-2 leading-relaxed font-normal">
              Every tool is welcome for free, and every listing gets the same page, the same search
              index and the same digest announcement. What the paid tiers buy is <strong>what you
              can see</strong>, <strong>where you sit</strong> and <strong>work we do for
              you</strong> — never a better verdict, an editorial pick, or a rank. Claiming your
              listing and editing it is free for every founder who can prove the domain, at any
              tier, and always will be. All one-time: nothing here renews, and nothing disappears
              if you stop paying, because there is nothing to stop paying.
            </p>
          </section>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING_TIERS.map((tier) => (
              <TierColumn key={tier.id} tier={tier} />
            ))}
          </div>

          {/* The paid perks that are not obvious from a bullet list, each
              stated as the mechanism that delivers it — this is the section a
              founder reads to decide whether the price is real. The first
              entry is what the $19 tier sells; the rest start at $49. */}
          <section className="mt-14 rounded-2xl border border-line bg-bg-elev p-6 sm:p-8">
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
              stacking it as a fourth column would imply it competes with
              them on speed. */}
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

          <p className="mt-8 text-center text-xs text-muted">
            Questions about which tier fits your launch?{' '}
            <Link to="/contact" className="text-accent font-semibold hover:underline">
              Contact us
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  )
}
