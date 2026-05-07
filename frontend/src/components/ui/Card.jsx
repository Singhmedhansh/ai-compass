import clsx from 'clsx'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import Badge from './Badge'
import ToolLogo from './ToolLogo'

const MotionButton = motion.div

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

function Card({ tool = {} }) {
  const navigate = useNavigate()

  const name = tool.name || 'Unknown Tool'
  const description = tool.shortDescription || tool.description || 'No description available.'
  const category = tool.category || 'coding'
  const rating = Math.max(0, Math.min(5, Number(tool.rating) || 0))
  const pricing = (tool.pricing || 'free').toLowerCase()
  const slug = tool.slug || slugify(name)

  const ratingStars = Array.from({ length: 5 }, (_, index) => {
    const active = index < Math.round(rating)

    return (
      <Star
        key={`${name}-star-${index}`}
        className={clsx('h-4 w-4', active ? 'fill-amber-400 text-amber-400' : 'text-line-strong')}
      />
    )
  })

  return (
    <MotionButton
      onClick={() => navigate(`/tools/${slug}`)}
      whileHover={{ y: -4, boxShadow: 'var(--shadow-lg)' }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group flex w-full flex-col gap-4 rounded-2xl border border-line bg-bg-elev p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden" aria-hidden="true">
          <ToolLogo tool={tool} size={48} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-ink">{name}</h3>
          <p
            className="mt-1 overflow-hidden text-sm text-muted"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Badge label={category} variant={category} />

        <div className="flex items-center gap-1" aria-label={`Rated ${rating} out of 5`}>
          {ratingStars}
        </div>

        <span
          className={clsx(
            'rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
            pricingClasses[pricing] || pricingClasses.free,
          )}
        >
          {tool.pricing || 'Free'}
        </span>
      </div>
    </MotionButton>
  )
}

export default Card