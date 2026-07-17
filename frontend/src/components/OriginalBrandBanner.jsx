import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck, X } from 'lucide-react'

const MotionDiv = motion.div

export default function OriginalBrandBanner() {
  const [visible, setVisible] = useState(true)

  return (
    <AnimatePresence>
      {visible && (
        <MotionDiv
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-accent/10 border-b border-accent/20 overflow-hidden"
        >
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-ink dark:text-ink">
              <ShieldCheck className="h-5 w-5 text-accent flex-shrink-0" />
              <p>
                <strong>Welcome to the Official AI Compass.</strong> You are using the original, student-built discovery engine powered by real ML recommendations. Beware of static knock-offs on similar domains!
              </p>
            </div>
            <button 
              onClick={() => setVisible(false)}
              className="p-1 ml-4 text-muted hover:text-ink transition-colors flex-shrink-0"
              aria-label="Dismiss banner"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </MotionDiv>
      )}
    </AnimatePresence>
  )
}
