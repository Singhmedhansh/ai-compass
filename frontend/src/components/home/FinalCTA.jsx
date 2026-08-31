import { Link } from 'react-router-dom'

import SectionHeader from './SectionHeader'

export default function FinalCTA() {
  return (
    <section id="final" className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeader
          index="06"
          label="Your turn"
          title="Tell us your situation. We'll do the picking."
          lede="Four questions. About 40 seconds. No account, no email, no upsell at the end — just five tools chosen for you and the reasons we chose them."
          className="mb-6"
        />

        {/* Both CTAs route to full pages instead of in-page anchors. The
            old `#wizard` worked (WizardDemo has id="wizard") but `#catalog`
            silently 404'd — no element on this page has that id. Hero's
            CTAs already point at /ai-tool-finder and /tools, so we mirror
            those destinations here for consistency and because the full
            wizard route is the more substantive landing than the homepage
            demo. */}
        <div className="flex flex-wrap items-center gap-2.5">
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
          <Link
            to="/tools"
            className="inline-flex items-center gap-2 rounded-full border border-line-strong px-[18px] py-3 text-sm font-medium text-ink transition-all hover:border-ink hover:bg-bg-elev"
          >
            Browse the catalog
          </Link>
        </div>
      </div>
    </section>
  )
}
