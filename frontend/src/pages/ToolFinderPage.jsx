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
    activeHelper: 'Pick the closest match — you can change this anytime.',
    options: GOAL_OPTIONS,
    type: 'chips',
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
    activeHelper: 'Pick the surface you spend most time on.',
    options: PLATFORM_OPTIONS,
    type: 'chips',
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

function articleFor(nextWord = '') {
  return /^[aeiouAEIOU]/.test(nextWord.trim()) ? 'an' : 'a'
}

function buildPersona(answers) {
  const { goal, use_case, budget, platform, level } = answers
  if (!goal && !use_case && !budget && !platform && !level) {
    return null
  }

  const goalNoun = GOAL_NOUN[goal]
  const budgetClause = BUDGET_CLAUSE[budget]
  const platformClause = PLATFORM_CLAUSE[platform]

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

function QuestionRow({ index, question, answer, isActive, onActivate, onSelect, onTextChange, onCollapse }) {
  const indexLabel = String(index).padStart(2, '0')
  const isAnswered = Boolean(answer)

  const answerLabel = (() => {
    if (!isAnswered) return '— pending —'
    if (question.type === 'text') return answer
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
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{question.label}</span>
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
                      onCollapse()
                    }
                  }}
                  maxLength={120}
                  style={{ fontSize: 16 }}
                  autoFocus
                />
                <div className="flex justify-end">
                  <Button variant="primary" size="sm" onClick={onCollapse}>
                    Use this
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{question.activeHelper}</p>
                <div className="flex flex-wrap gap-2">
                  {question.options.map((opt) => {
                    const selected = answer === opt.id
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
  const [activeQuestion, setActiveQuestion] = useState('goal')
  const [viewMode, setViewMode] = useState('wizard')
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

  // Debounced live-preview fetch — fires whenever answers change.
  useEffect(() => {
    const hasGatingAnswer = Boolean(answers.goal || answers.budget || answers.platform || answers.level)
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

  const canSeeResults = Boolean(answers.goal && answers.level)

  const writeAnswer = (key, value) => {
    setAnswers((previous) => ({ ...previous, [key]: value }))
  }

  const handleRestart = () => {
    setAnswers({ goal: '', use_case: '', budget: '', platform: '', level: '' })
    setResults([])
    setError('')
    setActiveQuestion('goal')
    setViewMode('wizard')
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
      const API = import.meta.env.VITE_API_URL || ''
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
                      style={{ cursor: 'pointer' }}
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
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">AI Tool Finder Wizard</h1>
          <p className="mt-2 text-sm text-muted sm:text-base">
            Tap any question to refine your fit. Preview updates in real time.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.2fr] md:gap-8">
          <div className="flex flex-col gap-3">
            {QUESTIONS.map((question, idx) => (
              <QuestionRow
                key={question.id}
                index={idx + 1}
                question={question}
                answer={answers[question.id]}
                isActive={activeQuestion === question.id}
                onActivate={() => setActiveQuestion(question.id)}
                onSelect={(value) => writeAnswer(question.id, value)}
                onTextChange={(value) => writeAnswer(question.id, value)}
                onCollapse={() => setActiveQuestion(null)}
              />
            ))}
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
