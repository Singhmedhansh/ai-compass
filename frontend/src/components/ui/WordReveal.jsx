import { motion } from 'framer-motion'

const MotionSpan = motion.span

const containerVariants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.25,
    },
  },
}

const wordVariants = {
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      ease: [0.16, 1, 0.3, 1],
    },
  },
}

export default function WordReveal({ children, className = '' }) {
  if (typeof children !== 'string') {
    return <span className={className}>{children}</span>
  }

  const words = children.split(' ').filter(Boolean)

  return (
    <MotionSpan
      className={className}
      variants={containerVariants}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: '-10% 0px' }}
      style={{ display: 'inline-block' }}
    >
      {words.flatMap((word, i) => [
        <MotionSpan
          key={`w-${i}`}
          variants={wordVariants}
          // inline-block is required so the Y transform actually applies — inline elements ignore transforms
          style={{ display: 'inline-block' }}
        >
          {word}
        </MotionSpan>,
        i < words.length - 1 ? ' ' : null,
      ])}
    </MotionSpan>
  )
}
