import { useEffect, useRef } from 'react'

/**
 * Fires one impression beacon when a sponsored unit is actually seen.
 *
 * "Actually seen" matters commercially: counting every render would inflate
 * the denominator on a sponsor's CTR and make the report worthless to them.
 * So this waits for the element to intersect the viewport, then posts once
 * per mount and never again. Failures are swallowed — a lost beacon is an
 * undercount, never a broken page.
 *
 * @param {{slug: string, placement: string, slotId?: number|null}} unit
 * @returns {import('react').RefObject} attach to the unit's root element
 */
export default function useSponsorImpression({ slug, placement = 'rail', slotId = null }) {
  const ref = useRef(null)
  const sentRef = useRef(false)

  useEffect(() => {
    sentRef.current = false
  }, [slug, placement, slotId])

  useEffect(() => {
    const node = ref.current
    if (!node || !slug) return undefined

    const send = () => {
      if (sentRef.current) return
      sentRef.current = true
      fetch('/api/v1/community/sponsors/impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_slug: slug, placement, slot_id: slotId }),
        credentials: 'include',
        keepalive: true,
      }).catch(() => {})
    }

    // No IntersectionObserver (older Safari, jsdom in tests) — the unit is
    // rendered, so count it rather than reporting zero forever.
    if (typeof IntersectionObserver === 'undefined') {
      send()
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          send()
          observer.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [slug, placement, slotId])

  return ref
}
