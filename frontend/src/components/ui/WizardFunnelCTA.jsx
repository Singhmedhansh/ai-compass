import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight, Compass } from 'lucide-react'

export default function WizardFunnelCTA({ 
  variant = 'inline', 
  title = "Not sure which tool is right for you?",
  subtitle = "Answer 3 quick questions to get personalized recommendations tailored to your goals.",
  className = ""
}) {
  if (variant === 'inline') {
    return (
      <div className={`my-8 rounded-2xl border border-accent/30 bg-gradient-to-r from-accent-soft/40 via-bg-elev to-accent-soft/20 p-5 shadow-sm transition-all hover:border-accent/60 ${className}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-bg shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-ink">
                Not sure which is right for you?
              </h4>
              <p className="text-xs text-muted mt-0.5">
                Find your perfect AI tool match in 60 seconds →
              </p>
            </div>
          </div>
          <Link
            to="/ai-tool-finder"
            className="group shrink-0 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-xs font-bold text-accent-ink transition-all hover:bg-accent-hover hover:scale-105 shadow-sm"
          >
            <span>Take 60s Match Wizard</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <section className={`my-12 rounded-3xl border border-line bg-gradient-to-br from-bg-elev via-bg-elev to-accent-soft/30 p-8 shadow-sm ${className}`}>
      <div className="mx-auto max-w-2xl text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent-soft/50 px-3.5 py-1 text-xs font-semibold text-accent-ink">
          <Compass className="h-3.5 w-3.5 animate-spin-slow" />
          <span>Interactive AI Tool Finder</span>
        </div>

        <h3 className="text-2xl font-bold text-ink tracking-tight sm:text-3xl">
          {title}
        </h3>

        <p className="text-sm text-muted max-w-lg mx-auto">
          {subtitle}
        </p>

        <div className="pt-2 flex justify-center">
          <Link
            to="/ai-tool-finder"
            className="group inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-accent-ink transition-all hover:scale-105 shadow-md hover:shadow-accent/20"
          >
            <span>Find your match in 60 seconds</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  )
}
