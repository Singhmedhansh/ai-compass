import clsx from 'clsx'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Badge from './Badge'
import CompareToggleButton from './CompareToggleButton'
import ToolLogo from './ToolLogo'

const MotionButton = motion.button

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
  const [isHovered, setIsHovered] = useState(false)

  const name = tool.name || 'Unknown Tool'
  const description = tool.shortDescription || tool.description || 'No description available.'
  const category = tool.category || 'coding'
  const rating = Math.max(0, Math.min(5, Number(tool.rating) || 0))
  const reviewCount = Number(tool.review_count ?? tool.reviewCount ?? tool.reviews ?? 0)
  // Only show a star rating when it's backed by real user reviews. Every tool
  // here is hand-picked, so with no reviews we show an honest "Curated" mark
  // instead of a fabricated or empty star widget.
  const hasRealRating = rating > 0 && reviewCount > 0
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
      layout
      onClick={() => navigate(`/tools/${slug}`)}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      whileHover={{ y: -4, boxShadow: 'var(--shadow-lg)' }}
      whileTap={{ scale: 0.98 }}
      animate={{ minHeight: isHovered ? 248 : 224 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative flex w-full flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-bg-elev p-4 text-left shadow-sm transition-all hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div className="absolute right-2 top-2 z-10">
        <CompareToggleButton slug={slug} toolName={name} />
      </div>

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
              WebkitLineClamp: isHovered ? 3 : 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Badge label={category} variant={category} />

        {hasRealRating ? (
          <div className="flex items-center gap-1" aria-label={`Rated ${rating} out of 5`}>
            {ratingStars}
          </div>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink"
            aria-label="Hand-curated pick"
          >
            <Star className="h-3 w-3 fill-current" />
            Curated
          </span>
        )}

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