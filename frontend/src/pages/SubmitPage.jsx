import { useState } from 'react'
import { CreditCard, Sparkles, CheckCircle2, ShieldCheck, Mail, Send, ArrowRight, User } from 'lucide-react'

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
  const [submissionType, setSubmissionType] = useState('suggest') // 'suggest' | 'sponsor'
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [cardData, setCardData] = useState({ number: '', expiry: '', cvc: '', name: '' })
  const [paying, setPaying] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleCardChange(event) {
    const { name, value } = event.target
    // Simple formatting for card number & expiry
    let formattedValue = value
    if (name === 'number') {
      formattedValue = value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim().slice(0, 19)
    } else if (name === 'expiry') {
      formattedValue = value.replace(/\D/g, '').replace(/(.{2})/, '$1/').trim().slice(0, 5)
    } else if (name === 'cvc') {
      formattedValue = value.replace(/\D/g, '').slice(0, 3)
    }

    setCardData((current) => ({
      ...current,
      [name]: formattedValue,
    }))
  }

  function handleFormSubmit(event) {
    event.preventDefault()
    setError('')

    if (submissionType === 'sponsor') {
      // Show payment modal first
      setShowPaymentModal(true)
    } else {
      // Direct submit
      submitData('free')
    }
  }

  async function handlePayment(event) {
    event.preventDefault()
    if (!cardData.number || !cardData.expiry || !cardData.cvc || !cardData.name) {
      setError('Please fill in all card details.')
      return
    }

    setPaying(true)
    // Simulate transaction delay
    setTimeout(async () => {
      setPaying(false)
      setPaymentDone(true)
      // Small delay for showing success checkmark before submitting data
      setTimeout(() => {
        setShowPaymentModal(false)
        submitData('sponsored')
      }, 1500)
    }, 1800)
  }

  async function submitData(pricingModel) {
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
        }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to submit right now. Please try again.')
      }

      setSubmitted(true)
      setFormData(INITIAL_FORM)
      setCardData({ number: '', expiry: '', cvc: '', name: '' })
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
        <span className="text-[10px] font-black text-accent uppercase tracking-widest block mb-1">Inclusion Curation</span>
        <h1 className="text-2xl font-black text-ink tracking-tight sm:text-3xl">Submit an AI Tool</h1>
        <p className="mt-2 text-sm text-ink-2 max-w-2xl">
          We curate hand-tested, student-friendly AI utilities. Select your submission tier below to get started.
        </p>

        {/* Curation Tiers Choice */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Suggest a Tool Card (Free) */}
          <div
            onClick={() => {
              setSubmissionType('suggest')
              setError('')
            }}
            className={`group rounded-2xl border p-5 cursor-pointer transition duration-300 ${
              submissionType === 'suggest'
                ? 'border-accent bg-accent-soft/20 shadow-md ring-2 ring-accent/15'
                : 'border-line bg-bg-elev hover:border-line-strong hover:shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-sunk px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-2">
                <User className="h-2.5 w-2.5" /> Friendly User
              </span>
              <span className="text-sm font-black text-muted-2">$0</span>
            </div>
            <h3 className="mt-3 text-base font-bold text-ink group-hover:text-accent transition-colors">
              Suggest a Tool
            </h3>
            <p className="mt-1 text-xs text-ink-2 leading-relaxed">
              For students and creators recommending a favorite utility. Standard community review queue (takes up to 2-3 weeks).
            </p>
          </div>

          {/* Sponsored Inclusion Card (Paid) */}
          <div
            onClick={() => {
              setSubmissionType('sponsor')
              setError('')
            }}
            className={`group rounded-2xl border p-5 cursor-pointer transition duration-300 relative overflow-hidden ${
              submissionType === 'sponsor'
                ? 'border-accent bg-accent-soft/20 shadow-md ring-2 ring-accent/15'
                : 'border-line bg-bg-elev hover:border-line-strong hover:shadow-sm'
            }`}
          >
            <div className="absolute top-0 right-0 h-24 w-24 bg-accent/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-bg shadow-sm">
                <Sparkles className="h-2.5 w-2.5" /> Founder / Co-Founder
              </span>
              <span className="text-sm font-black text-accent">$75 + taxes</span>
            </div>
            <h3 className="mt-3 text-base font-bold text-ink group-hover:text-accent transition-colors">
              Fast-Track Sponsored Inclusion
            </h3>
            <p className="mt-1 text-xs text-ink-2 leading-relaxed">
              Guaranteed priority review and permanent inclusion within 24 hours. Ideal for builders seeking visibility.
            </p>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left/Main Column: Submission Form */}
        <div className="lg:col-span-2">
          <section className="rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
            <h2 className="text-lg font-bold text-ink">
              {submissionType === 'suggest' ? 'Tool Suggestion Form' : 'Sponsored Curation Form'}
            </h2>
            
            <form className="mt-6 space-y-4" onSubmit={handleFormSubmit}>
              
              {/* Conditional sponsored fields */}
              {submissionType === 'sponsor' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="submitter_email" className="mb-1 block text-xs font-semibold text-ink-2">
                      Founder Contact Email
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
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="mb-1 block text-xs font-semibold text-ink-2">
                    Tool name
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
                    Tool URL
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
                  {submissionType === 'suggest' ? 'Why it\'s useful for students' : 'Product description & Curation context'}
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  rows={4}
                  required
                  value={formData.reason}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder={
                    submissionType === 'suggest'
                      ? "Describe what makes this tool helpful for students, creators, or developers..."
                      : "Describe your tool's main features and why it belongs in our curated library..."
                  }
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
                    : submissionType === 'sponsor' 
                      ? 'Proceed to Secure Payment' 
                      : 'Submit Free Suggestion'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>

            {submitted && (
              <div className="mt-4 rounded-xl border border-accent bg-accent-soft/30 p-4 text-xs text-accent-ink flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />
                <div>
                  <p className="font-bold">Submission Confirmed!</p>
                  <p className="mt-1 leading-relaxed">
                    {submissionType === 'sponsor'
                      ? "Thank you! Your sponsor priority fee was successfully received. Our editors will review and index your tool within 24 hours."
                      : "Thanks! We've received your suggestion and will audit it shortly to see if it qualifies for inclusion."}
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
            <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Inclusion Overview</h3>
            
            {submissionType === 'suggest' ? (
              <div className="space-y-3 text-xs text-ink-2 leading-relaxed">
                <div className="flex items-center gap-2 font-medium text-ink">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                  <span>Free Submissions Queue</span>
                </div>
                <p>Anyone can suggest a tool they love. Free suggestions undergo standard queue checking where they are checked for student safety and utility.</p>
                <div className="rounded-xl bg-bg-sunk/50 p-3 border border-line/45">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">Est. Audit time</span>
                  <span className="font-bold text-ink">2 - 3 weeks</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl bg-accent-soft/30 p-3 border border-accent/15 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <span className="font-bold text-accent-ink">Priority Fast-Track Audit</span>
                </div>

                <div className="space-y-2 border-b border-line pb-3">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Priority submission fee</span>
                    <span className="font-bold text-ink">$75.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Taxes & Processing (8%)</span>
                    <span className="font-bold text-ink">$6.00</span>
                  </div>
                </div>

                <div className="flex justify-between items-baseline pt-1">
                  <span className="font-bold text-ink">Total Due</span>
                  <span className="text-xl font-black text-ink">$81.00</span>
                </div>

                <ul className="space-y-2 text-ink-2 leading-relaxed pt-2">
                  <li className="flex items-start gap-2">
                    <span className="text-accent font-bold">✓</span>
                    <span>Guaranteed review within 24 hours.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent font-bold">✓</span>
                    <span>Permanent inclusion in catalog.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent font-bold">✓</span>
                    <span>Featured badge in search results.</span>
                  </li>
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Simulated Checkout Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md bg-bg-elev border border-line rounded-3xl p-6 shadow-2xl space-y-6">
            
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-accent" />
                <h3 className="text-base font-bold text-ink">Secure Sponsored Checkout</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setShowPaymentModal(false)}
                className="text-xs font-semibold text-muted hover:text-ink hover:bg-bg-sunk px-2.5 py-1 rounded-lg border border-line/45"
              >
                Cancel
              </button>
            </div>

            {/* Simulated Payment content */}
            {!paymentDone ? (
              <form onSubmit={handlePayment} className="space-y-4">
                <div className="bg-bg-sunk/40 rounded-xl p-3 border border-line/45 flex justify-between items-center text-xs">
                  <span className="font-medium text-ink-2">Sponsored review for <strong className="text-ink font-bold">{formData.name || 'Your Tool'}</strong></span>
                  <span className="font-black text-ink">$81.00</span>
                </div>

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
                        <span>Authorizing payment...</span>
                      </div>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        <span>Pay $81.00</span>
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-center space-y-4 animate-scale-up">
                <div className="h-16 w-16 bg-accent-soft rounded-full flex items-center justify-center text-accent shadow-inner animate-pulse">
                  <CheckCircle2 className="h-10 w-10" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-ink">Payment Successful!</h4>
                  <p className="text-xs text-muted mt-1">Transaction ref: TXN-{Math.floor(Math.random() * 9000000 + 1000000)}</p>
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
