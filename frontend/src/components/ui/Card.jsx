import clsx from 'clsx'
import { Star } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import Badge from './Badge'

const avatarPalette = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
]

const pricingClasses = {
  free: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  freemium: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  paid: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100',
}

function slugify(value = '') {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function getAvatarClass(name = '') {
  const code = name
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)

  return avatarPalette[code % avatarPalette.length]
}

function Card({ tool = {} }) {
  const navigate = useNavigate()

  const name = tool.name || 'Unknown Tool'
  const description = tool.shortDescription || tool.description || 'No description available.'
  const category = tool.category || 'coding'
  const rating = Math.max(0, Math.min(5, Number(tool.rating) || 0))
  const pricing = (tool.pricing || 'free').toLowerCase()
  const slug = tool.slug || slugify(name)
  const visual = tool.logo || tool.emoji || tool.icon

  const ratingStars = Array.from({ length: 5 }, (_, index) => {
    const active = index < Math.round(rating)

    return (
      <Star
        key={`${name}-star-${index}`}
        className={clsx('h-4 w-4', active ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600')}
      />
    )
  })

  return (
    <button
      type="button"
      onClick={() => navigate(`/tools/${slug}`)}
      className="group flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500 dark:focus-visible:ring-offset-slate-950"
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-semibold',
            !visual && getAvatarClass(name),
          )}
          aria-hidden="true"
        >
          {visual ? (
            typeof visual === 'string' && visual.startsWith('http') ? (
              <img src={visual} alt={`${name} logo`} className="h-full w-full object-cover" />
            ) : (
              <span className="text-2xl leading-none">{visual}</span>
            )
          ) : (
            <span>{name.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{name}</h3>
          <p
            className="mt-1 overflow-hidden text-sm text-slate-600 dark:text-slate-300"
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
    </button>
  )
}

export default Card
