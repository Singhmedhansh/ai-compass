import { AnimatePresence, motion } from 'framer-motion'
import { Check, HelpCircle, RotateCcw, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

import PageTransition from '../components/PageTransition'

const MotionButton = motion.button
const MotionDiv = motion.div
const MotionArticle = motion.article

const TOTAL_STEPS = 5

const GOAL_OPTIONS = [
  { id: 'studying', emoji: '🎓', label: 'Studying', description: 'Homework, essays, exam prep' },
  { id: 'coding', emoji: '💻', label: 'Coding', description: 'Build apps, debug, learn to code' },
  { id: 'writing', emoji: '✍️', label: 'Writing', description: 'Essays, emails, creative writing' },
  { id: 'research', emoji: '🔬', label: 'Research', description: 'Find papers, summarize, analyze' },
  { id: 'creating', emoji: '🎨', label: 'Creating', description: 'Images, videos, design' },
  { id: 'productivity', emoji: '⚡', label: 'Productivity', description: 'Organize, automate, focus' },
]

const BUDGET_OPTIONS = [
  { id: 'free', emoji: '🆓', label: 'Free only', description: 'Student-friendly, zero cost' },
  { id: 'freemium', emoji: '🔓', label: 'Freemium', description: 'Free tier + paid upgrades' },
  { id: 'any', emoji: '💳', label: 'Any budget', description: 'Best tool regardless of price' },
]

const PLATFORM_OPTIONS = [
  { id: 'web', emoji: '🌐', label: 'Web browser', description: 'Use directly in the browser' },
  { id: 'desktop', emoji: '💻', label: 'Desktop app', description: 'Install and run on your computer' },
  { id: 'mobile', emoji: '📱', label: 'Mobile', description: 'Work from iOS or Android' },
  { id: 'api', emoji: '🔌', label: 'API / Code', description: 'Automate in scripts and apps' },
]

const LEVEL_OPTIONS = [
  { id: 'beginner', emoji: '🌱', label: 'Beginner', description: 'Just getting started' },
  { id: 'intermediate', emoji: '🚀', label: 'Intermediate', description: 'Comfortable with tech' },
  { id: 'advanced', emoji: '⚡', label: 'Advanced', description: 'Power user, developer' },
]

function normalizeTool(rawTool) {
  const name = rawTool?.name || 'Unknown Tool'
  const description = rawTool?.description || rawTool?.shortDescription || rawTool?.tagline || ''
  const pricing = rawTool?.pricing || rawTool?.price || rawTool?.pricingType || rawTool?.pricing_type || 'Free'
  const category = rawTool?.category || rawTool?.subCategory || 'General'
  const platformLabel = Array.isArray(rawTool?.platforms)
    ? rawTool.platforms.join(', ')
    : rawTool?.platform || 'Web'

  return {
    ...rawTool,
    id: rawTool?.id || name,
    name,
    description,
    pricing,
    category,
    platformLabel,
    reason: rawTool?.reason || rawTool?._reason || 'Strong overall match for your preferences.',
    _reason: rawTool?._reason || rawTool?.reason || '',
    rating: Number(rawTool?.rating || rawTool?.averageRating || rawTool?.average_rating || 0),
  }
}

function StepCard({ option, selected, onClick, compact = false }) {
  return (
    <MotionButton
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03, borderColor: '#6366f1' }}
      whileTap={{ scale: 0.97 }}
      animate={{ scale: selected ? 1.02 : 1 }}
      className={`relative rounded-2xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${
        selected
          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20'
          : 'border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900/80 dark:hover:bg-gray-900'
      } ${compact ? 'min-h-[120px]' : 'min-h-[156px]'}`}
    >
      <div className="text-3xl" aria-hidden="true">{option.emoji}</div>
      <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">{option.label}</h3>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{option.description}</p>
      {selected ? (
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white">
          <Check className="h-4 w-4" />
        </div>
      ) : null}
    </MotionButton>
  )
}

function ProgressDots({ step }) {
  return (
    <div className="mb-8">
      <div className="relative mx-auto flex w-full max-w-xl items-center justify-between">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 px-5">
          <div className="h-1 rounded-full bg-gray-300 dark:bg-gray-700">
            <MotionDiv
              className="h-1 rounded-full bg-indigo-500"
              animate={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
              transition={{ type: 'spring', stiffness: 140, damping: 20 }}
            />
          </div>
        </div>

        {Array.from({ length: TOTAL_STEPS }, (_, index) => {
          const dot = index + 1
          const isCompleted = dot < step
          const isCurrent = dot === step

          return (
            <div key={`step-dot-${dot}`} className="z-10 flex flex-col items-center gap-2">
              {isCompleted ? (
                <MotionDiv
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white"
                >
                  <Check className="h-5 w-5" />
                </MotionDiv>
              ) : isCurrent ? (
                <MotionDiv
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 1.3, repeat: Number.POSITIVE_INFINITY }}
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-indigo-500 bg-white text-indigo-600 dark:bg-gray-950 dark:text-indigo-300"
                >
                  <span className="text-sm font-semibold">{dot}</span>
                </MotionDiv>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400">
                  <span className="text-sm font-semibold">{dot}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ToolFinderPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [answers, setAnswers] = useState({ goal: '', use_case: '', budget: '', platform: '', level: '' })
  const [results, setResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [savingStack, setSavingStack] = useState(false)
  const [error, setError] = useState('')

  let user = null
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    user = null
  }

  const canContinue =
    (step === 1 && Boolean(answers.goal)) ||
    step === 1.5 || // use_case can be skipped
    (step === 2 && Boolean(answers.budget)) ||
    (step === 3 && Boolean(answers.platform)) ||
    (step === 4 && Boolean(answers.level))

  const selectOption = (key, value) => {
    setAnswers((previous) => ({ ...previous, [key]: value }))
  }

  const fetchResults = async () => {
    setLoadingResults(true)
    setError('')

    try {
      const API = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${API}/api/v1/finder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to generate recommendations right now.')
      }

      const tools = Array.isArray(payload?.tools) ? payload.tools.map(normalizeTool) : []
      setResults(tools)
      setStep(5)
    } catch (requestError) {
      setError(requestError.message || 'Unable to generate recommendations right now.')
    } finally {
      setLoadingResults(false)
    }
  }

  const handleContinue = async () => {
    if (step === 1) {
      setStep(1.5)
      return
    }
    if (step === 1.5) {
      setStep(2)
      return
    }
    if (step < 4) {
      setStep((previous) => previous + 1)
      return
    }
    await fetchResults()
  }

  const handleBack = () => {
    setError('')
    if (step === 2) { setStep(1.5); return }
    if (step === 1.5) { setStep(1); return }
    setStep((previous) => Math.max(1, previous - 1))
  }

  const handleRestart = () => {
    setAnswers({ goal: '', use_case: '', budget: '', platform: '', level: '' })
    setResults([])
    setError('')
    setStep(1)
  }

  const handleSaveStack = async () => {
    if (!user) {
      toast.error('Please login to save your stack')
      setTimeout(() => {
        navigate('/login')
      }, 1500)
      return
    }

    setSavingStack(true)

    try {
      const API = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${API}/api/v1/stack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          goal: answers.goal,
          budget: answers.budget,
          platform: answers.platform,
          level: answers.level,
          tools: results.map((tool) => tool.slug || tool.name),
        }),
      })

      if (response.ok) {
        toast.success('Stack saved to your dashboard!')
      } else {
        toast.error('Could not save stack, try again')
      }
    } catch {
      toast.error('Could not save stack, try again')
    } finally {
      setSavingStack(false)
    }
  }

  const renderStep = () => {
    if (step === 1) {
      return (
        <section>
          <h2 className="text-xl font-semibold text-white">What&apos;s your primary goal?</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {GOAL_OPTIONS.map((option) => (
              <StepCard
                key={option.id}
                option={option}
                selected={answers.goal === option.id}
                onClick={() => selectOption('goal', option.id)}
              />
            ))}
          </div>
        </section>
      )
    }

    // Use Case Step (step 1.5)
    if (step === 1.5) {
      return (
        <section>
          <h2 className="text-xl font-semibold text-white">What specifically do you want to do?</h2>
          <p className="text-slate-300 mb-2">
            Be specific — "write essays" gets better results than "writing"
          </p>
          <input
            type="text"
            className="wizard-input w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-white mb-4"
            placeholder="e.g. write essays, build a web app, edit YouTube videos..."
            value={answers.use_case}
            onChange={e => setAnswers(prev => ({ ...prev, use_case: e.target.value }))}
            maxLength={120}
            autoFocus
          />
          <div className="wizard-nav flex gap-2">
            <button
              className="btn-secondary border border-slate-600 bg-slate-800 px-4 py-2 rounded-lg text-white"
              onClick={() => { setAnswers(prev => ({ ...prev, use_case: '' })); setStep(2); }}
              type="button"
            >
              Skip
            </button>
            <button
              className="btn-primary bg-indigo-600 px-4 py-2 rounded-lg text-white"
              onClick={() => setStep(2)}
              type="button"
            >
              Next →
            </button>
          </div>
        </section>
      )
    }

    if (step === 2) {
      return (
        <section>
          <h2 className="text-xl font-semibold text-white">What&apos;s your budget?</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {BUDGET_OPTIONS.map((option) => (
              <StepCard
                key={option.id}
                option={option}
                selected={answers.budget === option.id}
                onClick={() => selectOption('budget', option.id)}
                compact
              />
            ))}
          </div>
        </section>
      )
    }

    if (step === 3) {
      return (
        <section>
          <h2 className="text-xl font-semibold text-white">Where do you work?</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {PLATFORM_OPTIONS.map((option) => (
              <StepCard
                key={option.id}
                option={option}
                selected={answers.platform === option.id}
                onClick={() => selectOption('platform', option.id)}
                compact
              />
            ))}
          </div>
        </section>
      )
    }

    if (step === 4) {
      return (
        <section>
          <h2 className="text-xl font-semibold text-white">How would you describe your experience level?</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {LEVEL_OPTIONS.map((option) => (
              <StepCard
                key={option.id}
                option={option}
                selected={answers.level === option.id}
                onClick={() => selectOption('level', option.id)}
                compact
              />
            ))}
          </div>
        </section>
      )
    }

    return (
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-white">Your Recommended Tools</h2>
            <p className="mt-1 text-sm text-slate-300">{results.length} matched tools based on your preferences.</p>
          </div>

          <MotionButton
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleRestart}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-indigo-400"
          >
            <RotateCcw className="h-4 w-4" />
            Start over
          </MotionButton>

          <MotionButton
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleSaveStack}
            disabled={savingStack || results.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-800"
          >
            <Save className="h-4 w-4" />
            {savingStack ? 'Saving...' : 'Save to my stack'}
          </MotionButton>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((tool, index) => (
            <MotionArticle
              key={`${tool.name}-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="group relative rounded-2xl border border-slate-700 bg-slate-900/90 p-5"
            >
              <div className="mb-3 inline-flex items-center rounded-full border border-indigo-500/50 bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-200">
                Why recommended
              </div>

              <h3 className="text-lg font-semibold text-white">{tool.name}</h3>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-indigo-300">{tool.category}</p>
              {tool._reason && (
                <p className="tool-reason mt-2 flex items-start gap-1.5 text-xs">
                  <span className="reason-icon mt-0.5 flex-shrink-0">✦</span>
                  {tool._reason}
                </p>
              )}
              <p className="mt-3 line-clamp-3 text-sm text-slate-300">{tool.description}</p>

              <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
                <span>{tool.pricing}</span>
                <span>{tool.platformLabel}</span>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <div className="relative">
                  <MotionButton
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-indigo-400"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    Why this?
                  </MotionButton>
                  <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 opacity-0 shadow-xl transition group-hover:opacity-100">
                    {tool.reason}
                  </div>
                </div>

                <a
                  href={tool.link || tool.url || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-indigo-400"
                >
                  Open Tool
                </a>
              </div>
            </MotionArticle>
          ))}
        </div>
      </section>
    )
  }

  const currentStep = step

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-950 to-slate-900 p-6 shadow-2xl sm:p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">AI Tool Finder Wizard</h1>
            <p className="mt-2 text-sm text-slate-300 sm:text-base">
              Answer 4 quick questions and get your best-fit AI tools.
            </p>
          </div>

          {step <= 4 ? <ProgressDots step={step} /> : null}

          {error ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </motion.div>
          ) : null}

          <AnimatePresence mode="wait">
            <MotionDiv
              key={currentStep}
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            >
              {renderStep()}
            </MotionDiv>
          </AnimatePresence>

          {step <= 4 ? (
            <div className="mt-8 flex items-center justify-between gap-3">
              <MotionButton
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleBack}
                disabled={step === 1 || loadingResults}
                className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </MotionButton>

              <MotionButton
                type="button"
                whileHover={{ scale: canContinue && !loadingResults ? 1.03 : 1 }}
                whileTap={{ scale: canContinue && !loadingResults ? 0.97 : 1 }}
                onClick={handleContinue}
                disabled={!canContinue || loadingResults}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-indigo-800"
              >
                {loadingResults ? 'Finding tools...' : step === 4 ? 'See results' : 'Continue'}
              </MotionButton>
            </div>
          ) : null}
        </section>
      </main>
    </PageTransition>
  )
}

export default ToolFinderPage
