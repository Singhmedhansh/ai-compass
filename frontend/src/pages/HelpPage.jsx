import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, Sparkles, Layers, BookOpen, User, Settings, AlertCircle, MessageSquare, Mail, HelpCircle, Compass } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

import Button from '../components/ui/Button'
import { WordReveal, SEO } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div
const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

const FAQS = [
  // --- AI STACK ARCHITECT ---
  {
    category: 'AI Stack Architect',
    question: 'How does the match confidence percentage work?',
    answer: 'The AI Stack Architect maps your selections (Goal, Budget, Platform, Experience) and custom use-case details against our curated tool catalog. We analyze multiple dimensions such as category fit, pricing plan, platform support, and technical difficulty. A raw score is calculated using our recommendation algorithms, which is then mapped to a realistic percentage match clamped between 70% and 99% to keep recommendations realistic and trustworthy.'
  },
  {
    category: 'AI Stack Architect',
    question: 'Why does the search mapping understand terms like "write essays" or "build apps"?',
    answer: 'We have implemented a semantic synonym and intent matcher in the backend. When you type specific descriptions, the system maps common keywords to matching tool categories. For example, "write essays" maps to academic writing, content drafting, or editing, while "build apps" maps to developer programming and coding stacks, ensuring you find the right fit even if you do not use exact tags.'
  },
  {
    category: 'AI Stack Architect',
    question: 'Are there suggestion limits or daily limits on generating stacks?',
    answer: 'There are currently no daily limits or suggestion limits on generating stacks using the AI Stack Architect. Guest users and registered users alike can run the tool finder wizard as many times as they want to search, discover, and build different stacks for their workflows.'
  },
  {
    category: 'AI Stack Architect',
    question: 'How does the system score custom text input queries?',
    answer: 'When you enter a custom use-case or specific task description in the text input box, the backend runs a keyword-matching and scoring algorithm. It assigns weights to matching terms found in the tool descriptions, capabilities, and target audience fields. This custom use-case score is then factored into the overall match percentage along with your budget and platform constraints.'
  },
  {
    category: 'AI Stack Architect',
    question: 'Can I edit or modify a saved stack after generation?',
    answer: 'Once you have saved a stack to your dashboard, you cannot directly edit the tools within that specific saved stack. However, you can use the stack as a template to run the builder again, swap tools out using the comparison engine, or save a new customized stack to your dashboard while deleting the old version.'
  },
  // --- DIRECTORY & SEARCH ---
  {
    category: 'Directory & Search',
    question: 'How are tools curated and rated on AI Compass?',
    answer: 'Every tool listed on AI Compass is hand-verified and curated. We do not accept sponsored placements that skew rankings. Curation scores and ratings reflect verified pricing plans, student benefits, platform ease-of-use, and community reviews. Standard ratings are updated in real-time as users submit reviews on the tool details pages.'
  },
  {
    category: 'Directory & Search',
    question: 'How do I find tools that offer student discounts or exclusive perks?',
    answer: 'To find tools with student discounts or exclusive perks, visit our main Directory page. You can use the filters panel to toggle the "Student Discount / Perk Available" filter, which will narrow down the list of tools to only those that offer active student benefits, free trials, or discounted pricing tiers for academic users.'
  },
  {
    category: 'Directory & Search',
    question: 'What is the difference between Curation Score and Community Rating?',
    answer: 'The Curation Score is an internal metric calculated by AI Compass based on data accuracy, pricing transparency, and platform support. The Community Rating is the average star rating calculated from user reviews left on our platform. Both metrics help you gauge the overall quality and reliability of a tool.'
  },
  {
    category: 'Directory & Search',
    question: 'What do the pricing tags (Free, Freemium, Paid, Free Trial) mean?',
    answer: 'We categorize pricing into four tags: "Free" means the tool has a fully functional free tier with no time limits. "Freemium" means there is a free tier alongside paid upgrade options. "Paid" means the tool requires a subscription or one-time payment to use. "Free Trial" means you can test paid features for a limited period before buying.'
  },
  {
    category: 'Directory & Search',
    question: 'Can I filter search results by platform compatibility like macOS, iOS, or Android?',
    answer: 'Yes. In the Directory page, the filters sidebar allows you to select operating system compatibility. You can filter tools to show only those supporting macOS, Windows, Linux, iOS, or Android, ensuring that any tool you discover fits your specific device constraints.'
  },
  // --- COMPARE ENGINE ---
  {
    category: 'Compare Engine',
    question: 'How do I compare tools side-by-side?',
    answer: 'You can compare tools in two ways: (1) Click "Add to Compare" on any tool card, which places it in your Compare Tray. Once you have selected 2-3 tools, click "Compare" to load the matrix. (2) Visit the compare page directly and search/select tools to stack side-by-side.'
  },
  {
    category: 'Compare Engine',
    question: 'Can I compare tools across different categories?',
    answer: 'Yes, our Compare Engine allows you to compare any tools side-by-side, even if they belong to different categories. However, we recommend comparing tools within the same category (e.g. comparing two writing tools) to get the most meaningful comparisons of features, pricing, and integrations.'
  },
  {
    category: 'Compare Engine',
    question: 'Is there a limit on how many tools I can add to the compare tray?',
    answer: 'You can add up to 3 tools to your compare tray at one time. This limit ensures that the comparison matrix remains readable, responsive, and fits neatly on both desktop and mobile screens without causing horizontal scrolling issues.'
  },
  {
    category: 'Compare Engine',
    question: 'How is the comparison matrix compiled?',
    answer: 'The comparison matrix extracts real-time database details for each selected tool, comparing them across key dimensions including pricing, platform support, core features, primary category, and curation score, allowing you to quickly spot differences.'
  },
  // --- ACCOUNTS & DASHBOARD ---
  {
    category: 'Accounts & Stacks',
    question: 'Do I need to sign up to use AI Compass?',
    answer: 'No! AI Compass is fully functional without an account. You can search, filter, compare, and get recommendations anonymously. A free account simply lets you save your recommended stacks to a private dashboard and generate public stack links to share with others.'
  },
  {
    category: 'Accounts & Stacks',
    question: 'Are my saved stacks private or public by default?',
    answer: 'By default, any stack you save to your dashboard is private and visible only to you when logged in. If you choose to share your stack, you can generate a public link that allows others to view your selected tools and configuration.'
  },
  {
    category: 'Accounts & Stacks',
    question: 'How can I delete a saved stack from my dashboard?',
    answer: 'To delete a saved stack, log in and navigate to your Dashboard. Locate the stack you want to remove and click the "Delete" or "Remove" button on the card. This action is permanent and will clear the stack from your account history.'
  },
  {
    category: 'Accounts & Stacks',
    question: 'How do I delete my AI Compass account and associated data?',
    answer: 'If you wish to delete your account and wipe all associated data (including saved stacks and account profile details), please go to your Profile settings page and click on the "Delete Account" button, or contact us through the Feedback widget for manual data deletion.'
  },
  // --- TROUBLESHOOTING & POLICIES ---
  {
    category: 'Troubleshooting',
    question: 'Why am I not receiving the registration verification email?',
    answer: 'Verification emails are dispatched automatically. If you do not see it within a minute, please check your spam or promotions folders. If it is still missing, you can log in to trigger a new verification link, or use the floating Feedback widget to request manual verification.'
  },
  {
    category: 'Troubleshooting',
    question: 'I found a bug or incorrect pricing details. What should I do?',
    answer: 'AI tools update their pricing plans frequently. If you see incorrect information or find a bug, please click the floating "Feedback" button in the bottom right corner of the screen and send us a quick report. We review and update data assets within 24 hours!'
  },
  {
    category: 'Troubleshooting',
    question: 'How can developers submit a new tool to AI Compass?',
    answer: 'Developers can request listing a new tool by using our contact options or the feedback widget. Please provide the tool name, website URL, primary use-case, pricing model, and details of any student discounts or benefits offered. Our moderation team reviews submissions weekly.'
  },
  {
    category: 'Troubleshooting',
    question: 'How often is the tool database updated with new information?',
    answer: 'We update our tools database and listings weekly to ensure pricing plans, features, and platform support remain accurate. Real-time updates are applied immediately when users submit confirmed pricing changes or when developers submit corrections.'
  },
  {
    category: 'Troubleshooting',
    question: 'Does AI Compass use affiliate links or sponsored listings?',
    answer: 'AI Compass does not use sponsored listings that alter rankings or recommendations. We may use affiliate links for some tools to help support website operation costs, but this never affects our curation scores, tool matching, or recommendation objectivity.'
  },
  {
    category: 'Troubleshooting',
    question: 'How does AI Compass monetize or fund its operations?',
    answer: 'AI Compass is currently a free product. We plan to keep all core discovery features, including the AI Stack Architect and Compare Engine, completely free. Future monetization may include premium developer features, newsletters, or affiliate programs, but will never compromise search objectivity.'
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
  const [openFAQQuestion, setOpenFAQQuestion] = useState(null)

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

  const toggleFAQ = (question) => {
    setOpenFAQQuestion(prevQuestion => prevQuestion === question ? null : question)
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
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => {
                const event = new CustomEvent('ai-compass-start-tour')
                window.dispatchEvent(event)
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg-elev px-4 py-2 text-xs font-semibold text-ink-2 shadow-sm transition hover:bg-bg-sunk"
            >
              <Compass className="h-4 w-4 text-accent" />
              Take the onboarding tour
            </button>
          </div>

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
                {filteredFAQs.map((faq) => (
                  <FAQItem
                    key={faq.question}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openFAQQuestion === faq.question}
                    onToggle={() => toggleFAQ(faq.question)}
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
