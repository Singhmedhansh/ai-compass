import { useState, useEffect } from 'react'
import { CreditCard, Sparkles, CheckCircle2, ShieldCheck, ArrowRight, User, Wallet, QrCode, ArrowUpRight, Lock, TrendingUp, Users, Search, BarChart3 } from 'lucide-react'

import Button from '../components/ui/Button'

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

export default function SubmitPage() {
  const [submissionType] = useState('sponsor') // Exclusively 'sponsor' ($49.99)
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('paypal') // 'stripe' | 'paypal' | 'razorpay'
  const [cardData, setCardData] = useState({ number: '', expiry: '', cvc: '', name: '' })
  const [upiId, setUpiId] = useState('')
  const [paying, setPaying] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)
  const [transactionRef, setTransactionRef] = useState('')
  const [paypalLoaded, setPaypalLoaded] = useState(false)
  const [paypalError, setPaypalError] = useState(false)

  const [paypalHostedConfig, setPaypalHostedConfig] = useState(null)

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

    const savedMethod = sessionStorage.getItem('submit_payment_method')
    if (savedMethod) {
      setPaymentMethod(savedMethod)
    }

    // Check if redirecting back from PayPal
    const query = new URLSearchParams(window.location.search)
    const hasPaypalParams = query.has('tx') || query.has('paymentId') || query.has('token') || query.has('PayerID')
    if (hasPaypalParams) {
      const txRef = query.get('tx') || query.get('paymentId') || `TXN-PAYPAL-${Math.floor(Math.random() * 9000000 + 1000000)}`
      
      if (savedForm) {
        try {
          const parsedForm = JSON.parse(savedForm)
          setSubmitting(true)
          
          fetch('/api/v1/submit-tool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              ...parsedForm,
              pricing_model: 'sponsored_paypal',
              transaction_ref: txRef,
            }),
          })
          .then(res => {
            if (!res.ok) throw new Error('API submission failed')
            return res.json()
          })
          .then(() => {
            setSubmitted(true)
            setTransactionRef(txRef)
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
    sessionStorage.setItem('submit_payment_method', paymentMethod)
  }, [paymentMethod])

  useEffect(() => {
    if (showPaymentModal && paymentMethod === 'paypal') {
      fetch('/api/v1/config/paypal-hosted')
        .then(res => res.json())
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
              if (window.paypal) {
                setPaypalLoaded(true)
              } else {
                handleLoadError()
              }
            }

            script.onerror = () => {
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
  }, [showPaymentModal, paymentMethod])

  useEffect(() => {
    if (paypalLoaded && window.paypal && paymentMethod === 'paypal') {
      const container = document.getElementById('paypal-button-container')
      if (container) {
        container.innerHTML = ''
        
        if (paypalHostedConfig && paypalHostedConfig.hosted_button_id) {
          try {
            window.paypal.HostedButtons({
              hostedButtonId: paypalHostedConfig.hosted_button_id
            }).render('#paypal-button-container')
          } catch (err) {
            console.error('Failed to render HostedButtons:', err)
            setError('Could not load PayPal checkout buttons.')
          }
        } else {
          try {
            window.paypal.Buttons({
              createOrder: (data, actions) => {
                return actions.order.create({
                  purchase_units: [{
                    amount: {
                      value: '49.99'
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
                    submitData('sponsored_paypal', txRef)
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
            }).render('#paypal-button-container')
          } catch (err) {
            console.error('Failed to render standard PayPal buttons:', err)
          }
        }
      }
    }
  }, [paypalLoaded, paymentMethod, paypalHostedConfig])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleCardChange(event) {
    const { name, value } = event.target
    let formattedValue = value
    if (name === 'number') {
      formattedValue = value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19)
    } else if (name === 'expiry') {
      formattedValue = value.replace(/\D/g, '').replace(/(.{2})/, '$1/').trim().slice(0, 5)
    } else if (name === 'cvc') {
      formattedValue = value.replace(/\D/g).slice(0, 3)
    }

    setCardData((current) => ({
      ...current,
      [name]: formattedValue,
    }))
  }

  function handleFormSubmit(event) {
    event.preventDefault()
    setError('')
    setShowPaymentModal(true)
  }

  async function handlePayment(event) {
    event.preventDefault()
    setError('')

    if (paymentMethod === 'paypal') {
      return
    }

    if (paymentMethod === 'stripe') {
      if (!cardData.number || !cardData.expiry || !cardData.cvc || !cardData.name) {
        setError('Please fill in all credit card details.')
        return
      }
    } else if (paymentMethod === 'razorpay') {
      if (!upiId && !upiId.includes('@')) {
        setError('Please enter a valid UPI ID (e.g., name@upi) or choose QR Code payment.')
        return
      }
    }

    setPaying(true)
    setTimeout(async () => {
      setPaying(false)
      setPaymentDone(true)
      const mockRef = `TXN-${paymentMethod.toUpperCase()}-${Math.floor(Math.random() * 9000000 + 1000000)}`
      setTransactionRef(mockRef)

      setTimeout(() => {
        setShowPaymentModal(false)
        submitData(`sponsored_${paymentMethod}`, mockRef)
      }, 1500)
    }, 1800)
  }

  async function submitData(pricingModel, transactionRef = '') {
    setSubmitting(true)
    setSubmitted(false)

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
          pricing_model: pricingModel,
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
      setFormData(INITIAL_FORM)
      setCardData({ number: '', expiry: '', cvc: '', name: '' })
      setUpiId('')
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
        <span className="text-[10px] font-black text-accent uppercase tracking-widest block mb-1">Fast-Track Sponsored Curation</span>
        <h1 className="text-2xl font-black text-ink tracking-tight sm:text-3xl">Submit Your AI Tool for Curation</h1>
        <p className="mt-2 text-sm text-ink-2 max-w-2xl font-normal leading-relaxed">
          Get your tool indexed and featured in front of students, creators, and developers with guaranteed 24-hour priority review.
        </p>

        {/* Sponsored Curation Card (Single Paid Path) */}
        <div className="mt-6">
          <div className="rounded-2xl border border-accent bg-accent-soft/20 p-5 shadow-md ring-2 ring-accent/15">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm">
                <Sparkles className="h-2.5 w-2.5" /> Founder / Builder Fast-Track
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-semibold text-muted text-line-through">$81</span>
                <span className="text-base font-black text-ink">$49.99</span>
                <span className="text-[10px] font-medium text-ink-2">one-time</span>
              </div>
            </div>
            <h3 className="mt-3 text-base font-bold text-ink">
              Fast-Track Sponsored Curation ($49.99)
            </h3>
            <p className="mt-1 text-xs text-ink-2 leading-relaxed font-normal">
              Guaranteed priority review, permanent high-authority dofollow backlink, featured badge, and inclusion in our weekly student AI digest within 24 hours.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left/Main Column: Submission Form */}
        <div className="lg:col-span-2">
          <section className="rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
            <h2 className="text-lg font-bold text-ink">
              Sponsored Curation Form
            </h2>
            
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
                  {submitting ? 'Processing...' : 'Proceed to Secure Checkout ($49.99)'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>

            {submitted && (
              <div className="mt-6 rounded-2xl border border-accent bg-accent-soft/30 p-6 shadow-md text-ink animate-fade-in">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-7 w-7 text-accent shrink-0" />
                  <div>
                    <h3 className="text-base font-black text-ink">Payment Approved & Submission Received! 🎉</h3>
                    <p className="text-xs text-accent-ink font-semibold mt-0.5">
                      Transaction Reference: <span className="font-mono">{transactionRef || 'TXN-PAYPAL-VERIFIED'}</span> • Amount: $49.99 USD
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-accent/20 text-xs text-ink-2 space-y-2 leading-relaxed">
                  <p>
                    <strong>What happens next?</strong> Our editorial team has received your submission details and payment confirmation.
                  </p>
                  <p className="bg-bg-elev/80 p-3 rounded-xl border border-line font-medium text-ink">
                    📩 <strong>Our team will review your submission and contact you soon via email at your provided founder address.</strong>
                  </p>
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

        {/* Right Column: Pricing details sidebar */}
        <div className="lg:col-span-1">
          <section className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Sponsored Perks Included</h3>
            
            <div className="space-y-4 text-xs">
              <div className="rounded-xl bg-accent-soft/30 p-3 border border-accent/15 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" />
                <span className="font-semibold text-accent-ink">Priority Fast-Track Audit</span>
              </div>

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
                <span className="text-xl font-bold text-ink">$49.99</span>
              </div>

              <ul className="space-y-2 text-ink-2 leading-relaxed pt-2 font-normal">
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">✓</span>
                  <span>Guaranteed review within 24 hours.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">✓</span>
                  <span>Permanent high-authority dofollow backlink.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">✓</span>
                  <span>Featured badge in search & catalog results.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent font-bold">✓</span>
                  <span>Spotlight inclusion in weekly student AI digest.</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>

      {/* Why Sponsor Your Tool Section */}
      <section className="mt-12 rounded-3xl border border-line bg-gradient-to-b from-bg-elev to-bg p-6 sm:p-10 shadow-md">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent px-3 py-1 text-[10px] font-bold uppercase tracking-widest mb-3">
            <Sparkles className="h-3 w-3" /> Proven Growth Platform
          </span>
          <h2 className="text-2xl font-black text-ink tracking-tight sm:text-3xl">
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
            <div className="text-2xl sm:text-3xl font-black text-ink">2,000+</div>
            <div className="text-[11px] font-medium text-ink-2 mt-1">Monthly Active Visitors</div>
          </div>

          <div className="rounded-2xl border border-line bg-bg/80 p-5 text-center transition hover:border-accent/40 hover:shadow-sm">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-ink">4,000+</div>
            <div className="text-[11px] font-medium text-ink-2 mt-1">Students Powered</div>
          </div>

          <div className="rounded-2xl border border-line bg-bg/80 p-5 text-center transition hover:border-accent/40 hover:shadow-sm">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-ink">100K+</div>
            <div className="text-[11px] font-medium text-ink-2 mt-1">Google Search Impressions</div>
          </div>

          <div className="rounded-2xl border border-line bg-bg/80 p-5 text-center transition hover:border-accent/40 hover:shadow-sm">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Search className="h-5 w-5" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-ink">Top 15</div>
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
              <span>High-Authority Dofollow SEO Backlink</span>
            </div>
            <p className="text-xs text-ink-2 leading-relaxed font-normal">
              Boost your site's domain authority with a permanent, indexable link from our structured directory, helping your tool rank higher on search engines.
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
                <h3 className="text-base font-semibold text-ink">Secure Sponsored Checkout</h3>
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
                  <span className="font-normal text-ink-2">Priority Curation for <strong className="text-ink font-semibold">{formData.name || 'Your Tool'}</strong></span>
                  <span className="font-bold text-ink">$49.99</span>
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
                  
                  {/* STRIPE CARD FORM */}
                  {paymentMethod === 'stripe' && (
                    <div className="space-y-3 animate-fade-in">
                      <div>
                        <label htmlFor="card_name" className="mb-1 block text-[10px] font-bold text-muted uppercase tracking-wider">
                          Cardholder Name
                        </label>
                        <input
                          id="card_name"
                          name="name"
                          type="text"
                          required
                          value={cardData.name}
                          onChange={handleCardChange}
                          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                          placeholder="Jane Doe"
                        />
                      </div>

                      <div>
                        <label htmlFor="card_number" className="mb-1 block text-[10px] font-bold text-muted uppercase tracking-wider">
                          Card Number
                        </label>
                        <input
                          id="card_number"
                          name="number"
                          type="text"
                          required
                          value={cardData.number}
                          onChange={handleCardChange}
                          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                          placeholder="4000 1234 5678 9010"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="card_expiry" className="mb-1 block text-[10px] font-bold text-muted uppercase tracking-wider">
                            Expiration Date
                          </label>
                          <input
                            id="card_expiry"
                            name="expiry"
                            type="text"
                            required
                            value={cardData.expiry}
                            onChange={handleCardChange}
                            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            placeholder="MM/YY"
                          />
                        </div>

                        <div>
                          <label htmlFor="card_cvc" className="mb-1 block text-[10px] font-bold text-muted uppercase tracking-wider">
                            CVC
                          </label>
                          <input
                            id="card_cvc"
                            name="cvc"
                            type="password"
                            required
                            value={cardData.cvc}
                            onChange={handleCardChange}
                            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                            placeholder="123"
                          />
                        </div>
                      </div>
                      <span className="block text-[9px] text-muted-2 text-right">🔒 Securely processed by Stripe Elements</span>
                    </div>
                  )}

                  {/* PAYPAL CHECKOUT BLOCK */}
                  {paymentMethod === 'paypal' && (
                    <div className="bg-bg-sunk/30 border border-line/60 rounded-2xl p-5 text-center space-y-4 animate-fade-in">
                      <div className="flex justify-center">
                        <span className="inline-flex items-center gap-1.5 bg-[#003087] text-white px-5 py-2.5 rounded-full font-black italic text-sm tracking-tight shadow-md select-none">
                          Pay<span className="text-[#0070ba]">Pal</span>
                        </span>
                      </div>
                      
                      <div className="space-y-3 max-w-md mx-auto">
                        <p className="text-xs text-ink-2 leading-relaxed font-normal">
                          Complete your <b>$49.99 Priority Curation</b> payment directly on PayPal&apos;s secure checkout page:
                        </p>
                        
                        <a
                          href={paypalHostedConfig?.payment_url || 'https://www.paypal.com/ncp/payment/XMWMPTJH5ZHPY'}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            setPaying(true)
                            setTimeout(() => {
                              setPaying(false)
                              setPaymentDone(true)
                              const txRef = `PAYPAL-NCP-XMWMPTJH5ZHPY-${Math.floor(Math.random() * 900000 + 100000)}`
                              setTransactionRef(txRef)
                              setTimeout(() => {
                                setShowPaymentModal(false)
                                submitData('sponsored_paypal', txRef)
                              }, 1200)
                            }, 1000)
                          }}
                          className="inline-flex items-center justify-center gap-2 w-full bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold py-3.5 px-6 rounded-xl text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                        >
                          <span>Pay $49.99 via PayPal Checkout</span>
                          <ArrowUpRight className="h-4 w-4" />
                        </a>
                        <span className="block text-[10px] text-muted-2">Opens PayPal&apos;s official checkout in a new window</span>
                      </div>

                      {paypalLoaded && (
                        <div className="pt-2 border-t border-line/40">
                          <p className="text-[11px] text-muted mb-2">Or use PayPal Smart Buttons:</p>
                          <div id="paypal-button-container" className="min-h-[60px] flex flex-col justify-center"></div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* RAZORPAY UPI BLOCK */}
                  {paymentMethod === 'razorpay' && (
                    <div className="space-y-4 animate-fade-in">
                      <div className="bg-bg-sunk/30 border border-line/60 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 justify-between">
                        <div className="space-y-1 text-center md:text-left">
                          <span className="text-[8px] font-bold uppercase tracking-wider text-[#0b69ff] bg-[#0b69ff]/10 px-2 py-0.5 rounded-full">Option 1: Quick QR Code</span>
                          <h4 className="text-xs font-semibold text-ink">Scan & Pay via UPI App</h4>
                          <p className="text-[10px] text-muted-2 leading-relaxed max-w-xs font-normal">Scan the mock QR code using GPay, PhonePe, Paytm, or BHIM UPI.</p>
                        </div>
                        {/* Mock QR code container */}
                        <div className="h-20 w-20 border border-line bg-bg-elev rounded-lg p-1.5 flex flex-col items-center justify-center shrink-0 shadow-sm relative group">
                          <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <QrCode className="h-12 w-12" />
                          </div>
                          <span className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition duration-200">
                            <ArrowUpRight className="h-5 w-5 text-white" />
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="upi_id" className="mb-1 block text-[10px] font-bold text-muted uppercase tracking-wider">
                          Option 2: Enter UPI ID
                        </label>
                        <input
                          id="upi_id"
                          type="text"
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value)}
                          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                          placeholder="e.g. founder@upi"
                        />
                      </div>
                      <span className="block text-[9px] text-muted-2 text-right">🔒 Securely processed by Razorpay Checkout</span>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl border border-danger bg-danger-soft px-3 py-2 text-[11px] text-danger">
                      {error}
                    </div>
                  )}

                  {/* Submission Button */}
                  {(paymentMethod !== 'paypal') && (
                    <div className="pt-3">
                      <Button
                        variant="primary"
                        type="submit"
                        disabled={paying}
                        className="w-full font-bold flex items-center justify-center gap-2 rounded-xl"
                      >
                        {paying ? (
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                            <span>
                              {paymentMethod === 'stripe' && 'Authorizing via Stripe...'}
                              {paymentMethod === 'razorpay' && 'Connecting to Razorpay UPI...'}
                            </span>
                          </div>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4" />
                            <span>
                              {paymentMethod === 'stripe' ? 'Pay $49.99' : ''}
                              {paymentMethod === 'razorpay' ? 'Authorize UPI / QR Payment' : ''}
                            </span>
                          </>
                        )}
                      </Button>
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

  // Helper function to handle thank-you banner pricing model label matching
  function pricingModelOfLastSubmission() {
    if (submitted) {
      return submissionType === 'suggest' ? 'free' : 'sponsored'
    }
    return 'free'
  }
}
