import { useEffect, useMemo, useState } from 'react'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState(
    CATEGORY_OPTIONS.find((item) => item.toLowerCase() === initialCategory.toLowerCase()) || 'All',
  )
  const [sortBy, setSortBy] = useState('Trending')
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(initialQuery)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams)

    if (category !== 'All') {
      nextParams.set('category', category)
    } else {
      nextParams.delete('category')
    }

    const query = searchQuery.trim()
    if (query) {
      nextParams.set('q', query)
    } else {
      nextParams.delete('q')
    }

    setSearchParams(nextParams, { replace: true })
  }, [category, searchParams, searchQuery, setSearchParams])

  useEffect(() => {
    const controller = new AbortController()

    async function loadTools() {
      try {
        const response = await fetch('/api/v1/tools', { signal: controller.signal })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()

        let resolvedTools = []
        if (Array.isArray(data)) {
          resolvedTools = data
        } else if (data && typeof data === 'object') {
          if (Array.isArray(data.tools)) {
            resolvedTools = data.tools
          } else if (Array.isArray(data.data)) {
            resolvedTools = data.data
          } else if (Array.isArray(data.items)) {
            resolvedTools = data.items
          } else if (Array.isArray(data.results)) {
            resolvedTools = data.results
          }
        }

        setTools(resolvedTools.map(mapTool))
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setTools([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadTools()

    return () => controller.abort()
  }, [])

  const filteredTools = useMemo(() => {
    const normalizedSearch = debouncedSearchQuery.trim().toLowerCase()

    const byCategory = tools.filter((tool) => {
      if (category === 'All') {
        return true
      }

      return getNormalizedCategory(tool.category) === getNormalizedCategory(category)
    })

    const bySearch = byCategory.filter((tool) => {
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

      return getTrendingScore(b) - getTrendingScore(a)
    })

    return sorted
  }, [category, debouncedSearchQuery, sortBy, tools])

  const handleReset = () => {
    setCategory('All')
    setSortBy('Trending')
    setSearchQuery('')
  }

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-7xl bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8">
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">AI Tools Directory</h1>
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {loading ? 'Loading...' : `${filteredTools.length} tools`}
        </span>
      </section>

      <section className="sticky top-16 z-20 mb-6 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
        <div className="flex gap-2 overflow-x-auto pb-1">
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
          />
        </div>
      </section>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
          Failed to load tools: {error}
        </div>
      )}

      {loading ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={`directory-skeleton-${index}`} />
          ))}
        </section>
      ) : filteredTools.length > 0 ? (
        <AnimatedGrid className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTools.map((tool) => (
            <AnimatedItem key={tool.slug || tool.name}>
              <Card tool={tool} />
            </AnimatedItem>
          ))}
        </AnimatedGrid>
      ) : (
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
