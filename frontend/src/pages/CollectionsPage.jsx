import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

import { WordReveal } from '../components/ui'
import { sectionReveal, staggerChild } from '../lib/motion'

// motion(component) calls aliased at module scope — ESLint quirk in the local config flags inline JSX with motion.X otherwise.
const MotionDiv = motion.div
const MotionLink = motion(Link)

const COLLECTIONS = [
  {
    slug: 'best-free-tools',
    emoji: '🆓',
    title: 'Best Free Tools',
    description: 'Top free AI tools for everyday workflows.',
  },
  {
    slug: 'best-for-students',
    emoji: '🎓',
    title: 'Best for Students',
    description: 'Student-friendly tools for study, writing, and projects.',
  },
  {
    slug: 'best-for-coding',
    emoji: '💻',
    title: 'Best for Coding',
    description: 'High-impact coding assistants and developer tools.',
  },
  {
    slug: 'best-for-writing',
    emoji: '✍️',
    title: 'Best for Writing',
    description: 'AI tools for writing, editing, and documentation.',
  },
  {
    slug: 'best-for-research',
    emoji: '🔬',
    title: 'Best for Research',
    description: 'Research-focused tools for summaries and insight extraction.',
  },
  {
    slug: 'trending',
    emoji: '🔥',
    title: 'Trending Now',
    description: 'The fastest-rising AI tools right now.',
  },
  {
    slug: 'top-rated',
    emoji: '⭐',
    title: 'Top Rated',
    description: 'The highest-rated tools by users and quality signals.',
  },
]

function CollectionsPage() {
  const [counts, setCounts] = useState({})

  useEffect(() => {
    let mounted = true

    async function loadCounts() {
      const entries = await Promise.all(
        COLLECTIONS.map(async (collection) => {
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
        setCounts(Object.fromEntries(entries))
      }
    }

    loadCounts()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>Browse AI Tool Collections | AI Compass</title>
        <meta name="description" content="Explore curated categories tailored to goals like coding, writing, research, and more." />
      </Helmet>

      <header className="mb-12 text-center md:mb-16">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
          <WordReveal>Browse AI tool collections</WordReveal>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted sm:text-lg">
          Explore curated categories tailored to goals like coding, writing, research, and more.
        </p>
      </header>

      <MotionDiv
        variants={sectionReveal}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true, margin: '-10% 0px' }}
        className="grid grid-cols-1 gap-6 md:grid-cols-2"
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
                className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-2xl"
                aria-hidden="true"
              >
                {collection.emoji}
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
