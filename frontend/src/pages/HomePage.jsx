import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { Badge, Button, Card, SkeletonCard } from '../components/ui'

const HOME_CATEGORIES = [
  { name: 'Coding', emoji: '💻', variant: 'coding' },
  { name: 'Writing', emoji: '✍️', variant: 'writing' },
  { name: 'Research', emoji: '🔍', variant: 'research' },
  { name: 'Productivity', emoji: '⚡', variant: 'productivity' },
  { name: 'Image Gen', emoji: '🎨', variant: 'image gen' },
  { name: 'Video Gen', emoji: '🎬', variant: 'video gen' },
]

const STAT_CONFIG = [
  { label: 'Tools', value: 500, suffix: '+' },
  { label: 'Categories', value: 6, suffix: '' },
  { label: 'Updated Weekly', value: 1, suffix: '' },
]

function mapTool(rawTool) {
  return {
    slug: rawTool.slug,
    name: rawTool.name,
    shortDescription: rawTool.shortDescription || rawTool.description || rawTool.summary,
    category: rawTool.category || 'coding',
    rating: rawTool.rating || rawTool.averageRating || rawTool.average_rating || 0,
    pricing: rawTool.pricing || rawTool.pricingType || rawTool.pricing_type || 'Free',
    logo: rawTool.logo,
    emoji: rawTool.emoji,
    icon: rawTool.icon,
  }
}

function HomePage() {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState([0, 0, 0])

  useEffect(() => {
    let frame = null
    const start = performance.now()
    const duration = 1200

    function animateStats(now) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)

      setStats(STAT_CONFIG.map((item) => Math.round(item.value * eased)))

      if (progress < 1) {
        frame = requestAnimationFrame(animateStats)
      }
    }

    frame = requestAnimationFrame(animateStats)

    return () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadTools() {
      try {
        console.log('[HomePage] Fetching tools from /api/v1/tools...')
        const response = await fetch('/api/v1/tools', { signal: controller.signal })

        console.log(`[HomePage] Response status: ${response.status} ${response.statusText}`)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        console.log('[HomePage] Received data:', data)

        // Explore data structure
        let resolvedTools = []

        if (Array.isArray(data)) {
          console.log('[HomePage] Data is a direct array')
          resolvedTools = data
        } else if (data && typeof data === 'object') {
          console.log('[HomePage] Data is an object. Keys:', Object.keys(data))

          // Try common data structure keys
          if (Array.isArray(data.tools)) {
            console.log('[HomePage] Found tools under data.tools')
            resolvedTools = data.tools
          } else if (Array.isArray(data.data)) {
            console.log('[HomePage] Found tools under data.data')
            resolvedTools = data.data
          } else if (Array.isArray(data.items)) {
            console.log('[HomePage] Found tools under data.items')
            resolvedTools = data.items
          } else if (Array.isArray(data.results)) {
            console.log('[HomePage] Found tools under data.results')
            resolvedTools = data.results
          }
        }

        console.log(`[HomePage] Resolved ${resolvedTools.length} tools total`)
        const mapped = resolvedTools.slice(0, 6).map(mapTool)

        console.log('[HomePage] Mapped tools:', mapped)
        setTools(mapped)
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[HomePage] Error loading tools:', err.message, err)
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

    return () => {
      controller.abort()
    }
  }, [])

  return (
    <main>
      <section className="relative z-0 flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-gray-950 px-4 py-12 sm:px-6 lg:px-8">
        {/* Grid pattern overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
            backgroundSize: '4rem 4rem',
          }}
        />

        <div className="relative z-10 max-w-2xl text-center">
          <Badge
            label="✨ AI Discovery Platform"
            variant="coding"
            className="mb-6 animate-pulse rounded-full px-4 py-1.5 text-sm font-semibold"
          />
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
            Find the perfect AI tool for your workflow
          </h1>
          <p className="mt-6 text-lg text-gray-400 sm:text-xl">
            Discover, compare, and bookmark the best AI products for coding, writing, research, and daily execution.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/tools">
              <Button variant="primary" size="lg">
                Browse All Tools
              </Button>
            </Link>
            <Link to="/ai-tool-finder">
              <Button variant="ghost" size="lg" className="border border-slate-600 text-slate-100 hover:bg-slate-800">
                Get My AI Stack
              </Button>
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STAT_CONFIG.map((item, index) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-5 py-4 backdrop-blur"
              >
                <p className="text-2xl font-bold text-white">
                  {index === 0 ? `${stats[index]}${item.suffix} ${item.label}` : null}
                  {index === 1 ? `${stats[index]} ${item.label}` : null}
                  {index === 2 ? (stats[index] > 0 ? 'Updated Weekly' : '0') : null}
                </p>
                <p className="mt-1 text-sm text-slate-300">{item.label === 'Updated Weekly' ? 'Fresh data drops every week' : item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Explore By Category</h2>
          <Link to="/tools" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            Browse all →
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2">
          {HOME_CATEGORIES.map((category) => (
            <Link
              key={category.name}
              to={`/tools?category=${encodeURIComponent(category.name)}`}
              className="group min-w-44 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
            >
              <div className="text-2xl" aria-hidden="true">
                {category.emoji}
              </div>
              <p className="mt-3 font-semibold text-slate-900 dark:text-slate-100">{category.name}</p>
              <Badge label={category.name} variant={category.variant} className="mt-3" />
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Featured Tools</h2>
          <Link to="/tools" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
            View all tools →
          </Link>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
            <p className="font-semibold">Error loading tools</p>
            <p className="text-sm">{error}</p>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              Check browser console for more details.
            </p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={`home-skeleton-${index}`} />
            ))}
          </div>
        ) : tools.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <Card key={tool.slug || tool.name} tool={tool} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-12 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-lg text-slate-600 dark:text-slate-300">No tools found</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Check back soon or browse all tools to see what's available.
            </p>
            <div className="mt-4">
              <Link to="/tools">
                <Button variant="secondary" size="md">
                  Browse All Tools
                </Button>
              </Link>
            </div>
          </div>
        )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">How It Works</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { step: '1', title: 'Browse Categories', detail: 'Explore curated categories across the AI landscape.' },
            { step: '2', title: 'Compare Tools', detail: 'Review ratings, pricing, and strengths side by side.' },
            { step: '3', title: 'Get Your Stack', detail: 'Build your personalized set of tools for daily work.' },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-sm font-semibold uppercase tracking-wider text-indigo-500">Step {item.step}</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

export default HomePage