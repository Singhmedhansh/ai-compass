import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Compass, Sparkles, Layers, HelpCircle, Check, HelpCircle as HelpIcon } from 'lucide-react'

const MotionDiv = motion.div

const ALLOWED_TOUR_PAGES = ['/', '/tools', '/ai-tool-finder']

export default function OnboardingTour() {
  const location = useLocation()
  const [active, setActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  // Start tour manually or auto-start for new visitors on allowed entry pages
  useEffect(() => {
    const tourCompleted = localStorage.getItem('ai-compass-tour-completed') === 'true'
    const isAllowedPage = ALLOWED_TOUR_PAGES.includes(location.pathname)
    
    if (!tourCompleted && isAllowedPage) {
      // Small delay to let initial page animations finish
      const timer = setTimeout(() => {
        setActive(true)
        setCurrentStep(0)
      }, 1200)
      return () => clearTimeout(timer)
    }
  }, [location.pathname])

  // Listener for manual tour trigger
  useEffect(() => {
    const handleStartTour = () => {
      setActive(true)
      setCurrentStep(0)
    }

    window.addEventListener('ai-compass-start-tour', handleStartTour)
    return () => {
      window.removeEventListener('ai-compass-start-tour', handleStartTour)
    }
  }, [])

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1)
    } else {
      handleComplete()
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleComplete = () => {
    setActive(false)
    localStorage.setItem('ai-compass-tour-completed', 'true')
  }

  if (!active) return null

  const steps = [
    {
      title: 'Welcome to AI Compass',
      description: 'Discover curated, free, and student-friendly AI tools. Let us take a quick 4-step tour of the platform features to help you get started.',
      icon: Compass,
      renderIllustration: () => (
        <div className="flex h-32 w-full items-center justify-center rounded-2xl border border-line/40 bg-bg-sunk/30 relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-gradient(circle_at_center,rgba(22,131,88,0.1),transparent_70%)" />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 25, ease: 'linear' }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent-ink shadow-sm"
          >
            <Compass className="h-8 w-8" />
          </motion.div>
        </div>
      )
    },
    {
      title: 'AI Stack Architect',
      description: 'Answer a few simple questions about your goals, budget, and platforms, and our matching algorithm will build a tailored recommendation stack with confidence scores.',
      icon: Sparkles,
      renderIllustration: () => (
        <div className="flex flex-col h-32 w-full p-4 justify-between rounded-2xl border border-line/40 bg-bg-sunk/30 overflow-hidden text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Wizard Recommendation</span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-ink">96% Match</span>
          </div>
          <div className="space-y-1.5 my-2">
            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-accent-soft text-accent-ink"><Check className="h-2.5 w-2.5" /></span>
              <span>Goal Alignment: Curated category match</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-ink-2">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-accent-soft text-accent-ink"><Check className="h-2.5 w-2.5" /></span>
              <span>Pricing Plan: Budget calibrated</span>
            </div>
          </div>
          <div className="h-1.5 w-full rounded-full bg-line-strong overflow-hidden">
            <div className="h-full w-[96%] bg-accent rounded-full" />
          </div>
        </div>
      )
    },
    {
      title: 'Compare Side-by-Side',
      description: 'Add up to 3 tools from any search or list view to your Compare Tray, then compare pricing plans, features, and platform limits side-by-side in a single matrix.',
      icon: Layers,
      renderIllustration: () => (
        <div className="flex h-32 w-full items-center justify-center gap-2 p-3 rounded-2xl border border-line/40 bg-bg-sunk/30 overflow-hidden">
          <div className="w-1/3 h-full rounded-xl border border-line bg-bg-elev p-2 flex flex-col justify-between text-left shadow-sm">
            <span className="text-[10px] font-bold text-ink">Claude</span>
            <div className="h-1 bg-line rounded-full w-3/4" />
            <span className="text-[9px] text-accent font-semibold">Free Tier</span>
          </div>
          <div className="w-1/3 h-full rounded-xl border border-accent bg-accent-soft/20 p-2 flex flex-col justify-between text-left shadow-sm relative">
            <span className="text-[10px] font-bold text-ink">ChatGPT</span>
            <div className="h-1 bg-accent rounded-full w-2/3" />
            <span className="text-[9px] text-accent-ink font-semibold">Freemium</span>
          </div>
          <div className="w-1/3 h-full rounded-xl border border-line bg-bg-elev p-2 flex flex-col justify-between text-left shadow-sm">
            <span className="text-[10px] font-bold text-ink">Gemini</span>
            <div className="h-1 bg-line rounded-full w-4/5" />
            <span className="text-[9px] text-accent font-semibold">Free Tier</span>
          </div>
        </div>
      )
    },
    {
      title: 'FAQ & Support',
      description: 'Our FAQ & Support page houses articles covering student discount filters, limits, and pricing. If you ever run a search returning 0 results, our proactive prompt will guide you to resources.',
      icon: HelpCircle,
      renderIllustration: () => (
        <div className="flex h-32 w-full items-center gap-3 p-4 rounded-2xl border border-line/40 bg-bg-sunk/30 overflow-hidden relative">
          {/* Mock Proactive Prompt */}
          <div className="w-full rounded-xl border border-line bg-bg-elev p-3 shadow-md text-left flex items-start gap-2 backdrop-blur">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-accent-ink">Need Help?</span>
              <p className="text-[10px] leading-tight text-ink-2 mt-0.5">Could not find what you are looking for?</p>
            </div>
          </div>
        </div>
      )
    }
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Dimmed backdrop */}
      <MotionDiv
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleComplete}
      />

      {/* Onboarding Dialog Card */}
      <MotionDiv
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-line glass-card p-6 md:p-8 shadow-2xl text-ink"
        style={{
          borderColor: 'rgba(230, 229, 222, 0.5)'
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleComplete}
          aria-label="Dismiss tour"
          className="absolute right-4 top-4 rounded-full p-1 text-muted hover:bg-bg-sunk hover:text-ink transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Tour content layout */}
        <div className="flex flex-col gap-4 text-center items-center">
          {/* Step illustration */}
          <div className="w-full my-2">
            {steps[currentStep].renderIllustration()}
          </div>

          {/* Heading */}
          <h3 className="text-xl font-bold text-ink tracking-tight mt-2">
            {steps[currentStep].title}
          </h3>

          {/* Description */}
          <p className="text-sm text-ink-2 leading-relaxed max-w-sm">
            {steps[currentStep].description}
          </p>

          {/* Pagination Indicators */}
          <div className="flex gap-1.5 mt-3 justify-center">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentStep === i ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'
                }`}
              />
            ))}
          </div>

          {/* Action Row */}
          <div className="flex w-full items-center justify-between mt-6 gap-3 pt-4 border-t border-line/40">
            <button
              type="button"
              onClick={handleComplete}
              className="text-xs font-semibold text-muted hover:text-ink"
            >
              Skip Tour
            </button>

            <div className="flex gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-bg-sunk px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 shadow-sm transition-all"
              >
                {currentStep === 3 ? 'Finish' : 'Next'} <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </MotionDiv>
    </div>
  )
}
