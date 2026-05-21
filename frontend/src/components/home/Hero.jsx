import { Link } from 'react-router-dom'

import { useCatalogStats } from '../../hooks/useCatalogStats'
import AnimatedCompass from '../ui/AnimatedCompass'
import { MagneticWrapper, WordReveal } from '../ui'

// Static fallback covers the ~100ms before /api/v1/stats responds — kept close to the live count so the page never reads as broken.
const FALLBACK_TOOL_COUNT = 400

export default function Hero() {
  const { totalTools } = useCatalogStats()
  const displayCount = totalTools ?? FALLBACK_TOOL_COUNT
  return (
    <header className="relative pt-9 pb-8 md:pt-24 md:pb-20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
        <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-2.5 py-1 text-xs font-medium text-muted">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-accent"
            style={{ boxShadow: '0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent)' }}
          />
          For undergraduates · {displayCount} tools curated
        </div>

        <h1 className="mt-4 mb-3.5 text-balance text-3xl font-semibold leading-[1.1] tracking-tight text-ink md:max-w-[16ch] md:text-[56px] lg:text-[64px]">
          <WordReveal>A hand-picked AI finder. Made for students.</WordReveal>
        </h1>

        <p className="mb-5 max-w-[36ch] text-pretty text-[15px] text-muted md:max-w-[48ch] md:text-lg">
          Answer 4 questions about your situation — use case, level, budget, platform —
          and get <strong className="font-medium text-ink-2">5–6 AI tools chosen for you</strong>,
          each with a one-line reason. Free. No login. No directory spam.
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <MagneticWrapper strength={0.25}>
            <Link
              to="/ai-tool-finder"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-[18px] py-3 text-sm font-medium text-bg transition-all hover:-translate-y-px hover:shadow-md"
            >
              Start the wizard
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              >
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
          </MagneticWrapper>
          <Link
            to="/tools"
            className="inline-flex items-center gap-2 rounded-full border border-line-strong px-[18px] py-3 text-sm font-medium text-ink transition-all hover:border-ink hover:bg-bg-elev"
          >
            Browse the catalog
          </Link>
        </div>

        <div
          className="mt-6 flex flex-wrap gap-[18px] text-[13px] text-muted"
          aria-label="Quick facts"
        >
          <span className="inline-flex items-center gap-1.5">
            <b className="font-semibold text-ink">~1 min</b> · to a shortlist
          </span>
          <span className="inline-flex items-center gap-1.5">
            <b className="font-semibold text-ink">0</b> · accounts required
          </span>
        </div>

        <div
          aria-hidden="true"
          className="mt-7 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-2 md:hidden"
        >
          <span>Scroll</span>
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <path d="M3 5l3 3 3-3" />
          </svg>
        </div>
        </div>

        <div className="hidden justify-center md:flex">
          <AnimatedCompass size={340} />
        </div>
      </div>
    </header>
  )
}
