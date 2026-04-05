import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

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
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Browse AI Tool Collections</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">
          Explore curated categories tailored to goals like coding, writing, research, and more.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {COLLECTIONS.map((collection) => (
          <Link
            key={collection.slug}
            to={`/collections/${collection.slug}`}
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-3xl" aria-hidden="true">
                  {collection.emoji}
                </p>
                <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">{collection.title}</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{collection.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                {counts[collection.slug] ?? 0}
              </span>
            </div>

            <p className="mt-5 text-sm font-semibold text-indigo-600 group-hover:text-indigo-500 dark:text-indigo-400">
              View Collection →
            </p>
          </Link>
        ))}
      </section>
    </main>
  )
}

export default CollectionsPage
