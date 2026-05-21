// Hover/focus prefetch helpers for the most common navigation targets.
//
// On modest mobile + ~4s Render cold-start, the time from "tap a tool card"
// to "tool detail page renders" is dominated by:
//   1. Fetching the lazy chunk for ToolDetailPage (~30-60 KB gzipped)
//   2. Fetching /api/v1/tools/<slug> from Flask
// Both can be started while the user is still moving toward the click —
// hover gives us ~300-1000 ms of "intent" runway on desktop, and focus
// gives the keyboard equivalent. On touch devices the touchstart event
// fires ~50-150 ms before the click resolves, which still helps a bit.
//
// Each route's chunk is prefetched at most once per session (further calls
// are no-ops, so attaching the handler to every card is cheap). Per-slug
// API responses are also cached in a Set so we don't re-fire identical
// requests on the same page.
//
// Failures are swallowed — prefetch is best-effort. If the fetch errors,
// the real navigation will retry it; nothing the user sees changes.

const chunkPrefetched = {
  toolDetail: false,
  alternatives: false,
  comparePage: false,
}

const apiPrefetched = new Set()

function safeImport(loader) {
  try {
    return loader().catch(() => {})
  } catch {
    return undefined
  }
}

function safeFetch(url) {
  try {
    return fetch(url).catch(() => {})
  } catch {
    return undefined
  }
}

/**
 * Prefetch the tool detail route chunk + the API response for `slug`.
 * Attach to tool cards in listicles, DirectoryPage, AlternativesPage, etc.
 */
export function prefetchTool(slug) {
  if (!chunkPrefetched.toolDetail) {
    chunkPrefetched.toolDetail = true
    safeImport(() => import('../pages/ToolDetailPage'))
  }
  const key = `tool:${slug}`
  if (slug && !apiPrefetched.has(key)) {
    apiPrefetched.add(key)
    safeFetch(`/api/v1/tools/${slug}`)
  }
}

/**
 * Prefetch the alternatives route chunk + the alternatives API for `slug`.
 * Attach to "See alternatives →" links across listicles.
 */
export function prefetchAlternatives(slug) {
  if (!chunkPrefetched.alternatives) {
    chunkPrefetched.alternatives = true
    safeImport(() => import('../pages/AlternativesPage'))
  }
  const key = `alts:${slug}`
  if (slug && !apiPrefetched.has(key)) {
    apiPrefetched.add(key)
    safeFetch(`/api/v1/tools/${slug}/alternatives`)
  }
}

/**
 * Prefetch the compare route chunk. Used when a user hovers a "Compare X
 * with Y" link — we don't prefetch the API here because the compare page
 * fetches BOTH tools in parallel, so a single tool-API prefetch wouldn't
 * meaningfully accelerate it.
 */
export function prefetchCompare() {
  if (!chunkPrefetched.comparePage) {
    chunkPrefetched.comparePage = true
    safeImport(() => import('../pages/ComparePage'))
  }
}

/**
 * Convenience: returns the standard {onMouseEnter, onFocus, onTouchStart}
 * handler bundle for a tool card. Pass the slug to also warm the API.
 *
 * Usage:
 *   <Link to={`/tools/${slug}`} {...toolHoverHandlers(slug)}>...</Link>
 */
export function toolHoverHandlers(slug) {
  const fire = () => prefetchTool(slug)
  return { onMouseEnter: fire, onFocus: fire, onTouchStart: fire }
}

export function alternativesHoverHandlers(slug) {
  const fire = () => prefetchAlternatives(slug)
  return { onMouseEnter: fire, onFocus: fire, onTouchStart: fire }
}

export function compareHoverHandlers() {
  return {
    onMouseEnter: prefetchCompare,
    onFocus: prefetchCompare,
    onTouchStart: prefetchCompare,
  }
}
