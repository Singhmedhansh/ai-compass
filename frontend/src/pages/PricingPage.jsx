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
          content="Three ways to list your AI tool on AI Compass: a free listing, a $14.99 Quick Review that skips the queue, or $49.99 Fast-Track Sponsored Curation with guaranteed placement and a featured badge."
        />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-5xl px-4 py-12 md:py-20">
          <section className="text-center max-w-2xl mx-auto">
            <span className="text-[10px] font-bold text-accent uppercase tracking-widest">Pricing</span>
            <h1 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">Three ways to get listed</h1>
            <p className="mt-3 text-sm text-ink-2 leading-relaxed font-normal">
              Every tool is welcome for free. Paid tiers exist for founders who don&apos;t want to wait — the difference between them is speed and visibility, not whether you get listed at all.
            </p>
          </section>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {PRICING_TIERS.map((tier) => (
              <TierColumn key={tier.id} tier={tier} />
            ))}
          </div>

          <section className="mt-14 rounded-2xl border border-line bg-bg-elev p-6 sm:p-8">
            <h2 className="text-base font-bold text-ink">Fast-Track sponsors also get homepage exposure</h2>
            <p className="mt-2 text-sm text-ink-2 leading-relaxed font-normal max-w-2xl">
              Beyond the featured badge and above-free placement, active Fast-Track listings appear in the{' '}
              <Link to="/" className="text-accent font-semibold hover:underline">
                &quot;Featured on AI Compass&quot;
              </Link>{' '}
              strip on the homepage — real visibility on the page every visitor sees first, at no extra cost.
            </p>
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
