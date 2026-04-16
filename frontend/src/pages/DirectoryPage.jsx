import { useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import { AnimatedGrid, AnimatedItem } from '../components/AnimatedGrid'
import PageTransition from '../components/PageTransition'
import { Button, Card, SearchInput, SkeletonCard } from '../components/ui'

const CATEGORY_OPTIONS = ['All', 'Coding', 'Writing', 'Research', 'Productivity', 'Image Gen', 'Video Gen']
const SORT_OPTIONS = ['Trending', 'Newest', 'Top Rated', 'Free First']

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
    logo_url: rawTool.logo_url || rawTool.logoUrl,
    logo_emoji: rawTool.logo_emoji || rawTool.emoji,
    accent_color: rawTool.accent_color,
  }
}

function getNormalizedCategory(value = '') {
  return value.toLowerCase().trim()
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

  const [tools, setTools] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState(
    CATEGORY_OPTIONS.find((item) => item.toLowerCase() === initialCategory.toLowerCase()) || 'All',
  )
  const [sortBy, setSortBy] = useState('Trending')
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(initialQuery)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const hasSearchQuery = debouncedSearchQuery.trim().length > 0

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const nextParams = new URLSearchParams()
    if (category !== 'All') {
      nextParams.set('category', category)
    }
    const query = searchQuery.trim()
    if (query) {
      nextParams.set('q', query)
    }
    setSearchParams(nextParams, { replace: true })
  }, [category, searchQuery, setSearchParams])

  useEffect(() => {
    const controller = new AbortController()
    const API = import.meta.env.VITE_API_URL || ''
    const normalizedQuery = debouncedSearchQuery.trim()
    const normalizedCategory = category?.trim() || 'All'
    const isRemoteSearch = Boolean(normalizedQuery)

    async function loadTools() {
      setIsLoading(true)
      setError(null)
      try {
        const abortTimeout = setTimeout(() => controller.abort(), 15000)
        const endpoint = isRemoteSearch
          ? `${API}/api/v1/search?${new URLSearchParams({
              q: normalizedQuery,
              ...(normalizedCategory !== 'All' ? { category: normalizedCategory } : {}),
            }).toString()}`
          : `${API}/api/v1/tools`

        const response = await fetch(endpoint, { signal: controller.signal })
        clearTimeout(abortTimeout)

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`)
        }
        const data = await response.json()
        setTools((data.results || data || []).map(mapTool))
        setIsLoading(false)
      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn('API request timeout, falling back to empty state')
          setError(null)
          setTools([])
          setIsLoading(false)
        } else {
          console.error('DirectoryPage fetch error:', err)
          setError('Failed to load tools')
          setIsLoading(false)
        }
      }
    }

    loadTools()
    return () => controller.abort()
  }, [debouncedSearchQuery, category])

  const filteredTools = useMemo(() => {
    const normalizedSearch = debouncedSearchQuery.trim().toLowerCase()

    // 1. Always filter by category (backend might have done it, but this is safe)
    const byCategory = tools.filter((tool) => {
      if (category === 'All') {
        return true
      }
      return getNormalizedCategory(tool.category) === getNormalizedCategory(category)
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
  }, [category, debouncedSearchQuery, hasSearchQuery, sortBy, tools])

  const handleReset = () => {
    setCategory('All')
    setSortBy('Trending')
    setSearchQuery('')
  }

  return (
    <PageTransition>
      <main
        className="container main-content mx-auto w-full max-w-7xl bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8"
        style={{ maxWidth: 1200, margin: '0 auto', padding: '0 12px' }}
      >
      <Helmet>
        <title>AI Tools Directory | AI Compass</title>
        <meta name="description" content="Discover the best AI tools organized by category, rating, and logic." />
      </Helmet>
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">AI Tools Directory</h1>
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {isLoading ? 'Loading...' : `${filteredTools.length} tools`}
        </span>
        {/* Mobile Filters Button */}
        <button
          className="md:hidden ml-auto rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          onClick={() => setShowMobileFilters(true)}
        >
          Filters
        </button>
      </section>

      {/* Mobile Filter Drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileFilters(false)} />
          <div className="relative w-full rounded-t-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Filters</h2>
              <button className="text-2xl" onClick={() => setShowMobileFilters(false)}>&times;</button>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1">Category</label>
              <select
                className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold mb-1">Sort By</label>
              <select
                className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                {SORT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 rounded-lg bg-indigo-600 text-white py-2 font-semibold" onClick={() => setShowMobileFilters(false)}>Apply</button>
              <button className="flex-1 rounded-lg bg-gray-200 text-gray-700 py-2 font-semibold dark:bg-gray-700 dark:text-gray-200" onClick={handleReset}>Reset</button>
            </div>
          </div>
        </div>
      )}

      <section className="sticky top-16 z-20 mb-6 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 hidden md:block">
        <div className="filters-row flex gap-2 overflow-x-auto pb-1">
          {CATEGORY_OPTIONS.map((option) => {
            const active = option === category

            return (
              <button
                key={option}
                type="button"
                onClick={() => setCategory(option)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                {option}
              </button>
            )
          })}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            aria-label="Sort tools"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
            placeholder="Search tools, categories, or use cases..."
            style={{ fontSize: 16 }}
          />
        </div>
      </section>

      {isLoading && <p>Loading tools...</p>}
      {error && <p style={{color:'var(--text-muted)'}}>{error}</p>}

      {!isLoading && !error && filteredTools.length > 0 ? (
        <AnimatedGrid className="tools-grid grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTools.map((tool) => (
            <AnimatedItem key={tool.slug || tool.name}>
              <Card tool={tool} />
            </AnimatedItem>
          ))}
        </AnimatedGrid>
      ) : null}

      {!isLoading && !error && filteredTools.length === 0 && (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center dark:border-gray-700 dark:bg-gray-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-white text-3xl shadow-sm dark:border-gray-700 dark:bg-gray-800" aria-hidden="true">
            🔎
          </div>
          <h2 className="mt-5 text-xl font-semibold text-gray-900 dark:text-gray-100">No tools found for this filter</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Try a broader category, clear the search term, or reset all filters.
          </p>
          <div className="mt-6">
            <Button variant="secondary" onClick={handleReset}>
              Reset filters
            </Button>
          </div>
        </section>
      )}
      </main>
    </PageTransition>
  )
}

export default DirectoryPage
