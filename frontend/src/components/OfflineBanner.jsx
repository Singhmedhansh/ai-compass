import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'

// ESLint in this repo doesn't recognise JSX namespaced tags (<MotionDiv>)
// as usage, so we alias to a constant. Same pattern as FeedbackWidget.
const MotionDiv = motion.div

// Tiny global banner that pops up when the browser flips to offline and
// disappears the moment it's back online. Mounted once at the App root
// so every route gets it for free. Sits at z-[55]: above the sticky
// navbar (z-50) so it's actually visible, below the feedback modal
// backdrop (z-[60]) so a modal still owns focus when one is open.
export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <AnimatePresence>
      {!online && (
        <MotionDiv
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-3 z-[55] flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/40 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-lg backdrop-blur dark:bg-amber-500/10 dark:text-amber-200"
        >
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          <span>You&apos;re offline — some things may not load.</span>
        </MotionDiv>
      )}
    </AnimatePresence>
  )
}
