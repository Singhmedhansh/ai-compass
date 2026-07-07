import clsx from 'clsx'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Check, ExternalLink, LayoutGrid, Star, StarHalf, X, Shield, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
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

function ToolSelector({ slugs, onAdd, allTools, loadingTools }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const containerRef = useRef(null)

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const filtered = useMemo(() => {
    if (!allTools) return []
    const normalized = query.trim().toLowerCase()
    return allTools
      .filter((tool) => !slugs.includes(tool.slug))
      .filter((tool) => {
        if (!normalized) return true
        return (
          tool.name.toLowerCase().includes(normalized) ||
          (tool.tagline && tool.tagline.toLowerCase().includes(normalized)) ||
          (tool.category && tool.category.toLowerCase().includes(normalized))
        )
      })
      .slice(0, 8)
  }, [allTools, query, slugs])

  const handleSelect = (slug) => {
    onAdd(slug)
    setQuery('')
    setFocused(false)
  }

  const isAtMax = slugs.length >= MAX_COMPARE

  return (
    <div ref={containerRef} className="relative w-full max-w-md mx-auto">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          disabled={isAtMax}
          placeholder={
            isAtMax 
              ? `Maximum of ${MAX_COMPARE} tools selected` 
              : "Search to add a tool..."
          }
          className="h-11 w-full rounded-xl border border-line/50 bg-bg-elev/40 backdrop-blur-md shadow-inner pl-10 pr-10 text-sm text-ink outline-none transition-all placeholder:text-muted hover:border-line-strong hover:bg-bg-elev/60 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-bg-sunk hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {focused && !isAtMax && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border border-line bg-bg-elev p-1.5 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          {loadingTools ? (
            <div className="px-4 py-3 text-xs text-muted flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Loading tools catalog...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted">
              No matching tools found
            </div>
          ) : (
            filtered.map((tool) => (
              <button
                key={tool.slug}
                type="button"
                onClick={() => handleSelect(tool.slug)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-bg-sunk outline-none focus:bg-bg-sunk"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden" aria-hidden="true">
                  <ToolLogo tool={tool} size={24} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink truncate">{tool.name}</span>
                  <span className="block text-[11px] text-muted truncate">{tool.category || 'General'}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function StarRow({ rating }) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0))
  return (
    <div className="flex items-center gap-0.5" aria-label={`Rated ${value} out of 5`}>
      {Array.from({ length: 5 }, (_, index) => {
        const floor = Math.floor(value)
        if (index < floor) {
          return (
            <Star
              key={`star-${index}`}
              className="h-4 w-4 fill-amber-400 text-amber-400"
            />
          )
        }
        if (index === floor) {
          const remainder = value - floor
          if (remainder >= 0.75) {
            return (
              <Star
                key={`star-${index}`}
                className="h-4 w-4 fill-amber-400 text-amber-400"
              />
            )
          }
          if (remainder >= 0.25) {
            return (
              <StarHalf
                key={`star-${index}`}
                className="h-4 w-4 fill-amber-400 text-amber-400"
              />
            )
          }
        }
        return (
          <Star
            key={`star-${index}`}
            className="h-4 w-4 text-line-strong"
          />
        )
      })}
    </div>
  )
}

function PricingBlock({ tool }) {
  const { convertPrice } = useCurrency()
  const tiers = tool.pricing_tiers && Array.isArray(tool.pricing_tiers.tiers)
    ? tool.pricing_tiers.tiers
    : []

  if (tiers.length === 0) {
    const isFree = String(tool.pricing || '').toLowerCase() === 'free'
    return (
      <div className="rounded-xl border border-line bg-bg-sunk/30 p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold capitalize text-ink">{tool.pricing || 'Freemium'}</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-ink">
            {isFree ? 'Free' : 'Premium Plans'}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted leading-relaxed">
          {tool.free_tier_summary || 'Pricing details vary. Visit the official website to view the latest plans.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {tiers.map((tier) => (
        <div 
          key={tier.name} 
          className={clsx(
            "rounded-xl border p-3 transition-all duration-200",
            tier.is_popular 
              ? "border-accent bg-accent-soft/10 shadow-sm" 
              : "border-line bg-bg-sunk/20 hover:bg-bg-sunk/35"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className="text-xs font-bold text-ink">{tier.name}</h4>
                {tier.is_popular && (
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-bg">
                    {tier.highlight_label || 'Popular'}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted mt-1 line-clamp-1">
                {tier.features && tier.features.length > 0 ? tier.features[0] : 'Plan features'}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-xs font-bold text-ink">
                {convertPrice(tier.price_display)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
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
  const count = columns.length
  return (
    <div className="border-t border-line py-8">
      <h3 className="text-lg font-bold text-ink mb-6">{title}</h3>
      <div className={clsx(
        "grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 mx-auto",
        count === 2 ? "lg:grid-cols-2 max-w-5xl" : "lg:grid-cols-3 max-w-7xl"
      )}>
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
  const [allTools, setAllTools] = useState([])
  const [loadingTools, setLoadingTools] = useState(false)

  useEffect(() => {
    setLoadingTools(true)
    fetch('/api/v1/tools?fields=card')
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => {
        setAllTools(data.results || [])
        setLoadingTools(false)
      })
      .catch((err) => {
        console.error('Failed to fetch tools for dropdown', err)
        setLoadingTools(false)
      })
  }, [])

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

  const updateComparison = (nextSlugs) => {
    if (nextSlugs.length === 0) {
      navigate('/compare')
    } else if (nextSlugs.length === 1) {
      navigate(`/compare?tools=${nextSlugs[0]}`)
    } else {
      if (isPathMode) {
        navigate(`/compare/${nextSlugs.join('-vs-')}`)
      } else {
        setSearchParams({ tools: nextSlugs.join(',') })
      }
    }
  }

  const handleRemoveSlug = (slugToRemove) => {
    const remaining = slugs.filter((slug) => slug !== slugToRemove)
    updateComparison(remaining)
  }

  const handleAddTool = (toolSlug) => {
    if (slugs.length >= MAX_COMPARE) {
      toast.warning(`Maximum of ${MAX_COMPARE} tools can be compared at once.`)
      return
    }
    updateComparison([...slugs, toolSlug])
  }

  // Helper to trigger navigation for pre-configured cards
  const startComparison = (pairSlugs) => {
    navigate(`/compare/${pairSlugs.join('-vs-')}`)
  }

  if (slugs.length < 2) {
    const isSingleTool = slugs.length === 1;

    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <Helmet>
          <title>Compare AI Tools Side-by-Side | AI Compass</title>
          <meta name="description" content="Compare the best AI tools, writing helpers, coding editors, and research search engines side-by-side on pricing, features, ratings, and platforms." />
        </Helmet>
        
        {/* Top Hero Card */}
        <div className="relative rounded-[28px] border border-line bg-bg-elev p-8 md:p-12 text-center shadow-lg overflow-visible">
          <div
            className="absolute inset-0 bg-[radial-gradient(circle_at_top,var(--accent-soft),transparent_60%)] rounded-[28px]"
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto max-w-xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent border border-accent/20 shadow-inner">
              <LayoutGrid className="h-6 w-6" />
            </div>
            <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              {isSingleTool ? "Select a second tool to compare" : "AI Tool Comparison Builder"}
            </h1>
            <p className="mt-3 text-base text-ink-2 leading-relaxed">
              {isSingleTool 
                ? `You've selected ${columns[0]?.tool?.name || slugs[0]}. Select another tool from the catalog to run a side-by-side comparison on pricing, features, limits, and ratings.`
                : `Choose two or more tools to match features, community ratings, pricing structures, and academic integrity policies side-by-side.`
              }
            </p>

            <div className="mt-8 max-w-md mx-auto relative z-20">
              <ToolSelector
                slugs={slugs}
                onAdd={handleAddTool}
                allTools={allTools}
                loadingTools={loadingTools}
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="secondary" onClick={() => navigate('/tools')}>
                Browse all tools
              </Button>
              {isSingleTool && (
                <Button variant="secondary" onClick={() => navigate('/compare')}>
                  Clear selection
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Popular Comparisons Quick Links */}
        {!isSingleTool && (
          <div className="mt-16">
            <h2 className="text-xl font-bold text-ink mb-6 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent animate-pulse" /> Popular side-by-side comparisons
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "ChatGPT vs Claude",
                  desc: "Compare writing flow, reasoning, and context window differences.",
                  slugs: ["chatgpt", "claude"],
                  tags: ["Writing", "Chat"]
                },
                {
                  title: "Cursor vs GitHub Copilot",
                  desc: "Find the best AI coding assistant for your student projects.",
                  slugs: ["cursor", "github-copilot"],
                  tags: ["Coding"]
                },
                {
                  title: "Perplexity vs ChatGPT",
                  desc: "Research & citations vs general brainstorming capabilities.",
                  slugs: ["perplexity-ai", "chatgpt"],
                  tags: ["Research"]
                },
                {
                  title: "v0 vs Bolt.new",
                  desc: "Compare instant web UI code builders and full stack platforms.",
                  slugs: ["v0", "bolt-new"],
                  tags: ["UI Dev"]
                },
                {
                  title: "Grammarly vs Quillbot",
                  desc: "Essay editing vs advanced paragraph paraphrasing.",
                  slugs: ["grammarly", "quillbot"],
                  tags: ["Writing"]
                },
                {
                  title: "NotebookLM vs Claude",
                  desc: "Document briefing and audio synthesis vs long context files.",
                  slugs: ["notebooklm", "claude"],
                  tags: ["Research"]
                }
              ].map((battle, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => startComparison(battle.slugs)}
                  className="group relative flex flex-col justify-between rounded-2xl border border-line bg-bg-elev p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex gap-1">
                        {battle.tags.map((t, i) => (
                          <span key={i} className="rounded bg-accent-soft/60 px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink border border-accent/10">
                            {t}
                          </span>
                        ))}
                      </span>
                      <span className="rounded-full bg-bg-sunk p-1.5 text-muted transition group-hover:text-accent group-hover:bg-accent-soft">
                        <ArrowLeft className="h-3 w-3 rotate-180" />
                      </span>
                    </div>
                    <h3 className="mt-3 font-bold text-ink group-hover:text-accent transition-colors">
                      {battle.title}
                    </h3>
                    <p className="mt-1.5 text-xs text-muted leading-relaxed">
                      {battle.desc}
                    </p>
                  </div>
                  <div className="mt-4 text-[11px] font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity">
                    Compare now &rarr;
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
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
        className={clsx(
          "mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 mx-auto",
          count === 2 ? "lg:grid-cols-2 max-w-5xl" : "lg:grid-cols-3 max-w-7xl"
        )}
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
                onRemove={handleRemoveSlug}
              />
            </MotionDiv>
          </MotionDiv>
        ))}
      </MotionDiv>

      {/* MATRIX */}
      {allLoaded && (
        <>
        <div className="mt-16 mb-20 space-y-2 animate-in fade-in duration-500">
          {/* PRICING */}
          <CompareRow
            title="Pricing"
            columns={columns}
            renderCell={(tool) => <PricingBlock tool={tool} />}
          />

          {/* LIMITATIONS & RISKS */}
          <CompareRow
            title="Limitations & Risks"
            columns={columns}
            renderCell={(tool) => {
              const freeLimits = tool.free_tier_summary || 'Standard limitations apply to free plans.'
              const safety = tool.academic_integrity_rating || 'Safe'
              const warning = tool.academic_warning

              return (
                <div className="space-y-3.5">
                  <div className="rounded-xl border border-line bg-bg-sunk/20 p-3.5">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Free Version Limits</h4>
                    <p className="mt-1.5 text-xs text-ink-2 leading-relaxed">
                      {freeLimits}
                    </p>
                  </div>

                  <div className="rounded-xl border border-line bg-bg-sunk/20 p-3.5">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Academic Integrity Risk</h4>
                    <div className="mt-2">
                      <span className={clsx(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                        safety === 'Safe' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
                        safety === 'Use with Caution' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
                        safety === 'High Risk' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      )}>
                        <Shield className="h-3 w-3" /> {safety}
                      </span>
                    </div>
                    {warning && (
                      <p className="mt-2.5 text-xs text-muted leading-relaxed">
                        {warning}
                      </p>
                    )}
                  </div>
                </div>
              )
            }}
          />

          {/* USE CASES */}
          <CompareRow
            title="Use Cases"
            columns={columns}
            renderCell={(tool) => {
              const useCases = Array.isArray(tool.use_cases) 
                ? tool.use_cases 
                : (Array.isArray(tool.useCases) ? tool.useCases : [])

              if (useCases.length === 0) {
                return (
                  <div className="rounded-xl border border-line bg-bg-sunk/20 p-3.5">
                    <p className="text-xs font-semibold text-ink flex items-center gap-1.5">
                      💡 Best For
                    </p>
                    <p className="mt-1 text-xs text-ink-2 leading-relaxed">
                      {tool.bestFor || 'General student tasks'}
                    </p>
                  </div>
                )
              }

              return (
                <ul className="space-y-2">
                  {useCases.map((useCase, index) => (
                    <li key={index} className="flex items-start gap-2 text-xs text-ink-2">
                      <span className="mt-0.5 text-accent select-none text-xs leading-none font-bold" aria-hidden="true">✓</span>
                      <span className="leading-relaxed">{useCase}</span>
                    </li>
                  ))}
                </ul>
              )
            }}
          />

          {/* KEY FEATURES */}
          <CompareRow
            title="Key Features"
            columns={columns}
            renderCell={(tool) => {
               const features = Array.isArray(tool.features) ? tool.features : []
               if (!features.length) return <span className="text-sm text-muted">—</span>
               return (
                  <ul className="space-y-2.5">
                    {features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs text-ink-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                        <span className="leading-relaxed">{feature}</span>
                      </li>
                    ))}
                  </ul>
               )
            }}
          />

          {/* PLATFORMS */}
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

          {/* COMMUNITY RATINGS */}
          <CompareRow
            title="Community Rating"
            columns={columns}
            renderCell={(tool) => {
              const ratingCount = Number(tool.review_count || tool.reviewCount || tool.ratingCount || 0)
              const rating = Number(tool.rating || tool.averageRating || 0)
              return (
                <div className="flex items-center gap-2 bg-bg-sunk/30 border border-line rounded-xl p-3 w-fit">
                  <StarRow rating={rating} />
                  <span className="text-sm font-semibold text-ink">
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

        {/* Add another tool action */}
        {slugs.length < MAX_COMPARE ? (
          <div className="mt-12 max-w-md mx-auto pb-8 animate-in fade-in duration-500 text-center relative z-20">
            <p className="text-sm font-bold text-ink mb-3">Add another tool to compare</p>
            <ToolSelector
              slugs={slugs}
              onAdd={handleAddTool}
              allTools={allTools}
              loadingTools={loadingTools}
            />
          </div>
        ) : (
          <div className="mt-12 text-center pb-8 text-xs text-muted">
            Comparison limit reached (maximum of {MAX_COMPARE} tools)
          </div>
        )}
        </>
      )}
    </div>
  )
}
