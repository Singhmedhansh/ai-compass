import { useState } from 'react'
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
        // Uniform cells, matching CategorySection and the DirectoryPage grids.
        //
        // This used to be an "asymmetric bento" that made every 7th tool a 2x2
        // card and items 3 and 6 double-wide, on grid-flow-row-dense. Size is
        // the strongest ranking signal a grid has, and it was being assigned by
        // array position — so a tool looked like a featured pick purely because
        // of where it landed, on a catalog that promises no ranking tricks. The
        // dense flow also reordered cards to backfill gaps, so what you saw
        // stopped matching relevance order. Tools are a comparable set; they
        // get comparable cells. Editorial emphasis is carried by the card's
        // "Editor's pick" treatment instead, which doesn't distort the grid.
        className="tools-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
      >
        {visibleTools.map((tool, i) => (
          <MotionDiv
            key={tool.slug || tool.name}
            variants={staggerChild}
            custom={Math.min(i, 11) * 0.04}
          >
            <Card tool={tool} />
          </MotionDiv>
        ))}
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
