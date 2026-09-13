import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'

import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

export default function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy | AI Compass</title>
        <meta
          name="description"
          content="How AI Compass handles your data: account info, cookies, server logs, third-party services. Operated from India; data stored in the United States."
        />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
          <section>
            <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
              <WordReveal>Privacy Policy</WordReveal>
            </h1>
            <p className="mt-3 text-sm text-muted">Last updated: September 13, 2026</p>
            <p className="mt-6 text-base leading-relaxed text-ink-2">
              This Privacy Policy explains how AI Compass (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) collects, uses, and protects your information when you use ai-compass.in (the &quot;Service&quot;). By using the Service, you agree to this policy.
            </p>
          </section>

          {/* Single sectionReveal wrap so the content block reveals as one cohesive unit — per-section reveals would feel choppy on a text-heavy page. */}
          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={REVEAL_VIEWPORT}
          >
            <section className="mt-12">
              <h2 id="information-we-collect" className="text-xl font-semibold text-ink sm:text-2xl">
                1. Information we collect
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                Account information: When you create an account, we collect your email address and a hashed version of your password. We use bcrypt — we never store passwords in plain text.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                Newsletter subscriptions: If you sign up via the homepage newsletter form (no account required), we store your email address and the timestamp of the subscription. We use it only to send the &quot;new tools&quot; digest. Every email has a one-click unsubscribe link; clicking it deletes the row from our database immediately.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                User-generated content: Reviews, ratings, favorites, and collections you create are stored in our database. Reviews and ratings are publicly visible to other users along with your username. Upvotes and downvotes you cast on reviews are recorded to prevent double voting.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                Stack Architect profiles: If you use the AI Stack Architect wizard while logged in, you can choose to save your custom stack selections (goals, budget preferences, platform, experience level, and the list of recommended tools) to your account. This data is stored securely in our database and can be deleted by you at any time from your user dashboard.
              </p>

              <p className="mt-3 leading-relaxed text-ink-2">
                Session data: We use session cookies to keep you logged in. These are essential for the Service to function.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                Usage data: We keep server logs of requests to the site — IP address, user agent, path and response status — for security and operational purposes, and our hosting provider keeps its own. We also use your IP address to rate-limit sign-in attempts and form submissions, which is how we stop password guessing and spam.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                Outbound link clicks: When you click through to a tool&apos;s website from one of our listings, we record the click along with your IP address and user agent. Some of those links are affiliate links, and we use this to tell genuine interest from automated or repeated clicking. It is not used to build a profile of you.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                Payment data: Payments for paid listings are processed by <strong>PayPal</strong>. Your card or PayPal account details go to PayPal directly and never reach our servers — we cannot see them, and we do not store them. PayPal collects and processes that data under its own privacy policy. What we store is the PayPal order reference, the amount, the currency and the verification status of the payment, kept against your submission so we can confirm what was bought, issue your invoice, and refund you if we need to. There are no subscriptions, so there is no recurring billing data of any kind.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                We do not collect location data beyond standard server logs, or contacts/social media data.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="how-we-use" className="text-xl font-semibold text-ink sm:text-2xl">
                2. How we use information
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">We use the information we collect to:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">Provide account services and authentication</li>
                <li className="leading-relaxed">Display your reviews, ratings, and contributions to other users</li>
                <li className="leading-relaxed">Maintain your favorites and collections</li>
                <li className="leading-relaxed">Improve the Service based on usage patterns</li>
                <li className="leading-relaxed">Respond to your requests and inquiries</li>
              </ul>
              <p className="mt-3 leading-relaxed text-ink-2">
                We do not sell your personal information. We do not share your information with third parties for marketing purposes.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="service-providers" className="text-xl font-semibold text-ink sm:text-2xl">
                3. Service providers
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                We rely on the following service providers to operate AI Compass:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">Render — hosting and database (PostgreSQL)</li>
                <li className="leading-relaxed">PayPal — payment processing for paid listings. Receives your payment details directly; we receive only the order reference and its status.</li>
                <li className="leading-relaxed">Resend — delivery of transactional email (verification, invoices, listing notices, the digest). Receives your email address and the message.</li>
                <li className="leading-relaxed">Cloudflare — sits in front of the site for TLS, caching and abuse protection. Sees the IP address and request metadata of every visit.</li>
                <li className="leading-relaxed">Google Analytics 4 — website analytics. Loads only if you accept analytics cookies. Receives page and device data and your IP address; it does not receive your email address or name.</li>
                <li className="leading-relaxed">PostHog — product analytics and session recording. Loads only if you accept analytics cookies. Receives page and interaction data and, if you are signed in, your account ID — not your email address or name.</li>
                <li className="leading-relaxed">Sentry — error monitoring, so we find crashes. Receives technical details of the error and, if you are signed in, your account ID. It does not receive your email address.</li>
              </ul>
              <p className="mt-3 leading-relaxed text-ink-2">
                These providers process data on our behalf and are bound by their own privacy commitments.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="cookies" className="text-xl font-semibold text-ink sm:text-2xl">
                4. Cookies & analytics
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                <strong>Essential cookie.</strong> If you sign in, we set one session cookie to keep you signed in. It is required for the Service to work and is set whether or not you accept analytics.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                <strong>Analytics cookies, only if you accept them.</strong> We use two analytics products: <strong>Google Analytics 4</strong> and <strong>PostHog</strong>. Both set their own cookies and both store data in your browser. Neither one loads until you press Accept on the cookie banner — if you press Decline, or simply never answer, no analytics script is loaded at all.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                What they collect: page paths and navigation, approximate location derived from IP, device and browser type, clicks and other interactions, and — through PostHog — session recordings, which replay how a page was used. Text you type into forms is masked in those recordings and we do not receive its contents. Passwords are never recorded.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                If you are signed in and have accepted analytics, PostHog events are linked to your account ID so we can tell one person&apos;s sessions apart. We do not send your email address or your name to PostHog or to Google.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                You can change your mind at any time by clearing this site&apos;s data in your browser, which removes the stored choice and brings the banner back. Standard ad blockers and tracker blockers also block both products.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                <strong>Correction (September 13, 2026).</strong> An earlier version of this page said we used only a session cookie, used no tracking cookies, and ran PostHog in a memory-only mode that wrote no cookies or <code className="rounded bg-bg-sunk px-1.5 py-0.5 text-sm">localStorage</code>. That was not accurate: PostHog was configured to persist to both, Google Analytics was running and was not mentioned anywhere on this page, and the cookie banner&apos;s Decline button did not actually stop either product. The behaviour described above is what the site does now, and the banner now controls what it says it controls.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="data-retention" className="text-xl font-semibold text-ink sm:text-2xl">
                5. Data retention
              </h2>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">Account data: retained while your account is active. When you delete your account, the record and everything personal attached to it is removed immediately, not on a delay.</li>
                <li className="leading-relaxed">Newsletter subscriptions: retained until you unsubscribe (one-click link in every email). Clicking unsubscribe deletes the row immediately — we don&apos;t keep a record of past subscribers.</li>
                <li className="leading-relaxed">User content (reviews, ratings, favorites, collections): retained while associated with your account. You can delete individual items at any time. When you delete your account, your content is removed.</li>
                <li className="leading-relaxed">Server logs: typically retained for 30-90 days by our hosting provider for security purposes.</li>
                <li className="leading-relaxed">Session records and page-view events: we do not currently expire these on a fixed schedule, so they are kept until you delete your account, at which point they go with it. We are working towards a fixed retention window and will say so here when it is in place.</li>
                <li className="leading-relaxed">Analytics data held by Google and PostHog is subject to their own retention settings and is not deleted by deleting your AI Compass account. If you want it removed, contact us and we will raise it with them.</li>
              </ul>
            </section>

            <section className="mt-12">
              <h2 id="your-rights" className="text-xl font-semibold text-ink sm:text-2xl">
                6. Your rights
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">You have the right to:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">Access your account data — request a copy by emailing us</li>
                <li className="leading-relaxed">Correct inaccurate information — most fields are editable from your profile</li>
                <li className="leading-relaxed">Delete your account — available from account settings, or by emailing us. If you signed up with Google, GitHub or LinkedIn and so have no password, you confirm by typing your email address instead.</li>
                <li className="leading-relaxed">Export your data in a portable format — request via email</li>
              </ul>
              <p className="mt-3 leading-relaxed text-ink-2">
                For EU users (GDPR): you have additional rights including data portability, restriction of processing, and the right to lodge a complaint with your local data protection authority.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="security" className="text-xl font-semibold text-ink sm:text-2xl">
                7. Security
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">We use industry-standard security practices:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">Bcrypt password hashing</li>
                <li className="leading-relaxed">HTTPS encryption for all traffic</li>
                <li className="leading-relaxed">Secure session cookies</li>
              </ul>
              <p className="mt-3 leading-relaxed text-ink-2">
                No system is perfectly secure. If you become aware of a security issue, please contact us at{' '}
                <a
                  href="mailto:admin@ai-compass.in"
                  className="text-accent hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  admin@ai-compass.in
                </a>
                , which is the address we monitor for urgent reports.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="childrens-privacy" className="text-xl font-semibold text-ink sm:text-2xl">
                8. Children&apos;s privacy
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                AI Compass is intended for use by people aged 13 and over. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided personal information, contact us and we will delete it.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="changes" className="text-xl font-semibold text-ink sm:text-2xl">
                9. Changes to this policy
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                We may update this Privacy Policy from time to time. When we do, we&apos;ll update the &quot;Last updated&quot; date at the top. For significant changes, we&apos;ll notify active users by email.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="contact" className="text-xl font-semibold text-ink sm:text-2xl">
                10. Contact
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                For privacy questions, data requests, or to report a concern:
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                <strong className="text-ink">Privacy and data requests:</strong>{' '}
                <a
                  href="mailto:help@ai-compass.in"
                  className="text-accent hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  help@ai-compass.in
                </a>
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                <strong className="text-ink">Payment data, or anything urgent:</strong>{' '}
                <a
                  href="mailto:admin@ai-compass.in"
                  className="text-accent hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  admin@ai-compass.in
                </a>
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                This Service is operated from India, but your data is not stored there. Our application server and database are hosted by Render in <strong>Virginia, United States</strong>, so that is where your account, your content and our logs physically live. Our other processors are also outside India: PostHog and Sentry in the United States, and Google, PayPal, Resend and Cloudflare across their own global infrastructure.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                If you are in the EU or UK, this means your personal data is transferred outside your jurisdiction, and you should treat that as part of your decision to use the Service. By using it, you consent to that transfer.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                <strong>Correction (September 13, 2026).</strong> An earlier version of this page said your information was transferred to and stored in India. That was wrong — it described where the Service is run from, not where the data sits. The database has been hosted in the United States throughout.
              </p>
            </section>
          </MotionDiv>
        </div>
      </div>
    </>
  )
}
