import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, Sparkles, Layers, BookOpen, User, Settings, AlertCircle, MessageSquare, Mail, HelpCircle } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

import Button from '../components/ui/Button'
import { WordReveal, SEO } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div
const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

const FAQS = [
  {
    category: 'AI Stack Architect',
    question: 'How does the match confidence percentage work?',
    answer: 'The AI Stack Architect maps your selections (Goal, Budget, Platform, Experience) and custom use-case details against our curated tool catalog. We analyze multiple dimensions such as category fit, pricing plan, platform support, and technical difficulty. A raw score is calculated using our recommendation algorithms, which is then mapped to a realistic percentage match clamped between 70% and 99% to keep recommendations realistic and trustworthy.'
  },
  {
    category: 'AI Stack Architect',
    question: 'Why does the search mapping understand terms like "write essays" or "build apps"?',
    answer: 'We have implemented a semantic synonym and intent matcher in the backend. When you type specific descriptions, the system maps common keywords to matching tool categories. For example, "write essays" maps to academic writing, content drafting, or editing, while "build apps" maps to developer programming and coding stacks, ensuring you find the right fit even if you don\'t use exact tags.'
  },
  {
    category: 'Directory & Search',
    question: 'How are tools curated and rated on AI Compass?',
    answer: 'Every tool listed on AI Compass is hand-verified and curated. We do not accept sponsored placements that skew rankings. Curation scores and ratings reflect verified pricing plans, student benefits, platform ease-of-use, and community reviews. Standard ratings are updated in real-time as users submit reviews on the tool details pages.'
  },
  {
    category: 'Compare Engine',
    question: 'How do I compare tools side-by-side?',
    answer: 'You can compare tools in two ways: (1) Click "Add to Compare" on any tool card, which places it in your Compare Tray. Once you have selected 2-3 tools, click "Compare" to load the matrix. (2) Visit the /compare page directly and search/select tools to stack side-by-side.'
  },
  {
    category: 'Accounts & Stacks',
    question: 'Do I need to sign up to use AI Compass?',
    answer: 'No! AI Compass is fully functional without an account. You can search, filter, compare, and get recommendations anonymously. A free account simply lets you save your recommended stacks to a private dashboard and generate public stack links to share with others.'
  },
  {
    category: 'Troubleshooting',
    question: 'Why am I not receiving the registration verification email?',
    answer: 'Verification emails are dispatched automatically. If you do not see it within a minute, please check your spam or promotions folders. If it is still missing, you can log in to trigger a new verification link, or use the floating Feedback widget to request manual verification.'
  },
  {
    category: 'Troubleshooting',
    question: 'I found a bug or incorrect pricing details. What should I do?',
    answer: 'AI tools update their pricing plans frequently. If you see incorrect information or find a bug, please click the floating "Feedback" button in the bottom right corner of the screen and send us a quick report. We review and update data assets within 24 hours!'
  }
]

function FAQItem({ question, answer, isOpen, onToggle }) {
  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between py-4 text-left font-semibold text-ink transition hover:text-accent-ink focus:outline-none"
      >
        <span>{question}</span>
        <ChevronDown 
          className="h-4 w-4 shrink-0 transition-transform duration-200" 
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <p className="pb-4 text-sm leading-relaxed text-ink-2">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [openFAQIndex, setOpenFAQIndex] = useState(null)

  const filteredFAQs = useMemo(() => {
    if (!searchQuery.trim()) return FAQS
    const query = searchQuery.toLowerCase()
    return FAQS.filter(
      faq => 
        faq.question.toLowerCase().includes(query) || 
        faq.answer.toLowerCase().includes(query) ||
        faq.category.toLowerCase().includes(query)
    )
  }, [searchQuery])

  const toggleFAQ = (index) => {
    setOpenFAQIndex(prevIndex => prevIndex === index ? null : index)
  }

  return (
    <>
      <SEO
        title="Help Center & Guides — AI Compass"
        description="Get guides, tutorials, and support for using AI Compass. Learn how the AI Stack Architect works, search tips, and troubleshooting."
      />

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Hero Header */}
        <section className="text-center">
          <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink">
            <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
            Support Center
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl md:text-5xl">
            <WordReveal>How can we help you?</WordReveal>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
            Find answers to frequently asked questions, learn how the Architect recommendation scoring works, or get support.
          </p>

          {/* Search bar */}
          <div className="mx-auto mt-8 max-w-md">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3" aria-hidden="true">
                <Search className="h-5 w-5 text-muted" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles, guides, or keywords..."
                className="block w-full rounded-xl border border-line bg-bg-elev py-3 pl-10 pr-4 text-sm text-ink placeholder-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
        </section>

        {/* Feature Guides Grid */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={REVEAL_VIEWPORT}
          className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="rounded-2xl border border-line bg-bg-elev p-5 flex flex-col h-full shadow-sm hover:border-line-strong transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
              <Sparkles className="h-5 w-5 text-accent-ink" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">AI Stack Architect</h3>
            <p className="mt-2 text-xs text-muted leading-relaxed flex-grow">
              Learn how the multi-step builder matches your level, budgets, platforms, and custom use-case queries into a match percentage.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-bg-elev p-5 flex flex-col h-full shadow-sm hover:border-line-strong transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
              <Layers className="h-5 w-5 text-accent-ink" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Directory & Search</h3>
            <p className="mt-2 text-xs text-muted leading-relaxed flex-grow">
              Tips on filtering through our 400+ curated tools, refining by student perks, pricing plans, and writing user reviews.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-bg-elev p-5 flex flex-col h-full shadow-sm hover:border-line-strong transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
              <BookOpen className="h-5 w-5 text-accent-ink" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Tool Comparisons</h3>
            <p className="mt-2 text-xs text-muted leading-relaxed flex-grow">
              Find out how to collect tools into your compare tray and analyze pricing models side-by-side on the matrix view.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-bg-elev p-5 flex flex-col h-full shadow-sm hover:border-line-strong transition">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
              <User className="h-5 w-5 text-accent-ink" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Accounts & Sharing</h3>
            <p className="mt-2 text-xs text-muted leading-relaxed flex-grow">
              How to save your recommended stacks to your dashboard, manage password recovery, and share public stack links.
            </p>
          </div>
        </MotionDiv>

        {/* FAQs Section */}
        <section className="mt-16">
          <div className="rounded-2xl border border-line bg-bg-elev p-6 md:p-8">
            <h2 className="text-xl font-bold text-ink sm:text-2xl mb-6 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-accent" />
              Frequently Asked Questions
            </h2>

            {filteredFAQs.length > 0 ? (
              <div className="divide-y divide-line">
                {filteredFAQs.map((faq, index) => (
                  <FAQItem
                    key={faq.question}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openFAQIndex === index}
                    onToggle={() => toggleFAQ(index)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="mx-auto h-8 w-8 text-muted mb-2" />
                <p className="text-sm text-ink-2">No matching questions found.</p>
                <button 
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs text-accent font-semibold hover:underline"
                >
                  Clear search query
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Contact CTA */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={REVEAL_VIEWPORT}
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="flex items-start gap-4 rounded-2xl border border-line bg-bg-elev p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
              <MessageSquare className="h-6 w-6 text-accent-ink" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Feedback Widget</p>
              <h3 className="mt-1 text-base font-semibold text-ink">Use Floating Widget</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Click the feedback button in the bottom-right corner to report bugs, request features, or submit corrections.
              </p>
            </div>
          </div>

          <a
            href="mailto:medhansh.builds@gmail.com"
            className="group flex items-start gap-4 rounded-2xl border border-line bg-bg-elev p-6 outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
              <Mail className="h-6 w-6 text-accent-ink" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Direct Email</p>
              <h3 className="mt-1 text-base font-semibold text-ink group-hover:text-accent">medhansh.builds@gmail.com</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Send us an email for general inquiries, business partnerships, or manual verification requests.
              </p>
            </div>
          </a>
        </MotionDiv>
      </div>
    </>
  )
}
