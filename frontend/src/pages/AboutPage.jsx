import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'
import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

export default function AboutPage() {
  return (
    <>
      <Helmet>
        <title>About Us | AI Compass</title>
        <meta
          name="description"
          content="The aim of AI Compass: a hand-tested student AI toolkit. Learn how we are different from conversational AI recommendations like Gemini and ChatGPT."
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
            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                Our Aim
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                We hand-curate, test, and rank tools across key categories like Coding, Research, Writing, and Design. We dig deep into pricing structures, student discounts, and usability so you can find the right tool in 30 seconds instead of hours of trial and error.
              </p>
            </section>

            <section className="mt-12">
              <h2 className="text-xl font-semibold text-ink sm:text-2xl">
                How We Are Different from Gemini, ChatGPT & LLM Recommendations
              </h2>
              <p className="mt-3 leading-relaxed text-ink-2">
                While asking a conversational assistant like Gemini, ChatGPT, or Perplexity for tool recommendations is quick, it often comes with major drawbacks:
              </p>
              
              <div className="mt-6 space-y-6">
                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">1. Real Human Testing vs. Generic Training Data</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    LLMs recommend tools based on patterns in their training data, which often results in generic, repetitive, or outdated lists. We install, register, and test every single tool in our catalog. If a tool doesn&apos;t work, isn&apos;t useful, or has a broken landing page, it doesn&apos;t make it onto AI Compass.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">2. Zero Hallucinations & Accurate Links</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    Generative models frequently hallucinate URL domains, brand names, or specific feature sets. Every link on AI Compass is direct, secure, and manually verified.
                  </p>
                </div>

                <div className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                  <h3 className="font-semibold text-ink">3. Transparent Pricing & Hidden Paywalls Unmasked</h3>
                  <p className="mt-2 text-sm text-ink-2 leading-relaxed">
                    Traditional LLM recommendations will tell you a tool is &quot;free&quot; only for you to discover a strict 3-input limit or an upfront credit card requirement. We clearly label tools as Free, Freemium, or Paid, and outline what the free tier actually includes.
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
                    Instead of a block of chat text, our interactive <Link to="/ai-tool-finder" className="text-accent underline hover:text-accent-ink transition-colors">Stack Architect</Link> matches tools directly to your major, workflow, operating system, and budget using a structured questionnaire.
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-12 text-center border-t border-line pt-8">
              <h3 className="text-lg font-semibold text-ink">Ready to explore?</h3>
              <p className="mt-2 text-sm text-muted">Discover 400+ hand-tested AI tools curated for your studies.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                <Link to="/tools" className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-bg hover:bg-accent/95 shadow-sm transition-colors">
                  Browse Catalog
                </Link>
                <Link to="/ai-tool-finder" className="rounded-xl border border-line bg-bg-elev px-5 py-2.5 text-sm font-semibold text-ink hover:bg-bg-elev/80 transition-colors">
                  Build Your AI Stack
                </Link>
              </div>
            </section>
          </MotionDiv>
        </div>
      </div>
    </>
  )
}
