import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

const MotionDiv = motion.div

// strength=0.25 means content moves 25% of cursor offset from center —
// subtle enough to read as polish, not as gimmick. Spring tuning chosen
// to feel "weighty" not "rubbery".
export default function MagneticWrapper({ children, strength = 0.25, className = '' }) {
  const ref = useRef(null)
  const reducedMotion = useReducedMotion()
  const [transform, setTransform] = useState({ x: 0, y: 0 })

  const handleMouseMove = (event) => {
    if (reducedMotion || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (event.clientX - rect.left - rect.width / 2) * strength
    const y = (event.clientY - rect.top - rect.height / 2) * strength
    setTransform({ x, y })
  }

  const handleMouseLeave = () => setTransform({ x: 0, y: 0 })

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`inline-block ${className}`}
    >
      <MotionDiv
        animate={transform}
        transition={{ type: 'spring', stiffness: 200, damping: 20, mass: 0.3 }}
      >
        {children}
      </MotionDiv>
    </div>
  )
}
