import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

// This page previously described a product that does not exist: it talked
// about cancelling a subscription "through your account dashboard", retaining
// "premium features until the end of your current billing period", and
// refunds arriving "via Stripe". AI Compass has never had a subscription, has
// never taken a Stripe payment, and has no billing period — everything on
// /pricing is a single PayPal charge. A refund policy that describes the
// wrong product is worse than none: it is the document a buyer reads to
// decide whether we can be trusted with $49, and the first thing they notice
// is that it was not written about them.
//
// The rule it now states is the one we can actually keep, and the line is
// drawn at DELIVERY rather than at time. Once a listing is published, the
// work is done and the page is live — that is the thing being bought, and it
// cannot be handed back. Before that point, and for anything charged twice,
// the money goes back in full. Being explicit about both halves is what makes
// the "no refunds" half credible.

function Section({ id, number, title, children }) {
  return (
    <section className="mt-10">
      <h2 id={id} className="text-xl font-semibold text-ink sm:text-2xl">
        {number}. {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed text-ink-2">{children}</div>
    </section>
  )
}

export default function RefundsPage() {
  return (
    <>
      <Helmet>
        <title>Refund & Cancellation Policy | AI Compass</title>
        <meta
          name="description"
          content="AI Compass refund policy: every listing tier is a one-time payment, not a subscription. Duplicate charges are refunded in full. Refunds are available before your listing is published; once it is live, the work has been delivered."
        />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
          <section>
            <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
              <WordReveal>Refund & Cancellation Policy</WordReveal>
            </h1>
            <p className="mt-3 text-sm text-muted">Last updated: September 2, 2026</p>

            {/* The short version, before the sections. Most people reading
                this page have one specific question and want it answered in
                the first screen, not on the third heading. */}
            <div className="mt-6 rounded-2xl border border-line bg-bg-elev p-5">
              <h2 className="text-sm font-bold text-ink">The short version</h2>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-2">
                <li>
                  <strong className="font-semibold text-ink">Charged twice? Refunded in full,
                  always.</strong> Write to admin@ai-compass.in with the PayPal reference.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Not published yet? Refunded in
                  full.</strong> Ask any time before your listing goes live.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Already published?</strong> No refund
                  — the listing is the deliverable and it is permanent.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Rejected by us? Refunded in
                  full,</strong> automatically. You do not have to ask.
                </li>
                <li>
                  <strong className="font-semibold text-ink">Nothing is a subscription.</strong>{' '}
                  There is nothing to cancel and nothing that renews.
                </li>
              </ul>
            </div>
          </section>

          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={REVEAL_VIEWPORT}
          >
            <Section id="what-you-buy" number={1} title="What you are buying">
              <p>
                Every paid tier on{' '}
                <Link to="/pricing" className="text-accent hover:underline">/pricing</Link> — Listing
                + Analytics ($19), Fast-Track ($49), Reviewed ($79) and a standalone commissioned
                review ($39) — is a <strong>one-time payment in USD</strong>, taken through PayPal.
              </p>
              <p>
                There is no subscription, no billing period, no renewal and no auto-charge. Nothing
                you buy expires, and nothing is withdrawn if you never pay again, because there is
                nothing further to pay. As a result there is nothing to cancel: a listing you have
                stopped wanting simply stays where it is, and you can ask us to remove it at any
                time at no charge (removal is not a refund — see section 3).
              </p>
            </Section>

            <Section id="duplicate-charges" number={2} title="Duplicate and incorrect charges">
              <p>
                <strong>If you were charged more than once for the same listing, we refund the
                duplicate in full.</strong> This is unconditional, it does not depend on the state
                of your listing, and it is the one thing we treat as urgent.
              </p>
              <p>
                The same applies to any charge that is wrong on its face: a payment taken for a
                tier you did not choose, an amount that does not match the price on /pricing, or a
                charge for a submission that was never recorded on our side.
              </p>
              <p>
                Email{' '}
                <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">
                  admin@ai-compass.in
                </a>{' '}
                with your PayPal transaction reference and the tool name. We aim to reply the same
                day and to issue the refund through PayPal as soon as we have confirmed it, which
                is normally within one working day. PayPal then typically takes 3&ndash;10 business
                days to return the money to your original payment method — that part is their
                timeline, not ours.
              </p>
            </Section>

            <Section id="before-published" number={3} title="Before your listing is published">
              <p>
                <strong>You can ask for a full refund at any point before your listing goes
                live.</strong> No reason is needed. Until publication nothing has been delivered,
                so there is nothing for us to keep.
              </p>
              <p>
                This covers the whole window between paying and appearing: the review queue, the
                staggered release delay, and a Launch Day you booked but have not reached. If you
                change your mind, or your product is not ready, write to{' '}
                <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">
                  admin@ai-compass.in
                </a>{' '}
                before the live date and you get the money back in full.
              </p>
            </Section>

            <Section id="after-published" number={4} title="Once your listing is live">
              <p>
                <strong>Once your listing has been published, the payment is final.</strong> At
                that point the work you paid for has been done and delivered: the listing is
                written and reviewed, the page exists at a permanent URL, it has been submitted to
                search engines, the placement is running and the announcement has gone out. None
                of that can be handed back.
              </p>
              <p>
                We will always remove a live listing on request, and we will do it promptly — but
                removal is not a refund, for the same reason. If a listing is removed at your
                request, the page and its URL are gone with it.
              </p>
              <p className="text-sm text-muted">
                We would rather be plain about this before you pay than argue about it afterwards.
                If you are not sure the timing is right, ask{' '}
                <a href="mailto:help@ai-compass.in" className="font-semibold text-accent hover:underline">
                  help@ai-compass.in
                </a>{' '}
                first, or start on the free tier — it is permanent and costs nothing.
              </p>
            </Section>

            <Section id="rejections" number={5} title="If we reject your submission">
              <p>
                <strong>A rejected submission is refunded in full, automatically.</strong> You do
                not have to ask, and we do not keep a processing fee.
              </p>
              <p>
                We only list tools that honestly belong in the catalogue. If yours does not fit —
                it is not an AI tool, the site does not work, the product does not exist yet, or
                the listing would mislead our readers — we return the money rather than publish it.
                A directory that publishes anything it is paid for is worth nothing to read, which
                would make it worth nothing to be listed in either.
              </p>
            </Section>

            <Section id="commissioned-reviews" number={6} title="Commissioned reviews">
              <p>
                A commissioned hands-on review (the $39 standalone, or the review included in the
                $79 Reviewed tier) buys the review being <em>written and published</em>, not its
                verdict. We publish what we find, and every commissioned review says on its face
                that it was commissioned.
              </p>
              <p>
                <strong>An unfavourable verdict is not grounds for a refund.</strong> That
                guarantee is precisely what makes the review worth citing.
              </p>
              <p>
                If we conclude we <em>cannot</em> review your tool fairly — we could not get access
                to it, or we have a conflict of interest — we refund the review portion in full and
                publish nothing.
              </p>
            </Section>

            <Section id="how-to-ask" number={7} title="How to request a refund">
              <p>
                Email{' '}
                <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">
                  admin@ai-compass.in
                </a>{' '}
                from the address you submitted with, and include:
              </p>
              <ul className="ml-5 list-disc space-y-1">
                <li>your tool name and its URL,</li>
                <li>the PayPal transaction reference from your invoice email,</li>
                <li>the amount and the date of the charge.</li>
              </ul>
              <p>
                Refunds are issued to the original PayPal payment method. We cannot refund to a
                different account, and we cannot refund in a different currency — PayPal converts
                at its own rate on the day, so a refunded amount may differ slightly from what
                left your account if your card is not in USD.
              </p>
              <p className="text-sm text-muted">
                Please write to us before opening a PayPal dispute. A dispute freezes the payment
                and stops us refunding it directly, which makes the same outcome take several weeks
                instead of a day.
              </p>
            </Section>

            <Section id="questions" number={8} title="Questions">
              <p>
                Anything about a payment, a charge or a refund:{' '}
                <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">
                  admin@ai-compass.in
                </a>
                . Anything about which tier to buy, or your listing itself:{' '}
                <a href="mailto:help@ai-compass.in" className="font-semibold text-accent hover:underline">
                  help@ai-compass.in
                </a>
                . See also our{' '}
                <Link to="/terms" className="text-accent hover:underline">Terms of Service</Link> and{' '}
                <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
              </p>
            </Section>
          </MotionDiv>
        </div>
      </div>
    </>
  )
}
