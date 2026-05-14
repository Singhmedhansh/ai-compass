import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { SearchX } from 'lucide-react'
import { Button, Card, Dropdown, SearchInput, SkeletonCard, WordReveal } from '../components/ui'
import { drawerSlideUp, frostedDropdown, sectionReveal, staggerChild, staggerParent } from '../lib/motion'

const MotionDiv = motion.div

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const CATEGORY_OPTIONS = ['All', 'Coding', 'Writing', 'Research', 'Productivity', 'Image Gen', 'Video Gen']
const SORT_OPTIONS = [
  { value: 'Trending',   label: 'Trending' },
  { value: 'Newest',     label: 'Newest' },
  { value: 'Top Rated',  label: 'Top Rated' },
  { value: 'Free First', label: 'Free First' },
]

const CATEGORY_FILTER_MAP = {
  Writing: 'Writing & Chat',
  'Image Gen': 'Image Generation',
  'Video Gen': 'Video Generation',
}

function mapTool(rawTool) {
  return {
    slug: rawTool.slug,
    name: rawTool.name,
    description: rawTool.description || rawTool.shortDescription || rawTool.summary || '',
    shortDescription: rawTool.shortDescription || rawTool.description || rawTool.summary,
    category: rawTool.category || 'coding',
    rating: Number(rawTool.rating || rawTool.averageRating || rawTool.average_rating || 0),
    pricing: rawTool.pricing || rawTool.pricingType || rawTool.pricing_type || 'Free',
    createdAt: rawTool.createdAt || rawTool.created_at || rawTool.publishedAt || rawTool.published_at,
    reviews: Number(rawTool.reviewCount || rawTool.reviews || rawTool.total_reviews || 0),
    logo: rawTool.logo,
    emoji: rawTool.emoji,
    icon: rawTool.icon,
    url: rawTool.url || rawTool.website || rawTool.link,
    website: rawTool.website || rawTool.url || rawTool.link,
    logo_url: rawTool.logo_url || rawTool.logoUrl,
    logo_emoji: rawTool.logo_emoji || rawTool.emoji,
    accent_color: rawTool.accent_color,
    _score: rawTool._score,
  }
}

function getNormalizedCategory(value = '') {
  return value.toLowerCase().trim()
}

function toCanonicalCategory(value = '') {
  return CATEGORY_FILTER_MAP[value] || value
}

function getTrendingScore(tool) {
  const ratingWeight = (Number(tool.rating) || 0) * 2
  const reviewWeight = Math.min(100, Number(tool.reviews) || 0) * 0.05
  const freshnessBonus = tool.createdAt ? 0.5 : 0

  return ratingWeight + reviewWeight + freshnessBonus
}


function DirectoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialCategory = searchParams.get('category') || 'All'
  const initialQuery = searchParams.get('q') || ''
  const queryFromParams = searchParams.get('q') || ''
  const categoryFromParams = searchParams.get('category') || 'All'

  const [tools, setTools] = useState([])
  const [searchMeta, setSearchMeta] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState(
    CATEGORY_OPTIONS.find((item) => item.toLowerCase() === initialCategory.toLowerCase()) || 'All',
  )
  const [sortBy, setSortBy] = useState('Trending')
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const latestRequestIdRef = useRef(0)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const hasSearchQuery = queryFromParams.trim().length > 0

  useEffect(() => {
    if (searchQuery !== queryFromParams) {
      setSearchQuery(queryFromParams)
    }

    const normalizedCategory = CATEGORY_OPTIONS.find(
      (item) => item.toLowerCase() === categoryFromParams.toLowerCase(),
    ) || 'All'
    if (category !== normalizedCategory) {
      setCategory(normalizedCategory)
    }
  }, [searchQuery, queryFromParams, categoryFromParams, category])

  const updateUrlParams = (nextCategory, nextQuery) => {
    const nextParams = new URLSearchParams(searchParams)
    const query = (nextQuery || '').trim()

    if (nextCategory && nextCategory !== 'All') {
      nextParams.set('category', nextCategory)
    } else {
      nextParams.delete('category')
    }

    if (query) {
      nextParams.set('q', query)
    } else {
      nextParams.delete('q')
    }

    setSearchParams(nextParams, { replace: true })
  }

  const handleSearchChange = (value) => {
    setSearchQuery(value)
    updateUrlParams(category, value)
  }

  const handleCategoryChange = (value) => {
    setCategory(value)
    updateUrlParams(value, searchQuery)
  }

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++latestRequestIdRef.current
    const API = import.meta.env.VITE_API_URL || ''
    const normalizedQuery = queryFromParams.trim()
    const normalizedCategory = category?.trim() || 'All'
    const canonicalCategory = toCanonicalCategory(normalizedCategory)
    const isRemoteSearch = Boolean(normalizedQuery)

    // WHY 300ms: hit the backend after the user stops typing for one quarter
    // second — short enough that the page feels live, long enough that a
    // 12-character query fires 1 request instead of 12. No delay on the bare
    // directory load (empty query) since that's a single page-init fetch.
    const debounceDelay = isRemoteSearch ? 300 : 0

    async function loadTools() {
      setIsLoading(true)
      setError(null)
      try {
        const abortTimeout = setTimeout(() => controller.abort(), 15000)
        const endpoint = isRemoteSearch
          ? `${API}/api/v1/search?${new URLSearchParams({
              q: normalizedQuery,
              ...(canonicalCategory !== 'All' ? { category: canonicalCategory } : {}),
            }).toString()}`
          : `${API}/api/v1/tools`

        const response = await fetch(endpoint, { signal: controller.signal })
        clearTimeout(abortTimeout)

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`)
        }
        const data = await response.json()
        if (requestId !== latestRequestIdRef.current || controller.signal.aborted) {
          return
        }

        setTools((data.results || data || []).map(mapTool))
        setSearchMeta(
          isRemoteSearch
            ? {
                fuzzy_matched: Boolean(data.fuzzy_matched),
                suggested_query: data.suggested_query || null,
                fallback: Boolean(data.fallback),
                original_query: data.original_query || normalizedQuery,
              }
            : null,
        )
      } catch (err) {
        if (requestId !== latestRequestIdRef.current || controller.signal.aborted) {
          return
        }

        if (err.name === 'AbortError') {
          console.warn('API request timeout, falling back to empty state')
          setError(null)
          setTools([])
        } else {
          console.error('DirectoryPage fetch error:', err)
          setError('Failed to load tools')
        }
      } finally {
        if (requestId === latestRequestIdRef.current && !controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    const debounceTimer = setTimeout(loadTools, debounceDelay)
    return () => {
      clearTimeout(debounceTimer)
      controller.abort()
    }
  }, [queryFromParams, category])

  const filteredTools = useMemo(() => {
    const normalizedSearch = queryFromParams.trim().toLowerCase()

    // 1. Always filter by category (backend might have done it, but this is safe)
    const byCategory = tools.filter((tool) => {
      if (category === 'All') {
        return true
      }
      return getNormalizedCategory(tool.category) === getNormalizedCategory(toCanonicalCategory(category))
    })

    // 2. If it's a remote search, skip substring filtering (which breaks semantic matches)
    //    If it's NOT a remote search, do standard substring filtering.
    const bySearch = hasSearchQuery ? byCategory : byCategory.filter((tool) => {
      if (!normalizedSearch) {
        return true
      }
      const normalizedName = (tool.name || '').toLowerCase()
      const normalizedDescription = (tool.description || '').toLowerCase()
      return normalizedName.includes(normalizedSearch) || normalizedDescription.includes(normalizedSearch)
    })

    const sorted = [...bySearch]

    sorted.sort((a, b) => {
      if (sortBy === 'Newest') {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      }

      if (sortBy === 'Top Rated') {
        return (b.rating || 0) - (a.rating || 0)
      }

      if (sortBy === 'Free First') {
        const isFreeA = (a.pricing || '').toLowerCase().includes('free')
        const isFreeB = (b.pricing || '').toLowerCase().includes('free')

        if (isFreeA !== isFreeB) {
          return isFreeA ? -1 : 1
        }

        return (b.rating || 0) - (a.rating || 0)
      }

      // If we performed a semantic search, trust the backend's `_score` if it exists
      if (hasSearchQuery && a._score !== undefined && b._score !== undefined) {
        return b._score - a._score
      }

      return getTrendingScore(b) - getTrendingScore(a)
    })

    return sorted
  }, [category, queryFromParams, hasSearchQuery, sortBy, tools])

  const handleReset = () => {
    setSortBy('Trending')
    setCategory('All')
    setSearchQuery('')
    updateUrlParams('All', '')
  }

  const closeDrawer = () => {
    setShowMobileFilters(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!showMobileFilters) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showMobileFilters])

  useEffect(() => {
    if (!showMobileFilters || !panelRef.current) return
    const focusable = panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
    focusable[0]?.focus()
  }, [showMobileFilters])

  const handlePanelKeyDown = (e) => {
    if (e.key !== 'Tab') return
    const focusable = panelRef.current?.querySelectorAll(FOCUSABLE_SELECTOR)
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const trimmedSearchTerm = queryFromParams.trim()
  const hasFilter = category !== 'All'
  const displaySearchTerm = trimmedSearchTerm.length > 40
    ? `${trimmedSearchTerm.slice(0, 40)}…`
    : trimmedSearchTerm

  let emptyHeading
  let emptyBody
  if (hasSearchQuery && hasFilter) {
    emptyHeading = `No ${category} tools match "${displaySearchTerm}"`
    emptyBody = 'Try a different category or rephrase your search.'
  } else if (hasSearchQuery) {
    emptyHeading = `No tools match "${displaySearchTerm}"`
    emptyBody = 'Try a different search term, or browse by category.'
  } else if (hasFilter) {
    emptyHeading = `No tools in ${category} yet`
    emptyBody = 'Try a different category, or reset to see all tools.'
  } else {
    emptyHeading = 'No tools found'
    emptyBody = 'Try resetting the filters.'
  }

  return (
    <div
      className="container main-content mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <Helmet>
        <title>Browse 427 AI Tools by Category | AI Compass</title>
        <meta name="description" content="Browse our hand-curated directory of 427 AI tools. Filter by category, pricing tier, or student plans. Pricing verified weekly." />
      </Helmet>
      <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl"><WordReveal>AI Tools Directory</WordReveal></h1>
        <span className="text-sm font-medium tabular-nums text-muted">
          {isLoading ? 'Loading...' : `${filteredTools.length} tools`}
        </span>
        {/* Mobile Filters Button */}
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={showMobileFilters}
          aria-controls="mobile-filters-drawer"
          onClick={() => setShowMobileFilters(true)}
          className="md:hidden ml-auto rounded-xl border border-line bg-bg-elev px-4 py-2 text-sm font-semibold text-ink-2 shadow-sm"
        >
          Filters
        </button>
      </section>

      {/* Mobile Filter Drawer */}
      <AnimatePresence>
        {showMobileFilters && (
          <Fragment key="mobile-drawer">
            <MotionDiv
              key="mobile-drawer-backdrop"
              variants={frostedDropdown}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={closeDrawer}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
            />
            <MotionDiv
              key="mobile-drawer-panel"
              ref={panelRef}
              variants={drawerSlideUp}
              initial="initial"
              animate="animate"
              exit="exit"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-filters-title"
              id="mobile-filters-drawer"
              onKeyDown={handlePanelKeyDown}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-bg-elev px-6 pt-6 shadow-2xl md:hidden"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="mobile-filters-title" className="text-lg font-bold text-ink">Filters</h2>
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close filters"
                  className="text-2xl text-muted hover:text-ink"
                >
                  &times;
                </button>
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-ink-2">Category</label>
                <Dropdown
                  value={category}
                  onChange={handleCategoryChange}
                  options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
                  label="Filter category"
                />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-ink-2">Sort By</label>
                <Dropdown
                  value={sortBy}
                  onChange={setSortBy}
                  options={SORT_OPTIONS}
                  label="Sort tools"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1 font-semibold" onClick={closeDrawer}>Apply</Button>
                <Button variant="secondary" className="flex-1 font-semibold" onClick={() => { handleReset(); closeDrawer() }}>Reset</Button>
              </div>
            </MotionDiv>
          </Fragment>
        )}
      </AnimatePresence>

      <section className="sticky top-16 z-20 mb-6 rounded-2xl border border-line bg-bg-elev/95 p-4 shadow-sm backdrop-blur hidden md:block">
        <div className="filters-row flex gap-2 overflow-x-auto pb-1">
          {CATEGORY_OPTIONS.map((option) => {
            const active = option === category

            return (
              <button
                key={option}
                type="button"
                onClick={() => handleCategoryChange(option)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  active
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-transparent bg-bg-sunk text-ink-2 hover:bg-bg-elev'
                }`}
              >
                {option}
              </button>
            )
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
          <Dropdown
            value={sortBy}
            onChange={setSortBy}
            options={SORT_OPTIONS}
            label="Sort tools"
          />

          <SearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            onClear={() => handleSearchChange('')}
            placeholder="Search or describe what you need..."
            style={{ fontSize: 16 }}
          />
        </div>
      </section>
      </MotionDiv>

      {error && <p className="text-danger">{error}</p>}

      {!isLoading && !error && searchMeta?.fuzzy_matched && searchMeta?.suggested_query && (
        <div className="mb-4 rounded-lg border border-accent/20 bg-accent-soft px-4 py-2.5 text-sm text-ink">
          Showing results for <strong className="font-medium">{searchMeta.suggested_query}</strong>.
          {' '}Searched for <em className="text-muted">{searchMeta.original_query}</em>.
        </div>
      )}

      {!isLoading && !error && searchMeta?.fallback && filteredTools.length > 0 && (
        <div className="mb-4 rounded-lg border border-line bg-bg-sunk px-4 py-2.5 text-sm text-muted">
          No exact matches for <em>{searchMeta.original_query}</em>. Showing trending tools — try a different keyword or browse by category.
        </div>
      )}

      {!error && isLoading && (
        <div className="tools-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={`directory-skeleton-${i}`} />
          ))}
        </div>
      )}

      {!isLoading && !error && filteredTools.length > 0 && (
        <MotionDiv
          key={`${category}-${sortBy}-${queryFromParams}`}
          variants={staggerParent}
          initial="initial"
          animate="animate"
          className="tools-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filteredTools.map((tool, i) => (
            <MotionDiv
              key={tool.slug || tool.name}
              variants={staggerChild}
              custom={Math.min(i, 11) * 0.04}
            >
              <Card tool={tool} />
            </MotionDiv>
          ))}
        </MotionDiv>
      )}

      {!isLoading && !error && filteredTools.length === 0 && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-line bg-bg-sunk px-6 py-16 text-center"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm" aria-hidden="true">
            <SearchX className="h-7 w-7 text-muted" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink">{emptyHeading}</h2>
          <p className="mt-2 text-sm text-muted">{emptyBody}</p>
          <div className="mt-6">
            <Button variant="secondary" onClick={handleReset}>
              Reset filters
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

export default DirectoryPage
