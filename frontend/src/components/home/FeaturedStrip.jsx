import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import ToolLogo from '../ui/ToolLogo'

// Homepage "Featured on AI Compass" strip — surfaces tools with an active
// Fast-Track sponsorship (GET /api/v1/tools/sponsored, backed by the
// existing _sponsored_active/_placement_rank mechanism already used to rank
// sponsored tools in search results). Renders nothing until there's at
// least one real sponsor — no placeholder/fake inventory.
export default function FeaturedStrip() {
  const [tools, setTools] = useState(null) // null = not loaded yet, [] = loaded and empty

  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/tools/sponsored?limit=8')
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => {
        if (!cancelled) setTools(Array.isArray(data.results) ? data.results : [])
      })
      .catch(() => {
        if (!cancelled) setTools([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!tools || tools.length === 0) return null

  return (
    <section id="featured-strip" className="pb-4 pt-10 md:pb-8 md:pt-14">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-2 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-2">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          Featured on AI Compass
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tools.map((tool) => (
            <Link
              key={tool.slug}
              to={`/tools/${tool.slug}`}
              className="flex items-center gap-2.5 rounded-2xl border border-line bg-bg-elev p-3 shadow-sm transition hover:border-accent/40 hover:shadow-md"
            >
              <ToolLogo tool={tool} size={36} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">{tool.name}</span>
                </div>
                <p className="truncate text-xs text-muted">
                  {tool.tagline || tool.shortDescription || tool.summary || tool.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
