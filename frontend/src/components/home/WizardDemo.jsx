import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import MockupChrome from '../ui/MockupChrome'
import chatgptIcon from '../../assets/brand/chatgpt.svg'
import claudeIcon from '../../assets/brand/claude.svg'
import githubCopilotIcon from '../../assets/brand/github-copilot.svg'

// Curated demo data. This is a homepage demo of the *interaction*, not the
// full catalog engine — but every tool/reason here is real and honest, so
// nothing overclaims. Results react to the two driving questions the user
// can actually click: Use case and Budget.
const ICON = { chatgpt: chatgptIcon, claude: claudeIcon, copilot: githubCopilotIcon }
const BRAND = { chatgpt: '#10A37F', claude: '#C96442', copilot: '#1F2328' }

function tile(key, label) {
  // Real SVG when we have it; clean letter tile otherwise (no asset risk).
  if (ICON[key]) {
    return { type: 'svg', src: ICON[key], bg: BRAND[key], alt: label }
  }
  return { type: 'letter', letter: label[0], bg: '#0F5F47' }
}

const USE_CASES = ['Coding', 'Writing', 'Research']
const BUDGETS = ['Free only', 'Freemium', 'Any budget']
const SPECIFIC = { Coding: 'Build a web app', Writing: 'Write essays', Research: 'Review papers' }

// RESULTS[useCase] -> ordered cards. Budget re-orders/relabels (free-first
// when "Free only"), keeping it plausible without a combinatorial dataset.
const RESULTS = {
  Coding: [
    { key: 'chatgpt', name: 'ChatGPT', model: 'GPT-4o mini', free: true,
      why: 'Best free tier for explaining unfamiliar code line-by-line. Strong at "why is this broken?" debugging.' },
    { key: 'claude', name: 'Claude', model: 'Sonnet 4.6', free: true,
      why: 'Reads longer code files than ChatGPT free. Better at refactoring without rewriting your style.' },
    { key: 'copilot', name: 'GitHub Copilot', model: 'students', free: true,
      why: 'Free for verified students via GitHub Education. Inline suggestions in VS Code — the workflow profs expect.' },
    { key: 'cursor', name: 'Cursor', model: 'Pro $20/mo', free: false,
      why: 'Paid, but the tightest agentic editor for multi-file changes once you outgrow free tools.' },
  ],
  Writing: [
    { key: 'chatgpt', name: 'ChatGPT', model: 'GPT-4o mini', free: true,
      why: 'Strongest free all-rounder for drafting and restructuring essays with a clear thesis.' },
    { key: 'claude', name: 'Claude', model: 'Sonnet 4.6', free: true,
      why: 'Best free model for long-form tone control — keeps your voice instead of flattening it.' },
    { key: 'quillbot', name: 'QuillBot', model: 'free tier', free: true,
      why: 'Free paraphrase + grammar pass that catches what spellcheck misses before you submit.' },
    { key: 'grammarly', name: 'Grammarly', model: 'Premium $12/mo', free: false,
      why: 'Paid clarity/structure feedback; worth it only if you write graded work weekly.' },
  ],
  Research: [
    { key: 'notebooklm', name: 'NotebookLM', model: 'free', free: true,
      why: 'Free. Grounds answers in *your* uploaded papers with citations — no hallucinated sources.' },
    { key: 'semantic', name: 'Semantic Scholar', model: 'free', free: true,
      why: 'Free academic search with TLDRs and citation graphs across 200M+ papers.' },
    { key: 'claude', name: 'Claude', model: 'Sonnet 4.6', free: true,
      why: 'Best free model for summarising a dense PDF without dropping the methodology.' },
    { key: 'elicit', name: 'Elicit', model: 'paid tiers', free: false,
      why: 'Paid, but automates literature-review tables if you are screening dozens of papers.' },
  ],
}

function pickResults(useCase, budget) {
  const all = RESULTS[useCase]
  let list = all
  if (budget === 'Free only') list = all.filter((t) => t.free)
  else if (budget === 'Freemium') list = [...all].sort((a, b) => Number(b.free) - Number(a.free))
  return list.slice(0, 3)
}

function budgetPhrase(budget) {
  if (budget === 'Free only') return 'on free tier'
  if (budget === 'Freemium') return 'open to freemium'
  return 'any budget'
}

function useCaseRole(useCase) {
  return useCase === 'Coding' ? 'coder' : useCase === 'Writing' ? 'writer' : 'researcher'
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function WizardDemo() {
  const [useCase, setUseCase] = useState('Coding')
  const [budget, setBudget] = useState('Free only')
  // Reduced-motion users skip the animation and start fully interactive.
  const [phase, setPhase] = useState(() => (prefersReducedMotion() ? 'done' : 'idle'))
  const [cursor, setCursor] = useState({ x: 0, y: 0, pressed: false, visible: false })
  // clicks drives a one-shot ripple (re-keyed each press); flashId is the
  // chip that just got "clicked" so it can pulse.
  const [clicks, setClicks] = useState(0)
  const [flashId, setFlashId] = useState(null)

  const rootRef = useRef(null)
  const chipRefs = useRef({}) // id -> element, for cursor targeting
  const timers = useRef([])
  const startedRef = useRef(false)

  const setChipRef = (id) => (el) => {
    if (el) chipRefs.current[id] = el
  }

  const clearTimers = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  // Move the ghost cursor to the centre of a target chip (coords relative
  // to the mockup root), then optionally simulate a click.
  const moveTo = useCallback((id) => {
    const root = rootRef.current
    const target = chipRefs.current[id]
    if (!root || !target) return
    const r = root.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    setCursor((c) => ({
      ...c,
      visible: true,
      x: t.left - r.left + t.width / 2,
      y: t.top - r.top + t.height / 2,
    }))
  }, [])

  const press = useCallback((targetId) => {
    setCursor((c) => ({ ...c, pressed: true }))
    setClicks((n) => n + 1) // re-mounts the ripple so it replays
    if (targetId) setFlashId(targetId)
    timers.current.push(setTimeout(() => setCursor((c) => ({ ...c, pressed: false })), 180))
    timers.current.push(setTimeout(() => setFlashId(null), 420))
  }, [])

  // Scripted run, then hand control to the user.
  const runDemo = useCallback(() => {
    const seq = [
      [400, () => moveTo('budget-Freemium')],
      [1100, () => { press('budget-Freemium'); setBudget('Freemium') }],
      [2100, () => moveTo('use-Writing')],
      [2800, () => { press('use-Writing'); setUseCase('Writing') }],
      [3900, () => moveTo('budget-Free only')],
      [4600, () => { press('budget-Free only'); setBudget('Free only') }],
      [5400, () => moveTo('use-Coding')],
      [6100, () => { press('use-Coding'); setUseCase('Coding') }],
      [7000, () => { setCursor((c) => ({ ...c, visible: false })); setPhase('done') }],
    ]
    seq.forEach(([delay, fn]) => {
      timers.current.push(setTimeout(fn, delay))
    })
  }, [moveTo, press])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return undefined

    if (prefersReducedMotion()) {
      return undefined // phase already initialised to 'done'
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true
            setPhase('playing')
            runDemo()
          }
        })
      },
      { threshold: 0.45 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      clearTimers()
    }
  }, [runDemo])

  const interactive = phase === 'done'
  const results = pickResults(useCase, budget)
  const doneSteps = 3 // Q1, Q2, Q3 answered in this demo

  const Chip = ({ group, value, current, onPick }) => {
    const id = `${group}-${value}`
    const active = current === value
    const flashing = flashId === id
    return (
      <button
        type="button"
        ref={setChipRef(id)}
        onClick={interactive ? () => onPick(value) : undefined}
        aria-pressed={active}
        disabled={!interactive}
        className={[
          'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs transition-all duration-200',
          active
            ? 'border-accent bg-accent text-white'
            : 'border-line bg-bg text-muted',
          interactive ? 'cursor-pointer hover:border-accent' : 'cursor-default',
        ].join(' ')}
        style={{
          transform: flashing ? 'scale(1.08)' : 'scale(1)',
          animation: flashing ? 'wd-flash .42s ease-out' : undefined,
        }}
      >
        {value}
      </button>
    )
  }

  return (
    <section id="wizard" className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          02 / The wizard, demonstrated
        </div>

        <h2 className="mb-4 max-w-[28ch] text-balance text-[28px] font-semibold leading-[1.15] tracking-tight text-ink md:max-w-[20ch] md:text-[40px]">
          Five questions. Five tools. One reason for each.
        </h2>

        <p className="mb-8 max-w-[52ch] text-pretty text-base text-muted md:text-[17px]">
          This is what the wizard actually does. Not a video — it runs itself once,
          then it&apos;s yours: tap the use case or budget and the right side
          re-ranks in real time.
        </p>

        <MockupChrome
          url="wizard.ai-compass.in"
          ariaLabel="Wizard demonstration"
          stepLabel={<>step <b className="text-accent">{doneSteps}</b> / 5</>}
        >
          <div ref={rootRef} className="relative grid grid-cols-1 md:grid-cols-[1fr_1.2fr]">
            <style>{`
              @keyframes wd-ripple {
                0%   { transform: translate(-50%,-50%) scale(.25); opacity: .55; }
                100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
              }
              @keyframes wd-flash {
                0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--accent) 55%, transparent); }
                100% { box-shadow: 0 0 0 10px color-mix(in oklab, var(--accent) 0%, transparent); }
              }
            `}</style>

            {/* Click ripple — re-mounts each press via key so it replays once */}
            {clicks > 0 && cursor.visible ? (
              <span
                key={clicks}
                aria-hidden="true"
                className="pointer-events-none absolute z-10 h-7 w-7 rounded-full border-2 border-accent"
                style={{
                  left: cursor.x,
                  top: cursor.y,
                  animation: 'wd-ripple .5s ease-out forwards',
                }}
              />
            ) : null}

            {/* Ghost cursor */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-20 transition-[left,top] duration-700 ease-out"
              style={{
                left: cursor.x,
                top: cursor.y,
                opacity: cursor.visible ? 1 : 0,
                transform: `translate(-4px,-2px) scale(${cursor.pressed ? 0.82 : 1})`,
                transition: 'left .7s cubic-bezier(.22,1,.36,1), top .7s cubic-bezier(.22,1,.36,1), opacity .35s, transform .15s',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M3 2l14 6.5-6 1.7-1.7 6L3 2z" fill="var(--ink)" stroke="var(--bg)" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Questions column */}
            <div className="border-b border-line p-5 md:border-b-0 md:border-r md:p-8">
              {/* Q1 — Use case (interactive) */}
              <div className="border-b border-dashed border-line py-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">01</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Use case</span>
                    <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink">
                      <span aria-hidden="true" className="grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded-full bg-accent">
                        <svg viewBox="0 0 14 14" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3.5 7.2 6 9.5l4.5-5" />
                        </svg>
                      </span>
                      {useCase}
                    </span>
                  </div>
                </div>
                <div className="mt-3 ml-[34px] flex max-w-full gap-1.5 overflow-x-auto pb-1.5 scrollbar-none sm:flex-wrap sm:overflow-visible">
                  {USE_CASES.map((v) => (
                    <Chip key={v} group="use" value={v} current={useCase} onPick={setUseCase} />
                  ))}
                </div>
              </div>

              {/* Q2 — Specifics (auto, follows use case) */}
              <div className="border-b border-dashed border-line py-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">02</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Specifics</span>
                    <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink">
                      <span aria-hidden="true" className="grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded-full bg-accent">
                        <svg viewBox="0 0 14 14" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3.5 7.2 6 9.5l4.5-5" />
                        </svg>
                      </span>
                      {SPECIFIC[useCase]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Q3 — Budget (interactive) */}
              <div className="border-b border-dashed border-line py-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">03</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Budget</span>
                    <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-accent-ink">
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-accent"
                        style={{ boxShadow: '0 0 0 3px color-mix(in oklab, var(--accent) 20%, transparent)' }}
                      />
                      {budget}
                    </span>
                  </div>
                </div>
                <div className="mt-3 ml-[34px] flex max-w-full gap-1.5 overflow-x-auto pb-1.5 scrollbar-none sm:flex-wrap sm:overflow-visible">
                  {BUDGETS.map((v) => (
                    <Chip key={v} group="budget" value={v} current={budget} onPick={setBudget} />
                  ))}
                </div>
              </div>

              {/* Q4 — pending */}
              <div className="border-b border-dashed border-line py-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">04</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Platform</span>
                    <span className="text-[15px] font-medium text-muted-2">— pending —</span>
                  </div>
                </div>
              </div>

              {/* Q5 — pending */}
              <div className="py-3.5">
                <div className="flex items-center gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">05</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Level</span>
                    <span className="text-[15px] font-medium text-muted-2">— pending —</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Output column */}
            <div className="bg-bg-sunk p-5 md:p-8">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                  Live preview · {results.length} of 5 shown
                </span>
                {phase === 'playing' ? (
                  <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-accent-ink">
                    auto-demo…
                  </span>
                ) : null}
              </div>

              <p className="mb-[18px] rounded-lg border border-dashed border-line-strong bg-bg-elev px-3 py-2.5 text-[13px] text-ink-2">
                For a <b className="font-medium text-ink">{useCaseRole(useCase)}</b> who wants to{' '}
                <b className="font-medium text-ink">{SPECIFIC[useCase].toLowerCase()}</b>,{' '}
                <b className="font-medium text-ink">{budgetPhrase(budget)}</b>:
              </p>

              {results.map((tool, i) => {
                const t = tile(tool.key, tool.name)
                return (
                  <div
                    key={tool.key}
                    className="mb-2.5 grid grid-cols-[36px_1fr_auto] items-start gap-3 rounded-xl border border-line bg-bg-elev p-3.5"
                  >
                    <div
                      className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white"
                      style={{ background: t.bg }}
                    >
                      {t.type === 'svg' ? (
                        <img
                          src={t.src}
                          alt={t.alt}
                          className="h-5 w-5"
                          style={{ filter: 'brightness(0) invert(1)' }}
                          width="20"
                          height="20"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        t.letter
                      )}
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2 text-sm font-semibold text-ink">
                        {tool.name}{' '}
                        <span className="text-xs font-normal text-muted">
                          {tool.free ? 'free' : 'paid'} · {tool.model}
                        </span>
                      </div>
                      <div className="mt-1 text-[13px] leading-[1.45] text-muted">
                        <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-ink">why</span>
                        {tool.why}
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-2">#{i + 1}</span>
                  </div>
                )
              })}

              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[13px] text-muted">
                <span>+ 2 more in the full result</span>
                <Link
                  to="/ai-tool-finder"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
                >
                  Run with my own answers →
                </Link>
              </div>
            </div>
          </div>
        </MockupChrome>
      </div>
    </section>
  )
}
