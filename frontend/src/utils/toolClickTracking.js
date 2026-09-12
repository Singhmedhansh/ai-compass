/**
 * Emits a named `tool_click` event for every outbound click.
 *
 * "How many visitors found something useful" is the number the product is
 * steered by, and its best proxy is a click through to a tool. Until now that
 * figure came from PostHog autocapture — DOM matching on class names — which
 * silently stops matching the moment a card is restyled. A metric with a
 * target on it cannot rest on that.
 *
 * One delegated listener rather than an onClick on each of the fifteen call
 * sites: every outbound link is an anchor to /go/<slug> (see utils/outbound),
 * so the chokepoint is the href, and a new call site is covered the day it is
 * written instead of the day someone remembers to instrument it.
 *
 * The server counts the same clicks in outbound_clicks, so the two are
 * reconcilable — with the server side being the bot-filtered one. A gap
 * between them is a signal in itself: clicks the browser fired but the
 * redirect never logged.
 *
 * Capture phase, and never preventDefault: navigation must not depend on
 * telemetry succeeding.
 */
const OUTBOUND_PREFIX = '/go/'

export function toolSlugFromHref(href) {
  if (!href) return ''
  try {
    // Anchors report href absolute; parse rather than string-match so a
    // query string or an absolute URL both resolve correctly.
    const url = new URL(href, window.location.origin)
    if (url.origin !== window.location.origin) return ''
    if (!url.pathname.startsWith(OUTBOUND_PREFIX)) return ''
    return decodeURIComponent(url.pathname.slice(OUTBOUND_PREFIX.length))
  } catch {
    return ''
  }
}

export function installToolClickTracking() {
  if (typeof document === 'undefined') return () => {}

  const onClick = (event) => {
    try {
      const anchor = event.target?.closest?.('a[href]')
      if (!anchor) return
      const slug = toolSlugFromHref(anchor.getAttribute('href'))
      if (!slug) return

      window.posthog?.capture?.('tool_click', {
        slug,
        // Where the click came from, so assisted discovery can be split by
        // surface — an SEO page, the directory, or the wizard's results.
        path: window.location.pathname,
        is_affiliate: anchor.rel?.includes('sponsored') || false,
      })
    } catch {
      /* telemetry must never break a navigation */
    }
  }

  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

export default installToolClickTracking
