import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'
import { useCatalogStats } from '../hooks/useCatalogStats'

const MotionDiv = motion.div

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

export default function AboutPage() {
  const { roundedToolsText } = useCatalogStats() // {/* Dynamic — do not hardcode */}
  return (
    <>
      <Helmet>
        <title>About Us | AI Compass</title>
        <meta
          name="description"
          content="Learn about the mission, 4-step testing methodology, values, and Bengaluru-origins of AI Compass, the hand-tested AI directory built for students."
        />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
          <section>
            <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
              <WordReveal>About AI Compass</WordReveal>
            </h1>
            <p className="mt-3 text-sm text-muted">Building the ultimate student AI toolkit</p>
            <p className="mt-6 text-base leading-relaxed text-ink-2">
              At AI Compass, we believe students shouldn&apos;t waste hours sorting through SEO spam, outdated lists, or fake reviews just to find a tool that helps them study, code, or write. Our mission is simple: to provide a hand-tested, verified directory of AI tools tailored specifically for student needs—completely free, with zero signups required.
            </p>
          </section>

          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={REVEAL_VIEWPORT}
          >
            {/* Our Story section */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                The Story Behind AI Compass
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                Built and maintained by a small team out of Bengaluru, India, AI Compass was born out of personal frustration. As students and developers, we watched our peers struggle with high subscription fees for basic AI &quot;wrappers&quot; when much better, open-source, or heavily discounted alternatives were already available. 
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                We realized the internet lacked a single, transparent directory that put student budgets first. So we built AI Compass—a fast, lightweight platform where you can discover verified tools, build custom software stacks, and find discounts in less than 30 seconds.
              </p>
            </section>

            {/* How we test section */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                Our 4-Step Testing Methodology
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                Unlike scrapers or search engines, we don&apos;t just copy-paste tool descriptions. Every single tool added to our catalog goes through a strict verification checklist:
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-lg font-bold text-accent">01</div>
                  <h4 className="mt-2 font-semibold text-ink">Manual Verification</h4>
                  <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                    We manually sign up, download, and execute every application. If the tool is broken, buggy, or fails basic tasks, we reject it.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-lg font-bold text-accent">02</div>
                  <h4 className="mt-2 font-semibold text-ink">Limit & Paywall Audits</h4>
                  <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                    We document the exact limits of the free tier (e.g., messages/day, token counts, character limits) so you aren&apos;t surprised by sudden paywalls.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-lg font-bold text-accent">03</div>
                  <h4 className="mt-2 font-semibold text-ink">Discount Tracking</h4>
                  <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                    We hunt down student discounts by verifying UNiDAYS status, GitHub Pack integrations, and .edu email application options.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-lg font-bold text-accent">04</div>
                  <h4 className="mt-2 font-semibold text-ink">Redundancy & Safety</h4>
                  <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                    We confirm the tool is safe, respects basic data privacy standards, and doesn&apos;t force intrusive popups or spam.
                  </p>
                </div>
              </div>
            </section>

            {/* How We Are Different section */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                How We Are Different from Gemini & ChatGPT
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                While asking a conversational assistant like Gemini, ChatGPT, or Perplexity for tool recommendations is quick, it often comes with major drawbacks:
              </p>
              
              <div className="mt-6 space-y-6">
                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">1. Real Human Testing vs. Generic Training Data</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    LLMs recommend tools based on historical patterns in their training data, which often results in generic, repetitive, or outdated lists. We test each tool directly to ensure they are current, useful, and fully functional today.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">2. Zero Hallucinations & Real Links</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    Generative models frequently hallucinate URL domains, brand names, or specific feature sets. Every link on AI Compass is direct, secure, and manually verified to save you from phishing sites and dead URLs.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">3. Transparent Pricing & Hidden Paywalls Unmasked</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    LLMs will tell you a tool is &quot;free&quot; only for you to discover a strict 3-input limit or an upfront credit card requirement. We clearly label tools as Free, Freemium, or Paid, outlining the specific limitations of each free tier.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">4. Curated Student Discounts & Perks</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    We cross-reference every service with UNiDAYS, Student Beans, and GitHub Student Developer Pack partnerships to pinpoint exactly how you can get premium features for free or at a massive discount.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">5. Interactive Stack Architect</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    Instead of a generic block of chat text, our interactive <Link to="/ai-tool-finder" className="text-accent underline hover:text-accent-ink transition-colors">Stack Architect</Link> matches tools directly to your major, workflow, operating system, and budget using a structured questionnaire.
                  </p>
                </div>
              </div>
            </section>

            {/* Trust and Independence Guarantee */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                Our Guarantee of Independence
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                We believe trust is the most important factor in a directory. Because of this, we pledge:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed"><strong>No Paid Boosts</strong>: Tools cannot pay us to rank higher or receive better ratings. Rankings are purely determined by verified value, popularity, and user reviews.</li>
                <li className="leading-relaxed"><strong>No Banner Ads or Popups</strong>: We will never clutter your screen with intrusive banner ads, trackers, or cookies that compromise your reading experience.</li>
                <li className="leading-relaxed"><strong>Transparent Affiliate Disclosures</strong>: If we use an affiliate link, it is to offset server and domain hosting costs, and it will <em>never</em> increase the price of the service to you.</li>
              </ul>
            </section>

            {/* Frequently Asked Questions */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                Frequently Asked Questions
              </h2>
              <div className="mt-6 space-y-6">
                <div>
                  <h4 className="font-semibold text-ink">Do I need an account to use AI Compass?</h4>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    No. The core catalog, searches, and Stack Architect are 100% accessible with no login or signup required. You only need to create a free account if you want to track your favorites, build public tool collections, or leave reviews.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-ink">How do you find your student discounts?</h4>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    We manually scan student discount providers, official software blogs, and verify perks through the GitHub Student Developer Pack, UNiDAYS, and direct university license offerings.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-ink">Can I submit or suggest a new tool?</h4>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    Absolutely! Head over to our <Link to="/submit" className="text-accent underline hover:text-accent-ink transition-colors">Submit a Tool</Link> page, fill out the details, and our curation team will test and list it if it fits our student guidelines.
                  </p>
                </div>
              </div>
            </section>

            {/* Bottom Call to Action */}
            <section className="mt-12 text-center border-t border-line pt-8">
              <h3 className="text-lg font-semibold text-ink">Ready to explore?</h3>
              <p className="mt-2 text-sm text-muted">Discover {roundedToolsText} hand-tested AI tools curated for your studies. {/* Dynamic — do not hardcode */}</p>
              <div className="mt-6">
                <Link to="/ai-tool-finder" className="inline-flex items-center rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-bg hover:bg-accent/95 shadow-sm transition-colors">
                  Find my AI tool →
                </Link>
              </div>
            </section>
          </MotionDiv>
        </div>
      </div>
    </>
  )
}
