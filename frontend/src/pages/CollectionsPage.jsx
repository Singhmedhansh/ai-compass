import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Zap, GraduationCap, Terminal, PenTool, Microscope, Flame, Award } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

import { WordReveal } from '../components/ui'
import ErrorState from '../components/ErrorState'
import { sectionReveal, staggerChild } from '../lib/motion'
import { inferErrorVariant } from '../utils/errorState'

// motion(component) calls aliased at module scope — ESLint quirk in the local config flags inline JSX with motion.X otherwise.
const MotionDiv = motion.div
const MotionLink = motion(Link)

const COLLECTIONS = [
  {
    slug: 'best-free-tools',
    Icon: Zap,
    title: 'Best Free Tools',
    description: 'Top free AI tools for everyday workflows.',
  },
  {
    slug: 'best-for-students',
    Icon: GraduationCap,
    title: 'Best for Students',
    description: 'Student-friendly tools for study, writing, and projects.',
  },
  {
    slug: 'best-for-coding',
    Icon: Terminal,
    title: 'Best for Coding',
    description: 'High-impact coding assistants and developer tools.',
  },
  {
    slug: 'best-for-writing',
    Icon: PenTool,
    title: 'Best for Writing',
    description: 'AI tools for writing, editing, and documentation.',
  },
  {
    slug: 'best-for-research',
    Icon: Microscope,
    title: 'Best for Research',
    description: 'Research-focused tools for summaries and insight extraction.',
  },
  {
    slug: 'trending',
    Icon: Flame,
    title: 'Trending Now',
    description: 'The fastest-rising AI tools right now.',
  },
  {
    slug: 'top-rated',
    Icon: Award,
    title: 'Top Rated',
    description: 'The highest-rated tools by users and quality signals.',
  },
]

function CollectionsPage() {
  const [counts, setCounts] = useState({})
  // Only surface a full-page error if *every* count fetch fails — a single
  // collection erroring shouldn't blank the whole grid, that's just a soft
  // 0. variant: null | 'offline' | 'server'.
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    let mounted = true

    async function loadCounts() {
      const results = await Promise.all(
        COLLECTIONS.map(async (collection) => {
          try {
            const response = await fetch(`/api/v1/collections/${collection.slug}`)
            if (!response.ok) {
              const httpErr = new Error(`HTTP ${response.status}`)
              httpErr.status = response.status
              return { slug: collection.slug, count: 0, error: httpErr }
            }
            const data = await response.json()
            return { slug: collection.slug, count: Number(data?.count || 0), error: null }
          } catch (err) {
            return { slug: collection.slug, count: 0, error: err }
          }
        }),
      )

      if (!mounted) return

      const successes = results.filter((r) => !r.error)
      if (successes.length === 0 && results.length > 0) {
        // All requests failed — treat as a real failure, not a "0 tools"
        // wallpaper. Pick the first error to infer the variant from.
        setError(inferErrorVariant(results[0].error))
        setCounts({})
      } else {
        setError(null)
        setCounts(Object.fromEntries(results.map((r) => [r.slug, r.count])))
      }
    }

    loadCounts()

    return () => {
      mounted = false
    }
  }, [retryNonce])

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>AI Tool Collections — Curated Stacks by Use Case | AI Compass</title>
        <meta name="description" content="Curated collections of AI tools grouped by use case: writing, research, coding, design, productivity. Hand-tested stacks for students." />
      </Helmet>

      <header className="mb-12 text-center md:mb-16">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
          <WordReveal>Browse AI tool collections</WordReveal>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted sm:text-lg">
          Explore curated categories tailored to goals like coding, writing, research, and more.
        </p>
      </header>

      {error ? (
        <ErrorState
          variant={error}
          onRetry={() => setRetryNonce((n) => n + 1)}
          secondaryAction={{ label: 'Browse all tools', to: '/tools' }}
        />
      ) : null}

      <MotionDiv
        variants={sectionReveal}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true, margin: '-10% 0px' }}
        className={`grid grid-cols-1 gap-6 md:grid-cols-2 ${error ? 'hidden' : ''}`}
      >
        {COLLECTIONS.map((collection, i) => (
          <MotionLink
            key={collection.slug}
            to={`/collections/${collection.slug}`}
            variants={staggerChild}
            custom={i * 0.05}
            className="group flex flex-col rounded-2xl border border-line bg-bg-elev p-6 outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent"
                aria-hidden="true"
              >
                <collection.Icon className="h-6 w-6" />
              </div>
              <span className="shrink-0 rounded-full bg-bg-sunk px-3 py-1 text-xs font-semibold text-ink-2">
                {counts[collection.slug] ?? 0}
              </span>
            </div>
            <h2 className="mt-5 text-xl font-semibold text-ink">{collection.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{collection.description}</p>
            {/* mt-auto pins CTA to card bottom so cards line up regardless of description length. */}
            <div className="mt-auto pt-5">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                View collection
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </MotionLink>
        ))}
      </MotionDiv>
    </div>
  )
}

export default CollectionsPage
