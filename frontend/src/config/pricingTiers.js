// Single source of truth for the /submit tier selector and /pricing page.
//
// Note on the badge: this used to promise a "Featured badge". `featured` is
// the EDITORIAL curation flag (~30 seeded tools carry it for free) and is
// deliberately not granted on payment — see admin_approve_submission. What a
// sponsor actually receives is the disclosed "Sponsored" badge rendered by
// Card.jsx, which is what this copy now says.
// Keep `id`/`pricingModel` in sync with app/pricing_tiers.py's prefixes —
// the backend matches pricing_model by startswith(prefix).
export const PRICING_TIERS = [
  {
    id: 'free',
    pricingModel: 'free',
    price: 0,
    priceLabel: 'Free',
    badgeLabel: 'Standard',
    name: 'Free Listing',
    tagline: 'Full directory listing with your description and link.',
    reviewEta: 'Reviewed in the order it arrives — usually within a couple of weeks.',
    perks: [
      'Full directory listing with description and link',
      'Reviewed in queue order (~2 weeks)',
    ],
    notIncluded: [
      'Priority review',
      'Sponsored placement above free listings',
      'Sponsored badge',
      'Newsletter mention',
    ],
  },
  {
    id: 'quick',
    pricingModel: 'quick_paypal',
    price: 14.99,
    priceLabel: '$14.99',
    badgeLabel: 'Quick Review',
    name: 'Quick Review',
    tagline: 'Same listing, reviewed faster — no placement boost, no badge, no newsletter mention.',
    reviewEta: 'Reviewed within 48–72 hours.',
    perks: [
      'Everything in the free listing',
      'Reviewed within 48–72 hours (vs. ~2 week free queue)',
    ],
    notIncluded: [
      'Sponsored placement above free listings',
      'Sponsored badge',
      'Newsletter mention',
    ],
  },
  {
    id: 'sponsor',
    pricingModel: 'sponsored_paypal',
    price: 49.99,
    priceLabel: '$49.99',
    badgeLabel: 'Fast-Track',
    name: 'Fast-Track Sponsored Curation',
    tagline: 'Guaranteed 24-hour review, permanent placement above free listings, a labelled Sponsored badge, newsletter mention.',
    reviewEta: 'Guaranteed review within 24 hours.',
    perks: [
      'Guaranteed review within 24 hours',
      'Sponsored placement above free listings in your category, permanently',
      'A labelled "Sponsored" badge on your card everywhere it appears',
      'Spotlight inclusion in weekly student AI digest',
      'Eligible for the homepage Featured strip',
    ],
    notIncluded: [],
  },
]

export function getTier(id) {
  return PRICING_TIERS.find((tier) => tier.id === id) || PRICING_TIERS[PRICING_TIERS.length - 1]
}
