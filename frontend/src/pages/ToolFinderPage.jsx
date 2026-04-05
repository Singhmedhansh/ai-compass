import { AnimatePresence, motion } from 'framer-motion'
import { Check, HelpCircle, RotateCcw, Save } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'

const TOTAL_STEPS = 4

const STEP_TRANSITION = {
  enter: { x: 100, opacity: 0 },
  center: { x: 0, opacity: 1 },
  exit: { x: -100, opacity: 0 },
}

const GOAL_OPTIONS = [
  {
    id: 'studying',
    emoji: '🎓',
    label: 'Studying',
    description: 'Homework, essays, exam prep',
  },
  {
    id: 'coding',
    emoji: '💻',
    label: 'Coding',
    description: 'Build apps, debug, learn to code',
  },
  {
    id: 'writing',
    emoji: '✍️',
    label: 'Writing',
    description: 'Essays, emails, creative writing',
  },
  {
    id: 'research',
    emoji: '🔬',
    label: 'Research',
    description: 'Find papers, summarize, analyze',
  },
  {
    id: 'creating',
    emoji: '🎨',
    label: 'Creating',
    description: 'Images, videos, design',
  },
  {
    id: 'productivity',
    emoji: '⚡',
    label: 'Productivity',
    description: 'Organize, automate, focus',
  },
]

const BUDGET_OPTIONS = [
  {
    id: 'free',
    emoji: '🆓',
    label: 'Free only',
    description: 'Student-friendly, zero cost',
  },
  {
    id: 'freemium',
    emoji: '🔓',
    label: 'Freemium',
    description: 'Free tier + paid upgrades',
  },
  {
    id: 'any',
    emoji: '💳',
    label: 'Any budget',
    description: 'Best tool regardless of price',
  },
]

const PLATFORM_OPTIONS = [
  { id: 'web', emoji: '🌐', label: 'Web browser', description: 'Use directly in the browser' },
  { id: 'desktop', emoji: '💻', label: 'Desktop app', description: 'Install and run on your computer' },
  { id: 'mobile', emoji: '📱', label: 'Mobile', description: 'Work from iOS or Android' },
  { id: 'api', emoji: '🔌', label: 'API / Code', description: 'Automate in scripts and apps' },
]

const LEVEL_OPTIONS = [
  {
    id: 'beginner',
    emoji: '🌱',
    label: 'Beginner',
    description: 'Just getting started',
  },
  {
    id: 'intermediate',
    emoji: '🚀',
    label: 'Intermediate',
    description: 'Comfortable with tech',
  },
  {
    id: 'advanced',
    emoji: '⚡',
    label: 'Advanced',
    description: 'Power user, developer',
  },
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
    reason: rawTool?.reason || 'Strong overall match for your preferences.',
    rating: Number(rawTool?.rating || rawTool?.averageRating || rawTool?.average_rating || 0),
  }
}

function StepCard({ option, selected, onClick, compact = false }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`relative rounded-2xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${
        selected
          ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/20'
          : 'border-slate-700 bg-slate-900/80 hover:border-indigo-400/60 hover:bg-slate-900'
      } ${compact ? 'min-h-[120px]' : 'min-h-[156px]'}`}
    >
      <div className="text-3xl" aria-hidden="true">{option.emoji}</div>
      <h3 className="mt-3 text-lg font-semibold text-white">{option.label}</h3>
      <p className="mt-2 text-sm text-slate-300">{option.description}</p>
      {selected ? (
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white">
          <Check className="h-4 w-4" />
        </div>
      ) : null}
    </motion.button>
  )
}

function ProgressDots({ step }) {
  return (
    <div className="mb-8">
      <div className="relative mx-auto flex w-full max-w-xl items-center justify-between">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 px-5">
          <div className="h-1 rounded-full bg-slate-700">
            <motion.div
              layoutId="progress-bar"
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
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white"
                >
                  <Check className="h-5 w-5" />
                </motion.div>
              ) : isCurrent ? (
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 1.3, repeat: Number.POSITIVE_INFINITY }}
                  className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-indigo-500 bg-slate-950 text-indigo-300"
                >
                  <span className="text-sm font-semibold">{dot}</span>
                </motion.div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-600 bg-slate-900 text-slate-400">
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
  const [answers, setAnswers] = useState({
    goal: '',
    budget: '',
    platform: '',
    level: '',
  })
  const [results, setResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [savingStack, setSavingStack] = useState(false)
  const [error, setError] = useState('')
  const selections = answers

  let user = null
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    user = null
  }

  const canContinue =
    (step === 1 && Boolean(answers.goal)) ||
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
      const response = await fetch('/api/v1/finder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
    if (!canContinue) {
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
    setStep((previous) => Math.max(1, previous - 1))
  }

  const handleRestart = () => {
    setAnswers({ goal: '', budget: '', platform: '', level: '' })
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
    setError('')

    try {
      const response = await fetch('/api/v1/stack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          goal: selections.goal,
          budget: selections.budget,
          platform: selections.platform,
          level: selections.level,
          tools: results.map((t) => t.slug || t.name),
        }),
      })

      if (response.ok) {
        toast.success('Stack saved to your dashboard! 🎉')
      } else {
        toast.error('Could not save stack, try again')
      }
    } catch {
      toast.error('Could not save stack, try again')
    } finally {
      setSavingStack(false)
    }
  }

  return (
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
          {step === 1 ? (
            <motion.section
              key="step-1"
              variants={STEP_TRANSITION}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
            >
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
            </motion.section>
          ) : null}

          {step === 2 ? (
            <motion.section
              key="step-2"
              variants={STEP_TRANSITION}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
            >
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
            </motion.section>
          ) : null}

          {step === 3 ? (
            <motion.section
              key="step-3"
              variants={STEP_TRANSITION}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
            >
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
            </motion.section>
          ) : null}

          {step === 4 ? (
            <motion.section
              key="step-4"
              variants={STEP_TRANSITION}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
            >
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
            </motion.section>
          ) : null}

          {step === 5 ? (
            <motion.section
              key="results"
              variants={STEP_TRANSITION}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Your Recommended Tools</h2>
                  <p className="mt-1 text-sm text-slate-300">{results.length} matched tools based on your preferences.</p>
                </div>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleRestart}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-indigo-400"
                >
                  <RotateCcw className="h-4 w-4" />
                  Start over
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleSaveStack}
                  disabled={savingStack || results.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-800"
                >
                  <Save className="h-4 w-4" />
                  {savingStack ? 'Saving...' : 'Save to my stack'}
                </motion.button>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.map((tool, index) => (
                  <motion.article
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
                    <p className="mt-3 line-clamp-3 text-sm text-slate-300">{tool.description}</p>

                    <div className="mt-4 flex items-center justify-between text-sm text-slate-300">
                      <span>{tool.pricing}</span>
                      <span>{tool.platformLabel}</span>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-2">
                      <div className="relative">
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-indigo-400"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          Why this?
                        </motion.button>
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
                  </motion.article>
                ))}
              </div>
            </motion.section>
          ) : null}
        </AnimatePresence>

        {step <= 4 ? (
          <div className="mt-8 flex items-center justify-between gap-3">
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleBack}
              disabled={step === 1 || loadingResults}
              className="rounded-xl border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: canContinue && !loadingResults ? 1.03 : 1 }}
              whileTap={{ scale: canContinue && !loadingResults ? 0.97 : 1 }}
              onClick={handleContinue}
              disabled={!canContinue || loadingResults}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-indigo-800"
            >
              {loadingResults ? 'Finding tools...' : step === 4 ? 'See results' : 'Continue'}
            </motion.button>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default ToolFinderPage
