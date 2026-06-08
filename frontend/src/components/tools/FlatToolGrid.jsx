import clsx from 'clsx'
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
      className="tools-grid grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[minmax(224px,auto)] grid-flow-row-dense"
    >
      {tools.map((tool, i) => {
        // Asymmetric Bento pattern (repeats every 7 items)
        const patternIndex = i % 7
        
        let layoutType = 'standard'
        let colSpanClass = 'col-span-1'
        let rowSpanClass = 'row-span-1'
        
        if (patternIndex === 0) {
          layoutType = 'large'
          colSpanClass = 'md:col-span-2'
          rowSpanClass = 'md:row-span-2'
        } else if (patternIndex === 3 || patternIndex === 6) {
          layoutType = 'wide'
          colSpanClass = 'md:col-span-2'
        }

        return (
          <MotionDiv
            key={tool.slug || tool.name}
            variants={staggerChild}
            custom={Math.min(i, 11) * 0.04}
            className={clsx(colSpanClass, rowSpanClass)}
          >
            <Card tool={tool} layoutType={layoutType} />
          </MotionDiv>
        )
      })}
    </MotionDiv>
  )
}
