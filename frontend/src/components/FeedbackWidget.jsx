import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { MessageSquare, X, Send, CheckCircle2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

// ESLint in this repo doesn't recognise JSX namespaced tags (<MotionDiv>)
// as usage, so we alias to constants. Same pattern as BestJasperAlternatives.
const MotionDiv = motion.div
const MotionButton = motion.button

// Floating feedback widget rendered on every page (mounted in App.jsx
// outside <Routes> so it persists across navigation). Click the FAB to
// open a small form; submission POSTs to /api/v1/feedback which stores a
// row in the Feedback table AND emails the admin in real time.
//
// Spam defenses on the server: honeypot field `website`, per-IP rate
// limit (5/hour), min 5-char message. The honeypot is rendered here but
// hidden from sighted users via inline styles + aria-hidden.

const STORAGE_KEY = 'ai-compass-feedback-submitted-at'
const RESHOW_AFTER_MS = 1000 * 60 * 60 * 24 // 24h after a submit, button quietens

export default function FeedbackWidget() {
  const location = useLocation()
  const isWizardPage = location.pathname === '/ai-tool-finder'
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)
  const [recentlySubmitted, setRecentlySubmitted] = useState(false)

  // Soften the FAB for 24h after a successful submit — same user submitting
  // again immediately is probably noise, but we still want them to be able
  // to. So we dim the button rather than hide it.
  useEffect(() => {
    try {
      const ts = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
      if (ts && Date.now() - ts < RESHOW_AFTER_MS) {
        setRecentlySubmitted(true)
      }
    } catch { /* localStorage unavailable — ignore */ }
  }, [])

  // ESC closes the modal
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError(null)

    if (message.trim().length < 5) {
      setError('Message is too short — give us a few words.')
      return
    }

    setSubmitting(true)
    try {
      const resp = await fetch('/api/v1/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // include credentials so a logged-in user's identity is captured
        // server-side from the session cookie.
        credentials: 'include',
        body: JSON.stringify({
          message: message.trim(),
          email: email.trim() || null,
          page_url: typeof window !== 'undefined' ? window.location.href : null,
          website: honeypot, // honeypot — must be empty for real users
        }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || `Server error (${resp.status})`)
      }
      setSubmitted(true)
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch { /* ignore */ }
      setRecentlySubmitted(true)
      // Reset form for next time
      setMessage('')
      setEmail('')
      // Auto-close after a moment so the success state is visible
      setTimeout(() => {
        setOpen(false)
        // Reset submitted state after the close animation
        setTimeout(() => setSubmitted(false), 400)
      }, 1800)
    } catch (err) {
      setError(err.message || 'Could not send feedback. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating button — always visible bottom-right */}
      <MotionButton
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        initial={{ opacity: 0, y: 10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className={`fixed bottom-5 ${isWizardPage ? 'left-5 right-auto' : 'right-5'} z-50 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${isWizardPage ? 'text-xs px-3 py-2 sm:text-sm sm:px-4 sm:py-3' : ''} ${recentlySubmitted ? 'opacity-70' : ''}`}
        style={{ boxShadow: '0 6px 24px rgba(47, 179, 137, 0.35)' }}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </MotionButton>

      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — dim the page so the form has focus */}
            <MotionDiv
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-[60] bg-black/40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />

            {/* Form panel */}
            <MotionDiv
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="feedback-title"
              className={`fixed bottom-20 ${isWizardPage ? 'left-5 right-auto' : 'right-5'} z-[70] w-[calc(100vw-2.5rem)] max-w-sm rounded-2xl border border-line bg-bg-elev p-5 shadow-2xl ${isWizardPage ? '' : 'sm:right-5'}`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 id="feedback-title" className="text-base font-semibold text-ink">
                    Send feedback
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Bug, idea, tool that&apos;s wrong — anything goes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1 text-muted hover:bg-bg-sunk hover:text-ink"
                  aria-label="Close feedback form"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {submitted ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <CheckCircle2 className="h-10 w-10 text-accent" />
                  <p className="text-sm font-medium text-ink">Got it — thank you.</p>
                  <p className="text-xs text-muted">
                    {email ? 'I&apos;ll reply if a response makes sense.' : 'No reply expected — appreciated all the same.'}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <label className="sr-only" htmlFor="feedback-message">Your message</label>
                  <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's on your mind?"
                    rows={4}
                    maxLength={5000}
                    required
                    className="w-full resize-none rounded-lg border border-line bg-bg-sunk px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />

                  <label className="sr-only" htmlFor="feedback-email">Email (optional)</label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional, if you want a reply)"
                    maxLength={255}
                    autoComplete="email"
                    className="w-full rounded-lg border border-line bg-bg-sunk px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />

                  {/* Honeypot — must remain empty. Hidden from sighted users
                      and screen readers; bots see it as an input and fill it. */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
                    <label htmlFor="feedback-website">Website</label>
                    <input
                      id="feedback-website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-500" role="alert">{error}</p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-2">
                      {message.length}/5000
                    </p>
                    <button
                      type="submit"
                      disabled={submitting || message.trim().length < 5}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? 'Sending...' : (<>Send <Send className="h-3.5 w-3.5" /></>)}
                    </button>
                  </div>
                </form>
              )}
            </MotionDiv>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
