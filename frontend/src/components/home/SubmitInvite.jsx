// WHY: motion is used as <motion.div> in JSX below; do NOT remove this import
// even if lint flags it as unused — same false-positive pattern as
// CurationDiscipline.jsx. Removing it crashes the homepage at render time.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import { useScrollReveal } from '../../lib/motion'

// Sits at the very bottom of HomePage, after FinalCTA. FinalCTA is a big
// bare-page section pitching the wizard (the primary conversion). This is
// the quieter PS for the user who scrolled all the way down — different
// framing, different action.
//
// Visual structure deliberately differs from FinalCTA: contained card with
// soft background, horizontal split on desktop, smaller heading. That
// distinction is the whole point — two identical-looking left-aligned
// sections in a row read as repetition, a contained card reads as a
// genuine closer.
export default function SubmitInvite() {
  const [ref, inView] = useScrollReveal({ threshold: 0.25 })

  return (
    <section ref={ref} id="submit-invite" className="pb-16 pt-4 md:pb-24 md:pt-8">
      <div className="mx-auto max-w-6xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="rounded-2xl border border-line bg-bg-elev px-6 py-7 md:px-10 md:py-8"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between md:gap-8">
            <div className="min-w-0 md:max-w-[60%]">
              <div className="mb-2 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-2">
                <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
                PS — One last thing
              </div>
              <h2 className="text-pretty text-[22px] font-semibold leading-[1.2] tracking-tight text-ink md:text-[26px]">
                Spotted an AI tool we&apos;re missing?
              </h2>
              <p className="mt-2 text-[14px] leading-[1.55] text-muted md:text-[15px]">
                Made it this far — you probably know one we don&apos;t. Send it
                over and we&apos;ll hand-check it the same way as the other 427.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
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
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg px-[18px] py-3 text-sm font-medium text-ink transition-all hover:border-ink hover:bg-bg-sunk"
              >
                Browse first
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
