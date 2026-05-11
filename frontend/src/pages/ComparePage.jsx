import clsx from 'clsx'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Check, ExternalLink, LayoutGrid, Star, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Button, SkeletonCompareColumn, ToolLogo } from '../components/ui'
import { sectionReveal, staggerChild, staggerParent } from '../lib/motion'
import { MAX_COMPARE } from '../hooks/useCompare'

const MotionDiv = motion.div

function parseSlugs(raw) {
  if (!raw) return []
  const seen = new Set()
  const out = []
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase()
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(slug)
    if (out.length >= MAX_COMPARE) break
  }
  return out
}

function StarRow({ rating }) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0))
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rated ${value} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={`star-${index}`}
          className={clsx(
            'h-4 w-4',
            index < Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-line-strong',
          )}
        />
      ))}
    </div>
  )
}

function PricingBlock({ tool }) {
  const tiers = tool.pricing_tiers && Array.isArray(tool.pricing_tiers.tiers)
    ? tool.pricing_tiers.tiers
    : []

  if (tiers.length === 0) {
    return (
      <div>
        <p className="text-sm capitalize text-ink-2">{tool.pricing || 'Unknown'}</p>
        <p className="mt-1 text-xs text-muted">Detailed pricing coming soon</p>
      </div>
    )
  }

  return (
    <dl className="space-y-1.5">
      {tiers.map((tier) => (
        <div key={tier.name} className="flex items-center justify-between gap-2 text-sm">
          <dt
            className={clsx(
              'truncate',
              tier.is_popular ? 'font-semibold text-accent-ink' : 'text-ink-2',
            )}
          >
            {tier.name}
            {tier.is_popular ? (
              <span className="ml-1 text-[10px] font-semibold uppercase text-accent">Popular</span>
            ) : null}
          </dt>
          <dd className="shrink-0 font-semibold text-ink">{tier.price_display}</dd>
        </div>
      ))}
    </dl>
  )
}

function SectionHeading({ children }) {
  return <h3 className="text-sm font-semibold text-ink">{children}</h3>
}

function QuickInfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-ink">{value || '—'}</dd>
    </div>
  )
}

function ToolColumn({ slug, status, tool, error, onRemove }) {
  if (status === 'loading') {
    return <SkeletonCompareColumn />
  }

  if (status === 'error' || !tool) {
    return (
      <div className="flex flex-col rounded-2xl border border-line bg-bg-elev p-4 md:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-bg-sunk"
            >
              <AlertTriangle className="h-6 w-6 text-muted" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink">Tool not found</h2>
              <p className="truncate text-xs text-muted">{slug}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(slug)}
            aria-label={`Remove ${slug} from comparison`}
            className="rounded-full p-1.5 text-muted outline-none transition hover:bg-bg-sunk hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-4 text-sm text-ink-2">
          {error || 'We could not load this tool. Try removing it and selecting another.'}
        </p>
        <button
          type="button"
          onClick={() => onRemove(slug)}
          className="mt-6 inline-flex items-center justify-center rounded-lg border border-line bg-bg-sunk px-3 py-2 text-sm font-medium text-ink outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
        >
          Remove from comparison
        </button>
      </div>
    )
  }

  const name = tool.name || slug
  const tagline = tool.tagline || tool.shortDescription || tool.description || ''
  const category = tool.category || tool.subCategory || 'General'
  const url = tool.url || tool.website || tool.link || '#'
  const platforms = Array.isArray(tool.platforms)
    ? tool.platforms.join(', ')
    : tool.platform || 'Web'
  const studentFriendly = Boolean(tool.student_friendly ?? tool.studentPerk ?? tool.student_perk)
  const apiAvailable = Boolean(tool.apiAvailable ?? tool.api_available)
  const features = Array.isArray(tool.features) ? tool.features : []
  const tags = Array.isArray(tool.tags) ? tool.tags : []
  const ratingCount = Number(tool.review_count || tool.reviewCount || tool.ratingCount || 0)
  const rating = Number(tool.rating || tool.averageRating || 0)

  return (
    <div className="flex flex-col rounded-2xl border border-line bg-bg-elev p-4 md:p-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden" aria-hidden="true">
            <ToolLogo tool={tool} size={48} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink">{name}</h2>
            <span className="mt-1 inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink">
              {category}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(slug)}
          aria-label={`Remove ${name} from comparison`}
          className="rounded-full p-1.5 text-muted outline-none transition hover:bg-bg-sunk hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {tagline ? <p className="mt-3 text-sm text-muted">{tagline}</p> : null}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
      >
        Visit tool
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>

      <div className="mt-6">
        <SectionHeading>Pricing</SectionHeading>
        <div className="mt-2">
          <PricingBlock tool={tool} />
        </div>
      </div>

      <div className="mt-6">
        <SectionHeading>Rating</SectionHeading>
        <div className="mt-2 flex items-center gap-2">
          <StarRow rating={rating} />
          <span className="text-xs text-muted">
            {rating ? rating.toFixed(1) : '—'} out of 5
            {ratingCount > 0 ? ` · ${ratingCount} review${ratingCount === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <SectionHeading>Quick info</SectionHeading>
        <dl className="mt-2 space-y-2">
          <QuickInfoRow label="Platform" value={platforms} />
          <QuickInfoRow label="Category" value={category} />
          <QuickInfoRow label="Student friendly" value={studentFriendly ? 'Yes' : 'No'} />
          <QuickInfoRow label="API available" value={apiAvailable ? 'Yes' : 'No'} />
        </dl>
      </div>

      {features.length > 0 ? (
        <div className="mt-6">
          <SectionHeading>Key features</SectionHeading>
          <ul className="mt-2 space-y-1.5">
            {features.slice(0, 5).map((feature, index) => (
              <li key={`${slug}-feature-${index}`} className="flex items-start gap-2 text-sm text-ink-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          {features.length > 5 ? (
            <p className="mt-1.5 text-xs text-muted">+{features.length - 5} more</p>
          ) : null}
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="mt-6">
          <SectionHeading>Tags</SectionHeading>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.slice(0, 5).map((tag) => (
              <span
                key={`${slug}-tag-${tag}`}
                className="rounded-full border border-line bg-bg-sunk px-2 py-0.5 text-xs text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const slugs = useMemo(() => parseSlugs(searchParams.get('tools')), [searchParams])
  const slugsKey = slugs.join('|')

  const [columns, setColumns] = useState(() =>
    slugs.map((slug) => ({ slug, status: 'loading', tool: null, error: null })),
  )

  useEffect(() => {
    if (slugs.length === 0) {
      setColumns([])
      return undefined
    }

    setColumns(slugs.map((slug) => ({ slug, status: 'loading', tool: null, error: null })))

    const controller = new AbortController()

    Promise.allSettled(
      slugs.map((slug) =>
        fetch(`/api/v1/tools/${slug}`, { signal: controller.signal })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`)
            }
            return response.json()
          })
          .then((data) => ({ slug, status: 'ok', tool: data, error: null }))
          .catch((requestError) => {
            if (requestError.name === 'AbortError') {
              return { slug, status: 'aborted', tool: null, error: null }
            }
            return { slug, status: 'error', tool: null, error: requestError.message || 'Failed to load' }
          }),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return
      const next = results.map((result, index) => {
        if (result.status === 'fulfilled') return result.value
        return { slug: slugs[index], status: 'error', tool: null, error: 'Failed to load' }
      })
      const filtered = next.filter((column) => column.status !== 'aborted')
      setColumns(filtered.length === slugs.length ? filtered : next.map((column) => column.status === 'aborted' ? { ...column, status: 'error', error: 'Aborted' } : column))
    })

    return () => {
      controller.abort()
    }
    // slugsKey collapses the array dependency to a stable string so the effect only re-runs on real changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugsKey])

  const handleRemoveSlug = (slugToRemove) => {
    const remaining = slugs.filter((slug) => slug !== slugToRemove)
    if (remaining.length === 0) {
      setSearchParams({})
    } else {
      setSearchParams({ tools: remaining.join(',') })
    }
  }

  if (slugs.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div
          aria-hidden="true"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm"
        >
          <LayoutGrid className="h-5 w-5 text-muted" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-ink">No tools to compare</h1>
        <p className="mt-1.5 text-sm text-muted">
          Add tools from the directory to start comparing — up to {MAX_COMPARE} side by side.
        </p>
        <div className="mt-6">
          <Button variant="primary" onClick={() => navigate('/tools')}>
            Browse tools
          </Button>
        </div>
      </div>
    )
  }

  const count = slugs.length

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link
        to="/tools"
        className="inline-flex items-center gap-1.5 rounded text-sm text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to directory
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        Comparing {count} tool{count === 1 ? '' : 's'}
      </h1>

      <MotionDiv
        variants={staggerParent}
        initial="initial"
        animate="animate"
        className="mt-8 flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-2 md:gap-6 md:overflow-x-visible md:pb-0 lg:grid-cols-3"
      >
        {columns.map((column, index) => (
          <MotionDiv
            key={column.slug}
            variants={staggerChild}
            custom={Math.min(index, 2) * 0.06}
            className="min-w-[85vw] shrink-0 snap-start md:min-w-0 md:shrink"
          >
            <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
              <ToolColumn
                slug={column.slug}
                status={column.status}
                tool={column.tool}
                error={column.error}
                onRemove={handleRemoveSlug}
              />
            </MotionDiv>
          </MotionDiv>
        ))}
      </MotionDiv>
    </div>
  )
}
