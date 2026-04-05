import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { AnimatedGrid, AnimatedItem } from '../components/AnimatedGrid'
import PageTransition from '../components/PageTransition'
import { Badge, Button, Card, SkeletonCard } from '../components/ui'

const MotionDiv = motion.div
const MotionSpan = motion.span
const MotionP = motion.p

function AnimatedCount({ end, suffix = '', active, duration = 1200 }) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) {
      setValue(0)
      return undefined
    }

    const startTime = performance.now()
    let frameId = 0

    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      setValue(Math.round(end * easedProgress))

      if (progress < 1) {
        frameId = window.requestAnimationFrame(step)
      }
    }

    frameId = window.requestAnimationFrame(step)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [active, duration, end])

  return <span>{`${value}${suffix}`}</span>
}

const HERO_TITLE = 'Find the perfect AI tool for your workflow'
const HERO_WORDS = HERO_TITLE.split(' ')

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

const POPULAR_COLLECTIONS = [
  {
    slug: 'best-free-tools',
    title: 'Best Free Tools',
    emoji: '🆓',
    description: 'Top no-cost tools for students and creators.',
  },
  {
    slug: 'best-for-coding',
    title: 'Best for Coding',
    emoji: '💻',
    description: 'Powerful coding assistants and developer picks.',
  },
  {
    slug: 'trending',
    title: 'Trending Now',
    emoji: '🔥',
    description: 'The fastest-rising AI tools right now.',
  },
  {
    slug: 'top-rated',
    title: 'Top Rated',
    emoji: '⭐',
    description: 'Highest-rated tools across the catalog.',
  },
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
  const [collectionCounts, setCollectionCounts] = useState({})
  const { ref: statsRef, inView: statsInView } = useInView({ triggerOnce: true })

  useEffect(() => {
    const controller = new AbortController()

    async function loadTools() {
      try {
        const response = await fetch('/api/v1/tools', { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        const resolvedTools = Array.isArray(data) ? data : Array.isArray(data?.tools) ? data.tools : []
        setTools(resolvedTools.slice(0, 6).map(mapTool))
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

  useEffect(() => {
    let mounted = true

    async function loadCollectionCounts() {
      const entries = await Promise.all(
        POPULAR_COLLECTIONS.map(async (collection) => {
          try {
            const response = await fetch(`/api/v1/collections/${collection.slug}`)
            if (!response.ok) {
              return [collection.slug, 0]
            }

            const data = await response.json()
            return [collection.slug, Number(data?.count || 0)]
          } catch {
            return [collection.slug, 0]
          }
        }),
      )

      if (mounted) {
        setCollectionCounts(Object.fromEntries(entries))
      }
    }

    loadCollectionCounts()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <PageTransition>
      <main>
        <section className="relative z-0 flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-gray-950 px-4 py-12 sm:px-6 lg:px-8">
          <MotionDiv
            className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 rounded-full bg-indigo-500/30 blur-3xl"
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          />
          <MotionDiv
            className="pointer-events-none absolute -bottom-24 -right-12 h-80 w-80 rounded-full bg-purple-500/30 blur-3xl"
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', delay: 0.6 }}
          />

          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)',
              backgroundSize: '4rem 4rem',
            }}
          />

          <div className="relative z-10 max-w-3xl text-center">
            <MotionDiv
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="mb-6"
            >
              <Badge
                label="✨ AI Discovery Platform"
                variant="coding"
                className="rounded-full px-4 py-1.5 text-sm font-semibold"
              />
            </MotionDiv>

            <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl md:text-7xl">
              {HERO_WORDS.map((word, index) => (
                <MotionSpan
                  key={`${word}-${index}`}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.05 }}
                  className="mr-3 inline-block"
                >
                  {word}
                </MotionSpan>
              ))}
            </h1>

            <MotionP
              className="mt-6 text-lg text-gray-300 sm:text-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              Discover, compare, and bookmark the best AI products for coding, writing, research, and daily execution.
            </MotionP>

            <MotionDiv
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
            >
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
            </MotionDiv>

            <div ref={statsRef} className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {STAT_CONFIG.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-700/80 bg-slate-900/60 px-5 py-4 backdrop-blur"
                >
                  <p className="text-2xl font-bold text-white">
                    {statsInView ? (
                      <AnimatedCount end={item.value} suffix={item.suffix} active={statsInView} duration={2000} />
                    ) : (
                      `0${item.suffix}`
                    )}
                    {item.label === 'Updated Weekly' ? '' : ` ${item.label}`}
                    {item.label === 'Updated Weekly' ? ' Updated Weekly' : ''}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {item.label === 'Updated Weekly' ? 'Fresh data drops every week' : item.label}
                  </p>
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

            {error ? (
              <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
                <p className="font-semibold">Error loading tools</p>
                <p className="text-sm">{error}</p>
              </div>
            ) : null}

            {loading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <SkeletonCard key={`home-skeleton-${index}`} />
                ))}
              </div>
            ) : tools.length > 0 ? (
              <AnimatedGrid className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {tools.map((tool) => (
                  <AnimatedItem key={tool.slug || tool.name}>
                    <Card tool={tool} />
                  </AnimatedItem>
                ))}
              </AnimatedGrid>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-12 dark:border-slate-800 dark:bg-slate-900/50">
                <p className="text-lg text-slate-600 dark:text-slate-300">No tools found</p>
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

        <section className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Browse by Collection</h2>
            <Link to="/collections" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
              See all collections →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {POPULAR_COLLECTIONS.map((collection) => (
              <Link
                key={collection.slug}
                to={`/collections/${collection.slug}`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
              >
                <div className="text-2xl" aria-hidden="true">
                  {collection.emoji}
                </div>
                <h3 className="mt-3 font-semibold text-slate-900 dark:text-slate-100">{collection.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{collection.description}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                  {(collectionCounts[collection.slug] ?? 0).toLocaleString()} tools
                </p>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </PageTransition>
  )
}

export default HomePage
