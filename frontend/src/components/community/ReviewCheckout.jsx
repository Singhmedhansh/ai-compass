import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'

import { loadPayPalSdk } from '../../lib/paypalSdk'

// Commissioning a hands-on review. One fixed price, one tool, no options —
// what varies is the brief, which is context for the reviewer and never
// published copy.
//
// The screen says twice, in the buyer's own flow, that the verdict is not
// for sale. That is not a disclaimer bolted on by legal: someone who expects
// to have bought a good review and gets an honest one asks for a refund, and
// the only way to avoid that conversation is to have it before the payment.

const REVIEW_EMAIL = 'admin@ai-compass.in'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-2">{hint}</span>}
    </label>
  )
}

export default function ReviewCheckout({ product, availability, onClose }) {
  const [toolSlug, setToolSlug] = useState('')
  const [email, setEmail] = useState('')
  const [brief, setBrief] = useState('')
  const [tools, setTools] = useState([])
  const [status, setStatus] = useState('idle') // idle | paying | queueing | done | error
  const [error, setError] = useState(null)
  const [ordered, setOrdered] = useState(null)
  const [sdkError, setSdkError] = useState(null)

  const buttonRef = useRef(null)
  // The PayPal callbacks are registered once but must read the fields as
  // they are at click time, not as they were when the buttons mounted.
  const formRef = useRef({ toolSlug, email, brief })
  useEffect(() => {
    formRef.current = { toolSlug, email, brief }
  }, [toolSlug, email, brief])

  const price = availability?.price ?? product.price
  const turnaround = availability?.turnaround_days ?? product.turnaroundDays

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/tools?fields=card', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.results || d?.tools || []
        setTools(list.map((t) => ({ slug: t.slug, name: t.name })).filter((t) => t.slug))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function mountButtons() {
      try {
        // context=sponsor: reviews are billed through the same REST app as
        // placements, which is the one that can create variable orders and
        // that the server verifies against.
        const cfgRes = await fetch('/api/v1/config/paypal?context=sponsor')
        const cfg = cfgRes.ok ? await cfgRes.json() : {}
        if (!cfg.client_id) {
          setSdkError("PayPal isn't configured on this site yet. Use the email option below.")
          return
        }
        const paypal = await loadPayPalSdk(cfg.client_id)
        if (cancelled || !buttonRef.current) return
        buttonRef.current.innerHTML = ''

        paypal.Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 44 },
          onClick: (_data, actions) => {
            const { toolSlug: slug, email: mail } = formRef.current
            if (!slug) {
              setError('Pick which tool we should review.')
              return actions.reject()
            }
            if (!mail || !mail.includes('@')) {
              setError('Add an email — the reviewer will have questions.')
              return actions.reject()
            }
            setError(null)
            return actions.resolve()
          },
          createOrder: (_data, actions) => {
            setStatus('paying')
            return actions.order.create({
              purchase_units: [{
                description: `Editorial review — ${formRef.current.toolSlug}`,
                amount: { value: Number(price).toFixed(2), currency_code: 'USD' },
              }],
            })
          },
          onApprove: async (_data, actions) => {
            // Capture first: the server verifies the *captured* order
            // against PayPal, so an un-captured order can never commission
            // anything.
            const details = await actions.order.capture()
            const form = formRef.current
            setStatus('queueing')
            try {
              const res = await fetch('/api/v1/reviews/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  order_id: details.id,
                  tool_slug: form.toolSlug,
                  contact_email: form.email,
                  brief: form.brief,
                }),
              })
              const data = await res.json()
              if (res.ok && data.success) {
                setOrdered(data.review)
                setStatus('done')
              } else {
                setError(data.error || 'Something went wrong queueing the review.')
                setStatus('error')
              }
            } catch {
              setError(
                'Your payment went through but we could not reach the server to queue the ' +
                `review. Email ${REVIEW_EMAIL} with your PayPal order ID and we will start it by hand.`
              )
              setStatus('error')
            }
          },
          onCancel: () => setStatus('idle'),
          onError: () => {
            setError('PayPal reported an error. Nothing has been charged.')
            setStatus('error')
          },
        }).render(buttonRef.current)
      } catch (err) {
        if (!cancelled) setSdkError(err?.message || 'Could not load PayPal checkout.')
      }
    }

    mountButtons()
    return () => { cancelled = true }
    // Mounted once per modal; live values come from formRef.
  }, [price])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-checkout-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-line bg-bg-elev p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition hover:bg-bg-sunk hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        {status === 'done' && ordered ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-accent" aria-hidden="true" />
            <h2 id="review-checkout-title" className="mt-3 text-lg font-bold text-ink">
              Commissioned — thank you
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
              We&apos;ll test <strong>{ordered.tool_slug}</strong> and publish the review at{' '}
              <span className="font-mono text-xs">/tools/{ordered.tool_slug}</span> within{' '}
              {ordered.turnaround_days || turnaround} days. You&apos;ll get the URL by email the day
              it goes live.
            </p>
            <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-muted">
              If anything in the brief needs clarifying we&apos;ll write to {email || 'your email'}{' '}
              first. The verdict is ours — that is what makes the link worth having.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 id="review-checkout-title" className="pr-8 text-lg font-bold text-ink">
              Commission a hands-on review
            </h2>
            <p className="mt-1 text-xs text-muted">
              ${Number(price).toFixed(2)} one-off · published within {turnaround} days · yours to link
              from anywhere
            </p>

            <div className="mt-5 space-y-3.5">
              <Field label="Which tool?" hint="It must already be listed in the catalog.">
                <input
                  list="review-tool-options"
                  value={toolSlug}
                  onChange={(e) => setToolSlug(e.target.value.trim().toLowerCase())}
                  placeholder="e.g. cursor"
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                />
                <datalist id="review-tool-options">
                  {tools.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.name}</option>
                  ))}
                </datalist>
              </Field>

              <Field label="Email" hint="Used for reviewer questions and the published URL.">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  placeholder="you@company.com"
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </Field>

              <Field
                label="Anything we should try? (optional)"
                hint="Docs, a demo login, the feature reviewers usually miss. Context for the reviewer — we don't publish it as copy."
              >
                <textarea
                  value={brief}
                  maxLength={2000}
                  rows={3}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Test account: …  The thing people miss is …"
                  className="mt-1 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </Field>
            </div>

            <div className="mt-5 rounded-xl border border-line bg-bg-sunk px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Total</span>
                <span className="text-xl font-extrabold tabular-nums text-ink">
                  ${Number(price).toFixed(2)}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                This buys the work, not the conclusion. We test the tool properly and publish what we
                find — including the parts that do not flatter it. Every review says on its face that
                it was commissioned, which is the only reason anyone believes the good ones.
              </p>
            </div>

            {error && (
              <p role="alert" className="mt-3 flex gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-ink-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                {error}
              </p>
            )}

            {status === 'queueing' && (
              <p className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Payment received — queueing your review…
              </p>
            )}

            <div className="mt-4" ref={buttonRef} aria-label="PayPal checkout" />

            {sdkError && (
              <p className="mt-3 text-center text-xs text-muted">
                {sdkError}{' '}
                <a href={`mailto:${REVIEW_EMAIL}`} className="font-semibold text-accent hover:underline">
                  {REVIEW_EMAIL}
                </a>
              </p>
            )}

            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-2">
              Payment is verified against PayPal server-side before anything is queued. If we decide
              we cannot review your tool fairly — we already use it commercially, say — we refund you
              in full and tell you why.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
