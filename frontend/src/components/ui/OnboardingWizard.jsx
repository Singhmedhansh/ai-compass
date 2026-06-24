import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, Check, Code, MessageSquare, Search, Briefcase, Image, 
  Video, Mic, Sparkles, Loader2, ChevronLeft, ChevronRight, BookOpen
} from 'lucide-react'

const MotionDiv = motion.div

const CATEGORIES = [
  { id: 'Coding', label: 'Coding', icon: Code },
  { id: 'Writing & Chat', label: 'Writing & Chat', icon: MessageSquare },
  { id: 'Research', label: 'Research', icon: Search },
  { id: 'Productivity', label: 'Productivity', icon: Briefcase },
  { id: 'Image Generation', label: 'Image Gen', icon: Image },
  { id: 'Video Generation', label: 'Video Gen', icon: Video },
  { id: 'Audio & Voice', label: 'Audio & Voice', icon: Mic }
]

const GOALS = [
  { id: 'Academic Writing', label: 'Writing papers & essays' },
  { id: 'Software Projects', label: 'Building apps & coding' },
  { id: 'Visual Design', label: 'Creating graphics & art' },
  { id: 'Voiceovers & Podcasts', label: 'Editing audio & speech' },
  { id: 'Study Planning', label: 'Workspace & task management' },
  { id: 'Literature Review', label: 'Reading & scraping citations' }
]

const SKILL_LEVELS = [
  { id: 'beginner', label: 'Beginner', desc: 'Just starting out with AI tools' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Know standard tools like ChatGPT' },
  { id: 'advanced', label: 'Advanced', desc: 'Comfortable with custom models & integrations' }
]

const PRICING_PREFS = [
  { id: 'free', label: 'Free only', desc: 'Show only 100% free software' },
  { id: 'freemium', label: 'Freemium', desc: 'Free tiers with premium upgrades' },
  { id: 'paid', label: 'Paid/Commercial', desc: 'Show specialized premium engines' }
]

export default function OnboardingWizard() {
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  
  // Selection States
  const [selectedInterests, setSelectedInterests] = useState([])
  const [selectedGoals, setSelectedGoals] = useState([])
  const [selectedSkill, setSelectedSkill] = useState('intermediate')
  const [selectedPricing, setSelectedPricing] = useState('freemium')

  useEffect(() => {
    // Check if user is logged in and needs onboarding
    const checkOnboardingNeeded = () => {
      try {
        const storedUser = JSON.parse(localStorage.getItem('user'))
        if (storedUser && storedUser.onboarding_completed === false) {
          setActive(true)
        } else {
          setActive(false)
        }
      } catch (e) {
        setActive(false)
      }
    }

    // Run check initially
    checkOnboardingNeeded()

    // Add listener for state changes
    window.addEventListener('userLoggedIn', checkOnboardingNeeded)
    return () => {
      window.removeEventListener('userLoggedIn', checkOnboardingNeeded)
    }
  }, [])

  const handleInterestToggle = (id) => {
    setSelectedInterests(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const handleGoalToggle = (id) => {
    setSelectedGoals(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const handleNext = () => {
    // Guard against rapid clicks: ignore if already saving or mid-transition
    if (saving || transitioning) return
    if (step < 2) {
      setTransitioning(true)
      setStep(prev => prev + 1)
      // AnimatePresence exit animation is ~200ms; re-enable after it clears
      setTimeout(() => setTransitioning(false), 300)
    } else {
      handleSubmit()
    }
  }

  const handleBack = () => {
    if (saving || transitioning) return
    if (step > 0) {
      setTransitioning(true)
      setStep(prev => prev - 1)
      setTimeout(() => setTransitioning(false), 300)
    }
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/v1/profile/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          interests: selectedInterests,
          goals: selectedGoals,
          skill_level: selectedSkill,
          pricing_pref: selectedPricing
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save preferences')
      }

      const updatedUser = await response.json()
      
      // Merge with existing local user
      const localUser = JSON.parse(localStorage.getItem('user')) || {}
      const mergedUser = { ...localUser, ...updatedUser }
      
      localStorage.setItem('user', JSON.stringify(mergedUser))
      
      // Dispatch events to notify other components (dashboard recommendations will reload)
      window.dispatchEvent(new Event('userLoggedIn'))
      window.dispatchEvent(new Event('onboardingCompleted'))
      
      setActive(false)
    } catch (err) {
      console.error('[OnboardingWizard] Submission error:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleDismiss = () => {
    // Allow users to dismiss/skip by marking onboarding completed (or just close modal)
    setActive(false)
  }

  if (!active) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <MotionDiv
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-md"
      />

      {/* Modal Card */}
      <MotionDiv
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-line glass-card p-6 md:p-8 shadow-2xl text-ink"
        style={{ borderColor: 'rgba(230, 229, 222, 0.4)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line/40 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">Personalize Dashboard</span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-full p-1 text-muted hover:bg-bg-sunk hover:text-ink transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Dynamic step rendering */}
        <AnimatePresence mode="wait">
          {step === 0 && (
            <MotionDiv
              key="step-interests"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h3 className="text-xl font-bold tracking-tight text-ink">What tools are you looking for?</h3>
                <p className="text-sm text-muted mt-1">Select the categories that match your interest to custom-fit your homepage.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const isSelected = selectedInterests.includes(cat.id)
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleInterestToggle(cat.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                        isSelected 
                          ? 'border-accent bg-accent-soft/20 text-accent-ink font-semibold' 
                          : 'border-line bg-bg-sunk hover:border-line-strong hover:bg-bg-elev text-ink'
                      }`}
                    >
                      <Icon className={`h-6 w-6 mb-2 ${isSelected ? 'text-accent' : 'text-muted'}`} />
                      <span className="text-xs">{cat.label}</span>
                    </button>
                  )
                })}
              </div>
            </MotionDiv>
          )}

          {step === 1 && (
            <MotionDiv
              key="step-goals"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h3 className="text-xl font-bold tracking-tight text-ink">What are your primary goals?</h3>
                <p className="text-sm text-muted mt-1">We will optimize recommendations to help you achieve these milestones.</p>
              </div>

              <div className="space-y-2 pt-2">
                {GOALS.map((goal) => {
                  const isSelected = selectedGoals.includes(goal.id)
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => handleGoalToggle(goal.id)}
                      className={`flex w-full items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                        isSelected 
                          ? 'border-accent bg-accent-soft/10 text-accent-ink font-semibold' 
                          : 'border-line bg-bg-sunk hover:border-line-strong hover:bg-bg-elev text-ink'
                      }`}
                    >
                      <span className="text-sm">{goal.label}</span>
                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                        isSelected ? 'border-accent bg-accent text-white' : 'border-line-strong'
                      }`}>
                        {isSelected && <Check className="h-3.5 w-3.5" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            </MotionDiv>
          )}

          {step === 2 && (
            <MotionDiv
              key="step-prefs"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-4"
            >
              <div>
                <h3 className="text-xl font-bold tracking-tight text-ink">Calibrate skill &amp; pricing</h3>
                <p className="text-sm text-muted mt-1">Fine-tune the complexity and budget of suggested software.</p>
              </div>

              <div className="space-y-4 pt-2">
                {/* Skill Selector */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted mb-2 block">Skill Level</span>
                  <div className="grid grid-cols-3 gap-2">
                    {SKILL_LEVELS.map((level) => (
                      <button
                        key={level.id}
                        type="button"
                        onClick={() => setSelectedSkill(level.id)}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          selectedSkill === level.id 
                            ? 'border-accent bg-accent-soft/20 text-accent-ink font-semibold' 
                            : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink'
                        }`}
                      >
                        <span className="text-xs font-bold block">{level.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pricing Selector */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-muted mb-2 block">Budget Preference</span>
                  <div className="space-y-2">
                    {PRICING_PREFS.map((pref) => (
                      <button
                        key={pref.id}
                        type="button"
                        onClick={() => setSelectedPricing(pref.id)}
                        className={`flex w-full items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                          selectedPricing === pref.id 
                            ? 'border-accent bg-accent-soft/10 text-accent-ink' 
                            : 'border-line bg-bg-sunk hover:bg-bg-elev text-ink'
                        }`}
                      >
                        <div>
                          <span className="text-sm font-semibold block">{pref.label}</span>
                          <span className="text-xs text-muted mt-0.5 block">{pref.desc}</span>
                        </div>
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                          selectedPricing === pref.id ? 'border-accent bg-accent text-white' : 'border-line-strong'
                        }`}>
                          {selectedPricing === pref.id && <Check className="h-3.5 w-3.5" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>

        {/* Footer Navigation */}
        <div className="flex w-full items-center justify-between mt-6 gap-3 pt-4 border-t border-line/40">
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs font-semibold text-muted hover:text-ink transition-colors"
          >
            Skip for now
          </button>

          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={saving || transitioning}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-sunk px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-line transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              disabled={saving || transitioning}
              className="inline-flex items-center gap-1 rounded-full bg-accent px-5 py-1.5 text-xs font-semibold text-white hover:opacity-90 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                </>
              ) : step === 2 ? (
                <>
                  Get Started <ChevronRight className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </MotionDiv>
    </div>
  )
}
