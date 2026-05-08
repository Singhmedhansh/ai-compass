import { Check, RotateCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { ToolLogo } from '../components/ui'

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

const PRICING_PILL_CLASS = {
  free: 'bg-accent-soft text-accent-ink',
  freemium: 'bg-bg-sunk text-ink-2 ring-1 ring-inset ring-line',
  paid: 'bg-bg-sunk text-ink-2 ring-1 ring-inset ring-line',
}

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

function getPricingPillClass(pricing = '') {
  return PRICING_PILL_CLASS[String(pricing || '').toLowerCase().trim()] || PRICING_PILL_CLASS.free
}

function getToolUrl(tool = {}) {
  return tool.website_url || tool.url || tool.link || '#'
}

function StepCard({ option, selected, onClick, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-2xl border p-5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        selected
          ? 'border-accent bg-accent-soft text-accent-ink shadow-sm'
          : 'border-line bg-bg-elev text-ink hover:border-accent hover:bg-bg-sunk'
      } ${compact ? 'min-h-[120px]' : 'min-h-[156px]'}`}
    >
      <div className="text-3xl" aria-hidden="true">{option.emoji}</div>
      <h3 className={`mt-3 text-lg font-semibold ${selected ? 'text-accent-ink' : 'text-ink'}`}>{option.label}</h3>
      <p className={`mt-2 text-sm ${selected ? 'text-accent-ink' : 'text-muted'}`}>{option.description}</p>
      {selected ? (
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-bg">
          <Check className="h-4 w-4" />
        </div>
      ) : null}
    </button>
  )
}

function ProgressDots({ step }) {
  const fillPercent = `${Math.max(0, Math.min(100, ((step - 1) / (TOTAL_STEPS - 1)) * 100))}%`

  return (
    <div className="mb-8">
      <div className="relative mx-auto flex w-full max-w-xl items-center justify-between">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 px-5">
          <div className="h-1 rounded-full bg-line">
            <div
              className="h-1 rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: fillPercent }}
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
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-bg">
                  <Check className="h-5 w-5" />
                </div>
              ) : isCurrent ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-accent bg-bg text-accent-ink">
                  <span className="text-sm font-semibold">{dot}</span>
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-line-strong bg-bg-elev text-muted">
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
          <h2 className="text-xl font-semibold text-ink">What&apos;s your primary goal?</h2>
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
          <h2 className="text-xl font-semibold text-ink">What specifically do you want to do?</h2>
          <p className="mb-2 text-muted">
            Be specific — "write essays" gets better results than "writing"
          </p>
          <input
            type="text"
            className="mb-4 w-full rounded-lg border border-line bg-bg-elev px-4 py-2 text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="e.g. write essays, build a web app, edit YouTube videos..."
            value={answers.use_case}
            onChange={e => setAnswers(prev => ({ ...prev, use_case: e.target.value }))}
            maxLength={120}
            style={{ fontSize: 16 }}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-line-strong bg-transparent px-4 py-2 text-ink transition-colors hover:bg-bg-sunk"
              style={{ minHeight: 44, width: '100%' }}
              onClick={() => { setAnswers(prev => ({ ...prev, use_case: '' })); setStep(2); }}
              type="button"
            >
              Skip
            </button>
            <button
              className="rounded-lg bg-accent px-4 py-2 text-bg transition-opacity hover:opacity-90"
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
          <h2 className="text-xl font-semibold text-ink">What&apos;s your budget?</h2>
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
          <h2 className="text-xl font-semibold text-ink">Where do you work?</h2>
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
          <h2 className="text-xl font-semibold text-ink">How would you describe your experience level?</h2>
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
        <div className="rounded-2xl border border-line bg-bg-elev px-4 py-3 sm:px-5">
          <h2 className="text-xl font-semibold text-ink sm:text-2xl">{results.length} tools picked for you</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleRestart}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Start over
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveStack}
              disabled={savingStack || results.length === 0}
              title={isLoggedIn ? undefined : 'Log in to save'}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {savingStack ? 'Saving...' : isLoggedIn ? 'Save stack' : 'Log in to save'}
            </Button>
          </div>
        </div>

        <div className="tools-grid mt-6 grid">
          {results.map((tool, index) => {
            const toolKey = tool.slug || tool.name || `${tool.name}-${index}`
            const isTopMatch = index === 0

            return (
              <article
                key={toolKey}
                className="group relative flex h-full min-w-0 flex-col rounded-2xl border border-line bg-bg-elev shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
              >
                {isTopMatch ? (
                  <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink shadow-sm ring-1 ring-inset ring-accent/30">
                    ★ Best Match
                  </span>
                ) : null}

                <div className="flex flex-1 flex-col gap-3 p-5">
                  <div
                    className="flex items-start gap-3"
                    onClick={() => navigate(`/tools/${tool.slug || ''}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-bg-sunk text-lg font-bold text-ink-2" aria-hidden="true">
                      <ToolLogo tool={tool} size={40} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className={`flex items-start justify-between gap-2 ${isTopMatch ? 'pr-24' : ''}`}>
                        <h3 className="truncate text-base font-semibold text-ink">{tool.name}</h3>
                        <Badge label={tool.category || 'General'} variant={tool.category} />
                      </div>

                      <p className="mt-1.5 text-sm italic leading-5 text-muted">
                        ✨ {tool.reason}
                      </p>

                      <p className="mt-2 line-clamp-2 overflow-hidden text-sm leading-snug text-ink-2">
                        {tool.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${getPricingPillClass(tool.pricing)}`}>
                      {String(tool.pricing || 'Free').toUpperCase()}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-bg-sunk px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-ink-2 ring-1 ring-inset ring-line">
                      {String(tool.platformLabel || 'Web').toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-auto">
                    <a
                      href={getToolUrl(tool)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
                    >
                      Visit Tool
                    </a>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">AI Tool Finder Wizard</h1>
          <p className="mt-2 text-sm text-muted sm:text-base">
            Answer 4 quick questions and get your best-fit AI tools.
          </p>
        </div>

        {step <= 4 ? <ProgressDots step={step} /> : null}

        {error ? (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            {error}
          </div>
        ) : null}

        {renderStep()}

        {step <= 4 ? (
          <div className="mx-auto mt-8 flex w-full max-w-5xl items-center justify-between gap-3">
            <Button
              variant="secondary"
              onClick={handleBack}
              disabled={step === 1 || loadingResults}
            >
              Back
            </Button>

            <Button
              variant="primary"
              onClick={handleContinue}
              disabled={!canContinue || loadingResults}
              className="w-full min-h-[44px]"
            >
              {loadingResults ? 'Finding tools...' : step === 4 ? 'See results' : 'Continue'}
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default ToolFinderPage
