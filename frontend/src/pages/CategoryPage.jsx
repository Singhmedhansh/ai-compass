import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'

import { DenseToolCard, SkeletonCard, WizardFunnelCTA } from '../components/ui'
import ErrorState from '../components/ErrorState'
import { sectionReveal, staggerChild } from '../lib/motion'
import { inferErrorVariant } from '../utils/errorState'

const MotionDiv = motion.div

export default function CategoryPage() {
  const { slug } = useParams()
  const [category, setCategory] = useState(null)
  const [tools, setTools] = useState([])
  const [related, setRelated] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    let mounted = true
    const API = import.meta.env.VITE_API_URL || ''

    async function load() {
      try {
        setLoading(true)
        setNotFound(false)
        const response = await fetch(`${API}/api/v1/categories/${encodeURIComponent(slug)}`)
        if (response.status === 404) {
          if (mounted) {
            setNotFound(true)
            setError(null)
          }
          return
        }
        if (!response.ok) {
          const httpErr = new Error(`HTTP ${response.status}`)
          httpErr.status = response.status
          throw httpErr
        }
        const data = await response.json()
        if (!mounted) return
        setCategory({
          slug: data.slug,
          name: data.name,
          count: data.count,
          description: data.description,
        })
        setTools(Array.isArray(data.tools) ? data.tools : [])
        setRelated(Array.isArray(data.related) ? data.related : [])
        setError(null)
      } catch (err) {
        if (!mounted) return
        setError(inferErrorVariant(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => {
      mounted = false
    }
  }, [slug, retryNonce])

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Category not found</h1>
        <p className="mt-3 text-muted">
          There is no <span className="font-medium text-ink-2">{slug}</span> category
          in the AI Compass catalog.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/categories"
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink"
          >
            Browse all categories
          </Link>
          <Link
            to="/tools"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink"
          >
            Browse all tools
          </Link>
        </div>
      </div>
    )
  }

  const name = category?.name || ''
  const count = category?.count ?? 0

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {category ? (
        <Helmet>
          <title>{`${count} Best ${name} AI Tools in 2026 (Free & Paid) | AI Compass`}</title>
          <meta
            name="description"
            content={`${count} hand-tested ${name} AI tools, ranked. Free tiers, pricing, and student options compared. No login to browse.`}
          />
          <link rel="canonical" href={`https://ai-compass.in/category/${category.slug}`} />
        </Helmet>
      ) : null}

      <nav className="mb-6 text-sm text-muted" aria-label="Breadcrumb">
        <Link to="/categories" className="inline-flex items-center gap-1.5 hover:text-ink">
          <ArrowLeft className="h-4 w-4" />
          All categories
        </Link>
      </nav>

      <header className="mb-10">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          {category ? `Best ${name} AI tools` : 'Loading category…'}
        </h1>
        {category ? (
          <>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
              {category.description}
            </p>
            <p className="mt-4 text-sm text-ink-2">
              {count} hand-tested {name} {count === 1 ? 'tool' : 'tools'}, ranked by our
              curation score. Sponsored placements are labelled and never counted in the
              ranking.
            </p>
          </>
        ) : null}
      </header>

      {error ? (
        <ErrorState
          variant={error}
          onRetry={() => setRetryNonce((n) => n + 1)}
          secondaryAction={{ label: 'Browse all tools', to: '/tools' }}
        />
      ) : null}

      {loading && !error ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : null}

      {!loading && !error && tools.length > 0 ? (
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {tools.map((tool, i) => (
            <MotionDiv key={tool.slug} variants={staggerChild} custom={Math.min(i, 12) * 0.03}>
              <DenseToolCard tool={tool} />
            </MotionDiv>
          ))}
        </MotionDiv>
      ) : null}

      {!loading && !error && tools.length === 0 && category ? (
        <p className="rounded-2xl border border-line bg-bg-elev p-8 text-center text-muted">
          No tools are visible in {name} right now.{' '}
          <Link to="/tools" className="font-semibold text-accent">
            Browse the full catalog
          </Link>
          .
        </p>
      ) : null}

      {related.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-xl font-semibold text-ink">Related categories</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {related.map((item) => (
              <Link
                key={item.slug}
                to={`/category/${item.slug}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg-elev px-4 py-2 text-sm font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
              >
                {item.name}
                <span className="text-xs text-muted">{item.count}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <WizardFunnelCTA variant="banner" />
    </div>
  )
}
