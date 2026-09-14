import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { WordReveal, ConversionCTA } from '../components/ui'
import { sectionReveal } from '../lib/motion'
import { useCatalogStats } from '../hooks/useCatalogStats'

const MotionDiv = motion.div

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

const API = import.meta.env.VITE_API_URL || ''

// The month the first commit landed. Everything else on this page is counted
// at request time rather than typed in, so the only number that can go stale
// is this one, and it never changes.
const LAUNCH_MONTH = 'March 2026'

function monthsLive(since = new Date(2026, 2, 21)) {
  const now = new Date()
  return Math.max(1, (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth()))
}

export default function AboutPage() {
  const { roundedToolsText } = useCatalogStats() // {/* Dynamic — do not hardcode */}

  // Counted live from the database, not written into the page. Both come from
  // the same expression the admin dashboard uses, so this page and the admin
  // panel can never quote two different figures — and nobody has to remember
  // to update a number in JSX when the catalogue grows.
  //
  // Traffic figures are deliberately NOT shown here. /api/v1/platform-stats
  // serves a hand-maintained snapshot whenever the PostHog credentials are
  // unavailable (it reports source: "fallback" when that happens), and a
  // visitor count that is actually a typed-in guess has no place on the page
  // that asks people to trust the catalogue.
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(`${API}/api/v1/platform-stats`)
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled) setCounts(data.totals || null)
      } catch { /* the page reads fine without the panel */ }
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <>
      <Helmet>
        <title>About Us | AI Compass</title>
        <meta
          name="description"
          content="AI Compass is a one-person, hand-tested AI tool directory for students, built in Bengaluru and online since March 2026. How it is tested, what it costs, and what money cannot buy."
        />
      </Helmet>

      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-12 md:py-20">
          <section>
            <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
              <WordReveal>About AI Compass</WordReveal>
            </h1>
            <p className="mt-3 text-sm text-muted">One person, hand-testing AI tools for students since March 2026</p>
            <p className="mt-6 text-base leading-relaxed text-ink-2">
              Students should not have to wade through SEO spam, stale listicles and invented
              recommendations just to find a tool that helps them study, code or write. AI
              Compass is a hand-tested directory of AI tools for students: free to use, no
              account needed, and nothing listed that has not been opened and used first.
            </p>
          </section>

          <MotionDiv
            variants={sectionReveal}
            initial="initial"
            whileInView="animate"
            viewport={REVEAL_VIEWPORT}
          >
            {/* Where things stand. Counted at request time - see the comment
                on the fetch above for why traffic figures are not here. */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                Where things stand
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                AI Compass went live in {LAUNCH_MONTH}. These numbers are counted from the
                database when you load this page, not written into it &mdash; so they are whatever
                is true right now, including on the days they go down.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-2xl font-bold text-ink">
                    {counts?.total_tools ?? roundedToolsText}
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink">tools in the catalogue</div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Every one opened and used before it was listed. Tools that were broken or
                    misrepresented their free tier never made it in.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-2xl font-bold text-ink">
                    {counts?.registered_users ?? '—'}
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink">registered members</div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    An account is optional. Browsing, searching and the Stack Architect all work
                    without one.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-2xl font-bold text-ink">{monthsLive()}</div>
                  <div className="mt-1 text-sm font-medium text-ink">months online</div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Since {LAUNCH_MONTH}, run continuously by one person alongside everything
                    else.
                  </p>
                </div>
              </div>
            </section>

            {/* Our Story section */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                The story behind AI Compass
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                AI Compass is one person in Bengaluru, India &mdash; not a company and not a team.
                I started it in {LAUNCH_MONTH} because I kept watching people around me pay
                subscription prices for thin wrappers around models they could reach for free,
                while genuinely better tools sat three pages deep in search results behind
                affiliate spam.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                The problem was never that AI tools are hard to find. It is that almost every list
                of them is written by someone who has not used them. Directories scrape each
                other, listicles rank by who pays best, and a chatbot asked for recommendations
                will cheerfully invent a product that does not exist. None of those sources can
                tell you the thing that actually matters before you sign up: whether the free tier
                is usable, or a demo with three messages in it.
              </p>
              <p className="mt-3 leading-relaxed text-ink-2">
                So the rule here is that nothing gets listed until it has been opened and used.
                That is slower than scraping, and it is the only reason this catalogue is worth
                more than a search result. It also means I am the bottleneck, which is the honest
                trade-off of a one-person directory: the list grows at the speed one person can
                test, and I would rather it grow slowly than stop being true.
              </p>
            </section>

            {/* What it is trying to do */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                What AI Compass is trying to be
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                The goal is narrow on purpose: be the place where a student can find a tool that
                actually does the job, understand what it costs before signing up, and get on with
                their work. Three commitments hold that together.
              </p>
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <h4 className="font-semibold text-ink">Free to use, and free to leave</h4>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">
                    The catalogue, search, comparisons and the Stack Architect need no account.
                    There is no paywall on reading, and nothing here is gated behind a signup you
                    have to undo later.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <h4 className="font-semibold text-ink">
                    Placement can be bought. Verdicts cannot.
                  </h4>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">
                    Tool makers can pay for a listing or a sponsored slot, and every paid unit is
                    labelled as paid where it appears. What money never buys is a favourable
                    review, a rating, an editorial pick, a community leaderboard rank, or an
                    unlabelled placement. That line is written into the{' '}
                    <Link to="/terms" className="text-accent hover:underline">Terms</Link>{' '}
                    so it is a commitment rather than a preference.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <h4 className="font-semibold text-ink">Say what is actually true</h4>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">
                    Including when it is unflattering. Free tiers are described with their real
                    limits, the{' '}
                    <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link>{' '}
                    names every company that receives your data, and when something on these pages
                    turns out to be wrong it gets a dated correction rather than a quiet edit.
                  </p>
                </div>
              </div>
            </section>

            {/* How we test section */}
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                Our 4-Step Testing Methodology
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                Unlike scrapers or search engines, I don&apos;t copy-paste tool descriptions. Every tool that makes it into the catalogue goes through the same four checks:
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-lg font-bold text-accent">01</div>
                  <h4 className="mt-2 font-semibold text-ink">Manual Verification</h4>
                  <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                    I sign up, install and actually run every application. If it is broken, buggy or fails at the basics, it does not get listed.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-lg font-bold text-accent">02</div>
                  <h4 className="mt-2 font-semibold text-ink">Limit & Paywall Audits</h4>
                  <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                    I record the real limits of the free tier &mdash; messages per day, token counts, character caps &mdash; so a paywall never arrives as a surprise.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-lg font-bold text-accent">03</div>
                  <h4 className="mt-2 font-semibold text-ink">Discount Tracking</h4>
                  <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                    I check for student pricing: UNiDAYS eligibility, GitHub Student Pack inclusion, and whether a .edu address gets you anything.
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-bg-elev p-5">
                  <div className="text-lg font-bold text-accent">04</div>
                  <h4 className="mt-2 font-semibold text-ink">Redundancy & Safety</h4>
                  <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                    I check the tool is safe to use, handles data reasonably, and does not bury you in popups or spam.
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
                    LLMs recommend tools from patterns in their training data, which tends to produce generic, repetitive or out-of-date lists. I test each tool directly, so what you read reflects how it behaves now rather than how it behaved whenever the model was trained.
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
                    An LLM will tell you a tool is &quot;free&quot; and leave you to discover the three-message limit or the card required up front. Every tool here is labelled Free, Freemium or Paid, with the actual limits of the free tier written out.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">4. Curated Student Discounts & Perks</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    I cross-reference every service against UNiDAYS, Student Beans and the GitHub Student Developer Pack, so you can see exactly how to get the premium features free or heavily discounted.
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
                What money can and cannot buy here
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                A directory is only worth reading if you know what money can and cannot do to it.
                So, precisely:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-6 text-ink-2">
                <li className="leading-relaxed"><strong>Placement is for sale. Judgement is not.</strong> A tool maker can buy a Fast-Track or Sponsored slot, which places their listing above free ones &mdash; and every one of those is labelled as paid where it appears. What cannot be bought at any price: a rating, a review verdict, an editorial pick, a community leaderboard rank, or a placement that is not marked as paid.</li>
                <li className="leading-relaxed"><strong>No banner ads, no popups.</strong> There are no ad networks on this site and there never will be.</li>
                <li className="leading-relaxed"><strong>Analytics only if you say yes.</strong> This site uses Google Analytics and PostHog, and both set cookies. Neither loads until you accept the cookie banner &mdash; decline, and no analytics script runs at all. The <Link to="/privacy" className="text-accent hover:underline">Privacy Policy</Link> names every company that receives anything.</li>
                <li className="leading-relaxed"><strong>Transparent affiliate disclosures.</strong> Some outbound links are affiliate links, which help cover hosting costs. They never change the price you pay, and they never affect whether a tool is listed or how it is described.</li>
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
                    I check student discount providers and official software blogs by hand, and verify perks through the GitHub Student Developer Pack, UNiDAYS and direct university licence offers.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-ink">Can I submit or suggest a new tool?</h4>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    Yes, please. Use the <Link to="/submit" className="text-accent underline hover:text-accent-ink transition-colors">Submit a Tool</Link> page and I&apos;ll test it myself. If it works and it is genuinely useful to students, it gets listed &mdash; free submissions are read the same way paid ones are.
                  </p>
                </div>
              </div>
            </section>

            {/* Bottom Call to Action */}
            <ConversionCTA 
              title="Ready to explore?" 
              subtitle={`Discover ${roundedToolsText} hand-tested AI tools curated for your studies.`} 
            />
          </MotionDiv>
        </div>
      </div>
    </>
  )
}
