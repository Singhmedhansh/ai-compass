import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Inbox, Loader2, X } from 'lucide-react'

import CommunityFeedItem from '../components/community/CommunityFeedItem'
import CommunityComposer from '../components/community/CommunityComposer'
import ErrorState from '../components/ErrorState'
import { inferErrorVariant } from '../utils/errorState'

const SORTS = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
]

function CommunityPage() {
  const [searchParams] = useSearchParams()
  const toolSlug = searchParams.get('tool_slug') || ''
  const [posts, setPosts] = useState([])
  const [sort, setSort] = useState('hot')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [showComposer, setShowComposer] = useState(false)

  const [isLoggedIn] = useState(() => {
    try {
      return Boolean(JSON.parse(localStorage.getItem('user') || 'null'))
    } catch {
      return false
    }
  })

  // Reset to page 1 whenever the sort or tool filter changes.
  useEffect(() => {
    setPage(1)
  }, [sort, toolSlug])

  useEffect(() => {
    const controller = new AbortController()

    async function loadPosts() {
      try {
        if (page === 1) {
          setLoading(true)
        } else {
          setLoadingMore(true)
        }
        const toolFilter = toolSlug ? `&tool_slug=${encodeURIComponent(toolSlug)}` : ''
        const response = await fetch(`/api/v1/community/posts?sort=${sort}&page=${page}${toolFilter}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) {
          const httpErr = new Error(`HTTP ${response.status}: ${response.statusText}`)
          httpErr.status = response.status
          throw httpErr
        }
        const data = await response.json()
        const nextPosts = Array.isArray(data.posts) ? data.posts : []
        setPosts((prev) => (page === 1 ? nextPosts : [...prev, ...nextPosts]))
        setHasMore(Boolean(data.has_more))
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(inferErrorVariant(err))
          if (page === 1) setPosts([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    }

    loadPosts()
    return () => controller.abort()
  }, [sort, toolSlug, page, retryNonce])

  const handleVote = async (postId, voteType) => {
    if (!isLoggedIn) {
      toast.error('Please log in to vote on posts')
      return
    }
    try {
      const response = await fetch(`/api/v1/community/posts/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote_type: voteType }),
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p
            const nextVote = p.user_vote === voteType ? 0 : voteType
            return { ...p, score: data.score, user_vote: nextVote === 0 ? null : voteType }
          })
        )
      } else {
        toast.error('Could not save your vote. Please try again.')
      }
    } catch {
      toast.error('Could not save your vote. Please try again.')
    }
  }

  const handleCreated = () => {
    setShowComposer(false)
    setSort('new')
    setPage(1)
    setRetryNonce((n) => n + 1)
    toast.success('Post published!')
  }

  const handleDelete = async (postId) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    try {
      const response = await fetch(`/api/v1/community/posts/${postId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setPosts((prev) => prev.filter((p) => p.id !== postId))
        toast.success('Post deleted')
      } else {
        toast.error('Could not delete post')
      }
    } catch {
      toast.error('Could not delete post')
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>Community — News, Questions & Discussion | AI Compass</title>
        <meta
          name="description"
          content="The AI Compass community feed — share AI tool news, ask questions, and discuss what's working for students and developers."
        />
        <link rel="canonical" href="https://ai-compass.in/community" />
      </Helmet>

      <section className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Community</h1>
        <p className="mt-2 max-w-2xl text-muted">
          News, questions, and discussion from the AI Compass community.
        </p>
      </section>

      <section className="mb-6 rounded-2xl border border-line bg-bg-elev p-6">
        {showComposer ? (
          <CommunityComposer
            isLoggedIn={isLoggedIn}
            onCreated={handleCreated}
            onCancel={() => setShowComposer(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowComposer(true)}
            className="w-full rounded-lg border border-line bg-bg-sunk px-4 py-3 text-left text-sm text-muted transition hover:border-line-strong hover:text-ink"
          >
            Share news, ask a question, or start a discussion...
          </button>
        )}
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSort(s.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
                sort === s.value
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-bg-elev text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {toolSlug && (
          <Link
            to="/community"
            className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-ink"
          >
            re: {toolSlug} <X className="h-3 w-3" />
          </Link>
        )}
      </div>

      {error ? (
        <ErrorState variant={error} onRetry={() => setRetryNonce((n) => n + 1)} />
      ) : loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading posts">
          {[1, 2, 3].map((i) => (
            <div key={`community-skeleton-${i}`} className="h-24 animate-pulse rounded-xl border border-line bg-bg-sunk" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <section role="status" aria-live="polite" className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk px-6 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm text-muted-2" aria-hidden="true">
            <Inbox className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink">No posts yet</h2>
          <p className="mt-2 text-sm text-muted">Be the first to start a discussion.</p>
        </section>
      ) : (
        <>
          <div aria-live="polite" className="space-y-3">
            {posts.map((post) => (
              <CommunityFeedItem key={post.id} post={post} onVote={handleVote} onDelete={handleDelete} />
            ))}
          </div>
          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev px-4 py-2 text-sm font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink disabled:opacity-60"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </>
                ) : (
                  'Load more'
                )}
              </button>
            </div>
          )}
        </>
      )}

      <p className="mt-8 text-center text-xs text-muted">
        Something to report or need help in the community?{' '}
        <a href="mailto:help@ai-compass.in" className="font-semibold text-accent hover:underline">help@ai-compass.in</a>
        {' '}· Other queries:{' '}
        <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">admin@ai-compass.in</a>
      </p>
    </div>
  )
}

export default CommunityPage
