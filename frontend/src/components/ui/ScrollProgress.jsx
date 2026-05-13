import { motion, useScroll, useSpring } from 'framer-motion'

const MotionDiv = motion.div

// Thin accent line bound to scroll progress. Always rendered; on short
// pages it just snaps to 100% with no visible animation. Reduced-motion
// gating happens via the App-level <MotionConfig reducedMotion="user">.
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  })

  return (
    <MotionDiv
      style={{ scaleX, transformOrigin: 'left center' }}
      className="pointer-events-none fixed left-0 right-0 top-0 z-50 h-[2px] bg-accent"
      aria-hidden="true"
    />
  )
}
