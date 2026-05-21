// WHY: motion is used as <motion.div> in JSX below; do NOT remove this import
// even if lint flags it as unused (eslint-plugin-react is missing from the
// config — false positive). Removing it crashes the homepage at render time.
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import { useState } from 'react'

import { useScrollReveal } from '../../lib/motion'

// Sits between CurationDiscipline (03) and SunoStory (04). Single opt-in
// — POSTs to /api/v1/newsletter/subscribe, idempotent on already-
// subscribed addresses, no confirmation email. The next digest send is
// the welcome; the unsubscribe link in every digest is one-click revoke.
//
// We deliberately don't number this section ("03.5" would feel off) so
// it reads as a side-note between the curation argument (03) and the
// audit reveal (04), not a fresh phase of the funnel.

export default function NewsletterCapture() {
  const [ref, inView] = useScrollReveal({ threshold: 0.25 })
  const [email, setEmail] = useState('')
  // Honeypot — bots fill this, humans never see it. State + value binding
  // is required so React doesn't strip the controlled input on re-renders.
  const [website, setWebsite] = useState('')
  // status: 'idle' | 'submitting' | 'success' | 'error'
  const [status, setStatus] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (status === 'submitting') return

    setStatus('submitting')
    setErrorMessage('')

    try {
      const response = await fetch('/api/v1/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          website, // honeypot field — server ignores when non-empty
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        setStatus('error')
        setErrorMessage(
          json.error || 'Something went wrong — try again in a moment.',
        )
        return
      }
      setStatus('success')
      setEmail('')
    } catch {
      setStatus('error')
      setErrorMessage('Network issue — please try again.')
    }
  }

  return (
    <section
      ref={ref}
      id="newsletter"
      className="py-12 md:py-20"
    >
      <div className="mx-auto max-w-6xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="rounded-2xl border border-line bg-bg-elev px-6 py-7 md:px-10 md:py-9"
        >
          <div className="mb-3 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-2">
            <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
            New tools, when we add them
          </div>

          <h2 className="text-balance text-[22px] font-semibold leading-[1.2] tracking-tight text-ink md:max-w-[28ch] md:text-[26px]">
            Want a short email when new AI tools join the catalog?
          </h2>

          <p className="mt-2.5 max-w-[52ch] text-[14px] leading-[1.55] text-muted md:text-[15px]">
            We add a few hand-tested tools each week. No spam, no upsells,
            no third-party sharing — just the new ones, with a one-line
            reason each. Unsubscribe in one click from any email.
          </p>

          {status === 'success' ? (
            <div
              className="mt-6 rounded-xl border border-accent/40 bg-accent-soft px-5 py-4 text-sm font-medium text-accent-ink"
              role="status"
              aria-live="polite"
            >
              You&apos;re in. We&apos;ll only email when there&apos;s
              something new — no welcome flood, no drip campaign.
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2.5"
              noValidate
            >
              {/* Honeypot — visually hidden but reachable by automated
                  fillers. tabIndex=-1 and aria-hidden keep it out of the
                  human keyboard + a11y path. */}
              <label
                className="absolute -left-[10000px] h-0 w-0 overflow-hidden"
                aria-hidden="true"
              >
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>

              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'submitting'}
                className="flex-1 rounded-full border border-line bg-bg px-5 py-3 text-sm text-ink placeholder:text-muted-2 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={status === 'submitting' || !email.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-bg transition-all hover:-translate-y-px hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                {status === 'submitting' ? 'Subscribing…' : 'Subscribe'}
              </button>
            </form>
          )}

          {status === 'error' && errorMessage ? (
            <p className="mt-3 text-xs text-danger" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </motion.div>
      </div>
    </section>
  )
}
