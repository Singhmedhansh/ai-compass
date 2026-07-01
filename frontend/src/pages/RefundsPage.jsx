import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'

import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

export default function RefundsPage() {
  return (
    <>
      <Helmet>
        <title>Refund & Cancellation Policy | AI Compass</title>
        <meta
          name="description"
          content="Refund and cancellation policy of AI Compass. Learn about cancellations, refunds, and exceptions for digital access."
        />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
          <section>
            <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
              <WordReveal>Refund & Cancellation Policy</WordReveal>
            </h1>
            <p className="mt-3 text-sm text-muted">Last updated: July 1, 2026</p>
            <p className="mt-6 text-base leading-relaxed text-ink-2">
              At AI Compass, we want to ensure you have a clear understanding of our billing practices. Because our platform provides instant digital access to premium tools, configurations, and insights, we enforce the following policy:
            </p>
          </section>

          {/* Single sectionReveal wrap so the content block reveals as one cohesive unit */}
          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={REVEAL_VIEWPORT}
          >
            <section className="mt-12">
              <h2 id="cancellations" className="text-xl font-semibold text-ink sm:text-2xl">
                1. Cancellations
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                You can cancel your subscription at any time directly through your account dashboard. Upon cancellation, you will retain full access to all premium features until the end of your current billing period. No further charges will be made to your card.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="refund-policy" className="text-xl font-semibold text-ink sm:text-2xl">
                2. Refund Policy
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                Due to the digital nature of the Service and the immediate delivery of value, all sales are final and we do not offer refunds or credits for any partial subscription periods.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="exceptions" className="text-xl font-semibold text-ink sm:text-2xl">
                3. Exceptions
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                If you believe you were mistakenly double-charged due to a technical glitch or billing error on our end, please reach out to us at{' '}
                <a
                  href="mailto:medhansh.builds@gmail.com"
                  className="text-accent hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  medhansh.builds@gmail.com
                </a>
                {' '}within 7 days of the transaction. We will investigate the issue and process a refund if an error occurred. Approved refunds typically take 5-10 business days to reflect in your bank account via Stripe.
              </p>
            </section>
          </MotionDiv>
        </div>
      </div>
    </>
  )
}
