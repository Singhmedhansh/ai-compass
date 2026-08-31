// Single source of truth for the /submit tier selector and /pricing page.
//
// The ladder is priced on DELIVERABLES, not on queue position. Quick Review
// ($14.99, "skip the queue") was retired: it sold a place in a queue the
// operator personally controls, twelve consecutive founders declined it, and
// it made the ladder read as a toll booth. It still exists server-side
// (pricing_tiers.py, `for_sale: False`) so live rows keep resolving — but it
// is no longer offered, which is why it is absent here.
//
// Every line below is a promise something in the backend actually keeps.
// Where each one is kept:
//
//   review order         Submission.is_priority (set on verified payment in
//                        submit_tool) sorts the admin queue — paid rows are
//                        reviewed before free ones.
//   goes-live delay      pricing_tiers.TIERS[*].visibility_delay_days, applied
//                        as catalog_tools.visible_at at approval. This is the
//                        mechanical part of "faster"; the review-time targets
//                        are a human commitment, so they are worded as targets.
//   above-free placement search_utils.search_tools + _placement_rank, gated on
//                        _sponsored_active().
//   Sponsored badge      Card.jsx, from the same _sponsored_active() flag.
//   homepage strip       GET /api/v1/tools/sponsored.
//   community rail       sponsorship.complimentary_window() — 30 days from the
//                        Launch Day when one is booked, otherwise from
//                        APPROVAL, with impressions/clicks/CTR reporting.
//   launch day           app/launch_day.py — the founder picks the date these
//                        perks start on, one launch per calendar day, never
//                        earlier than the tier's own release delay. It
//                        schedules what the tier already includes; it sells
//                        nothing extra, which is why it has no price.
//   digest spotlight     digest.compute_new_tools() orders sponsored first and
//                        labels them "Sponsored".
//   thread badge         community_routes._is_tool_featured() — 30 days from
//                        SUBMISSION (not approval) for any paid tier.
//   dashboard analytics  GET /api/v1/submissions/dashboard — paid tiers get
//                        clicks/views/CTR/trend; placement tiers also get the
//                        category benchmark and live perk confirmation.
//   editorial review     app/editorial.py — commissioned automatically on a
//                        verified Reviewed-tier payment (submit_tool).
//   partner units        app/partner_slots.py — a labelled card on the best-of
//                        guides and /alternatives pages, capped at 2 per page,
//                        rotated when oversubscribed, and only where the tool
//                        is honestly relevant to that page.
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
    tagline: 'A full listing with your description and link, on the same terms as everything else in the catalog.',
    reviewEta: 'Reviewed after paid submissions · goes live 7 days after approval.',
    perks: [
      'Full directory listing with description, link, category and tags',
      'Your own indexed /tools/ page, plus alternatives and comparison pages',
      'Announced in the new-tools email digest when it goes live',
      'Searchable, filterable and rateable like every other tool',
      'Permanent — it never expires and never needs renewing',
    ],
    notIncluded: [
      'Priority review — free submissions are reviewed after paid ones',
      'Placement above free listings',
      'Sponsored badge',
      'Homepage Featured strip',
      'Click and view analytics',
      'Choosing your own launch date',
      'A written review of your tool',
    ],
  },
  {
    id: 'sponsor',
    pricingModel: 'sponsored_paypal',
    price: 49,
    priceLabel: '$49',
    badgeLabel: 'Fast-Track',
    name: 'Fast-Track',
    tagline: 'Reviewed first, live the next day, and placed above free listings for as long as the listing stands — every unit of it labelled.',
    reviewEta: 'Reviewed first, target 24 hours · goes live 1 day after approval.',
    perks: [
      'Everything in the free listing',
      'Priority review queue — ahead of every free submission',
      'Goes live 1 day after approval, not 7',
      'Placement above free listings in your category and in search, permanently',
      'A labelled "Sponsored" badge on your card everywhere it appears',
      'Eligible for the homepage "Featured on AI Compass" strip',
      'A labelled Partner card on the best-of guide for your category, and on the alternatives pages of every tool in it',
      'A Featured rail card on /community for 30 days',
      'Launch Day: pick the date it all starts on, and we run one launch a day',
      'Announced first in the new-tools digest, labelled "Sponsored"',
      'Delivery reporting: impressions, clicks and CTR on the rail card',
      'Founder dashboard with your clicks, views, CTR and category benchmark',
    ],
    notIncluded: [
      'A written review of your tool — that is the Reviewed tier',
    ],
  },
  {
    id: 'reviewed',
    pricingModel: 'reviewed_paypal',
    price: 79,
    priceLabel: '$79',
    badgeLabel: 'Reviewed',
    name: 'Reviewed Listing',
    tagline: 'Fast-Track, plus we actually use your tool and publish an honest hands-on review of it on your page.',
    reviewEta: 'Everything in Fast-Track · your written review follows within 10 days.',
    perks: [
      'Everything in Fast-Track',
      'A 300–500 word hands-on review, written after we actually use the tool',
      'Screenshots from that session — not your press kit',
      'Pros, cons and a scored verdict, bylined and dated',
      'Published on your own indexed /tools/ page and there permanently',
      'A third-party URL you can cite from your site, launch post and investor update',
    ],
    notIncluded: [
      'A favourable verdict. We publish what we find, and the page says it was commissioned',
    ],
  },
]

export function getTier(id) {
  return PRICING_TIERS.find((tier) => tier.id === id) || PRICING_TIERS[PRICING_TIERS.length - 1]
}
