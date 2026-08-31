// Sponsored placement catalogue for /sponsor and the community surfaces.
// Prices and capacities mirror PLACEMENT_PRICING / PLACEMENT_CAPACITY in
// app/sponsorship.py — change both together or the sales page will quote a
// number the backend does not agree with.
//
// `comingSoon` here is presentation only. The server's LIVE_PLACEMENTS set is
// what actually refuses a booking, so removing the flag from this file cannot
// accidentally put a tier on sale.
export const SPONSOR_PLACEMENTS = [
  {
    id: 'rail',
    name: 'Featured Tool',
    price: 14.99,
    priceLabel: '$14.99',
    cadence: '/ week',
    capacity: 4,
    comingSoon: false,
    highlight: true,
    tagline: 'A card in the Featured rail beside the leaderboard and feed.',
    includes: [
      'Card in the Featured rail on every community view',
      'Logo, one-line pitch, and a tracked outbound link',
      'Impressions, clicks and CTR in your delivery report',
      '"Featured" badge on your discussion threads',
    ],
    best: 'Testing whether this audience converts before spending more.',
  },
  {
    id: 'board',
    name: 'Presenting Partner',
    price: 89,
    priceLabel: '$89',
    cadence: '/ week',
    capacity: 2,
    tagline: 'The labelled row pinned directly above the weekly leaderboard.',
    includes: [
      'Everything in Featured Tool',
      'Pinned row above the leaderboard — the most-read block on the page',
      'Custom headline (up to 140 characters), not just your tagline',
      'Mention in the weekly community recap email',
    ],
    best: 'Launch weeks, funding news, and pricing changes worth announcing.',
    comingSoon: true,
  },
  {
    id: 'hero',
    name: 'Community Spotlight',
    price: 149,
    priceLabel: '$149',
    cadence: '/ week',
    capacity: 1,
    tagline: 'Sole ownership of the unit at the very top of /community.',
    includes: [
      'Everything in Presenting Partner',
      'The single full-width spotlight above the fold — one sponsor, no rotation',
      'Custom headline, blurb and call-to-action copy',
      'A pinned Showcase thread we help you write',
      'Weekly delivery report emailed to you',
    ],
    best: 'A launch you want the whole community to see and discuss.',
    comingSoon: true,
  },
]

// The commissioned editorial review. Not a placement: a placement is rented
// attention that expires, this is an artifact the founder keeps and can link
// from their own site, their launch post and their investor update.
//
// This is the STANDALONE price, for a tool that is already listed. Bundled
// with a new listing it is the $79 Reviewed tier (see config/pricingTiers.js).
// Price and turnaround mirror REVIEW_PRICE / TURNAROUND_DAYS in
// app/editorial.py; live capacity comes from /api/v1/reviews/pricing, and the
// server is what actually refuses an order.
export const REVIEW_PRODUCT = {
  id: 'review',
  name: 'Editorial review',
  price: 39,
  priceLabel: '$39',
  cadence: 'one-off',
  turnaroundDays: 10,
  tagline: 'A real hands-on review of your tool, on its own indexed page.',
  includes: [
    '300–500 words written after we actually use the tool',
    'Screenshots from the session, not your press kit',
    'Pros, cons and a scored verdict — ours, not yours',
    'Published on /tools/<your-slug>, indexed and permanent',
    'Bylined and dated, so it reads as a third party because it is one',
  ],
  best: 'A URL you can cite in your launch post, your site and your investor update.',
}

// What a sponsor is actually buying — stated as mechanics, not adjectives,
// because the honest version is the version that survives a refund request.
export const SPONSOR_PROMISES = [
  {
    title: 'Ranks are never for sale',
    body: 'The leaderboard is scored purely from votes, comments and click-throughs. Sponsored units sit in their own labelled row. That is why people read the board — and why being next to it is worth paying for.',
  },
  {
    title: 'Every unit is labelled',
    body: 'Sponsored means sponsored, in plain text on the unit. No disguised placements, no "editor\'s pick" that was invoiced.',
  },
  {
    title: 'You get the denominator',
    body: 'Impressions are recorded server-side per rendered unit and clicks come from the same redirect that powers our own analytics — so your CTR and ours can never disagree.',
  },
  {
    title: 'Capped inventory, fixed weeks',
    body: 'One spotlight, two partner rows, four rail cards. Slots run Monday to Sunday. When a placement is sold out the page says so instead of quietly overselling it.',
  },
]

export function getPlacement(id) {
  return SPONSOR_PLACEMENTS.find((p) => p.id === id) || SPONSOR_PLACEMENTS[0]
}
