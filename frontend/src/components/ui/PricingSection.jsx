import { Check, DollarSign } from 'lucide-react'

export default function PricingSection({ tool }) {
  const pricingTiers = tool?.pricing_tiers
  const hasTiers = pricingTiers && Array.isArray(pricingTiers.tiers) && pricingTiers.tiers.length > 0

  if (!hasTiers) {
    return (
      <div className="rounded-2xl border border-line bg-bg-elev p-6">
        <h2 className="text-lg font-semibold text-ink">Pricing</h2>
        <section
          role="status"
          className="mt-4 rounded-xl border border-line bg-bg-sunk px-6 py-10 text-center"
        >
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm"
            aria-hidden="true"
          >
            <DollarSign className="h-5 w-5 text-muted" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">Detailed pricing coming soon</h3>
          <p className="mt-1.5 text-sm text-muted">
            Current pricing:{' '}
            <span className="font-medium capitalize text-ink-2">{tool?.pricing || 'Unknown'}</span>
          </p>
        </section>
      </div>
    )
  }

  const verifiedDate = pricingTiers.last_verified_at
    ? new Date(pricingTiers.last_verified_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : null

  let sourceHostname = null
  if (pricingTiers.source_url) {
    try {
      sourceHostname = new URL(pricingTiers.source_url).hostname.replace(/^www\./, '')
    } catch {
      sourceHostname = pricingTiers.source_url
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-bg-elev p-6">
      <h2 className="text-lg font-semibold text-ink">Pricing</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pricingTiers.tiers.map((tier) => (
          <article
            key={tier.name}
            className={`relative rounded-xl bg-bg-sunk p-5 ${
              tier.is_popular ? 'border-2 border-accent' : 'border border-line'
            }`}
          >
            {tier.is_popular && tier.highlight_label ? (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-bg">
                {tier.highlight_label}
              </span>
            ) : null}
            <h3 className="text-base font-semibold text-ink">{tier.name}</h3>
            <p className="mt-2 text-2xl font-bold text-ink">{tier.price_display}</p>
            <ul className="mt-4 space-y-2">
              {tier.features.map((feature, idx) => (
                <li key={`${tier.name}-feature-${idx}`} className="flex items-start gap-2 text-sm text-ink-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <a
              href={tier.cta_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
            >
              {tier.cta_label}
            </a>
          </article>
        ))}
      </div>

      {verifiedDate || sourceHostname ? (
        <p className="mt-6 text-xs text-muted">
          {verifiedDate ? `Pricing as of ${verifiedDate}.` : null}
          {sourceHostname ? (
            <>
              {verifiedDate ? ' ' : ''}Source:{' '}
              <a
                href={pricingTiers.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
              >
                {sourceHostname}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
