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
//   monthly report       app/founder_report.py — emailed to every verified
//                        PAID listing that is actually live, with the previous
//                        window beside the current one. This is the whole
//                        deliverable of the $19 tier, so it is the one line
//                        that must never quietly become free.
//   partner units        app/partner_slots.py — a labelled card on the best-of
//                        guides and /alternatives pages, capped at 2 per page,
//                        rotated when oversubscribed, and only where the tool
//                        is honestly relevant to that page.
//
// Note on the $19 tier: the diagnostic proposed selling a "Claimed Listing"
// — founder account, edit rights, verified badge, monthly report. Three of
// those four shipped FREE in app/claims.py: anyone who can prove they own the
// domain can claim their listing, edit its copy, carry the maker badge and
// reply to reviews, at no charge. Charging for them now would be withdrawing
// a live free feature and calling it a product. So this tier sells the only
// part that was ever actually behind the wall — the numbers — and says so.
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
      'Click and view analytics, and the monthly report',
      'Choosing your own launch date',
      'A written review of your tool',
    ],
  },
  {
    id: 'analytics',
    pricingModel: 'analytics_paypal',
    price: 19,
    priceLabel: '$19',
    badgeLabel: 'Analytics',
    name: 'Listing + Analytics',
    tagline: 'The same listing, plus the numbers it earns — a dashboard, and a report in your inbox every month.',
    reviewEta: 'Reviewed ahead of free submissions · goes live 7 days after approval.',
    perks: [
      'Everything in the free listing',
      'Reviewed ahead of every free submission',
      'A founder dashboard: clicks, views, CTR, saves and a 14-day trend',
      'A monthly report emailed to you — this month beside last month, with the real numbers including the small ones',
      'Outbound clicks counted by the same redirect that powers our own analytics, so your figures and ours can never disagree',
    ],
    notIncluded: [
      'Placement above free listings — this tier buys the numbers, not the position',
      'A "Sponsored" badge, the homepage strip or Partner cards',
      'A faster go-live — the 7-day wait is the same as free, on purpose',
      'A written review of your tool',
    ],
    // Claiming is free for everyone (app/claims.py), so it is deliberately
    // absent from both lists here: it is neither sold nor withheld.
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
      'Everything in Listing + Analytics, including the monthly report',
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

// ---------------------------------------------------------------------------
// Card highlights vs. the full perk list
// ---------------------------------------------------------------------------
// `perks` above is the complete, contractual list — every line is something
// the backend actually delivers, and it is what the /submit checkout sidebar
// shows a buyer who has already chosen a tier.
//
// It is the wrong thing to put on a pricing CARD. Rendered as four side-by-
// side columns it produced 5, 4, 12 and 6 bullets: one column ran to nearly
// twice the height of its neighbours, the cheapest tier looked like the
// biggest, and the $49 column — the one that has to sell — read as a wall.
// A price grid is scanned, not read; whichever column is tallest wins the
// eye, and here that was an accident of list length.
//
// So the cards show `highlights`: at most four lines, the same shape in every
// column, each one a thing the reader can picture. The full list did not go
// anywhere — it is the comparison matrix below, which is where someone who is
// actually deciding between two tiers goes to look.
export const TIER_HIGHLIGHTS = {
  free: [
    'A permanent listing, page and search entry',
    'Announced in the weekly new-tools email',
    'Rateable and reviewable like every other tool',
    'Live 7 days after approval',
  ],
  analytics: [
    'Everything in Free',
    'Your numbers: views, clicks, CTR, saves',
    'A report emailed to you every month',
    'Reviewed ahead of every free submission',
  ],
  sponsor: [
    'Everything in Analytics',
    'Placed above free listings, permanently',
    'Homepage strip, guide cards and the community rail',
    'Live 1 day after approval, not 7',
  ],
  reviewed: [
    'Everything in Fast-Track',
    'A 300-500 word hands-on review we actually write',
    'Screenshots, pros, cons and a scored verdict',
    'A citable third-party URL that never expires',
  ],
}

// ---------------------------------------------------------------------------
// The comparison matrix
// ---------------------------------------------------------------------------
// One row per thing that differs, in the order a founder cares about them:
// what everyone gets, then speed, then visibility, then proof.
//
// A cell is `true` (included), `false` (not), or a string (included, with the
// detail that makes it worth the money — "1 day" beats a tick when the row
// above it says "7 days"). Strings are what stop this being a tick-farm: four
// columns of identical ticks tells a reader nothing about why one costs sixty
// dollars more.
//
// Rows are grouped, because an ungrouped 18-row table is the same wall of
// text the cards were, just rotated.
export const COMPARISON_GROUPS = [
  {
    title: 'Every listing, at every tier',
    rows: [
      ['Permanent directory listing', true, true, true, true],
      ['Your own indexed /tools/ page', true, true, true, true],
      ['Alternatives and comparison pages', true, true, true, true],
      ['Announced in the weekly new-tools email', true, true, true, true],
      ['Claim and edit it yourself (domain proof)', true, true, true, true],
      ['Ratings and reader reviews', true, true, true, true],
    ],
  },
  {
    title: 'Speed',
    rows: [
      ['Review order', 'After paid', 'Ahead of free', 'First, target 24h', 'First, target 24h'],
      ['Goes live after approval', '7 days', '7 days', '1 day', '1 day'],
      ['Pick your own launch date', false, false, true, true],
    ],
  },
  {
    title: 'Your numbers',
    rows: [
      ['Founder dashboard: views, clicks, CTR, saves', false, true, true, true],
      ['14-day trend', false, true, true, true],
      ['Monthly report emailed to you', false, true, true, true],
      ['Category benchmark', false, false, true, true],
      ['Rail-card delivery reporting', false, false, true, true],
    ],
  },
  {
    title: 'Visibility',
    rows: [
      ['Placed above free listings in category and search', false, false, 'Permanent', 'Permanent'],
      ['Labelled "Sponsored" badge on your card', false, false, true, true],
      ['Homepage "Featured on AI Compass" strip', false, false, true, true],
      ['Partner card on the best-of guide for your category', false, false, true, true],
      ['Featured card on /community', false, false, '30 days', '30 days'],
      ['First position in the new-tools digest', false, false, true, true],
    ],
  },
  {
    title: 'Editorial',
    rows: [
      ['Hands-on written review on your page', false, false, false, '300-500 words'],
      ['Screenshots from our own session', false, false, false, true],
      ['Scored verdict, bylined and dated', false, false, false, true],
      ['A favourable verdict', false, false, false, false],
      ['An editorial pick, or a leaderboard rank', false, false, false, false],
    ],
  },
]

// Column order for COMPARISON_GROUPS rows. Kept beside the data rather than
// derived from PRICING_TIERS so reordering the cards can never silently
// reshuffle the matrix's cells under their headers.
export const COMPARISON_COLUMNS = ['free', 'analytics', 'sponsor', 'reviewed']

export function getTier(id) {
  return PRICING_TIERS.find((tier) => tier.id === id) || PRICING_TIERS[PRICING_TIERS.length - 1]
}
