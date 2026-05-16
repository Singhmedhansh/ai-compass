// Single source of truth for "visit this tool" links.
//
// Every outbound click goes through the server's /go/<slug> redirect so we
// can (a) attach affiliate URLs without a frontend redeploy and (b) log all
// clicks in one place for revenue analytics. Falls back to a direct URL only
// if there's no slug (defensive — every catalog tool has one).
export function outboundUrl(tool) {
  const slug = tool?.slug
  if (slug) {
    return `/go/${encodeURIComponent(slug)}`
  }
  return tool?.affiliate_url || tool?.url || tool?.website || tool?.link || '#'
}

// Affiliate links must be rel="sponsored nofollow"; keep noopener for security.
export const OUTBOUND_REL = 'sponsored nofollow noopener noreferrer'
