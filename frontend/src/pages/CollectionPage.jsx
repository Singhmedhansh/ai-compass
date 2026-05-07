import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'

import { Button, Card, SkeletonCard } from '../components/ui'

function CollectionPage() {
  const { slug } = useParams()
  const [collection, setCollection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCollection() {
      try {
        setLoading(true)
        const response = await fetch(`/api/v1/collections/${encodeURIComponent(slug || '')}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        setCollection(data)
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
          setCollection(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadCollection()

    return () => controller.abort()
  }, [slug])

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>{collection?.meta_title || 'AI Collections | AI Compass'}</title>
        <meta
          name="description"
          content={collection?.meta_description || 'Explore curated AI tool collections by category and use case.'}
        />
        <meta property="og:title" content={collection?.meta_title || 'AI Collections | AI Compass'} />
      </Helmet>

      <section className="mb-6 rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">Collection</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">
          {loading ? 'Loading collection...' : collection?.title || 'Collection not found'}
        </h1>
        <p className="mt-2 max-w-3xl text-muted">
          {collection?.description || 'Curated tools to help you discover the right AI stack faster.'}
        </p>
        <div className="mt-4 inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent-ink">
          {loading ? 'Loading...' : `${collection?.count || 0} tools`}
        </div>
      </section>

      {error ? (
        <section className="rounded-xl border border-danger bg-danger-soft p-4 text-danger">
          <p className="font-semibold">Failed to load collection</p>
          <p className="mt-1 text-sm">{error}</p>
          <div className="mt-4">
            <Link to="/collections">
              <Button variant="secondary">Back to Collections</Button>
            </Link>
          </div>
        </section>
      ) : null}

      {loading ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={`collection-skeleton-${index}`} />
          ))}
        </section>
      ) : collection?.tools?.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {collection.tools.map((tool) => (
            <Card key={tool.slug || tool.name} tool={tool} />
          ))}
        </div>
      ) : !error ? (
        <section className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk px-6 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-bg-elev text-3xl shadow-sm" aria-hidden="true">
            📭
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink">No tools found in this collection</h2>
          <p className="mt-2 text-sm text-muted">
            Try another collection to discover more tools.
          </p>
          <div className="mt-6">
            <Link to="/collections">
              <Button variant="secondary">Browse all collections</Button>
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  )
}

export default CollectionPage
