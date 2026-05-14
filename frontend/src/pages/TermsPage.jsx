import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'

import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

export default function TermsPage() {
  return (
    <>
      <Helmet>
        <title>Terms of Service | AI Compass</title>
        <meta
          name="description"
          content="Terms of using AI Compass. Acceptable use, content ownership, tool listings, and governing law. Last updated 2026."
        />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
          <section>
            <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
              <WordReveal>Terms of Service</WordReveal>
            </h1>
            <p className="mt-3 text-sm text-muted">Last updated: May 12, 2026</p>
            <p className="mt-6 text-base leading-relaxed text-ink-2">
              Welcome to AI Compass. These Terms of Service (&quot;Terms&quot;) govern your use of ai-compass.in (the &quot;Service&quot;). By using the Service, you agree to these Terms.
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
              <h2 id="about" className="text-xl font-semibold text-ink sm:text-2xl">
                1. About the Service
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                AI Compass is a hand-curated directory of AI tools, primarily aimed at students. The Service includes tool listings, user reviews and ratings, favorites and collections, and search/filtering features. The Service is operated by Medhansh Pratap Singh from Bengaluru, India.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="eligibility" className="text-xl font-semibold text-ink sm:text-2xl">
                2. Eligibility
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                You must be at least 13 years old to use the Service. If you are under 18, you should review these Terms with a parent or guardian.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="account" className="text-xl font-semibold text-ink sm:text-2xl">
                3. Your account
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">You&apos;re responsible for:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">Providing accurate information when creating your account</li>
                <li className="leading-relaxed">Keeping your password secure</li>
                <li className="leading-relaxed">All activity that occurs under your account</li>
              </ul>
              <p className="mt-3 leading-relaxed text-ink-2">
                You may delete your account at any time from your account settings or by contacting us.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="user-content" className="text-xl font-semibold text-ink sm:text-2xl">
                4. User content
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                You retain ownership of the reviews, ratings, and other content you post (&quot;User Content&quot;). By posting User Content, you grant AI Compass a non-exclusive, royalty-free license to display, distribute, and use that content as part of the Service.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">You agree not to post User Content that:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">Is defamatory, harassing, hateful, or threatening</li>
                <li className="leading-relaxed">Infringes anyone&apos;s intellectual property rights</li>
                <li className="leading-relaxed">Contains spam or commercial promotion</li>
                <li className="leading-relaxed">Violates any law</li>
                <li className="leading-relaxed">Contains malicious code</li>
              </ul>
              <p className="mt-3 leading-relaxed text-ink-2">
                We reserve the right to remove User Content that violates these Terms, without notice.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="tool-listings" className="text-xl font-semibold text-ink sm:text-2xl">
                5. Tool listings and affiliate disclosure
              </h2>
              <div className="mt-3 rounded-xl border border-accent/30 bg-accent-soft p-5">
                <p className="leading-relaxed text-ink-2">
                  Tool listings on AI Compass are curated by us. Rankings, reviews, and visibility are not for sale. Some outbound links on individual tool pages are affiliate links — when that's the case, the link is marked clearly on the page and the rating is unaffected.
                </p>
              </div>
              <p className="mt-3 leading-relaxed text-ink-2">
                Tool information (pricing, features, descriptions) is provided for convenience and may not reflect the latest changes from the tool providers. We are not affiliated with most tools we list, and we make no warranties about external tools or services. Use of any third-party tool is subject to that tool&apos;s own terms.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="ip" className="text-xl font-semibold text-ink sm:text-2xl">
                6. Intellectual property
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                The Service itself (including site design, code, copy, and curated content) is owned by AI Compass and protected by intellectual property laws. You may not copy, modify, or redistribute the Service without permission, except for personal, non-commercial use of the listings.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                Tool names, logos, and trademarks belong to their respective owners and are used for identification.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="acceptable-use" className="text-xl font-semibold text-ink sm:text-2xl">
                7. Acceptable use
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">You agree not to:</p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">Scrape, harvest, or systematically extract data from the Service</li>
                <li className="leading-relaxed">Use bots or automated tools without permission</li>
                <li className="leading-relaxed">Attempt to bypass security measures or rate limits</li>
                <li className="leading-relaxed">Interfere with the Service or other users</li>
                <li className="leading-relaxed">Use the Service for any illegal purpose</li>
              </ul>
            </section>

            <section className="mt-12">
              <h2 id="termination" className="text-xl font-semibold text-ink sm:text-2xl">
                8. Termination
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                We may suspend or terminate your account if you violate these Terms. You can stop using the Service at any time, and you can delete your account from your account settings.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="disclaimers" className="text-xl font-semibold text-ink sm:text-2xl">
                9. Disclaimers
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                The Service is provided &quot;AS IS&quot; without warranties of any kind. We do not guarantee:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed">That the Service will be uninterrupted or error-free</li>
                <li className="leading-relaxed">The accuracy or completeness of tool listings</li>
                <li className="leading-relaxed">The quality, safety, or behavior of external tools</li>
                <li className="leading-relaxed">Suitability of any tool for your specific needs</li>
              </ul>
            </section>

            <section className="mt-12">
              <h2 id="liability" className="text-xl font-semibold text-ink sm:text-2xl">
                10. Limitation of liability
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                To the maximum extent permitted by law, AI Compass and its operator are not liable for any indirect, incidental, consequential, or special damages arising from your use of the Service.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="governing-law" className="text-xl font-semibold text-ink sm:text-2xl">
                11. Governing law
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                These Terms are governed by the laws of India. Any disputes will be subject to the exclusive jurisdiction of the courts in Bengaluru, Karnataka, India.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="changes" className="text-xl font-semibold text-ink sm:text-2xl">
                12. Changes to these Terms
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                We may update these Terms from time to time. When we do, we&apos;ll update the &quot;Last updated&quot; date at the top. Continued use of the Service after changes means you accept the updated Terms.
              </p>
            </section>

            <section className="mt-12">
              <h2 id="contact" className="text-xl font-semibold text-ink sm:text-2xl">
                13. Contact
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">Questions about these Terms?</p>
              <p className="mt-3 leading-relaxed text-ink-2">
                <strong className="text-ink">Email:</strong>{' '}
                <a
                  href="mailto:medhansh.builds@gmail.com"
                  className="text-accent hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  medhansh.builds@gmail.com
                </a>
              </p>
            </section>
          </MotionDiv>
        </div>
      </div>
    </>
  )
}
