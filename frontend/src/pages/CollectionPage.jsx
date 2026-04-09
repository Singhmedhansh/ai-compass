import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'

import { AnimatedGrid, AnimatedItem } from '../components/AnimatedGrid'
import PageTransition from '../components/PageTransition'
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
    <PageTransition>
      <main className="mx-auto w-full max-w-7xl bg-gray-50 px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8">
      <Helmet>
        <title>{collection?.meta_title || 'AI Collections | AI Compass'}</title>
        <meta
          name="description"
          content={collection?.meta_description || 'Explore curated AI tool collections by category and use case.'}
        />
        <meta property="og:title" content={collection?.meta_title || 'AI Collections | AI Compass'} />
      </Helmet>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-500">Collection</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          {loading ? 'Loading collection...' : collection?.title || 'Collection not found'}
        </h1>
        <p className="mt-2 max-w-3xl text-gray-600 dark:text-gray-400">
          {collection?.description || 'Curated tools to help you discover the right AI stack faster.'}
        </p>
        <div className="mt-4 inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
          {loading ? 'Loading...' : `${collection?.count || 0} tools`}
        </div>
      </section>

      {error ? (
        <section className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
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
        <AnimatedGrid className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {collection.tools.map((tool) => (
            <AnimatedItem key={tool.slug || tool.name}>
              <Card tool={tool} />
            </AnimatedItem>
          ))}
        </AnimatedGrid>
      ) : !error ? (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center dark:border-gray-700 dark:bg-gray-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-white text-3xl shadow-sm dark:border-gray-700 dark:bg-gray-800" aria-hidden="true">
            📭
          </div>
          <h2 className="mt-5 text-xl font-semibold text-gray-900 dark:text-gray-100">No tools found in this collection</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
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
    </PageTransition>
  )
}

export default CollectionPage
