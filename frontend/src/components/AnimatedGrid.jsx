import { motion } from 'framer-motion'

const MotionDiv = motion.div

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 100, damping: 15 },
  },
}

export function AnimatedGrid({ children, className }) {
  return (
    <MotionDiv
      className={className}
      variants={container}
      initial="hidden"
      animate="show"
    >
      {children}
    </MotionDiv>
  )
}

export function AnimatedItem({ children }) {
  return <MotionDiv variants={item}>{children}</MotionDiv>
}
