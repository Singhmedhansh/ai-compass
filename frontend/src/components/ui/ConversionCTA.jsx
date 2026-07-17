import { Link } from 'react-router-dom'
import { ArrowRight, Compass } from 'lucide-react'

export default function ConversionCTA({ 
  title = "Ready to build your AI stack?", 
  subtitle = "Tell us what you're working on. We'll hand-pick the perfect tools for your exact needs—no account required.",
  eyebrow = "Next Steps"
}) {
  return (
    <section className="py-12 md:py-20 border-t border-line mt-12">
      <div className="mx-auto max-w-4xl px-5 text-center">
        <div className="mb-4 inline-flex items-center justify-center gap-2 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          {eyebrow}
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
        </div>

        <h2 className="mb-4 mx-auto max-w-[24ch] text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink md:text-[40px]">
          {title}
        </h2>

        <p className="mb-8 mx-auto max-w-[48ch] text-base text-muted md:text-[17px]">
          {subtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/ai-tool-finder"
            className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-ink px-[24px] py-3.5 text-sm font-medium text-bg transition-all hover:-translate-y-px hover:shadow-md"
          >
            <Compass className="h-4 w-4" />
            Find your AI tool
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            to="/tools"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-line-strong px-[24px] py-3.5 text-sm font-medium text-ink transition-all hover:border-ink hover:bg-bg-elev"
          >
            Browse full catalog
          </Link>
        </div>
      </div>
    </section>
  )
}
