import { motion } from 'framer-motion'

const MotionDiv = motion.div

const variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
}

export default function PageTransition({ children }) {
  return (
    <MotionDiv
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </MotionDiv>
  )
}
