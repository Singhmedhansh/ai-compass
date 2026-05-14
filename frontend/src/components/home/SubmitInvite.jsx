// WHY: motion is used as <motion.div> in JSX below; do NOT remove this import
// even if lint flags it as unused — same false-positive pattern as
// CurationDiscipline.jsx. Removing it crashes the homepage at render time.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import { useScrollReveal } from '../../lib/motion'

// Sits at the very bottom of HomePage, after FinalCTA. The wizard CTA is the
// page's primary conversion path; this is the quiet PS for the power-user
// who scrolled all the way down — different framing, different action.
// Reveal-on-scroll keeps it feeling like a payoff rather than another section
// the eye glides past.
export default function SubmitInvite() {
  const [ref, inView] = useScrollReveal({ threshold: 0.25 })

  return (
    <section ref={ref} id="submit-invite" className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted">
            <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
            06 / Spotted a gap?
          </div>

          <h2 className="mb-3 max-w-[26ch] text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink md:max-w-[20ch] md:text-[48px]">
            Know a tool we&apos;re missing?
          </h2>

          <p className="mb-6 max-w-[48ch] text-base text-muted md:text-[17px]">
            Made it this far — you probably know AI tools we don&apos;t. Submit one and
            we&apos;ll hand-check it the same way as the other 425. No paid slots, no
            scraping our way to a bigger catalog.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/submit"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-[18px] py-3 text-sm font-medium text-bg transition-all hover:-translate-y-px hover:shadow-md"
            >
              Suggest a tool
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              >
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
            <Link
              to="/tools"
              className="inline-flex items-center gap-2 rounded-full border border-line-strong px-[18px] py-3 text-sm font-medium text-ink transition-all hover:border-ink hover:bg-bg-elev"
            >
              See what&apos;s already in
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
