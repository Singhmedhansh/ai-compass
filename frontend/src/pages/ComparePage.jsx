import clsx from 'clsx'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Check, ExternalLink, LayoutGrid, Star, X, Shield } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useCurrency } from '../context/CurrencyContext'

import { Button, SkeletonCompareColumn, ToolLogo } from '../components/ui'
import { sectionReveal, staggerChild, staggerParent } from '../lib/motion'
import { MAX_COMPARE } from '../hooks/useCompare'
import { outboundUrl, OUTBOUND_REL } from '../utils/outbound'

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

// Path-based comparisons use "-vs-" as the separator, e.g.
//   /compare/chatgpt-vs-claude              → ["chatgpt", "claude"]
//   /compare/chatgpt-vs-claude-vs-gemini    → ["chatgpt", "claude", "gemini"]
// Tool slugs are kebab-case but never contain the literal "-vs-" substring,
// so splitting on it is unambiguous. Lowercased for canonical-URL hygiene.
function parsePairPath(pair) {
  if (!pair || typeof pair !== 'string') return []
  return parseSlugs(pair.toLowerCase().split('-vs-').join(','))
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
  const { convertPrice } = useCurrency()
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
          <dd className="shrink-0 font-semibold text-ink">{convertPrice(tier.price_display)}</dd>
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
    <div className="flex items-center justify-between gap-2 border-b border-line/50 pb-2">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-ink text-right">{value || '—'}</dd>
    </div>
  )
}

function CompareRow({ title, columns, renderCell }) {
  if (columns.length === 0) return null
  return (
    <div className="border-t border-line py-8">
      <h3 className="text-lg font-bold text-ink mb-6">{title}</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {columns.map((col) => (
          <div key={col.slug} className="min-w-0">
            {col.status === 'ok' && col.tool ? renderCell(col.tool) : <div className="text-sm text-muted">No data</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolColumn({ slug, status, tool, error, onRemove }) {
  // onRemove is null in path-mode (/compare/:pair) where the comparison is
  // fixed by the URL. The X button only makes sense in query-mode where the
  // user assembled the comparison ad-hoc from the directory.
  const canRemove = typeof onRemove === 'function'

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
          {canRemove ? (
            <button
              type="button"
              onClick={() => onRemove(slug)}
              aria-label={`Remove ${slug} from comparison`}
              className="rounded-full p-1.5 text-muted outline-none transition hover:bg-bg-sunk hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <p className="mt-4 text-sm text-ink-2">
          {error || 'We could not load this tool. Try a different comparison.'}
        </p>
        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(slug)}
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-line bg-bg-sunk px-3 py-2 text-sm font-medium text-ink outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
          >
            Remove from comparison
          </button>
        ) : (
          <Link
            to="/tools"
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-line bg-bg-sunk px-3 py-2 text-sm font-medium text-ink outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
          >
            Browse all tools
          </Link>
        )}
      </div>
    )
  }

  const name = tool.name || slug
  const tagline = tool.tagline || tool.shortDescription || tool.description || ''
  const category = tool.category || tool.subCategory || 'General'
  const url = outboundUrl(tool.slug ? tool : { ...tool, slug })
  const pricingRaw = String(tool.pricing_tier || tool.pricing || '').toLowerCase()
  const isFreeOrFreemium = pricingRaw === 'free' || pricingRaw === 'freemium'
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
        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(slug)}
            aria-label={`Remove ${name} from comparison`}
            className="rounded-full p-1.5 text-muted outline-none transition hover:bg-bg-sunk hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {tagline ? <p className="mt-3 text-sm text-muted">{tagline}</p> : null}

      <div className="mt-5">
        <a
          href={url}
          target="_blank"
          rel={OUTBOUND_REL}
          className="group flex w-full items-center justify-between rounded-xl bg-accent p-4 text-sm font-bold text-bg shadow-sm outline-none transition hover:opacity-90 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span>Try {name}{isFreeOrFreemium ? ' free' : ''}</span>
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
        </a>
      </div>

      {studentFriendly ? (
        <div className="mt-4 rounded-xl border border-accent-soft bg-accent-soft/20 p-3">
          <p className="text-sm font-semibold text-accent-ink flex items-center gap-1.5">
            <span role="img" aria-label="student">🎓</span> We recommend {name} for students
          </p>
          <p className="mt-1 text-xs text-ink-2">
            It offers features tailored for academic use cases and a dedicated student perk.
          </p>
        </div>
      ) : (
         <div className="mt-4 rounded-xl border border-line bg-bg-sunk p-3">
          <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
             <span role="img" aria-label="info">ℹ️</span> Good for general use
          </p>
          <p className="mt-1 text-xs text-ink-2">
            A solid option with standard features. Consider alternatives if you specifically need student perks.
          </p>
        </div>
      )}



      <div className="mt-6 flex-grow flex items-end">
        <Link
          to={`/tools/${slug}/alternatives`}
          className="inline-flex w-full items-center justify-center rounded-lg border border-line bg-transparent px-4 py-3 text-sm font-medium text-ink transition hover:bg-bg-sunk focus-visible:ring-2 focus-visible:ring-accent"
        >
          View alternatives for {name}
        </Link>
      </div>
    </div>
  )
}

export default function ComparePage() {
  const { selectedCurrency } = useCurrency()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  // pair is set by the /compare/:pair route ("chatgpt-vs-claude"); undefined
  // on the plain /compare URL where slugs come from the ?tools= query param.
  // Path-mode is the SEO-targeted form (canonical, indexable); query-mode is
  // a transient comparison launched from the directory compare-tray, with no
  // canonical or schema (we don't want every permutation indexed).
  const { pair } = useParams()
  const isPathMode = Boolean(pair)

  const [lastDirectorySearch, setLastDirectorySearch] = useState('/tools')

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('last_directory_search')
      if (saved && saved.startsWith('/tools')) {
        setLastDirectorySearch(saved)
      }
    } catch (e) {
      // ignore
    }
  }, [])

  const slugs = useMemo(
    () => (isPathMode ? parsePairPath(pair) : parseSlugs(searchParams.get('tools'))),
    [isPathMode, pair, searchParams],
  )
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

  // All columns resolved successfully? Path-mode only renders SEO Helmet when
  // every tool loaded — we don't want a broken indexable page with canonical
  // pointing to a comparison that 404s for one of its tools.
  const allLoaded =
    isPathMode &&
    columns.length === slugs.length &&
    columns.every((col) => col.status === 'ok' && col.tool)

  // Build the "X vs Y" display string from actual tool names (not slugs) so
  // the heading reads correctly even when slugs are abbreviated (e.g.,
  // "chatgpt" → "ChatGPT", "gpt-4" → "GPT-4").
  const pairTitle = allLoaded
    ? columns.map((col) => col.tool.name).join(' vs ')
    : null
  const pairCanonical = isPathMode
    ? `https://ai-compass.in/compare/${slugs.join('-vs-')}`
    : null

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* SEO Helmet: only fires in path-mode AND only when every tool loaded.
          Query-mode comparisons (?tools=...) stay un-indexed to avoid
          duplicate-content noise from every permutation. */}
      {allLoaded ? (
        <Helmet>
          <title>{`${pairTitle} — Compare AI Tools | AI Compass`}</title>
          <meta
            name="description"
            content={`${pairTitle}: side-by-side comparison of pricing, features, ratings, and platforms. Hand-tested by AI Compass.`}
          />
          <link rel="canonical" href={pairCanonical} />
          <meta property="og:type" content="article" />
          <meta property="og:title" content={`${pairTitle} — AI Compass`} />
          <meta
            property="og:description"
            content={`Side-by-side comparison: ${pairTitle}. Pricing, features, ratings.`}
          />
          <meta property="og:url" content={pairCanonical} />
          <meta property="og:image" content="https://ai-compass.in/og-image.png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={`${pairTitle} — AI Compass`} />
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: pairTitle,
              numberOfItems: columns.length,
              itemListElement: columns.map((col, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                item: {
                  '@type': 'SoftwareApplication',
                  name: col.tool.name,
                  applicationCategory: col.tool.category || 'AI Tool',
                  operatingSystem: 'Web',
                  url: `https://ai-compass.in/tools/${col.slug}`,
                },
              })),
            })}
          </script>
          <script type="application/ld+json">
            {JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai-compass.in/' },
                { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://ai-compass.in/compare' },
                { '@type': 'ListItem', position: 3, name: pairTitle, item: pairCanonical },
              ],
            })}
          </script>
        </Helmet>
      ) : null}
      <Link
        to={lastDirectorySearch}
        className="inline-flex items-center gap-1.5 rounded text-sm text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {lastDirectorySearch !== '/tools' ? '← Back to results' : 'Back to directory'}
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
        {pairTitle ? pairTitle : `Comparing ${count} tool${count === 1 ? '' : 's'}`}
      </h1>

      {selectedCurrency !== 'USD' && (
        <div className="mt-4 rounded-xl border border-accent-soft bg-accent-soft/20 p-3 text-xs text-ink-2 font-medium max-w-xl">
          Pricing displays are dynamically converted from USD. Kindly check the tool's official website for actual pricing in your country.
        </div>
      )}

      <MotionDiv
        variants={staggerParent}
        initial="initial"
        animate="animate"
        className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3"
      >
        {columns.map((column, index) => (
          <MotionDiv
            key={column.slug}
            variants={staggerChild}
            custom={Math.min(index, 2) * 0.06}
          >
            <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
              <ToolColumn
                slug={column.slug}
                status={column.status}
                tool={column.tool}
                error={column.error}
                onRemove={isPathMode ? null : handleRemoveSlug}
              />
            </MotionDiv>
          </MotionDiv>
        ))}
      </MotionDiv>

      {/* MATRIX */}
      {allLoaded && (
        <div className="mt-16 mb-20 space-y-2">
          <CompareRow
            title="Pricing"
            columns={columns}
            renderCell={(tool) => <PricingBlock tool={tool} />}
          />
          <CompareRow
            title="Platform & Access"
            columns={columns}
            renderCell={(tool) => {
               const platforms = Array.isArray(tool.platforms) ? tool.platforms.join(', ') : tool.platform || 'Web'
               const apiAvailable = Boolean(tool.apiAvailable ?? tool.api_available)
               return (
                 <dl className="space-y-4">
                   <QuickInfoRow label="Platform" value={platforms} />
                   <QuickInfoRow label="API available" value={apiAvailable ? 'Yes' : 'No'} />
                 </dl>
               )
            }}
          />
          <CompareRow
            title="Key Features"
            columns={columns}
            renderCell={(tool) => {
               const features = Array.isArray(tool.features) ? tool.features : []
               if (!features.length) return <span className="text-sm text-muted">—</span>
               return (
                  <ul className="space-y-2.5">
                    {features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-ink-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
               )
            }}
          />
          <CompareRow
            title="Academic Safety"
            columns={columns}
            renderCell={(tool) => {
              if (!tool.academic_integrity_rating) return <span className="text-sm text-muted">No safety details available.</span>
              return (
                <div className="space-y-2">
                  <span className={clsx(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
                    tool.academic_integrity_rating === 'Safe' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
                    tool.academic_integrity_rating === 'Use with Caution' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
                    tool.academic_integrity_rating === 'High Risk' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  )}>
                    <Shield className="h-4 w-4" /> {tool.academic_integrity_rating}
                  </span>
                  <p className="text-xs text-muted leading-relaxed">{tool.academic_warning}</p>
                </div>
              )
            }}
          />
          <CompareRow
            title="Community Rating"
            columns={columns}
            renderCell={(tool) => {
              const ratingCount = Number(tool.review_count || tool.reviewCount || tool.ratingCount || 0)
              const rating = Number(tool.rating || tool.averageRating || 0)
              return (
                <div className="flex items-center gap-2 bg-bg-sunk rounded-lg p-3 w-fit">
                  <StarRow rating={rating} />
                  <span className="text-sm font-medium text-ink">
                    {rating ? rating.toFixed(1) : '—'}
                    <span className="text-muted font-normal ml-1">
                      {ratingCount > 0 ? `(${ratingCount})` : ''}
                    </span>
                  </span>
                </div>
              )
            }}
          />
        </div>
      )}
    </div>
  )
}
