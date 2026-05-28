import { Check, RotateCcw, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { ToolLogo, WordReveal } from '../components/ui'
import { outboundUrl, OUTBOUND_REL } from '../utils/outbound'

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

const GOAL_OPTIONS = [
  { id: 'learning', label: 'Learning' },
  { id: 'coding', label: 'Coding' },
  { id: 'writing', label: 'Writing' },
  { id: 'research', label: 'Research' },
  { id: 'creating', label: 'Creating' },
  { id: 'productivity', label: 'Productivity' },
]

const BUDGET_OPTIONS = [
  { id: 'free', label: 'Free only' },
  { id: 'freemium', label: 'Freemium' },
  { id: 'any', label: 'Any budget' },
]

const PLATFORM_OPTIONS = [
  { id: 'web', label: 'Web browser' },
  { id: 'desktop', label: 'Desktop app' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'api', label: 'API / Code' },
]

const LEVEL_OPTIONS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

const QUESTIONS = [
  {
    id: 'goal',
    label: 'Use case',
    activeHeading: "What's your primary goal?",
    activeHelper: 'Pick all that apply — you can refine these anytime.',
    options: GOAL_OPTIONS,
    type: 'chips',
    multiSelect: true,
  },
  {
    id: 'use_case',
    label: 'Specifics',
    activeHeading: 'What specifically do you want to do?',
    activeHelper: 'Be specific — "write essays" beats "writing".',
    type: 'text',
  },
  {
    id: 'budget',
    label: 'Budget',
    activeHeading: "What's your budget?",
    activeHelper: 'Free is fine — we rank by fit, not price.',
    options: BUDGET_OPTIONS,
    type: 'chips',
  },
  {
    id: 'platform',
    label: 'Platform',
    activeHeading: 'Where do you work?',
    activeHelper: 'Pick every surface you use — we match tools that fit.',
    options: PLATFORM_OPTIONS,
    type: 'chips',
    multiSelect: true,
  },
  {
    id: 'level',
    label: 'Level',
    activeHeading: 'How comfortable are you with tech?',
    activeHelper: 'No wrong answer — this just calibrates the rec list.',
    options: LEVEL_OPTIONS,
    type: 'chips',
  },
]

const TOTAL_QUESTIONS = QUESTIONS.length
const QUESTION_FLOW = QUESTIONS.map((q) => q.id)

const PRICING_PILL_CLASS = {
  free: 'bg-accent-soft text-accent-ink',
  freemium: 'bg-bg-sunk text-ink-2 ring-1 ring-inset ring-line',
  paid: 'bg-bg-sunk text-ink-2 ring-1 ring-inset ring-line',
}

const GOAL_NOUN = {
  coding: 'coder',
  writing: 'writer',
  research: 'researcher',
  learning: 'learner',
  creating: 'creator',
  productivity: 'productivity-focused user',
}

const BUDGET_CLAUSE = {
  free: 'on free tier',
  freemium: 'on freemium pricing',
  any: 'with any budget',
}

const PLATFORM_CLAUSE = {
  web: 'working from a web browser',
  desktop: 'working from a desktop app',
  mobile: 'working from mobile',
  api: 'working through API or code',
}

const posthog = typeof window !== 'undefined' ? window.posthog : undefined

function captureWizardEvent(event, properties) {
  try {
    posthog?.capture?.(event, properties)
  } catch {
    /* telemetry must never break the wizard */
  }
}

function snapshotAnswers(answers) {
  return {
    goal: Array.isArray(answers.goal) ? [...answers.goal] : answers.goal,
    use_case: answers.use_case || '',
    budget: answers.budget || '',
    platform: Array.isArray(answers.platform) ? [...answers.platform] : answers.platform,
    level: answers.level || '',
  }
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
  return outboundUrl(tool)
}

function articleFor(nextWord = '') {
  return /^[aeiouAEIOU]/.test(nextWord.trim()) ? 'an' : 'a'
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  return value ? [value] : []
}

function joinPretty(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function buildPersona(answers) {
  const { goal, use_case, budget, platform, level } = answers
  const goals = asList(goal)
  const platforms = asList(platform)
  if (goals.length === 0 && !use_case && !budget && platforms.length === 0 && !level) {
    return null
  }

  const goalNoun = joinPretty(goals.map((g) => GOAL_NOUN[g]).filter(Boolean))
  const budgetClause = BUDGET_CLAUSE[budget]
  const platformClause = joinPretty(platforms.map((p) => PLATFORM_CLAUSE[p]).filter(Boolean))

  let lead
  if (level && goalNoun) {
    lead = `For ${articleFor(level)} ${level} ${goalNoun}`
  } else if (goalNoun) {
    lead = `For ${articleFor(goalNoun)} ${goalNoun}`
  } else if (level) {
    lead = `For ${articleFor(level)} ${level} user`
  } else {
    lead = 'Looking for tools'
  }

  const clauses = []
  if (use_case && use_case.trim()) clauses.push(`who wants to ${use_case.trim()}`)
  if (budgetClause) clauses.push(budgetClause)
  if (platformClause) clauses.push(platformClause)

  return clauses.length > 0 ? `${lead} ${clauses.join(', ')}:` : `${lead}:`
}

function QuestionRow({ index, question, answer, isActive, onActivate, onSelect, onTextChange, onNext }) {
  const indexLabel = String(index).padStart(2, '0')
  const isMulti = Boolean(question.multiSelect)
  const isAnswered = isMulti
    ? Array.isArray(answer) && answer.length > 0
    : Boolean(answer)
  const selectedCount = isMulti && Array.isArray(answer) ? answer.length : 0

  const answerLabel = (() => {
    if (!isAnswered) return '— pending —'
    if (question.type === 'text') return answer
    if (isMulti) {
      return answer
        .map((id) => question.options?.find((o) => o.id === id)?.label || id)
        .join(', ')
    }
    const opt = question.options?.find((o) => o.id === answer)
    return opt?.label || answer
  })()

  const wrapperClasses = isActive
    ? 'rounded-2xl border border-accent bg-bg-elev shadow-sm ring-2 ring-accent/20 transition-shadow'
    : 'rounded-2xl border border-line bg-bg-elev transition-colors hover:border-line-strong'

  const header = (
    <div className="flex items-start gap-3 p-4">
      <span
        className={`mt-1 w-7 flex-shrink-0 font-mono text-xs tracking-wider ${
          isActive ? 'text-accent' : 'text-muted-2'
        }`}
      >
        {indexLabel}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {question.label}
          {isActive ? (
            <span className="ml-2 text-muted-2">· Question {index} of {TOTAL_QUESTIONS}</span>
          ) : null}
        </span>
        {isActive ? (
          <span className="text-base font-semibold text-ink">{question.activeHeading}</span>
        ) : isAnswered ? (
          <span className="text-base font-medium text-ink">{answerLabel}</span>
        ) : (
          <span className="text-sm text-muted-2">— pending —</span>
        )}
      </div>

      <div className="mt-1 flex-shrink-0">
        {isActive ? (
          <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border-2 border-accent" />
        ) : isAnswered ? (
          <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-bg">
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border border-line-strong" />
        )}
      </div>
    </div>
  )

  return (
    <div className={wrapperClasses}>
      {isActive ? (
        <>
          {header}
          <div className="px-4 pb-4 pl-12">
            {question.type === 'text' ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{question.activeHelper}</p>
                <input
                  type="text"
                  className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder='e.g. write essays, build a web app, edit YouTube videos…'
                  value={answer || ''}
                  onChange={(e) => onTextChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onNext()
                    }
                  }}
                  maxLength={120}
                  style={{ fontSize: 16 }}
                  autoFocus
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-2">Optional — press Enter or Continue to skip</span>
                  <Button variant="primary" size="sm" onClick={onNext}>
                    Continue →
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{question.activeHelper}</p>
                <div className="flex flex-wrap gap-2">
                  {question.options.map((opt) => {
                    const selected = isMulti
                      ? Array.isArray(answer) && answer.includes(opt.id)
                      : answer === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSelect(opt.id)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          selected
                            ? 'border-accent bg-accent-soft text-accent-ink'
                            : 'border-line bg-bg-elev text-ink hover:border-accent'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {isMulti ? (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-muted-2">
                      {selectedCount > 0
                        ? `${selectedCount} selected — pick more or continue`
                        : 'Pick all that apply'}
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onNext}
                      disabled={selectedCount === 0}
                    >
                      Continue →
                    </Button>
                  </div>
                ) : (
                  <p className="pt-0.5 text-xs text-muted-2">
                    Pick one — we&apos;ll jump to the next question automatically.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onActivate}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-2xl"
        >
          {header}
        </button>
      )}
    </div>
  )
}

function PreviewCard({ tool, rank }) {
  const tierBits = [tool.pricing, tool.platformLabel].filter(Boolean).join(' · ')

  return (
    <div className="relative grid grid-cols-[36px_1fr_auto] items-start gap-3 rounded-xl border border-line bg-bg-elev p-3">
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-bg-sunk" aria-hidden="true">
        <ToolLogo tool={tool} size={32} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span className="truncate font-semibold text-ink">{tool.name}</span>
          {tierBits ? <span className="truncate text-xs font-normal text-muted">{tierBits}</span> : null}
        </div>
        <p className="mt-1 text-sm italic leading-snug text-muted">
          <span className="mr-1.5 not-italic text-[11px] font-semibold uppercase tracking-wide text-accent-ink">why</span>
          {tool.reason}
        </p>
      </div>
      <span className="font-mono text-xs text-muted-2">#{rank}</span>
    </div>
  )
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse items-start gap-3 rounded-xl border border-line bg-bg-elev p-3">
          <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-bg-sunk" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-2/3 rounded bg-bg-sunk" />
            <div className="h-2 w-full rounded bg-bg-sunk" />
            <div className="h-2 w-4/5 rounded bg-bg-sunk" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LivePreview({ answers, results, loading, error, canSeeResults, onSeeResults }) {
  const persona = buildPersona(answers)
  const top3 = results.slice(0, 3)
  const remaining = Math.max(0, results.length - 3)
  const hasResults = top3.length > 0

  return (
    <aside className="self-start rounded-2xl border border-line bg-bg-elev p-5 sm:p-6 lg:sticky lg:top-24">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Live preview</span>
        {hasResults ? (
          <span className="text-xs text-muted">{top3.length} of {results.length} shown</span>
        ) : null}
      </div>

      {persona ? (
        <p className="mb-5 rounded-lg border border-dashed border-line-strong bg-bg-sunk px-3 py-2.5 text-sm leading-relaxed text-ink-2">
          {persona}
        </p>
      ) : (
        <p className="mb-5 text-sm text-muted">Pick a few answers and we&apos;ll show your top picks here.</p>
      )}

      {error ? (
        <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          Couldn&apos;t fetch preview. Try again in a moment.
        </p>
      ) : loading && !hasResults ? (
        <SkeletonRows />
      ) : hasResults ? (
        <div className="flex flex-col gap-3">
          {top3.map((tool, index) => (
            <PreviewCard key={tool.slug || tool.name || index} tool={tool} rank={index + 1} />
          ))}
        </div>
      ) : persona ? (
        <p className="text-sm text-muted">No matches yet — try widening your answers.</p>
      ) : null}

      {hasResults ? (
        <div className="mt-4 flex flex-col gap-2">
          {remaining > 0 ? (
            <span className="text-xs text-muted">+ {remaining} more in the full result</span>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={onSeeResults}
            disabled={!canSeeResults}
            className="w-full"
            title={canSeeResults ? undefined : 'Pick a goal and your level first'}
          >
            See full results →
          </Button>
        </div>
      ) : null}
    </aside>
  )
}

function ToolFinderPage() {
  const navigate = useNavigate()
  const [hasStarted, setHasStarted] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [viewMode, setViewMode] = useState('wizard')
  const [answers, setAnswers] = useState({ goal: [], use_case: '', budget: '', platform: [], level: '' })
  const [results, setResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [savingStack, setSavingStack] = useState(false)
  const [error, setError] = useState('')
  const [aspectBucket, setAspectBucket] = useState(getAspectBucket)
  const [pendingCompletion, setPendingCompletion] = useState(null)
  const wizardStartedRef = useRef(false)
  const wizardCompletedRef = useRef(false)

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

  // Debounced live-preview fetch — fires whenever answers change.
  useEffect(() => {
    const hasGatingAnswer = (
      (Array.isArray(answers.goal) ? answers.goal.length > 0 : Boolean(answers.goal))
      || Boolean(answers.budget)
      || (Array.isArray(answers.platform) ? answers.platform.length > 0 : Boolean(answers.platform))
      || Boolean(answers.level)
    )
    if (!hasGatingAnswer) {
      setResults([])
      setError('')
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoadingResults(true)
      setError('')
      try {
        const API = import.meta.env.VITE_API_URL || ''
        const response = await fetch(`${API}/api/v1/finder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(answers),
          signal: controller.signal,
        })
        const responsePayload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(responsePayload.error || 'Unable to generate preview right now.')
        }
        const tools = Array.isArray(responsePayload?.tools) ? responsePayload.tools.map(normalizeTool) : []
        if (!controller.signal.aborted) {
          setResults(tools)
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Unable to generate preview right now.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingResults(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [answers])

  const canSeeResults = (
    (Array.isArray(answers.goal) ? answers.goal.length > 0 : Boolean(answers.goal))
    && Boolean(answers.level)
  )

  const handleStartWizard = () => {
    if (wizardStartedRef.current) return
    wizardStartedRef.current = true
    captureWizardEvent('wizard_started')
    setHasStarted(true)
    setActiveQuestion('goal')
  }

  const writeAnswer = (key, value) => {
    setAnswers((previous) => ({ ...previous, [key]: value }))
  }

  const trackStepCompletion = (question, answerSelected) => {
    captureWizardEvent('wizard_step_completed', {
      step_number: QUESTION_FLOW.indexOf(question.id) + 1,
      question_title: question.activeHeading,
      answer_selected: answerSelected,
    })
  }

  // Move focus to the next unanswered question (or finish). Guarded so a
  // late auto-advance can't yank the user if they've already moved on.
  const goToQuestionAfter = (question, answerSelected, nextAnswers = answers) => {
    const i = QUESTION_FLOW.indexOf(question.id)
    const next = QUESTIONS[i + 1]
    trackStepCompletion(question, answerSelected)
    if (!next) {
      setPendingCompletion({ answers: snapshotAnswers(nextAnswers) })
    }
    setActiveQuestion((prev) => (prev === question.id ? (next ? next.id : null) : prev))
  }

  const handleQuestionSelect = (question, value) => {
    if (question.multiSelect) {
      // Multi-select: toggle only — the user taps several, then "Continue".
      setAnswers((previous) => {
        const current = Array.isArray(previous[question.id]) ? previous[question.id] : []
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value]
        return { ...previous, [question.id]: next }
      })
      return
    }
    // Single-select: record, let the highlight register, then auto-advance.
    const nextAnswers = { ...answers, [question.id]: value }
    writeAnswer(question.id, value)
    window.setTimeout(() => goToQuestionAfter(question, value, nextAnswers), 280)
  }

  const handleQuestionContinue = (question) => {
    const selectedAnswer = question.type === 'text'
      ? (answers[question.id] || '')
      : answers[question.id]
    goToQuestionAfter(question, selectedAnswer, answers)
  }

  const handleRestart = () => {
    wizardStartedRef.current = false
    wizardCompletedRef.current = false
    setAnswers({ goal: [], use_case: '', budget: '', platform: [], level: '' })
    setResults([])
    setError('')
    setPendingCompletion(null)
    setHasStarted(false)
    setActiveQuestion(null)
    setViewMode('wizard')
  }

  useEffect(() => {
    if (!pendingCompletion || loadingResults || results.length === 0 || wizardCompletedRef.current) {
      return
    }

    wizardCompletedRef.current = true
    captureWizardEvent('wizard_completed', {
      total_steps: TOTAL_QUESTIONS,
      answers: pendingCompletion.answers,
    })
    setPendingCompletion(null)
  }, [loadingResults, pendingCompletion, results.length])

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
      const API = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API}/api/v1/stack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          // dashboard renders these as strings; flatten arrays for backward compat
          goal: Array.isArray(answers.goal) ? answers.goal.join(', ') : answers.goal,
          budget: answers.budget,
          platform: Array.isArray(answers.platform) ? answers.platform.join(', ') : answers.platform,
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

  if (viewMode === 'results') {
    const resultsMaxW = aspectBucket === 'ultrawide' ? 'max-w-7xl' : aspectBucket === 'portrait' ? 'max-w-4xl' : 'max-w-6xl'

    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className={`mx-auto w-full ${resultsMaxW}`}>
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

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((tool, index) => {
              const toolKey = tool.slug || tool.name || `${tool.name}-${index}`
              const isTopMatch = index === 0

              return (
                <article
                  key={toolKey}
                  className="group relative flex h-full min-w-0 flex-col rounded-2xl border border-line bg-bg-elev p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => navigate(`/tools/${tool.slug || ''}`)}
                    className="flex items-start gap-3 text-left"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg-sunk" aria-hidden="true">
                      <ToolLogo tool={tool} size={36} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-ink">{tool.name}</h3>
                        {isTopMatch && (
                          <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink">★ Best</span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">{tool.category || 'General'}</p>
                    </div>
                  </button>

                  <p className="mt-3 line-clamp-2 text-xs italic leading-snug text-muted">✨ {tool.reason}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-snug text-ink-2">{tool.description}</p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getPricingPillClass(tool.pricing)}`}>
                      {String(tool.pricing || 'Free').toUpperCase()}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-bg-sunk px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-2 ring-1 ring-inset ring-line">
                      {String(tool.platformLabel || 'Web').toUpperCase()}
                    </span>
                  </div>

                  <a
                    href={getToolUrl(tool)}
                    target="_blank"
                    rel={OUTBOUND_REL}
                    className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-xs font-semibold text-bg transition-opacity hover:opacity-90"
                  >
                    Visit Tool
                  </a>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl"><WordReveal>AI Tool Finder Wizard</WordReveal></h1>
          <p className="mt-2 text-sm text-muted sm:text-base">
            Answer {TOTAL_QUESTIONS} quick questions — pick an option and we&apos;ll move you
            to the next automatically. Your matches build live on the right as you go.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.2fr] md:gap-8">
          <div className="flex flex-col gap-3">
            {!hasStarted ? (
              <div className="rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Wizard</p>
                <p className="mt-1 text-sm font-semibold text-ink">Start the tool finder</p>
                <p className="mt-1 text-sm text-muted">
                  Click begin to answer five quick questions and unlock your recommendations.
                </p>
                <Button variant="primary" size="sm" className="mt-3" onClick={handleStartWizard}>
                  Begin wizard
                </Button>
              </div>
            ) : (
              QUESTIONS.map((question, idx) => (
                <QuestionRow
                  key={question.id}
                  index={idx + 1}
                  question={question}
                  answer={answers[question.id]}
                  isActive={activeQuestion === question.id}
                  onActivate={() => setActiveQuestion(question.id)}
                  onSelect={(value) => handleQuestionSelect(question, value)}
                  onTextChange={(value) => writeAnswer(question.id, value)}
                  onNext={() => handleQuestionContinue(question)}
                />
              ))
            )}

            {hasStarted && !activeQuestion ? (
              <div className="rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
                <p className="text-sm font-semibold text-ink">You&apos;re all set ✓</p>
                <p className="mt-0.5 text-sm text-muted">
                  {canSeeResults
                    ? 'Your matches are ready — open the full list whenever you want.'
                    : 'Pick a goal and your level above to unlock your full results.'}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-3"
                  disabled={!canSeeResults}
                  onClick={() => setViewMode('results')}
                >
                  See full results →
                </Button>
              </div>
            ) : null}
          </div>

          <LivePreview
            answers={answers}
            results={results}
            loading={loadingResults}
            error={error}
            canSeeResults={canSeeResults}
            onSeeResults={() => setViewMode('results')}
          />
        </div>
      </section>
    </div>
  )
}

export default ToolFinderPage
