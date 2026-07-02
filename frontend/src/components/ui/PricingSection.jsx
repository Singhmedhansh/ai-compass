import { Check, DollarSign, Clock, ExternalLink, Award } from 'lucide-react'
import { useCurrency } from '../../context/CurrencyContext'

export default function PricingSection({ tool }) {
  const { convertPrice, selectedCurrency } = useCurrency()
  const pricingTiers = tool?.pricing_tiers
  const hasTiers = pricingTiers && Array.isArray(pricingTiers.tiers) && pricingTiers.tiers.length > 0

  if (!hasTiers) {
    return (
      <div className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink tracking-tight">Pricing</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-bg-sunk px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2 border border-line/40">
            Overview
          </span>
        </div>
        <section
          role="status"
          className="mt-6 rounded-2xl border border-line border-dashed bg-bg-sunk/30 px-6 py-12 text-center"
        >
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm text-muted"
            aria-hidden="true"
          >
            <DollarSign className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-base font-bold text-ink">Detailed pricing coming soon</h3>
          <p className="mt-2 text-xs text-ink-2 max-w-sm mx-auto font-normal">
            We are currently auditing this tool's pricing model. The base pricing tier is classified as:
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-soft/20 text-accent px-3 py-1 text-xs font-semibold capitalize border border-accent/10">
            {tool?.pricing || 'Unknown'}
          </div>
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
    <div className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm space-y-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink tracking-tight">Pricing Plans</h2>
          {verifiedDate && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted">
              <Clock className="h-3 w-3" /> Verified {verifiedDate}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-2 max-w-lg font-normal">
          Explore student-friendly subscription rates and options. Select the plan that matches your project requirements.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {pricingTiers.tiers.map((tier) => {
          const priceStr = convertPrice(tier.price_display)
          const hasSlash = priceStr.includes('/')
          const priceParts = hasSlash ? priceStr.split('/') : [priceStr, '']

          return (
            <article
              key={tier.name}
              className={`relative flex flex-col justify-between rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${
                tier.is_popular
                  ? 'border-2 border-accent bg-gradient-to-b from-bg-elev via-bg-elev to-accent-soft/5 shadow-sm'
                  : 'border border-line bg-bg-sunk/35 hover:border-line-strong'
              }`}
            >
              {tier.is_popular && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-0.5 text-[9px] font-bold uppercase tracking-wider text-bg shadow-sm">
                  <Award className="h-2.5 w-2.5" /> {tier.highlight_label || 'Popular'}
                </span>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-ink-2 uppercase tracking-wider">{tier.name}</h3>
                  <div className="mt-2 flex items-baseline gap-0.5">
                    <span className="text-2xl font-black text-ink tracking-tight break-all [overflow-wrap:anywhere]">{priceParts[0]}</span>
                    {priceParts[1] && (
                      <span className="text-xs font-semibold text-muted-2 whitespace-nowrap">/{priceParts[1]}</span>
                    )}
                  </div>
                </div>

                <ul className="space-y-2.5 border-t border-line/60 pt-4">
                  {tier.features.map((feature, idx) => (
                    <li key={`${tier.name}-feature-${idx}`} className="flex items-start gap-2.5 text-xs text-ink-2 leading-relaxed">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft/30 text-accent">
                        <Check className="h-2.5 w-2.5 font-bold" />
                      </span>
                      <span className="font-normal">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-6">
                <a
                  href={tier.cta_url || pricingTiers.source_url || tool.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-xs font-bold transition duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    tier.is_popular
                      ? 'bg-accent text-bg hover:bg-accent/90 shadow-sm'
                      : 'border border-line bg-bg hover:border-line-strong hover:bg-bg-sunk text-ink'
                  }`}
                >
                  <span>{tier.cta_label || (tier.price_amount === 0 ? 'Get Started' : 'Choose Plan')}</span>
                </a>
              </div>
            </article>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-line/45 pt-4 text-[10px] text-muted">
        {selectedCurrency !== 'USD' ? (
          <span className="font-medium text-accent">
            ℹ️ Converted dynamically to {selectedCurrency} from USD rates. Check official site for final localized pricing.
          </span>
        ) : (
          <span />
        )}

        {sourceHostname && (
          <span className="flex items-center gap-1 sm:self-end">
            Official Pricing Page:{' '}
            <a
              href={pricingTiers.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-semibold text-accent hover:underline"
            >
              {sourceHostname} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </span>
        )}
      </div>
    </div>
  )
}
