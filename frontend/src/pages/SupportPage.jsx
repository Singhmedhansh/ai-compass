import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { Heart, QrCode, Copy, Check, ExternalLink, Globe, Maximize2, X } from 'lucide-react'
import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div
const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const PAYPAL_URL = 'https://www.paypal.com/ncp/payment/T5XPKJ4UMJXD4'
const UPI_ID = 'singhmedhansh07@okhdfcbank'
const GPAY_QR_IMAGE = '/gpay-qr.png'
// ──────────────────────────────────────────────────────────────────────────────

// ── QR Lightbox Modal ─────────────────────────────────────────────────────────
function QRLightbox({ onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <AnimatePresence>
      <motion.div
        key="qr-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-modal="true"
        role="dialog"
        aria-label="GPay QR code enlarged"
      >
        <motion.div
          key="qr-panel"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col items-center gap-4 rounded-2xl bg-bg-elev p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '90vmin', width: '420px' }}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close enlarged QR"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition hover:bg-gray-200 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Large QR — name header cropped via overflow:hidden + translateY */}
          <div className="w-full overflow-hidden rounded-xl" style={{ maxHeight: '70vmin' }}>
            <img
              src={GPAY_QR_IMAGE}
              alt="GPay UPI QR code — scan with any UPI or camera app to pay"
              className="w-full block"
              style={{ transform: 'translateY(-20%)', display: 'block' }}
            />
          </div>

          {/* UPI hint */}
          <p className="text-center text-xs text-gray-500 leading-relaxed">
            Scan with Google Pay, PhonePe, Paytm, BHIM, or your phone&apos;s camera app
          </p>
          <p className="font-mono text-xs text-gray-400">{UPI_ID}</p>

          <button
            type="button"
            onClick={onClose}
            className="mt-1 rounded-lg border border-gray-200 px-5 py-2 text-xs text-gray-600 transition hover:bg-gray-50"
          >
            Close
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SupportPage() {
  const [copied, setCopied] = useState(false)
  const [qrEnlarged, setQrEnlarged] = useState(false)

  const handleCopyUPI = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const el = document.createElement('textarea')
      el.value = UPI_ID
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const closeModal = useCallback(() => setQrEnlarged(false), [])

  return (
    <>
      <Helmet>
        <title>Support AI Compass — Help Keep it Free &amp; Ad-Free</title>
        <meta
          name="description"
          content="Support AI Compass to keep the platform free, ad-free, and hand-tested for students. Donate via PayPal or UPI / GPay QR code."
        />
      </Helmet>

      {/* Lightbox */}
      {qrEnlarged && <QRLightbox onClose={closeModal} />}

      <div className="relative min-h-screen bg-bg overflow-hidden">
        {/* Ambient glow */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-accent/5 blur-[140px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -right-32 h-[520px] w-[520px] rounded-full bg-accent/5 blur-[140px]" />

        <div className="relative z-10 mx-auto max-w-3xl px-4 py-14 md:py-20">

          {/* ── Hero heading ─────────────────────────────────────── */}
          <section className="text-center">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-accent-soft mb-5">
              <Heart className="h-5 w-5 text-accent-ink" aria-hidden="true" />
            </span>
            <h1 className="text-3xl font-semibold text-ink sm:text-4xl md:text-5xl tracking-tight leading-tight">
              <WordReveal>Support AI Compass</WordReveal>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm text-muted leading-relaxed sm:text-base">
              AI Compass is completely free and ad-free. Every tool is hand-tested by our small
              team in Bengaluru. If it&apos;s helped you in any way, even the smallest contribution
              keeps the servers running and the catalog growing.
            </p>
          </section>

          {/* ── Payment cards ────────────────────────────────────── */}
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">

            {/* Card: PayPal */}
            <MotionDiv
              variants={sectionReveal}
              initial="initial"
              whileInView="animate"
              viewport={REVEAL_VIEWPORT}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-bg-elev p-6 shadow-sm transition-all duration-300 hover:border-line-strong hover:shadow-md"
            >
              <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-accent/5 transition-colors duration-300 group-hover:bg-accent/10" />

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
                <Globe className="h-5 w-5 text-accent-ink" aria-hidden="true" />
              </div>

              <div className="mt-5 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-widest text-accent">International &amp; Cards</p>
                <h2 className="mt-1.5 text-lg font-medium text-ink">PayPal</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-2">
                  Works for anyone worldwide — credit card, debit card, or PayPal balance. You
                  set the amount yourself at checkout.
                </p>
              </div>

              <div className="mt-6 pt-5 border-t border-line">
                <a
                  id="support-paypal-btn"
                  href={PAYPAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  Donate via PayPal
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>
            </MotionDiv>

            {/* Card: GPay / UPI */}
            <MotionDiv
              variants={sectionReveal}
              initial="initial"
              whileInView="animate"
              viewport={REVEAL_VIEWPORT}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-bg-elev p-6 shadow-sm transition-all duration-300 hover:border-line-strong hover:shadow-md"
            >
              <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-accent/5 transition-colors duration-300 group-hover:bg-accent/10" />

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
                <QrCode className="h-5 w-5 text-accent-ink" aria-hidden="true" />
              </div>

              <div className="mt-5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-accent">Indian users · zero fees</p>
                <h2 className="mt-1.5 text-lg font-medium text-ink">GPay / UPI</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-2">
                  Screenshot or scan the QR below using Google Pay, PhonePe, Paytm, BHIM, or any
                  UPI app. Instant and free.
                </p>
              </div>

              {/* QR code + enlarge button */}
              <div className="mt-5 flex flex-col items-center gap-2">
                {/* Clickable QR wrapper */}
                <button
                  id="support-qr-enlarge-btn"
                  type="button"
                  onClick={() => setQrEnlarged(true)}
                  aria-label="Enlarge QR code to scan"
                  className="group/qr relative inline-flex rounded-xl border border-line bg-bg-elev p-3 shadow-sm transition hover:border-accent/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title="Click to enlarge and scan"
                >
                  {/* QR thumbnail — header cropped via overflow:hidden + translateY */}
                  <div
                    className="overflow-hidden rounded-lg"
                    style={{ width: 176, height: 176 }}
                  >
                    <img
                      src={GPAY_QR_IMAGE}
                      alt="GPay UPI QR code — click to enlarge and scan"
                      width={176}
                      className="w-full block"
                      style={{ transform: 'translateY(-20%)' }}
                    />
                  </div>
                  {/* Hover overlay hint */}
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-colors duration-200 group-hover/qr:bg-black/10">
                    <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-medium text-white opacity-0 transition-opacity duration-200 group-hover/qr:opacity-100">
                      <Maximize2 className="h-3 w-3" aria-hidden="true" />
                      Enlarge to scan
                    </span>
                  </span>
                </button>

                {/* Enlarge text link */}
                <button
                  type="button"
                  onClick={() => setQrEnlarged(true)}
                  className="flex items-center gap-1 text-[11px] text-accent hover:underline focus-visible:outline-none"
                >
                  <Maximize2 className="h-3 w-3" aria-hidden="true" />
                  Enlarge QR to scan from screen
                </button>
              </div>

              {/* UPI ID copy row */}
              <div className="mt-4">
                <p className="text-center text-[10px] font-medium uppercase tracking-widest text-muted">
                  Or type the UPI ID manually
                </p>
                <button
                  id="support-upi-copy-btn"
                  type="button"
                  onClick={handleCopyUPI}
                  aria-label="Copy UPI ID to clipboard"
                  className="group/copy mt-2 flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-bg px-3 py-2 text-xs font-mono text-ink-2 transition hover:border-line-strong hover:bg-bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="truncate">{UPI_ID}</span>
                  {copied ? (
                    <span className="flex shrink-0 items-center gap-1 text-accent">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Copied
                    </span>
                  ) : (
                    <Copy className="h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover/copy:text-ink" aria-hidden="true" />
                  )}
                </button>
              </div>
            </MotionDiv>
          </div>

          {/* ── Footer note ──────────────────────────────────────── */}
          <p className="mt-10 text-center text-xs text-muted leading-relaxed">
            Contributions go directly towards server costs and ongoing maintenance.
            <br />
            Thank you for keeping AI Compass free for students. 🙏
          </p>

        </div>
      </div>
    </>
  )
}
