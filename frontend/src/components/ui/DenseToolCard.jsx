import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

import ToolLogo from './ToolLogo'

const MotionDiv = motion.div

const pricingClasses = {
  free: 'bg-accent-soft text-accent-ink',
  freemium: 'bg-bg-sunk text-ink-2',
  paid: 'bg-bg-sunk text-ink-2',
}

function slugify(value = '') {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function DenseToolCard({ tool = {} }) {
  const navigate = useNavigate()

  const name = tool.name || 'Unknown Tool'
  const tagline = tool.tagline || tool.shortDescription || tool.description || ''
  const pricing = (tool.pricing || 'free').toLowerCase()
  const slug = tool.slug || slugify(name)

  return (
    <MotionDiv
      onClick={() => navigate(`/tools/${slug}`)}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line bg-bg-elev p-3.5 text-left shadow-sm transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden" aria-hidden="true">
        <ToolLogo tool={tool} size={36} />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-ink">{name}</h3>
        <p className="truncate text-xs text-muted">{tagline}</p>
      </div>

      <span
        className={clsx(
          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          pricingClasses[pricing] || pricingClasses.free,
        )}
      >
        {tool.pricing || 'Free'}
      </span>
    </MotionDiv>
  )
}

export default DenseToolCard
