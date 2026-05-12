import { useCatalogStats } from '../../hooks/useCatalogStats'

const FALLBACK_TOOL_COUNT = 396

export default function SunoStory() {
  const { totalTools } = useCatalogStats()
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT
  return (
    <section id="audit-story" className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          04 / What "trustworthy" looks like in practice
        </div>

        <blockquote className="m-0 border-l-[3px] border-accent py-1 pl-5 md:pl-7">
          <div className="mb-3 flex flex-wrap gap-3 font-mono text-xs text-muted">
            <span>
              <b className="font-medium text-accent-ink">incident · 2026-04</b>
            </span>
            <span>resolved · 2 days</span>
            {/* TODO before merge to main: publish #2026-209 audit post at stable URL, link this reference */}
            <span>changelog · #2026-209</span>
          </div>

          <p className="mb-3.5 text-pretty text-[18px] leading-[1.55] tracking-[-0.005em] text-ink md:text-[22px]">
            Last month, the wizard recommended{' '}
            <code className="rounded border border-line bg-bg-sunk px-1.5 py-0.5 font-mono text-[0.85em] text-ink-2">
              Suno
            </code>{' '}
            — a music generation AI — for a coding query. One mismatch, but it broke
            our promise. We froze recommendations, audited the entire {displayCount}-tool catalog
            end to end, and applied <strong className="font-semibold">209 corrections</strong>
            {' '}— nearly half the catalog — in two days.
          </p>

          <p className="mb-4 text-pretty text-[18px] leading-[1.55] tracking-[-0.005em] text-ink md:text-[22px]">
            Every recommendation in AI Compass can be traced back to a specific rule
            you can read. Not a black box, not an embedding-similarity guess —
            a <em>reason</em>.
          </p>

          {/* TODO Saturday: link signature to /about or team page once that route exists */}
          <div className="text-[13px] text-muted">— the AI Compass team</div>
        </blockquote>
      </div>
    </section>
  )
}
