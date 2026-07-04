import { useState } from 'react'
import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { Heart, QrCode, Copy, Check, ExternalLink, Globe } from 'lucide-react'
import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div
const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Update these when payment details change.
const PAYPAL_URL = 'https://www.paypal.com/ncp/payment/T5XPKJ4UMJXD4'
const UPI_ID = 'singhmedhansh07@okhdfcbank'
const GPAY_QR_IMAGE = '/gpay-qr.png' // Place actual QR image in frontend/public/gpay-qr.png
// ──────────────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [copied, setCopied] = useState(false)

  const handleCopyUPI = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for browsers that don't support clipboard API
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

  return (
    <>
      <Helmet>
        <title>Support AI Compass — Help Keep it Free & Ad-Free</title>
        <meta
          name="description"
          content="Support AI Compass to keep the platform free, ad-free, and hand-tested for students. Donate via PayPal or UPI / GPay QR code."
        />
      </Helmet>

      <div className="relative min-h-screen bg-bg overflow-hidden">
        {/* Ambient glow backgrounds */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-accent/5 blur-[140px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -right-32 h-[520px] w-[520px] rounded-full bg-accent/5 blur-[140px]"
        />

        <div className="relative z-10 mx-auto max-w-3xl px-4 py-14 md:py-20">

          {/* ── Hero heading ───────────────────────────────────────── */}
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

          {/* ── Payment cards ──────────────────────────────────────── */}
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">

            {/* ── Card: PayPal ──────────────────────── */}
            <MotionDiv
              variants={sectionReveal}
              initial="initial"
              whileInView="animate"
              viewport={REVEAL_VIEWPORT}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-bg-elev p-6 shadow-sm transition-all duration-300 hover:border-line-strong hover:shadow-md"
            >
              {/* Subtle corner accent */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-accent/5 transition-colors duration-300 group-hover:bg-accent/10"
              />

              {/* Icon */}
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
                <Globe className="h-5 w-5 text-accent-ink" aria-hidden="true" />
              </div>

              {/* Copy */}
              <div className="mt-5 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-widest text-accent">International &amp; Cards</p>
                <h2 className="mt-1.5 text-lg font-medium text-ink">PayPal</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-2">
                  Works for anyone worldwide — credit card, debit card, or PayPal balance. You
                  set the amount yourself at checkout.
                </p>
              </div>

              {/* CTA */}
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

            {/* ── Card: GPay / UPI ──────────────────── */}
            <MotionDiv
              variants={sectionReveal}
              initial="initial"
              whileInView="animate"
              viewport={REVEAL_VIEWPORT}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-bg-elev p-6 shadow-sm transition-all duration-300 hover:border-line-strong hover:shadow-md"
            >
              {/* Subtle corner accent */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-accent/5 transition-colors duration-300 group-hover:bg-accent/10"
              />

              {/* Icon */}
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
                <QrCode className="h-5 w-5 text-accent-ink" aria-hidden="true" />
              </div>

              {/* Copy */}
              <div className="mt-5">
                <p className="text-[10px] font-medium uppercase tracking-widest text-accent">Indian users · zero fees</p>
                <h2 className="mt-1.5 text-lg font-medium text-ink">GPay / UPI</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-ink-2">
                  Screenshot or scan the QR below using Google Pay, PhonePe, Paytm, BHIM, or any
                  UPI app. Instant and free.
                </p>
              </div>

              {/* QR code */}
              <div className="mt-5 flex justify-center">
                <div className="inline-flex rounded-xl border border-line bg-white p-3 shadow-sm">
                  <img
                    src={GPAY_QR_IMAGE}
                    alt="GPay UPI QR code — scan with any UPI app to pay Medhansh Singh"
                    width={176}
                    height={176}
                    className="h-44 w-44 object-contain"
                  />
                </div>
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
                    <Copy
                      className="h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover/copy:text-ink"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            </MotionDiv>
          </div>

          {/* ── Footer note ────────────────────────────────────────── */}
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
