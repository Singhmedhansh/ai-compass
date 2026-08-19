import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'

const MAX_WEEKS = 12

// The SDK is loaded once per page and reused. Re-injecting the script on
// every modal open leaves duplicate globals behind and the buttons silently
// stop rendering the second time.
let paypalSdkPromise = null

function loadPayPalSdk(clientId) {
  if (window.paypal) return Promise.resolve(window.paypal)
  if (paypalSdkPromise) return paypalSdkPromise

  paypalSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = 'paypal-sdk-sponsor'
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&disable-funding=venmo`
    script.async = true
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error('SDK loaded without paypal global')))
    script.onerror = () => reject(new Error('Could not load the PayPal SDK'))
    document.body.appendChild(script)
  }).catch((err) => {
    paypalSdkPromise = null
    throw err
  })

  return paypalSdkPromise
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-2">{hint}</span>}
    </label>
  )
}

export default function SponsorCheckout({ placement, availability, onClose }) {
  const [weeks, setWeeks] = useState(1)
  const [toolSlug, setToolSlug] = useState('')
  const [email, setEmail] = useState('')
  const [headline, setHeadline] = useState('')
  const [blurb, setBlurb] = useState('')
  const [tools, setTools] = useState([])
  const [status, setStatus] = useState('idle') // idle | paying | booking | done | error
  const [error, setError] = useState(null)
  const [booked, setBooked] = useState(null)
  const [sdkError, setSdkError] = useState(null)

  const buttonRef = useRef(null)
  // The PayPal callbacks are registered once but read the form fields at
  // click time, so they must see current values rather than the values
  // captured when the buttons were first rendered.
  const formRef = useRef({ weeks, toolSlug, email, headline, blurb })
  useEffect(() => {
    formRef.current = { weeks, toolSlug, email, headline, blurb }
  }, [weeks, toolSlug, email, headline, blurb])

  const total = useMemo(() => (placement.price * weeks).toFixed(2), [placement.price, weeks])

  // Catalog list for the tool picker — a placement can only point at a tool
  // that already exists, which the backend enforces too.
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/v1/tools?fields=card&limit=500', { signal: controller.signal })
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
        // context=sponsor so this uses the sponsorship REST app, not the
        // submission flow's hosted-button client ID (which cannot create
        // the variable-amount orders this checkout needs).
        const cfgRes = await fetch('/api/v1/config/paypal?context=sponsor')
        const cfg = cfgRes.ok ? await cfgRes.json() : {}
        if (!cfg.client_id) {
          setSdkError('PayPal isn\'t configured on this site yet. Use the email option below.')
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
              setError('Pick which tool the placement is for.')
              return actions.reject()
            }
            if (!mail || !mail.includes('@')) {
              setError('Add an email so we can send the delivery report.')
              return actions.reject()
            }
            setError(null)
            return actions.resolve()
          },
          createOrder: (_data, actions) => {
            const { weeks: w } = formRef.current
            setStatus('paying')
            return actions.order.create({
              purchase_units: [{
                description: `${placement.name} — ${w} week${w > 1 ? 's' : ''}`,
                amount: { value: (placement.price * w).toFixed(2), currency_code: 'USD' },
              }],
            })
          },
          onApprove: async (_data, actions) => {
            // Capture first: the backend verifies the *captured* order
            // against PayPal directly, so an un-captured order can never
            // book a slot.
            const details = await actions.order.capture()
            const form = formRef.current
            setStatus('booking')
            try {
              const res = await fetch('/api/v1/community/sponsors/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  order_id: details.id,
                  placement: placement.id,
                  weeks: form.weeks,
                  tool_slug: form.toolSlug,
                  contact_email: form.email,
                  headline: form.headline,
                  blurb: form.blurb,
                }),
              })
              const data = await res.json()
              if (res.ok && data.success) {
                setBooked(data.slot)
                setStatus('done')
              } else {
                setError(data.error || 'Something went wrong finalising the booking.')
                setStatus('error')
              }
            } catch {
              setError(
                'Your payment went through but we could not reach the server to schedule it. ' +
                'Email admin@ai-compass.in with your PayPal order ID and we will place it manually.'
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
      } catch {
        if (!cancelled) setSdkError('Could not load PayPal checkout. Use the email option below.')
      }
    }

    mountButtons()
    return () => { cancelled = true }
    // Buttons are mounted once per modal; live values come from formRef.
  }, [placement.id, placement.name, placement.price])

  const soldOutNow = availability?.sold_out

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sponsor-checkout-title"
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

        {status === 'done' && booked ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-accent" aria-hidden="true" />
            <h2 id="sponsor-checkout-title" className="mt-3 text-lg font-bold text-ink">
              Booked — thank you
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-2">
              Your {booked.label} placement for <strong>{booked.tool_slug}</strong> runs from{' '}
              {new Date(booked.starts_at).toLocaleDateString()} to{' '}
              {new Date(booked.ends_at).toLocaleDateString()}.
            </p>
            <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-muted">
              {new Date(booked.starts_at) > new Date()
                ? 'That placement was already taken for this week, so we scheduled you into the next open one — you were not charged for a week you cannot use.'
                : 'It is live now.'}{' '}
              Delivery reports go to {email || 'your email'}.
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
            <h2 id="sponsor-checkout-title" className="pr-8 text-lg font-bold text-ink">
              Book the {placement.name}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {placement.priceLabel} per week · {placement.capacity}{' '}
              {placement.capacity === 1 ? 'slot' : 'slots'} total
              {soldOutNow && ' · this week is full, so your booking starts the next open week'}
            </p>

            <div className="mt-5 space-y-3.5">
              <Field label="Which tool?" hint="It must already be listed in the catalog.">
                <input
                  list="sponsor-tool-options"
                  value={toolSlug}
                  onChange={(e) => setToolSlug(e.target.value.trim().toLowerCase())}
                  placeholder="e.g. cursor"
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                />
                <datalist id="sponsor-tool-options">
                  {tools.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.name}</option>
                  ))}
                </datalist>
              </Field>

              <Field label="Email for the delivery report">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  placeholder="you@company.com"
                  className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                />
              </Field>

              <Field label="How many weeks?">
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max={MAX_WEEKS}
                    value={weeks}
                    onChange={(e) => setWeeks(Number(e.target.value))}
                    className="flex-1 accent-[var(--accent)]"
                    aria-label="Number of weeks"
                  />
                  <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-ink">
                    {weeks} {weeks === 1 ? 'week' : 'weeks'}
                  </span>
                </div>
              </Field>

              {placement.id !== 'rail' && (
                <Field label="Headline (optional)" hint={`${headline.length}/140`}>
                  <input
                    value={headline}
                    maxLength={140}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="What should the unit say?"
                    className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                  />
                </Field>
              )}

              {placement.id === 'hero' && (
                <Field label="Blurb (optional)" hint={`${blurb.length}/280`}>
                  <textarea
                    value={blurb}
                    maxLength={280}
                    rows={2}
                    onChange={(e) => setBlurb(e.target.value)}
                    placeholder="A sentence or two under the headline."
                    className="mt-1 w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
                  />
                </Field>
              )}
            </div>

            <div className="mt-5 flex items-baseline justify-between rounded-xl border border-line bg-bg-sunk px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Total</span>
              <span className="text-xl font-extrabold tabular-nums text-ink">${total}</span>
            </div>

            {error && (
              <p role="alert" className="mt-3 flex gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-xs leading-relaxed text-ink-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                {error}
              </p>
            )}

            {status === 'booking' && (
              <p className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Payment received — scheduling your slot…
              </p>
            )}

            <div className="mt-4" ref={buttonRef} aria-label="PayPal checkout" />

            {sdkError && (
              <p className="mt-3 text-center text-xs text-muted">
                {sdkError}{' '}
                <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">
                  admin@ai-compass.in
                </a>
              </p>
            )}

            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-2">
              Payment is verified against PayPal server-side before anything is booked. If the
              placement is full this week we schedule you into the next open one and tell you the
              date — we never charge for a week you cannot use.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
