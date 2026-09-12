import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { GOAL_OPTIONS, SUB_CATEGORIES } from '../../lib/wizardOptions'
import { finderPath } from '../../utils/finderLink'

/**
 * The wizard's first question, asked in place on a landing page.
 *
 * The SEO pages already carried two or three CTAs into the Stack Architect
 * and still only converted 6.4% of visitors into wizard starts, so the
 * problem was never CTA surface — it was the size of the ask. "Leave this
 * page and fill in a form" is a much bigger commitment than "click the chip
 * that describes you", even though they lead to the same place.
 *
 * Each chip is a real link carrying the answer it represents, so a click
 * arrives at the wizard with question 1 (and often 2) already answered.
 * Options come from lib/wizardOptions so they always match the values
 * readWizardPrefill() accepts.
 *
 * Props:
 *   goal    — when the page implies a goal (a coding page, a student page),
 *             chips become that goal's specific tasks and a click answers two
 *             questions at once. Otherwise chips are the six top-level goals.
 *   budget  — carried along when the page implies one (e.g. a free-tools page)
 *   source  — page identifier reported with the click event
 */
export default function InlineWizardPicker({
  goal = '',
  budget = '',
  title = 'What are you trying to do?',
  subtitle = 'Pick one and we’ll match tools to it — no account, about 30 seconds.',
  source = 'seo',
  className = '',
}) {
  const subCategories = goal ? SUB_CATEGORIES[goal] : null
  const options = subCategories?.length
    ? subCategories.map((option) => ({ ...option, params: { goal, use_case: option.id, budget } }))
    : GOAL_OPTIONS.map((option) => ({ ...option, params: { goal: option.id, budget } }))

  const report = (option) => {
    try {
      window.posthog?.capture?.('seo_inline_wizard_answer', {
        source,
        answered: subCategories?.length ? 'use_case' : 'goal',
        value: option.id,
      })
    } catch {
      // telemetry must never break a navigation
    }
  }

  return (
    <section
      className={`my-8 rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-soft/30 via-bg-elev to-bg-elev p-5 sm:p-6 ${className}`}
      aria-labelledby="inline-wizard-picker-title"
    >
      <h2 id="inline-wizard-picker-title" className="text-lg font-bold tracking-tight text-ink sm:text-xl">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon
          return (
            <Link
              key={option.id}
              to={finderPath(option.params)}
              onClick={() => report(option)}
              className="group flex items-center gap-3 rounded-xl border border-line bg-bg-elev px-3.5 py-3 text-left transition-all hover:border-accent hover:bg-accent-soft/30"
            >
              {Icon ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
                  <Icon className="h-4 w-4" />
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{option.label}</span>
                {option.desc ? (
                  <span className="block truncate text-xs text-muted">{option.desc}</span>
                ) : null}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
