import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Cookie } from 'lucide-react'

const MotionDiv = motion.div

const bannerVariants = {
  initial: { opacity: 0, y: 50, scale: 0.95, x: '-50%' },
  animate: { 
    opacity: 1, 
    y: 0, 
    scale: 1, 
    x: '-50%', 
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } 
  },
  exit: { 
    opacity: 0, 
    y: 30, 
    scale: 0.95, 
    x: '-50%', 
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } 
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('ai_compass_cookie_consent')
    if (consent !== 'granted' && consent !== 'declined') {
      // Small delayed mount to feel natural and let other components render
      const timer = setTimeout(() => {
        setVisible(true)
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('ai_compass_cookie_consent', 'granted')
    setVisible(false)
  }

  const handleDecline = () => {
    localStorage.setItem('ai_compass_cookie_consent', 'declined')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <MotionDiv
          variants={bannerVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl rounded-token-lg border border-line dark:border-[#1f1f1f] bg-bg-elev/95 backdrop-blur-md p-4 md:py-3.5 md:px-5 shadow-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Cookie className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm leading-relaxed text-ink">
              We strictly use essential session tokens and minimal telemetry to optimize your tool search workflows. Learn more in our{' '}
              <Link
                to="/privacy"
                className="font-medium text-accent hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleDecline}
              className="w-full sm:w-auto px-4 py-2 text-sm font-semibold rounded-token border border-line bg-transparent text-muted hover:text-ink hover:bg-bg-sunk transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg focus-visible:ring-accent text-center"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={handleAccept}
              className="w-full sm:w-auto px-5 py-2 text-sm font-semibold rounded-token bg-[#10b981] text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] focus-visible:ring-offset-2 focus-visible:ring-offset-bg transition-all shrink-0 shadow-sm text-center"
            >
              Accept
            </button>
          </div>
        </MotionDiv>
      )}
    </AnimatePresence>
  )
}
