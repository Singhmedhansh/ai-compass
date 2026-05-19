import { motion } from 'framer-motion'

import { Card } from '../ui'
import { staggerChild, staggerParent } from '../../lib/motion'

const MotionDiv = motion.div

export default function FlatToolGrid({ tools }) {
  return (
    <MotionDiv
      variants={staggerParent}
      initial="initial"
      animate="animate"
      className="tools-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {tools.map((tool, i) => (
        <MotionDiv
          key={tool.slug || tool.name}
          variants={staggerChild}
          custom={Math.min(i, 11) * 0.04}
        >
          <Card tool={tool} />
        </MotionDiv>
      ))}
    </MotionDiv>
  )
}
