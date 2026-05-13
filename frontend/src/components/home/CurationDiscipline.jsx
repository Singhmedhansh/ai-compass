// WHY: motion is used as <motion.span> in JSX below; do NOT remove this import even if lint flags it as unused (eslint-plugin-react is missing from the config — false positive). Removing it crashes the homepage at render time with "motion is not defined".
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'

import { useCatalogStats } from '../../hooks/useCatalogStats'
import { useCountUp, useScrollReveal } from '../../lib/motion'

const FALLBACK_TOOL_COUNT = 396

export default function CurationDiscipline() {
  const [statsRef, statsInView] = useScrollReveal({ threshold: 0.3 })
  const { totalTools } = useCatalogStats()
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT
  // useCountUp re-animates if target changes — graceful when fetched value differs from fallback.
  const toolCount = useCountUp(displayCount, { enabled: statsInView, duration: 1.8 })
  const cadenceCount = useCountUp(7, { enabled: statsInView, duration: 1.0 })

  return (
    <section id="curation" className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          03 / Curation discipline
        </div>

        <h2 className="mb-4 max-w-[28ch] text-balance text-[28px] font-semibold leading-[1.15] tracking-tight text-ink md:max-w-[20ch] md:text-[40px]">
          Why this catalog isn't another scrape.
        </h2>

        <div className="mt-2 grid grid-cols-1 gap-[18px] md:grid-cols-[1.1fr_1fr] md:gap-16">
          {/* Prose column */}
          <div className="text-pretty">
            <p className="mb-3.5 text-base leading-[1.65] text-ink-2">
              Every tool in AI Compass has been opened, used for at least an hour, and
              assigned a written rationale.{' '}
              <strong className="font-semibold text-ink">
                No scraping. No paid placements. No affiliate ranking tricks.
              </strong>{' '}
              If a tool is in the catalog, someone here found it useful for a specific kind of student.
            </p>
            <p className="mb-3.5 text-base leading-[1.65] text-ink-2">
              Pricing pages are checked weekly. When a free tier disappears or a model
              gets nerfed, the tool's score is recomputed — sometimes it falls out of
              recommendations entirely.{' '}
              <strong className="font-semibold text-ink">
                Broken tools are removed, not buried.
              </strong>
            </p>
            <p className="text-base leading-[1.65] text-ink-2">
              We publish what changed and why, in a public changelog. The wizard's logic
              is rule-based and inspectable — you can ask why a tool was suggested and
              get a real answer, not a vibe.
            </p>
          </div>

          {/* Stats column — 3 stats in a single column on mobile, side-by-side at md+. Removed the unbacked "tools removed in 2026" stat. */}
          <div
            ref={statsRef}
            aria-label="Catalog facts"
            className="grid grid-cols-1 gap-px self-start overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3"
          >
            <div className="bg-bg p-5 md:p-7">
              <div className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-ink md:text-[40px]">
                <motion.span aria-label={String(displayCount)}>{toolCount}</motion.span>
              </div>
              <div className="mt-2 text-[13px] leading-[1.45] text-muted">
                tools, hand-tested<br />last touched · this week
              </div>
            </div>

            <div className="bg-bg p-5 md:p-7">
              <div className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-ink md:text-[40px]">
                0<span className="ml-0.5 text-sm font-medium text-muted">paid</span>
              </div>
              <div className="mt-2 text-[13px] leading-[1.45] text-muted">
                sponsored placements<br />ever
              </div>
            </div>

            <div className="bg-bg p-5 md:p-7">
              <div className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-ink md:text-[40px]">
                <motion.span aria-label="7">{cadenceCount}</motion.span>d
              </div>
              <div className="mt-2 text-[13px] leading-[1.45] text-muted">
                re-score cadence<br />on pricing changes
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
