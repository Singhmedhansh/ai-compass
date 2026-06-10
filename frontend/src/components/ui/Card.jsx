import clsx from 'clsx'
import { motion } from 'framer-motion'
import { Folder, Sparkles, Star } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Badge from './Badge'
import CompareToggleButton from './CompareToggleButton'
import ToolLogo from './ToolLogo'

const MotionCard = motion.div

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

function Card({ tool = {}, layoutType = 'standard', glass = false, folders = null, onFoldersUpdated = null }) {
  const navigate = useNavigate()
  const [isHovered, setIsHovered] = useState(false)
  const [showFolderDropdown, setShowFolderDropdown] = useState(false)

  const isLarge = layoutType === 'large'
  const isWide = layoutType === 'wide'

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

  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget) {
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.key === ' ') {
        event.preventDefault()
      }
      navigate(`/tools/${slug}`)
    }
  }

  const handleToggleFolder = async (folderName, isMember) => {
    try {
      const url = `/api/v1/profile/favorites/folders/${encodeURIComponent(folderName)}/tools${isMember ? '/' + encodeURIComponent(slug) : ''}`
      const method = isMember ? 'DELETE' : 'POST'
      const body = isMember ? undefined : JSON.stringify({ tool_id: slug })
      const headers = isMember ? {} : { 'Content-Type': 'application/json' }

      const res = await fetch(url, {
        method,
        headers,
        body,
        credentials: 'include'
      })

      if (res.ok) {
        if (onFoldersUpdated) {
          onFoldersUpdated()
        }
      }
    } catch (err) {
      console.error('Error toggling folder membership', err)
    }
  }

  const hasReason = !!(tool.relevance_reason || tool.reason)
  const baseMinHeight = isLarge ? 450 : (hasReason ? 260 : 224)
  const hoverMinHeight = isLarge ? 480 : (hasReason ? 284 : 248)

  const isInAnyFolder = folders ? folders.some(f => Array.isArray(f.tools) && f.tools.map(t => String(t).toLowerCase()).includes(String(slug).toLowerCase())) : false

  return (
    <MotionCard
      layout
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/tools/${slug}`)}
      onKeyDown={handleKeyDown}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => {
        setIsHovered(false)
        setShowFolderDropdown(false)
      }}
      onFocus={() => setIsHovered(true)}
      onBlur={() => {
        setIsHovered(false)
        setShowFolderDropdown(false)
      }}
      whileHover={{ y: -4, boxShadow: 'var(--shadow-lg)' }}
      whileTap={{ scale: 0.98 }}
      animate={{ minHeight: isHovered ? hoverMinHeight : baseMinHeight }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={clsx(
        "group relative flex w-full flex-col gap-4 overflow-hidden rounded-2xl border border-line text-left shadow-sm cursor-pointer transition-all hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        glass ? "glass-card bg-opacity-70 hover:bg-opacity-80" : "bg-bg-elev",
        isLarge ? "p-6" : "p-4"
      )}
    >
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {folders && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFolderDropdown(!showFolderDropdown)}
              aria-label="Manage folders"
              className={clsx(
                'inline-flex h-10 w-10 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-accent md:h-8 md:w-8',
                isInAnyFolder
                  ? 'border border-accent bg-accent/10 text-accent'
                  : 'border border-line bg-bg-elev text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <Folder className="h-4 w-4" />
            </button>
            {showFolderDropdown && (
              <div
                className="absolute right-0 mt-1.5 z-30 w-48 rounded-xl border border-line bg-bg-elev p-2.5 shadow-xl backdrop-blur-md bg-opacity-95"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted">Add to Folder</div>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {folders.length === 0 ? (
                    <p className="text-[11px] text-muted p-2 text-center">No folders created yet.</p>
                  ) : (
                    folders.map((folder) => {
                      const isMember = Array.isArray(folder.tools) && folder.tools.map(t => String(t).toLowerCase()).includes(String(slug).toLowerCase());
                      return (
                        <label
                          key={folder.name}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-sunk cursor-pointer text-xs font-medium text-ink-2"
                        >
                          <input
                            type="checkbox"
                            checked={isMember}
                            onChange={() => handleToggleFolder(folder.name, isMember)}
                            className="rounded border-line-strong text-accent focus:ring-accent accent-accent"
                          />
                          <span className="truncate">{folder.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        <CompareToggleButton slug={slug} toolName={name} />
      </div>

      <div className={clsx("flex items-start gap-3", isLarge ? "flex-col items-center text-center mt-2" : "")}>
        <div className={clsx("flex shrink-0 items-center justify-center overflow-hidden", isLarge ? "h-20 w-20" : "h-12 w-12")} aria-hidden="true">
          <ToolLogo tool={tool} size={isLarge ? 80 : 48} />
        </div>

        <div className={clsx("min-w-0 flex-1", isLarge ? "mt-4 w-full" : "")}>
          <h3 className={clsx("truncate font-semibold text-ink", isLarge ? "text-xl" : "text-base")}>{name}</h3>
          <p
            className={clsx("mt-1 overflow-hidden text-muted", isLarge ? "text-base" : "text-sm")}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: isHovered ? (isLarge ? 6 : 3) : (isLarge ? 4 : 2),
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </p>

          {hasReason && (
            <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-accent-soft/40 px-2.5 py-1.5 text-xs text-ink-2 border border-accent/10 backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
              <span>{tool.relevance_reason || tool.reason}</span>
            </div>
          )}
        </div>
      </div>

      <div className={clsx("flex items-center justify-between gap-3 mt-auto", isLarge ? "flex-wrap justify-center pt-4 border-t border-line" : "")}>
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
    </MotionCard>
  )
}

export default Card