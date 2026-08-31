import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ToolLogo } from '../ui'
import { outboundUrl, OUTBOUND_REL } from '../../utils/outbound'

// Labelled partner units for the pages that rank — the best-of guides and
// /alternatives/<slug>. See app/partner_slots.py for the rules; the two that
// matter on this side are that the block sits OUTSIDE the editorial list it
// appears beside, and that it says what it is in plain text.
//
// Renders nothing at all when there is no eligible sponsor, rather than an
// empty "Partners" heading. An empty section is an advertisement for unsold
// inventory, and a reader reads it as a broken page.

export default function PartnerUnits({ surface, className = '' }) {
  const [data, setData] = useState(null)
  const containerRef = useRef(null)
  const beaconed = useRef(new Set())

  useEffect(() => {
    if (!surface) return undefined
    const controller = new AbortController()
    fetch(`/api/v1/partners?surface=${encodeURIComponent(surface)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.units?.length && setData(d))
      .catch(() => {})
    return () => controller.abort()
  }, [surface])

  // Impressions are recorded when the unit actually enters the viewport, not
  // when the page loads — the same rule the community rail follows, so a
  // sponsor's CTR has a denominator that means "was seen".
  useEffect(() => {
    if (!data?.units?.length || !containerRef.current) return undefined
    const node = containerRef.current

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const slug = entry.target.getAttribute('data-slug')
          if (!slug || beaconed.current.has(slug)) return
          beaconed.current.add(slug)
          fetch('/api/v1/community/sponsors/impression', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tool_slug: slug, placement: 'partner' }),
          }).catch(() => {})
        })
      },
      { threshold: 0.5 }
    )

    node.querySelectorAll('[data-slug]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [data])

  if (!data?.units?.length) return null

  return (
    <section
      ref={containerRef}
      aria-labelledby="partner-units-heading"
      className={`rounded-2xl border border-line bg-bg-sunk/50 p-5 ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="partner-units-heading" className="text-sm font-bold uppercase tracking-wider text-muted">
          {data.units.length === 1 ? 'Partner' : 'Partners'}
        </h2>
        <p className="text-[11px] text-muted-2">Paid placement · not part of the picks above</p>
      </div>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {data.units.map((unit) => {
          const url = outboundUrl(unit)
          return (
            <li
              key={unit.slug}
              data-slug={unit.slug}
              className="flex items-start gap-3 rounded-xl border border-line bg-bg-elev p-3.5"
            >
              <ToolLogo tool={unit} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/tools/${unit.slug}`}
                    className="truncate text-sm font-bold text-ink hover:text-accent"
                  >
                    {unit.name}
                  </Link>
                  <span className="shrink-0 rounded-full border border-line-strong bg-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted">
                    {unit.label}
                  </span>
                </div>
                {unit.blurb && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-2">{unit.blurb}</p>
                )}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel={OUTBOUND_REL}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
                  >
                    {unit.cta_label || 'Visit site'}
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-2">{data.disclosure}</p>
    </section>
  )
}
