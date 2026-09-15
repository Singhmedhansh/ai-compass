import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, LayoutGrid } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

import { WordReveal, WizardFunnelCTA } from '../components/ui'
import ErrorState from '../components/ErrorState'
import { sectionReveal, staggerChild } from '../lib/motion'
import { inferErrorVariant } from '../utils/errorState'

const MotionDiv = motion.div
const MotionLink = motion(Link)

// Emoji per category, keyed by slug. Purely decorative — a category with no
// entry gets the LayoutGrid icon rather than a blank space, so adding a
// category to the catalog never needs a matching change here.
const CATEGORY_EMOJI = {
  coding: '⌨️',
  'coding-programming': '🧑‍💻',
  productivity: '⚡',
  research: '🔬',
  'research-productivity': '📚',
  'research-study': '📖',
  'writing-chat': '✍️',
  'design-graphics': '🎨',
  'design-creative': '🖌️',
  design: '🖼️',
  'courses-tutorials': '🎓',
  'image-generation': '🖼️',
  'video-generation': '🎬',
  'audio-voice': '🎙️',
  'video-audio': '📹',
  'audio-video': '🔊',
  'video-animation': '🎞️',
  education: '🏫',
  'developer-tools': '🛠️',
  development: '🧩',
  'customer-support': '💬',
  'sales-marketing': '📈',
  marketing: '📣',
  'email-communication': '📧',
  'business-operations': '🏢',
  'business-marketing': '💼',
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    let mounted = true
    const API = import.meta.env.VITE_API_URL || ''

    async function load() {
      try {
        setLoading(true)
        const response = await fetch(`${API}/api/v1/categories`)
        if (!response.ok) {
          const httpErr = new Error(`HTTP ${response.status}`)
          httpErr.status = response.status
          throw httpErr
        }
        const data = await response.json()
        if (!mounted) return
        setCategories(Array.isArray(data?.categories) ? data.categories : [])
        setError(null)
      } catch (err) {
        if (!mounted) return
        setError(inferErrorVariant(err))
        setCategories([])
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [retryNonce])

  const total = categories.reduce((sum, c) => sum + Number(c.count || 0), 0)

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>Browse AI Tool Categories | AI Compass</title>
        <meta
          name="description"
          content="Every category of hand-tested AI tools on AI Compass — coding, writing, research, design, image, video, and audio. Free to browse, no login."
        />
        <link rel="canonical" href="https://ai-compass.in/categories" />
      </Helmet>

      <header className="mb-12 text-center md:mb-16">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
          <WordReveal>Browse by category</WordReveal>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted sm:text-lg">
          {total > 0
            ? `${total} hand-tested AI tools across ${categories.length} categories, grouped by what they actually do.`
            : 'Hand-tested AI tools, grouped by what they actually do.'}
        </p>
      </header>

      {error ? (
        <ErrorState
          variant={error}
          onRetry={() => setRetryNonce((n) => n + 1)}
          secondaryAction={{ label: 'Browse all tools', to: '/tools' }}
        />
      ) : null}

      {loading && !error ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-2xl border border-line bg-bg-elev"
            />
          ))}
        </div>
      ) : null}

      {!loading && !error ? (
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-10% 0px' }}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {categories.map((category, i) => (
            <MotionLink
              key={category.slug}
              to={`/category/${category.slug}`}
              variants={staggerChild}
              custom={i * 0.04}
              className="group flex flex-col rounded-2xl border border-line bg-bg-elev p-6 outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-xl text-accent"
                  aria-hidden="true"
                >
                  {CATEGORY_EMOJI[category.slug] || <LayoutGrid className="h-6 w-6" />}
                </div>
                <span className="shrink-0 rounded-full bg-bg-sunk px-3 py-1 text-xs font-semibold text-ink-2">
                  {category.count} {category.count === 1 ? 'tool' : 'tools'}
                </span>
              </div>
              <h2 className="mt-5 text-xl font-semibold text-ink">{category.name}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {category.description}
              </p>
              <div className="mt-auto pt-5">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                  View {category.name}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </MotionLink>
          ))}
        </MotionDiv>
      ) : null}

      <WizardFunnelCTA variant="banner" />
    </div>
  )
}
