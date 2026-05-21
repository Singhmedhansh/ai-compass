import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'

import { Button, Card, SkeletonCard } from '../components/ui'
import ErrorState from '../components/ErrorState'
import { inferErrorVariant } from '../utils/errorState'

function CollectionPage() {
  const { slug } = useParams()
  const [collection, setCollection] = useState(null)
  const [loading, setLoading] = useState(true)
  // error is null when fine, otherwise 'offline' | 'server' | 'notfound'.
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadCollection() {
      try {
        setLoading(true)
        const response = await fetch(`/api/v1/collections/${encodeURIComponent(slug || '')}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          const httpErr = new Error(`HTTP ${response.status}: ${response.statusText}`)
          httpErr.status = response.status
          throw httpErr
        }

        const data = await response.json()
        setCollection(data)
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(inferErrorVariant(err))
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
  }, [slug, retryNonce])

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>{`${collection?.title || 'AI Tools'} — AI Tools Collection | AI Compass`}</title>
        <meta
          name="description"
          content={`Hand-picked AI tools for ${collection?.title || 'this category'}. Curated stack, verified pricing, written rationale. Browse alternatives at AI Compass.`}
        />
        <meta property="og:title" content={`${collection?.title || 'AI Tools'} — AI Tools Collection | AI Compass`} />
        <link rel="canonical" href={`https://ai-compass.in/collections/${slug}`} />
        {/* Breadcrumb + ItemList. Only emit when we actually have data
            so the markup doesn't carry placeholder strings. */}
        {collection && collection.tools && collection.tools.length > 0 ? (
          <>
            <script type="application/ld+json">{JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://ai-compass.in/' },
                { '@type': 'ListItem', position: 2, name: 'Collections', item: 'https://ai-compass.in/collections' },
                { '@type': 'ListItem', position: 3, name: collection.title, item: `https://ai-compass.in/collections/${slug}` },
              ],
            })}</script>
            <script type="application/ld+json">{JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: `${collection.title} — AI Tools Collection`,
              description: collection.description,
              url: `https://ai-compass.in/collections/${slug}`,
              mainEntity: {
                '@type': 'ItemList',
                name: collection.title,
                numberOfItems: collection.tools.length,
                itemListElement: collection.tools.map((t, i) => ({
                  '@type': 'ListItem',
                  position: i + 1,
                  name: t.name,
                  url: `https://ai-compass.in/tools/${t.slug || ''}`,
                })),
              },
            })}</script>
          </>
        ) : null}
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
        <ErrorState
          variant={error}
          onRetry={error === 'notfound' ? undefined : () => setRetryNonce((n) => n + 1)}
          secondaryAction={{ label: 'Back to Collections', to: '/collections' }}
        />
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
    </div>
  )
}

export default CollectionPage
