import { AnimatePresence, motion } from 'framer-motion'
import { Check, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

import PageTransition from '../components/PageTransition'
import { ToolLogo } from '../components/ui'

const MotionButton = motion.button
const MotionDiv = motion.div
const MotionArticle = motion.article

function getAspectBucket() {
  if (typeof window === 'undefined') {
    return 'landscape'
  }

  const ratio = window.innerWidth / Math.max(window.innerHeight, 1)
  if (ratio < 0.95) {
    return 'portrait'
  }
  if (ratio > 1.9) {
    return 'ultrawide'
  }
  return 'landscape'
}

const TOTAL_STEPS = 5

const GOAL_OPTIONS = [
  { id: 'learning', emoji: '🎓', label: 'Learning', description: 'Courses, tutorials, exam prep' },
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
    reason: rawTool?.reason || 'Strong overall match for your preferences.',
    rating: Number(rawTool?.rating || rawTool?.averageRating || rawTool?.average_rating || 0),
  }
}

const CATEGORY_BADGE_CLASSES = {
  coding: 'bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:ring-blue-500/30',
  writing: 'bg-purple-100 text-purple-700 ring-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:ring-purple-500/30',
  research: 'bg-green-100 text-green-700 ring-green-200 dark:bg-green-500/20 dark:text-green-300 dark:ring-green-500/30',
  productivity: 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30',
  'image generation': 'bg-pink-100 text-pink-700 ring-pink-200 dark:bg-pink-500/20 dark:text-pink-300 dark:ring-pink-500/30',
  'image gen': 'bg-pink-100 text-pink-700 ring-pink-200 dark:bg-pink-500/20 dark:text-pink-300 dark:ring-pink-500/30',
  'video generation': 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/30',
  'video gen': 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/30',
}

const PRICING_BADGE_CLASSES = {
  free: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30',
  freemium: 'bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/20 dark:text-sky-300 dark:ring-sky-500/30',
  paid: 'bg-gray-200 text-gray-700 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600/40',
}

const PLATFORM_BADGE_CLASS = 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700/80 dark:text-slate-200 dark:ring-slate-600/40'

function normalizeKey(value = '') {
  return String(value || '').toLowerCase().trim()
}

function getCategoryBadgeClass(category = '') {
  return CATEGORY_BADGE_CLASSES[normalizeKey(category)] || 'bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:ring-indigo-500/30'
}

function getPriceBadgeClass(pricing = '') {
  return PRICING_BADGE_CLASSES[normalizeKey(pricing)] || PRICING_BADGE_CLASSES.free
}

function getToolUrl(tool = {}) {
  return tool.website_url || tool.url || tool.link || '#'
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
  const [aspectBucket, setAspectBucket] = useState(getAspectBucket)

  useEffect(() => {
    const onResize = () => {
      setAspectBucket(getAspectBucket())
    }

    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  let user = null
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    user = null
  }
  const isLoggedIn = Boolean(user)

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
      const requestPayload = { ...answers }

      console.log('[Tool Finder] sending selections', requestPayload)

      const response = await fetch(`${API}/api/v1/finder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      })

      const responsePayload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(responsePayload.error || 'Unable to generate recommendations right now.')
      }

      const tools = Array.isArray(responsePayload?.tools) ? responsePayload.tools.map(normalizeTool) : []
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
        <section className="mx-auto w-full max-w-5xl">
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
        <section className="mx-auto w-full max-w-2xl">
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
            style={{ fontSize: 16 }}
            autoFocus
          />
          <div className="wizard-nav flex gap-2">
            <button
              className="btn-secondary border border-slate-600 bg-slate-800 px-4 py-2 rounded-lg text-white"
              style={{ minHeight: 44, width: '100%' }}
              onClick={() => { setAnswers(prev => ({ ...prev, use_case: '' })); setStep(2); }}
              type="button"
            >
              Skip
            </button>
            <button
              className="btn-primary bg-indigo-600 px-4 py-2 rounded-lg text-white"
              style={{ minHeight: 44, width: '100%' }}
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
        <section className="mx-auto w-full max-w-4xl">
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
        <section className="mx-auto w-full max-w-5xl">
          <h2 className="text-xl font-semibold text-white">Where do you work?</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <section className="mx-auto w-full max-w-4xl">
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
      <section className={`mx-auto w-full ${aspectBucket === 'ultrawide' ? 'max-w-7xl' : aspectBucket === 'portrait' ? 'max-w-4xl' : 'max-w-6xl'}`}>
        <div className="rounded-2xl border border-slate-700/70 bg-slate-900/40 px-4 py-3 sm:px-5">
          <h2 className="text-xl font-semibold text-white sm:text-2xl">{results.length} tools picked for you</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MotionButton
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleRestart}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-indigo-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Start over
            </MotionButton>

            <MotionButton
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSaveStack}
              disabled={savingStack || results.length === 0}
              title={isLoggedIn ? undefined : 'Log in to save'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-800"
            >
              <Save className="h-3.5 w-3.5" />
              {savingStack ? 'Saving...' : isLoggedIn ? 'Save stack' : 'Log in to save'}
            </MotionButton>
          </div>
        </div>

        <div className="tools-grid mt-6 grid">
          {results.map((tool, index) => {
            const toolKey = tool.slug || tool.name || `${tool.name}-${index}`
            const isTopMatch = index === 0

            return (
              <MotionArticle
                key={toolKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="tool-card group relative flex h-full min-w-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-500"
              >
                {isTopMatch ? (
                  <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 shadow-sm ring-1 ring-inset ring-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/40">
                    ★ Best Match
                  </span>
                ) : null}

                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div
                    className="flex items-start gap-3"
                    onClick={() => navigate(`/tools/${tool.slug || ''}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-lg font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-100" aria-hidden="true">
                      <ToolLogo tool={tool} size={40} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className={`flex items-start justify-between gap-2 ${isTopMatch ? 'pr-24' : ''}`}>
                        <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">{tool.name}</h3>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${getCategoryBadgeClass(tool.category)}`}>
                          {String(tool.category || 'General').toUpperCase()}
                        </span>
                      </div>

                      <p className="mt-1.5 text-sm italic leading-5 text-gray-500 dark:text-gray-400">
                        ✨ {tool.reason}
                      </p>

                      <p className="mt-2 line-clamp-2 overflow-hidden text-sm leading-snug text-gray-600 dark:text-gray-300">
                        {tool.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${getPriceBadgeClass(tool.pricing)}`}>
                      {String(tool.pricing || 'Free').toUpperCase()}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${PLATFORM_BADGE_CLASS}`}>
                      {String(tool.platformLabel || 'Web').toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-auto">
                    <a
                      href={getToolUrl(tool)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-500"
                    >
                      Visit Tool
                    </a>
                  </div>
                </div>
              </MotionArticle>
            )
          })}
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
            <div className="mx-auto mt-8 flex w-full max-w-5xl items-center justify-between gap-3">
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
                style={{ minHeight: 44, width: '100%' }}
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
