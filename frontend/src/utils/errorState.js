// Tiny helper for deciding which ErrorState variant to render when a
// fetch fails. We split into three bins:
//
//   offline  — browser says we're offline OR the fetch threw before
//              getting a response (TypeError "Failed to fetch", which is
//              what browsers throw on DNS failure, refused connection,
//              CORS network errors, etc.)
//   server   — the request reached someone and that someone returned
//              a non-OK status (5xx, or anything that produced an Error
//              with a status). The page is up; the data isn't.
//   notfound — explicit 404 from the API. Caller passes this in by
//              setting err.status = 404 before re-throwing (see
//              AlternativesPage and ToolDetailPage).
//
// Keep this dumb on purpose — the page knows more than this helper
// does and can override the variant when it has better info.
export function inferErrorVariant(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline'
  }
  if (err && err.status === 404) {
    return 'notfound'
  }
  // Native fetch throws TypeError for network-layer failures. Anything
  // that got past the network and came back with a status will be a
  // regular Error we constructed ourselves.
  if (err && err.name === 'TypeError') {
    return 'offline'
  }
  return 'server'
}
