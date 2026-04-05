import clsx from 'clsx'
import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Badge from './Badge'
import { getAvatarClass, getToolDomain } from '../../utils/toolBranding'

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

function Card({ tool = {} }) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)

  const name = tool.name || 'Unknown Tool'
  const description = tool.shortDescription || tool.description || 'No description available.'
  const category = tool.category || 'coding'
  const rating = Math.max(0, Math.min(5, Number(tool.rating) || 0))
  const pricing = (tool.pricing || 'free').toLowerCase()
  const slug = tool.slug || slugify(name)
  const domain = getToolDomain(name)
  const logoUrl = `https://logo.clearbit.com/${domain}`

  useEffect(() => {
    setImgError(false)
  }, [name])

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
      className="group flex w-full flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-indigo-500 dark:focus-visible:ring-offset-slate-950"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden" aria-hidden="true">
          {!imgError ? (
            <img
              src={logoUrl}
              alt={`${name} logo`}
              className="h-10 w-10 rounded-lg bg-white p-1 object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className={clsx(
                'flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white',
                getAvatarClass(name),
              )}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-gray-900 dark:text-white">{name}</h3>
          <p
            className="mt-1 overflow-hidden text-sm text-gray-600 dark:text-gray-400"
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