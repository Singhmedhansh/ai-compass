import { useState } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { Plus, Loader2 } from 'lucide-react'

import { Card } from '../ui'
import { staggerChild, staggerParent } from '../../lib/motion'

const MotionDiv = motion.div

export default function FlatToolGrid({ tools, defaultLimit = 24 }) {
  const [limit, setLimit] = useState(defaultLimit)
  const [loading, setLoading] = useState(false)
  const visibleTools = tools.slice(0, limit)
  const hasMore = limit < tools.length

  const handleLoadMore = () => {
    setLoading(true)
    setTimeout(() => {
      setLimit(prev => prev + 24)
      setLoading(false)
    }, 400)
  }

  return (
    <div className="flex flex-col gap-8">
      <MotionDiv
        variants={staggerParent}
        initial="initial"
        animate="animate"
        className="tools-grid grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[minmax(224px,auto)] grid-flow-row-dense"
      >
        {visibleTools.map((tool, i) => {
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

      {hasMore && (
        <div className="flex justify-center pb-8 mt-4">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="group flex items-center gap-2 rounded-full border border-line bg-bg-elev px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
            ) : (
              <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
            )}
            {loading ? 'Loading...' : `Load More Tools (${tools.length - limit} remaining)`}
          </button>
        </div>
      )}
    </div>
  )
}
