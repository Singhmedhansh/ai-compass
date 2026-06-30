import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Check, Code, MessageSquare, Search, Briefcase, Image,
  Video, Mic, Sparkles, Loader2, ChevronLeft, ChevronRight,
  BookOpen, Compass, Zap, Users, ArrowRight
} from 'lucide-react'

const MotionDiv = motion.div

// ─── Data ────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'Coding',           label: 'Coding',        icon: Code },
  { id: 'Writing & Chat',   label: 'Writing & Chat', icon: MessageSquare },
  { id: 'Research',         label: 'Research',       icon: Search },
  { id: 'Productivity',     label: 'Productivity',   icon: Briefcase },
  { id: 'Image Generation', label: 'Image Gen',      icon: Image },
  { id: 'Video Generation', label: 'Video Gen',      icon: Video },
  { id: 'Audio & Voice',    label: 'Audio & Voice',  icon: Mic },
  { id: 'Education',        label: 'Education',      icon: BookOpen },
]

const GOALS = [
  { id: 'Academic Writing',       label: 'Writing papers & essays' },
  { id: 'Software Projects',      label: 'Building apps & coding' },
  { id: 'Visual Design',          label: 'Creating graphics & art' },
  { id: 'Voiceovers & Podcasts',  label: 'Editing audio & speech' },
  { id: 'Study Planning',         label: 'Workspace & task management' },
  { id: 'Literature Review',      label: 'Reading & scraping citations' },
]

const SKILL_LEVELS = [
  { id: 'beginner',     label: 'Beginner',      desc: 'Just starting out with AI tools' },
  { id: 'intermediate', label: 'Intermediate',  desc: 'Know standard tools like ChatGPT' },
  { id: 'advanced',     label: 'Advanced',      desc: 'Comfortable with APIs & integrations' },
]

const PRICING_PREFS = [
  { id: 'free',      label: 'Free only',         desc: 'Show only 100% free software' },
  { id: 'freemium',  label: 'Freemium',           desc: 'Free tiers with premium upgrades' },
  { id: 'paid',      label: 'Paid / Commercial',  desc: 'Show specialized premium engines' },
]

// Steps: 0 = welcome, 1 = interests, 2 = goals, 3 = skill & pricing
const TOTAL_CONTENT_STEPS = 3   // steps after welcome (1, 2, 3)
const SESSION_SKIP_KEY = 'onboarding_skipped_session'

// ─── Slide animation variants ─────────────────────────────────────────────────

const slideVariants = {
  enter: (dir) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
  exit:   (dir) => ({ opacity: 0, x: dir > 0 ? -40 : 40, transition: { duration: 0.18 } }),
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ currentStep }) {
  // currentStep: 1, 2, 3 (welcome=0 has no bar)
  const pct = (currentStep / TOTAL_CONTENT_STEPS) * 100
  return (
    <div className="w-full h-1 bg-bg-sunk rounded-full overflow-hidden mb-5">
      <motion.div
        className="h-full rounded-full bg-accent"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

function StepLabel({ step }) {
  const labels = ['What you need', 'Your goals', 'Your level']
  return (
    <span className="text-xs font-semibold text-muted uppercase tracking-widest">
      Step {step} of {TOTAL_CONTENT_STEPS} &mdash; {labels[step - 1]}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingWizard() {
  const [active, setActive]               = useState(false)
  const [userName, setUserName]           = useState('')
  const [step, setStep]                   = useState(0)   // 0 = welcome
  const [direction, setDirection]         = useState(1)   // 1 = forward, -1 = back
  const [saving, setSaving]               = useState(false)
  const [transitioning, setTransitioning] = useState(false)

  // Selections
  const [selectedInterests, setSelectedInterests] = useState([])
  const [selectedGoals, setSelectedGoals]         = useState([])
  const [selectedSkill, setSelectedSkill]         = useState('intermediate')
  const [selectedPricing, setSelectedPricing]     = useState('freemium')

  // ── Trigger logic ────────────────────────────────────────────────────────
  const checkOnboarding = () => {
    try {
      // Don't show if user already skipped this browser session
      if (sessionStorage.getItem(SESSION_SKIP_KEY)) return

      const storedUser = JSON.parse(localStorage.getItem('user'))
      if (storedUser && storedUser.onboarding_completed === false) {
        setUserName((storedUser.name || '').split(' ')[0] || '')
        setActive(true)
        setStep(0)
      } else {
        setActive(false)
      }
    } catch {
      setActive(false)
    }
  }

  useEffect(() => {
    checkOnboarding()
    window.addEventListener('userLoggedIn', checkOnboarding)
    return () => window.removeEventListener('userLoggedIn', checkOnboarding)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Navigation ───────────────────────────────────────────────────────────
  const goTo = (nextStep) => {
    if (saving || transitioning) return
    setDirection(nextStep > step ? 1 : -1)
    setTransitioning(true)
    setStep(nextStep)
    setTimeout(() => setTransitioning(false), 300)
  }

  const handleNext = () => {
    if (step < 3) goTo(step + 1)
    else handleSubmit()
  }
  const handleBack = () => {
    if (step > 0) goTo(step - 1)
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/v1/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interests:    selectedInterests,
          goals:        selectedGoals,
          skill_level:  selectedSkill,
          pricing_pref: selectedPricing,
        }),
      })

      if (!res.ok) throw new Error('Failed to save preferences')

      const updatedUser = await res.json()
      const localUser   = JSON.parse(localStorage.getItem('user')) || {}
      localStorage.setItem('user', JSON.stringify({ ...localUser, ...updatedUser }))

      // PostHog event
      if (window.posthog) {
        window.posthog.capture('onboarding_completed', {
          interests:    selectedInterests,
          goals:        selectedGoals,
          skill_level:  selectedSkill,
          pricing_pref: selectedPricing,
        })
      }

      window.dispatchEvent(new Event('userLoggedIn'))
      window.dispatchEvent(new Event('onboardingCompleted'))
      setActive(false)
    } catch (err) {
      console.error('[OnboardingWizard] Submission error:', err)
    } finally {
      setSaving(false)
    }
  }

  // ── Skip ─────────────────────────────────────────────────────────────────
  const handleSkip = () => {
    // Mark skip for this browser session only — wizard will re-appear on next login
    sessionStorage.setItem(SESSION_SKIP_KEY, '1')
    if (window.posthog) window.posthog.capture('onboarding_skipped', { at_step: step })
    setActive(false)
  }

  // ── Toggle helpers ────────────────────────────────────────────────────────
  const toggleInterest = (id) =>
    setSelectedInterests(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const toggleGoal = (id) =>
    setSelectedGoals(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  if (!active) return null

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <MotionDiv
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-md"
        onClick={handleSkip}
      />

      {/* Modal */}
      <MotionDiv
        initial={{ opacity: 0, scale: 0.95, y: 24 }}
        animate={{ opacity: 1, scale: 1,    y: 0,  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-line/40 glass-card shadow-2xl text-ink"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">
              {step === 0 ? 'Welcome to AI Compass' : <StepLabel step={step} />}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-full p-1.5 text-muted hover:bg-bg-sunk hover:text-ink transition-colors"
            aria-label="Skip onboarding"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar (hidden on welcome step) */}
        <div className="px-6 pt-3">
          {step > 0 && <ProgressBar currentStep={step} />}
        </div>

        {/* Step Content */}
        <div className="px-6 pb-6 pt-1 min-h-[320px]">
          <AnimatePresence mode="wait" custom={direction}>

            {/* ── Step 0: Welcome ── */}
            {step === 0 && (
              <MotionDiv
                key="step-welcome"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="flex flex-col items-center text-center pt-4 pb-2 gap-5"
              >
                {/* Compass icon */}
                <div className="flex items-center justify-center w-20 h-20 rounded-3xl bg-accent/10 border border-accent/20">
                  <Compass className="h-10 w-10 text-accent" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-ink">
                    {userName ? `Hey ${userName}! 👋` : 'Welcome aboard! 👋'}
                  </h2>
                  <p className="text-sm text-muted mt-2 max-w-sm mx-auto leading-relaxed">
                    AI Compass has <span className="font-semibold text-ink">400+ hand-tested AI tools</span>. 
                    Answer 3 quick questions and we&apos;ll personalize your entire experience.
                  </p>
                </div>

                {/* Feature pills */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    { icon: Zap,     text: 'Personalized recommendations' },
                    { icon: BookOpen, text: 'Curated for students' },
                    { icon: Users,   text: 'Free to use forever' },
                  ].map(({ icon: Icon, text }) => (
                    <span key={text} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-sunk border border-line text-xs text-ink-2">
                      <Icon className="h-3 w-3 text-accent" />
                      {text}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 shadow-lg shadow-accent/20 transition-all"
                >
                  Let&apos;s go <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={handleSkip}
                  className="text-xs text-muted hover:text-ink transition-colors"
                >
                  Skip for now
                </button>
              </MotionDiv>
            )}

            {/* ── Step 1: Interests ── */}
            {step === 1 && (
              <MotionDiv
                key="step-interests"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-4"
              >
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-ink">What tools are you looking for?</h3>
                  <p className="text-sm text-muted mt-1">Pick all that apply — we&apos;ll surface more relevant tools.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon
                    const sel  = selectedInterests.includes(cat.id)
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleInterest(cat.id)}
                        className={`relative flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                          sel
                            ? 'border-accent bg-accent/10 text-accent-ink font-semibold'
                            : 'border-line bg-bg-sunk hover:border-line-strong hover:bg-bg-elev text-ink'
                        }`}
                      >
                        {sel && (
                          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                        <Icon className={`h-5 w-5 mb-1.5 ${sel ? 'text-accent' : 'text-muted'}`} />
                        <span className="text-xs leading-tight">{cat.label}</span>
                      </button>
                    )
                  })}
                </div>
              </MotionDiv>
            )}

            {/* ── Step 2: Goals ── */}
            {step === 2 && (
              <MotionDiv
                key="step-goals"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-4"
              >
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-ink">What are your primary goals?</h3>
                  <p className="text-sm text-muted mt-1">We&apos;ll optimize recommendations to match your workflow.</p>
                </div>
                <div className="space-y-2">
                  {GOALS.map((goal) => {
                    const sel = selectedGoals.includes(goal.id)
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => toggleGoal(goal.id)}
                        className={`flex w-full items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                          sel
                            ? 'border-accent bg-accent/10 text-accent-ink font-semibold'
                            : 'border-line bg-bg-sunk hover:border-line-strong hover:bg-bg-elev text-ink'
                        }`}
                      >
                        <span className="text-sm">{goal.label}</span>
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all flex-shrink-0 ${
                          sel ? 'border-accent bg-accent text-white' : 'border-line-strong bg-bg'
                        }`}>
                          {sel && <Check className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </MotionDiv>
            )}

            {/* ── Step 3: Skill & Pricing ── */}
            {step === 3 && (
              <MotionDiv
                key="step-prefs"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="space-y-5"
              >
                <div>
                  <h3 className="text-xl font-bold tracking-tight text-ink">Calibrate skill &amp; budget</h3>
                  <p className="text-sm text-muted mt-1">Fine-tune complexity and pricing of suggested tools.</p>
                </div>

                {/* Skill */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted mb-2 block">Skill Level</span>
                  <div className="grid grid-cols-3 gap-2">
                    {SKILL_LEVELS.map((level) => {
                      const sel = selectedSkill === level.id
                      return (
                        <button
                          key={level.id}
                          type="button"
                          onClick={() => setSelectedSkill(level.id)}
                          className={`p-3 rounded-2xl border text-center transition-all ${
                            sel
                              ? 'border-accent bg-accent/10 text-accent-ink'
                              : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink'
                          }`}
                        >
                          <span className="text-xs font-bold block">{level.label}</span>
                          <span className="text-[10px] text-muted mt-0.5 block leading-tight">{level.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Pricing */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted mb-2 block">Budget Preference</span>
                  <div className="space-y-2">
                    {PRICING_PREFS.map((pref) => {
                      const sel = selectedPricing === pref.id
                      return (
                        <button
                          key={pref.id}
                          type="button"
                          onClick={() => setSelectedPricing(pref.id)}
                          className={`flex w-full items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                            sel
                              ? 'border-accent bg-accent/10 text-accent-ink'
                              : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink'
                          }`}
                        >
                          <div>
                            <span className="text-sm font-semibold block">{pref.label}</span>
                            <span className="text-xs text-muted mt-0.5 block">{pref.desc}</span>
                          </div>
                          <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all flex-shrink-0 ${
                            sel ? 'border-accent bg-accent text-white' : 'border-line-strong bg-bg'
                          }`}>
                            {sel && <Check className="h-3.5 w-3.5" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </MotionDiv>
            )}

          </AnimatePresence>
        </div>

        {/* Footer nav — hidden on welcome step (it has its own CTA) */}
        {step > 0 && (
          <div className="flex w-full items-center justify-between px-6 pb-5 pt-2 border-t border-line/30 gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs font-semibold text-muted hover:text-ink transition-colors"
            >
              Skip for now
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={saving || transitioning}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-sunk px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-line transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>

              <button
                type="button"
                onClick={handleNext}
                disabled={saving || transitioning}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-5 py-1.5 text-xs font-semibold text-white hover:opacity-90 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...</>
                ) : step === 3 ? (
                  <>Finish <Check className="h-3.5 w-3.5" /></>
                ) : (
                  <>Next <ChevronRight className="h-3.5 w-3.5" /></>
                )}
              </button>
            </div>
          </div>
        )}
      </MotionDiv>
    </div>
  )
}
