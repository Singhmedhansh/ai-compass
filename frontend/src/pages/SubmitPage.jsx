import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Sparkles, CheckCircle2, ShieldCheck, ArrowRight, User, Wallet, QrCode, ArrowUpRight, Lock, TrendingUp, Users, Search, BarChart3 } from 'lucide-react'

import Button from '../components/ui/Button'
import { PRICING_TIERS, getTier } from '../config/pricingTiers'

const CATEGORIES = [
  'Writing & Chat',
  'Coding',
  'Image Generation',
  'Video Generation',
  'Audio & Voice',
  'Research',
  'Productivity',
  'Marketing',
  'Other',
]

const INITIAL_FORM = {
  name: '',
  url: '',
  category: 'Writing & Chat',
  reason: '',
  submitter_email: '',
  student_perks: '',
}

function TierCard({ tier, selected, onSelect }) {
  const isSponsor = tier.id === 'sponsor'
  const isFree = tier.id === 'free'

  return (
    <button
      type="button"
      onClick={() => onSelect(tier.id)}
      aria-pressed={selected}
      className={`text-left rounded-2xl border p-5 transition ${
        selected
          ? 'border-accent bg-accent-soft/20 shadow-md ring-2 ring-accent/15'
          : 'border-line bg-bg-elev hover:border-line-strong hover:bg-bg-sunk'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
            isFree
              ? 'bg-bg-sunk text-ink-2 border border-line'
              : 'bg-accent-soft text-accent shadow-sm'
          }`}
        >
          {isSponsor && <Sparkles className="h-2.5 w-2.5" />}
          {tier.badgeLabel}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-bold text-ink">{tier.priceLabel}</span>
          {tier.price > 0 && <span className="text-[10px] font-medium text-ink-2">one-time</span>}
        </div>
      </div>
      <h3 className="mt-3 text-base font-bold text-ink">{tier.name}</h3>
      <p className="mt-1 text-xs text-ink-2 leading-relaxed font-normal">{tier.tagline}</p>
    </button>
  )
}

export default function SubmitPage() {
  // 'free' = basic listing, reviewed when we get to it. 'quick' = $14.99
  // faster review, no placement/badge/newsletter perks. 'sponsor' = $49.99
  // full Fast-Track package. The free tier is the top of the funnel: it
  // costs nothing to serve, it's what gets a founder to hand over their
  // email at all, and those contacts are who the paid upgrades are later
  // sold to. A paid-only submit page has no top of funnel — nobody pays a
  // directory they have no relationship with yet.
  const [submissionType, setSubmissionType] = useState('sponsor')
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [submitted, setSubmitted] = useState(false)
  // Which tier the completed submission actually used. Read by the success
  // panel instead of submissionType, so switching the selector afterwards
  // (e.g. a free submitter looking at the upgrade) can't rewrite the
  // confirmation they were just shown.
  const [submittedTier, setSubmittedTier] = useState('sponsor')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Populated from the /submit-tool response so the success panel can show
  // a working dashboard link and founder-account status immediately —
  // without waiting on (or depending on) the welcome email actually
  // arriving.
  const [dashboardUrl, setDashboardUrl] = useState(null)
  const [founderAccountCreated, setFounderAccountCreated] = useState(false)
  const [founderAccountLinked, setFounderAccountLinked] = useState(false)

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('paypal') // Stripe/Razorpay are shown as "Maintenance" (disabled) — PayPal is the only live gateway
  const [paying, setPaying] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)
  const [paymentVerified, setPaymentVerified] = useState(false)
  const [transactionRef, setTransactionRef] = useState('')
  const [paypalLoaded, setPaypalLoaded] = useState(false)
  // paypalError was previously set in three failure paths and read by
  // nothing — the modal simply rendered empty space when the SDK failed.
  // It is now the source of truth for the checkout block's error state.
  const [paypalError, setPaypalError] = useState(false)
  // Bumped by the "Try again" button to re-run the SDK load effect.
  const [paypalRetry, setPaypalRetry] = useState(0)
  const [paypalLinkClicked, setPaypalLinkClicked] = useState(false)
  const [manualTxId, setManualTxId] = useState('')

  const [paypalHostedConfig, setPaypalHostedConfig] = useState(null)

  const selectedTier = getTier(submissionType)
  const submittedTierObj = getTier(submittedTier)

  // Restore form state from sessionStorage on page load, and check for redirect callback
  useEffect(() => {
    const savedForm = sessionStorage.getItem('submit_form_data')
    if (savedForm) {
      try {
        setFormData(JSON.parse(savedForm))
      } catch (e) {
        console.error('Failed to parse saved form data', e)
      }
    }

    const savedType = sessionStorage.getItem('submit_submission_type')
    if (savedType) {
      setSubmissionType(savedType)
    }

    const savedMethod = sessionStorage.getItem('submit_payment_method')
    if (savedMethod) {
      setPaymentMethod(savedMethod)
    }

    // Check if redirecting back from PayPal
    const query = new URLSearchParams(window.location.search)
    const hasPaypalParams = query.has('tx') || query.has('paymentId') || query.has('token') || query.has('PayerID')
    if (hasPaypalParams) {
      const txRef = query.get('tx') || query.get('paymentId') || query.get('token') || query.get('PayerID') || 'PAYPAL-REDIRECT-VERIFIED'

      if (savedForm) {
        try {
          const parsedForm = JSON.parse(savedForm)
          const tier = getTier(savedType || 'sponsor')
          setSubmitting(true)

          fetch('/api/v1/submit-tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              ...parsedForm,
              pricing_model: tier.pricingModel,
              transaction_ref: txRef,
            }),
          })
          .then(res => {
            if (!res.ok) throw new Error('API submission failed')
            return res.json()
          })
          .then((payload) => {
            setSubmitted(true)
            setSubmittedTier(tier.id)
            setPaymentVerified(!!payload.payment_verified)
            setTransactionRef(txRef)
            setDashboardUrl(payload.dashboard_url || null)
            setFounderAccountCreated(!!payload.founder_account_created)
            setFounderAccountLinked(!!payload.founder_account_linked)
            sessionStorage.removeItem('submit_form_data')
            sessionStorage.removeItem('submit_submission_type')
            sessionStorage.removeItem('submit_payment_method')
            window.history.replaceState({}, document.title, window.location.pathname)
          })
          .catch(err => {
            console.error('Failed to submit tool after payment:', err)
            setError('Payment completed but we failed to record your submission. Please contact support with Ref: ' + txRef)
          })
          .finally(() => {
            setSubmitting(false)
          })
        } catch (e) {
          console.error(e)
        }
      }
    }
  }, [])

  // Persist form state to sessionStorage on inputs
  useEffect(() => {
    sessionStorage.setItem('submit_form_data', JSON.stringify(formData))
  }, [formData])

  useEffect(() => {
    sessionStorage.setItem('submit_submission_type', submissionType)
  }, [submissionType])

  useEffect(() => {
    sessionStorage.setItem('submit_payment_method', paymentMethod)
  }, [paymentMethod])

  useEffect(() => {
    if (showPaymentModal && paymentMethod === 'paypal') {
      const tierParam = submissionType === 'quick' ? 'quick' : 'sponsor'
      // Clear both flags up front. Without this a retry (or reopening the
      // modal after a failure) starts out still showing the previous
      // attempt's error.
      setPaypalError(false)
      setPaypalLoaded(!!window.paypal)

      fetch(`/api/v1/config/paypal-hosted?tier=${tierParam}`)
        .then(res => {
          // A 5xx from the origin returns an HTML error page, and res.json()
          // on that throws a parse error that used to escape as an
          // unhandled rejection rather than a visible failure.
          if (!res.ok) throw new Error(`paypal-hosted config returned ${res.status}`)
          return res.json()
        })
        .then(data => {
          setPaypalHostedConfig(data)
          const clientId = data.client_id || 'sb'

          if (window.paypal) {
            setPaypalLoaded(true)
            return
          }

          setPaypalLoaded(false)
          setPaypalError(false)

          const loadPaypalScript = (cid, isFallback = false) => {
            const existingScript = document.getElementById('paypal-sdk-script')
            if (existingScript) {
              existingScript.remove()
            }

            // A blocker (uBlock, corporate proxy, DNS sinkhole) frequently makes
            // the request HANG rather than fail, so neither onload nor onerror
            // ever fires. Without this the modal spins forever and the buyer
            // just leaves. Treat silence as failure.
            let settled = false
            const timeoutId = setTimeout(() => {
              if (settled) return
              settled = true
              console.error('PayPal SDK load timed out after 15s.')
              setPaypalError(true)
            }, 15000)

            const script = document.createElement('script')
            script.id = 'paypal-sdk-script'

            if (data.hosted_button_id) {
              script.src = `https://www.paypal.com/sdk/js?client-id=${cid}&components=hosted-buttons&disable-funding=venmo&currency=USD`
            } else {
              script.src = `https://www.paypal.com/sdk/js?client-id=${cid}&currency=USD`
            }
            script.async = true
            script.crossOrigin = 'anonymous'

            script.onload = () => {
              if (settled) return
              settled = true
              clearTimeout(timeoutId)
              if (window.paypal) {
                setPaypalLoaded(true)
              } else {
                handleLoadError()
              }
            }

            script.onerror = () => {
              if (settled) return
              settled = true
              clearTimeout(timeoutId)
              handleLoadError()
            }

            const handleLoadError = () => {
              if (!isFallback && cid !== 'sb') {
                console.warn('Failed to load PayPal SDK with client-id. Trying fallback client-id=sb...')
                loadPaypalScript('sb', true)
              } else {
                console.error('Failed to load PayPal SDK entirely.')
                setPaypalError(true)
              }
            }

            document.body.appendChild(script)
          }

          loadPaypalScript(clientId)
        })
        .catch(err => {
          console.error('Failed to fetch PayPal config:', err)
          setPaypalError(true)
        })
    }
  }, [showPaymentModal, paymentMethod, submissionType, paypalRetry])

  useEffect(() => {
    if (paypalLoaded && window.paypal && paymentMethod === 'paypal') {
      const container = document.getElementById('paypal-button-container')
      if (container) {
        container.innerHTML = ''

        if (paypalHostedConfig && paypalHostedConfig.hosted_button_id) {
          try {
            // .render() returns a Promise. The try/catch only ever caught a
            // synchronous throw — a rejection escaped as an unhandled
            // rejection (captured by PostHog as an exception) and left the
            // container empty with no error shown.
            window.paypal.HostedButtons({
              hostedButtonId: paypalHostedConfig.hosted_button_id
            }).render('#paypal-button-container').catch((err) => {
              console.error('Failed to render HostedButtons:', err)
              setPaypalError(true)
            })
          } catch (err) {
            console.error('Failed to render HostedButtons:', err)
            setPaypalError(true)
          }
        } else {
          try {
            window.paypal.Buttons({
              createOrder: (data, actions) => {
                return actions.order.create({
                  purchase_units: [{
                    amount: {
                      value: getTier(submissionType).price.toFixed(2)
                    }
                  }]
                })
              },
              onApprove: async (data, actions) => {
                setPaying(true)
                try {
                  const details = await actions.order.capture()
                  setPaying(false)
                  setPaymentDone(true)
                  const txRef = details.id || `TXN-PAYPAL-${Math.floor(Math.random() * 9000000 + 1000000)}`
                  setTransactionRef(txRef)

                  setTimeout(() => {
                    setShowPaymentModal(false)
                    submitData(submissionType, txRef)
                  }, 1500)
                } catch (err) {
                  setPaying(false)
                  setError('PayPal transaction capture failed. Please try again.')
                }
              },
              onError: (err) => {
                console.error('PayPal Buttons error:', err)
                setError('An error occurred during the PayPal transaction.')
              }
            }).render('#paypal-button-container').catch((err) => {
              console.error('Failed to render standard PayPal buttons:', err)
              setPaypalError(true)
            })
          } catch (err) {
            console.error('Failed to render standard PayPal buttons:', err)
            setPaypalError(true)
          }
        }
      }
    }
  }, [paypalLoaded, paymentMethod, paypalHostedConfig, submissionType, paypalRetry])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleFormSubmit(event) {
    event.preventDefault()
    setError('')
    if (submissionType === 'free') {
      submitData('free')
      return
    }
    setShowPaymentModal(true)
  }

  // PayPal is the only live gateway (Stripe/Razorpay tabs are disabled,
  // "Maintenance") — real payment/submission happens via the PayPal SDK
  // callbacks and the manual transaction-ID paste flow below, not this
  // handler. It only exists to swallow an accidental Enter-key form submit.
  function handlePayment(event) {
    event.preventDefault()
  }

  async function submitData(tierId, transactionRef = '') {
    const tier = getTier(tierId)
    setSubmitting(true)
    setSubmitted(false)
    setPaymentVerified(false)
    setDashboardUrl(null)
    setFounderAccountCreated(false)
    setFounderAccountLinked(false)

    try {
      const response = await fetch('/api/v1/submit-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: formData.name,
          url: formData.url,
          category: formData.category,
          reason: formData.reason,
          pricing_model: tier.pricingModel,
          student_perks: formData.student_perks,
          submitter_email: formData.submitter_email,
          transaction_ref: transactionRef,
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to submit right now. Please try again.')
      }

      setSubmitted(true)
      setSubmittedTier(tier.id)
      setPaymentVerified(!!payload.payment_verified)
      setDashboardUrl(payload.dashboard_url || null)
      setFounderAccountCreated(!!payload.founder_account_created)
      setFounderAccountLinked(!!payload.founder_account_linked)
      setFormData(INITIAL_FORM)
      setPaymentDone(false)
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">

      {/* Monetization / Path Selector Banner */}
      <div className="mb-8 rounded-3xl border border-line bg-gradient-to-br from-bg-elev via-bg-elev to-bg-sunk/30 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[10px] font-bold text-accent uppercase tracking-widest block mb-1">Get Listed</span>
          <Link to="/pricing" className="text-xs font-semibold text-accent hover:underline">
            Compare all tiers →
          </Link>
        </div>
        <h1 className="text-2xl font-bold text-ink tracking-tight sm:text-3xl">Submit Your AI Tool</h1>
        <p className="mt-2 text-sm text-ink-2 max-w-2xl font-normal leading-relaxed">
          Get your tool in front of students, creators, and developers. Free listings are welcome — Quick Review skips the queue for $14.99, or pick Fast-Track for a guaranteed 24-hour review and featured placement.
        </p>

        {/* Tier selector — free is a real, selectable path, not a decoy. */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PRICING_TIERS.map((tier) => (
            <TierCard
              key={tier.id}
              tier={tier}
              selected={submissionType === tier.id}
              onSelect={setSubmissionType}
            />
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-8 ${submissionType !== 'free' ? 'lg:grid-cols-3' : ''}`}>

        {/* Left/Main Column: Submission Form */}
        <div className={submissionType !== 'free' ? 'lg:col-span-2' : ''}>
          <section className="rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
            <h2 className="text-lg font-bold text-ink">
              {submissionType === 'free' ? 'Tool Details' : `${selectedTier.name} Form`}
            </h2>
            <p className="mt-2 text-sm text-ink-2">
              Just drop a few details below and we'll take care of the rest. <br className="hidden sm:block" />
              <strong className="text-ink">Example:</strong> If you built a flashcard app, just drop the link and tell us what makes it unique for students.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleFormSubmit}>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="submitter_email" className="mb-1 block text-xs font-semibold text-ink-2">
                    Founder Contact Email <span className="text-accent">*</span>
                  </label>
                  <input
                    id="submitter_email"
                    name="submitter_email"
                    type="email"
                    required
                    value={formData.submitter_email}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="founder@company.com"
                  />
                </div>
                <div>
                  <label htmlFor="student_perks" className="mb-1 block text-xs font-semibold text-ink-2">
                    Student Perk/Discount details (Optional)
                  </label>
                  <input
                    id="student_perks"
                    name="student_perks"
                    type="text"
                    value={formData.student_perks}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="e.g. 50% discount via .edu email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="mb-1 block text-xs font-semibold text-ink-2">
                    Tool name <span className="text-accent">*</span>
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="e.g. Notion AI"
                  />
                </div>

                <div>
                  <label htmlFor="url" className="mb-1 block text-xs font-semibold text-ink-2">
                    Tool URL <span className="text-accent">*</span>
                  </label>
                  <input
                    id="url"
                    name="url"
                    type="text"
                    required
                    value={formData.url}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="category" className="mb-1 block text-xs font-semibold text-ink-2">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="reason" className="mb-1 block text-xs font-semibold text-ink-2">
                  Product description & Curation context <span className="text-accent">*</span>
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  rows={4}
                  required
                  value={formData.reason}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder="Describe your tool's main features and why it belongs in our curated library..."
                />
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  type="submit"
                  disabled={submitting}
                  className="w-full font-bold flex items-center justify-center gap-2 rounded-xl"
                >
                  {submitting
                    ? 'Processing...'
                    : submissionType === 'free'
                    ? 'Submit Free Listing'
                    : `Proceed to Secure Checkout (${selectedTier.priceLabel})`}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>

            {submitted && (
              <div className="mt-6 rounded-2xl border border-accent bg-accent-soft/30 p-6 shadow-md text-ink animate-fade-in">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-7 w-7 text-accent shrink-0" />
                  <div>
                    <h3 className="text-base font-semibold text-ink">
                      {submittedTier === 'free'
                        ? 'Submission Received'
                        : paymentVerified
                        ? 'Payment Approved & Submission Received'
                        : 'Submission Received — Payment Pending Verification'}
                    </h3>
                    {submittedTier !== 'free' && (
                      <p className="text-xs text-accent-ink font-semibold mt-0.5">
                        Transaction Reference: <span className="font-mono">{transactionRef || 'N/A'}</span> • Amount: {submittedTierObj.priceLabel} USD
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-accent/20 text-xs text-ink-2 space-y-2 leading-relaxed">
                  {submittedTier === 'free' ? (
                    <>
                      <p>
                        <strong>What happens next?</strong> Your tool is in the review queue. We review free submissions in the order they arrive — usually within a couple of weeks — and you&apos;ll get an email at your submitted address when it goes live.
                      </p>
                      <div className="bg-bg-elev/80 p-3 rounded-xl border border-line">
                        <p className="font-medium text-ink">
                          Need it live sooner? Quick Review gets you a 48–72 hour turnaround for $14.99, or Fast-Track gets a guaranteed 24-hour review, sponsored placement above free listings, and a featured badge for $49.99 one-time.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitted(false)
                            setSubmissionType('sponsor')
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 text-accent font-bold hover:underline"
                        >
                          Compare paid tiers <ArrowRight className="h-3 w-3" />
                        </button>
                      </div>
                    </>
                  ) : paymentVerified ? (
                    <>
                      <p>
                        <strong>What happens next?</strong> Our editorial team has received your submission details and payment confirmation.
                      </p>
                      <p className="bg-bg-elev/80 p-3 rounded-xl border border-line font-medium text-ink">
                        <strong>{submittedTierObj.reviewEta}</strong> Our team will review your submission and contact you soon via email at your provided founder address.
                      </p>
                      {(founderAccountCreated || founderAccountLinked) && (
                        <p className="bg-accent-soft/30 p-3 rounded-xl border border-accent/15 font-medium text-ink">
                          {founderAccountCreated
                            ? "We've created a Growth Hub account for you — check your confirmation email for login details."
                            : 'This tool is now linked to your existing AI Compass account — log in as usual to find it in your Growth Hub.'}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>What happens next?</strong> We received your submission, but couldn't automatically confirm the payment yet.
                      </p>
                      <p className="bg-bg-elev/80 p-3 rounded-xl border border-line font-medium text-ink">
                        <strong>Our team will manually verify your payment and follow up via email within 24 hours.</strong> If you completed payment and don't hear back, reply to your confirmation email with your transaction reference.
                      </p>
                    </>
                  )}

                  {dashboardUrl && (
                    <div className="pt-1">
                      <a
                        href={dashboardUrl}
                        className="inline-flex items-center justify-center gap-2 w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-5 rounded-xl text-xs transition-all shadow-sm"
                      >
                        View your submission dashboard <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                      <p className="mt-2 text-[11px] text-muted-2 text-center">
                        A confirmation email with this link (and login details, if applicable) is on its way to your inbox for future reference.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-xs text-danger">
                {error}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Pricing details sidebar — hidden for the free tier */}
        {submissionType !== 'free' && (
          <div className="lg:col-span-1">
            <section className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">{selectedTier.name} Includes</h3>

              <div className="space-y-4 text-xs">
                <div className="rounded-xl bg-accent-soft/30 p-3 border border-accent/15 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <span className="font-semibold text-accent-ink">{selectedTier.reviewEta}</span>
                </div>

                {submissionType === 'sponsor' ? (
                  <>
                    <div className="space-y-2 border-b border-line pb-3">
                      <div className="flex justify-between">
                        <span className="text-ink-2">Priority submission fee</span>
                        <span className="font-semibold text-ink">$75.00</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ink-2">Launch Discount</span>
                        <span className="font-semibold text-accent">-$25.01</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="font-bold text-ink">Total Due</span>
                      <span className="text-xl font-bold text-ink">{selectedTier.priceLabel}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between items-baseline pt-1 pb-1 border-b border-line">
                    <span className="font-bold text-ink">Total Due</span>
                    <span className="text-xl font-bold text-ink">{selectedTier.priceLabel}</span>
                  </div>
                )}

                <ul className="space-y-2 text-ink-2 leading-relaxed pt-2 font-normal">
                  {selectedTier.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2">
                      <span className="text-accent font-bold">✓</span>
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Why Sponsor Your Tool Section */}
      <section className="mt-12 rounded-3xl border border-line bg-gradient-to-b from-bg-elev to-bg p-6 sm:p-10 shadow-md">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent px-3 py-1 text-[10px] font-bold uppercase tracking-widest mb-3">
            <Sparkles className="h-3 w-3" /> Proven Growth Platform
          </span>
          <h2 className="text-2xl font-bold text-ink tracking-tight sm:text-3xl">
            Why Sponsor Your Tool on AI Compass?
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-ink-2 leading-relaxed font-normal">
            Put your product directly in front of thousands of tech-savvy students, developers, and creators actively searching for AI solutions.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-line bg-bg/80 p-5 text-center transition hover:border-accent/40 hover:shadow-sm">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Users className="h-5 w-5" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-ink">4,000+</div>
            <div className="text-[11px] font-medium text-ink-2 mt-1">Monthly Active Visitors</div>
          </div>

          <div className="rounded-2xl border border-line bg-bg/80 p-5 text-center transition hover:border-accent/40 hover:shadow-sm">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-ink">4,000+</div>
            <div className="text-[11px] font-medium text-ink-2 mt-1">Students Powered</div>
          </div>

          <div className="rounded-2xl border border-line bg-bg/80 p-5 text-center transition hover:border-accent/40 hover:shadow-sm">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-ink">110K+</div>
            <div className="text-[11px] font-medium text-ink-2 mt-1">Google Search Impressions</div>
          </div>

          <div className="rounded-2xl border border-line bg-bg/80 p-5 text-center transition hover:border-accent/40 hover:shadow-sm">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Search className="h-5 w-5" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-ink">Top 12</div>
            <div className="text-[11px] font-medium text-ink-2 mt-1">Google Search Rankings</div>
          </div>
        </div>

        {/* Benefits Breakdown */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-line/60">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-ink">
              <TrendingUp className="h-4 w-4 text-accent" />
              <span>Targeted High-Intent Traffic</span>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed font-normal">
              Connect with over 400+ registered users and thousands of monthly visitors specifically browsing for AI tools to study, code, and automate workflows.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-ink">
              <ArrowUpRight className="h-4 w-4 text-accent" />
              <span>Permanent High-Authority Backlink</span>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed font-normal">
              A permanent, indexable listing on ai-compass.in — real referral traffic from students and developers actively searching for tools like yours, not just a link sitting in a directory nobody reads.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-ink">
              <ShieldCheck className="h-4 w-4 text-accent" />
              <span>24-Hour Review & Newsletter Spotlight</span>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed font-normal">
              Skip the backlog. Guaranteed editorial review within 24 hours, featured badge placement, and inclusion in our weekly student AI newsletter.
            </p>
          </div>
        </div>
      </section>

      {/* Simulated Checkout Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-bg-elev border border-line rounded-3xl p-6 shadow-2xl space-y-6">

            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <h3 className="text-base font-semibold text-ink">Secure {selectedTier.name} Checkout</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-xs font-medium text-muted hover:text-ink hover:bg-bg-sunk px-2.5 py-1 rounded-lg border border-line/45 transition"
              >
                Cancel
              </button>
            </div>

            {!paymentDone ? (
              <div className="space-y-5">

                {/* Checkout Summary Banner */}
                <div className="bg-bg-sunk/40 rounded-xl p-3 border border-line/45 flex justify-between items-center text-xs">
                  <span className="font-normal text-ink-2">{selectedTier.name} for <strong className="text-ink font-semibold">{formData.name || 'Your Tool'}</strong></span>
                  <span className="font-bold text-ink">{selectedTier.priceLabel}</span>
                </div>

                {/* Gateway Tab Selector */}
                <div>
                  <label className="mb-2 block text-[10px] font-bold text-muted uppercase tracking-wider">
                    Select Secure Payment Gateway
                  </label>
                  <div className="grid grid-cols-3 gap-3">

                    {/* Stripe Tab (Maintenance) */}
                     <button
                       type="button"
                       disabled
                       className="flex flex-col items-center justify-center p-3 rounded-xl border border-line bg-bg opacity-50 cursor-not-allowed"
                     >
                       <CreditCard className="h-5 w-5 mb-1 text-muted-2" />
                       <span className="text-[10px] font-bold text-muted-2">Stripe</span>
                       <span className="text-[8px] text-danger whitespace-nowrap mt-0.5">Maintenance</span>
                     </button>

                    {/* PayPal Tab */}
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethod('paypal')
                        setError('')
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                        paymentMethod === 'paypal'
                          ? 'border-[#0070ba] bg-[#0070ba]/5 ring-2 ring-[#0070ba]/20'
                          : 'border-line bg-bg hover:border-line-strong'
                      }`}
                    >
                      <Wallet className={`h-5 w-5 mb-1 ${paymentMethod === 'paypal' ? 'text-[#0070ba]' : 'text-muted-2'}`} />
                      <span className="text-[10px] font-bold text-ink">PayPal</span>
                      <span className="text-[8px] text-muted-2 whitespace-nowrap mt-0.5">Wallet / Direct</span>
                    </button>

                    {/* Razorpay Tab (Maintenance) */}
                     <button
                       type="button"
                       disabled
                       className="flex flex-col items-center justify-center p-3 rounded-xl border border-line bg-bg opacity-50 cursor-not-allowed"
                     >
                       <QrCode className="h-5 w-5 mb-1 text-muted-2" />
                       <span className="text-[10px] font-bold text-muted-2">Razorpay</span>
                       <span className="text-[8px] text-danger whitespace-nowrap mt-0.5">Maintenance</span>
                     </button>

                  </div>
                </div>

                {/* Gateway Specific Form Renders */}
                <form onSubmit={handlePayment} className="space-y-4">

                  {/* PAYPAL CHECKOUT BLOCK */}
                  {paymentMethod === 'paypal' && (
                    <div className="bg-bg-sunk/30 border border-line/60 rounded-2xl p-5 text-center space-y-4 animate-fade-in">
                      <div className="flex justify-center">
                        <span className="inline-flex items-center gap-1.5 bg-[#003087] text-white px-5 py-2.5 rounded-full font-bold italic text-sm tracking-tight shadow-md select-none">
                          Pay<span className="text-[#0070ba]">Pal</span>
                        </span>
                      </div>

                      {/* The manual "pay via link, paste tx id" path only exists for
                          tiers with a real pre-made PayPal hosted-button product
                          behind them. Quick Review has none yet (its env vars are
                          unset), so it goes straight to the dynamic Smart Buttons
                          flow below — fully automated, no manual paste step. */}
                      {paypalHostedConfig?.hosted_button_id ? (
                        <div className="space-y-3 max-w-md mx-auto">
                          <p className="text-xs text-ink-2 leading-relaxed font-normal">
                            Complete your <b>{selectedTier.priceLabel} {selectedTier.name}</b> payment directly on PayPal&apos;s secure checkout page:
                          </p>

                          <a
                            href={paypalHostedConfig.payment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              setPaypalLinkClicked(true)
                            }}
                            className="inline-flex items-center justify-center gap-2 w-full bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold py-3.5 px-6 rounded-xl text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                          >
                            <span>Pay {selectedTier.priceLabel} via PayPal Checkout</span>
                            <ArrowUpRight className="h-4 w-4" />
                          </a>
                          <span className="block text-[10px] text-muted-2">Opens PayPal&apos;s official checkout in a new window</span>

                          {paypalLinkClicked && (
                            <div className="mt-4 p-4 rounded-xl border border-line bg-bg-elev text-left space-y-3 animate-fade-in">
                              <p className="text-xs font-semibold text-ink">
                                Opened PayPal checkout in a new window.
                              </p>
                              <p className="text-[11px] text-ink-2">
                                Once you complete payment on PayPal, paste your <b>Transaction ID / Receipt Number</b> below to submit for review:
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={manualTxId}
                                  onChange={(e) => setManualTxId(e.target.value)}
                                  placeholder="e.g. 5XY123456789 or PAYID-..."
                                  className="flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent"
                                />
                                <button
                                  type="button"
                                  disabled={!manualTxId.trim() || submitting}
                                  onClick={() => {
                                    if (!manualTxId.trim()) return
                                    const txRef = manualTxId.trim()
                                    setTransactionRef(txRef)
                                    setShowPaymentModal(false)
                                    submitData(submissionType, txRef)
                                  }}
                                  className="px-4 py-2 bg-accent text-white font-bold text-xs rounded-lg hover:bg-accent/90 disabled:opacity-50 transition shrink-0"
                                >
                                  Confirm & Submit
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-2 leading-relaxed font-normal max-w-md mx-auto">
                          Pay {selectedTier.priceLabel} securely below via PayPal.
                        </p>
                      )}

                      {/* Three explicit states. Previously only the third existed,
                          so a failed SDK load — and, on Quick Review, ANY failure,
                          since that tier has no hosted-button link to fall back on
                          — rendered nothing at all: the modal showed one sentence
                          over empty space, indistinguishable from still loading. */}
                      {paypalError ? (
                        <div className="rounded-xl border border-danger bg-danger-soft px-4 py-3 text-left space-y-2" role="alert">
                          <p className="text-xs font-semibold text-danger">
                            PayPal checkout couldn&apos;t load.
                          </p>
                          <p className="text-[11px] text-danger/90 leading-relaxed">
                            This is usually a network blip, an ad/script blocker, or a browser
                            extension blocking paypal.com. You have <b>not</b> been charged.
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setPaypalRetry((n) => n + 1)}
                              className="px-3 py-1.5 bg-accent text-white font-bold text-[11px] rounded-lg hover:bg-accent/90 transition"
                            >
                              Try again
                            </button>
                            <a
                              href={`mailto:help@ai-compass.in?subject=${encodeURIComponent(`Checkout failed — ${selectedTier.name}`)}&body=${encodeURIComponent(`PayPal checkout wouldn't load for ${selectedTier.name} (${selectedTier.priceLabel}).

Tool: ${formData.name}
URL: ${formData.url}
Email: ${formData.submitter_email}`)}`}
                              className="text-[11px] font-semibold text-accent hover:underline"
                            >
                              Or email us and we&apos;ll invoice you directly →
                            </a>
                          </div>
                        </div>
                      ) : !paypalLoaded ? (
                        <div className="min-h-[60px] flex items-center justify-center gap-2 text-[11px] text-muted">
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                          Loading secure PayPal checkout…
                        </div>
                      ) : (
                        <div className={paypalHostedConfig?.hosted_button_id ? 'pt-2 border-t border-line/40' : ''}>
                          {paypalHostedConfig?.hosted_button_id && (
                            <p className="text-[11px] text-muted mb-2">Or use PayPal Smart Buttons:</p>
                          )}
                          <div id="paypal-button-container" className="min-h-[60px] flex flex-col justify-center"></div>
                        </div>
                      )}
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl border border-danger bg-danger-soft px-3 py-2 text-[11px] text-danger">
                      {error}
                    </div>
                  )}

                </form>

              </div>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-scale-up">
                <div className="h-16 w-16 bg-accent-soft rounded-full flex items-center justify-center text-accent shadow-inner animate-pulse">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-ink">Payment Verified!</h4>
                  <p className="text-xs text-muted-2 mt-1 font-normal">Reference ID: {transactionRef}</p>
                  <p className="text-[10px] text-accent mt-2 font-medium">Submitting tool details to AI Compass...</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-[10px] text-muted border-t border-line/45 pt-4">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              <span>SSL Secure 256-bit encrypted checkout</span>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
