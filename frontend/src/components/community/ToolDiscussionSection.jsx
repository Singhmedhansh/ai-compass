import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import CommunityFeedItem from './CommunityFeedItem'
import CommunityComposer from './CommunityComposer'

export default function ToolDiscussionSection({ slug, isLoggedIn }) {
  const [posts, setPosts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    const loadPosts = async () => {
      try {
        const response = await fetch(`/api/v1/community/posts?tool_slug=${encodeURIComponent(slug)}&sort=new`, {
          credentials: 'include',
        })
        const data = await response.json()
        if (active) {
          setPosts(Array.isArray(data.posts) ? data.posts : [])
        }
      } catch {
        if (active) setPosts([])
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadPosts()
    return () => {
      active = false
    }
  }, [slug, refreshKey])

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
    <div className="rounded-2xl border border-line bg-bg-elev p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Discussion</h2>
        <Link to={`/community?tool_slug=${encodeURIComponent(slug)}`} className="text-xs font-semibold text-accent hover:underline">
          View all in Community
        </Link>
      </div>

      <div className="mt-4">
        {showComposer ? (
          <CommunityComposer
            isLoggedIn={isLoggedIn}
            toolSlug={slug}
            onCancel={() => setShowComposer(false)}
            onCreated={() => {
              setShowComposer(false)
              setRefreshKey((n) => n + 1)
              toast.success('Post published!')
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowComposer(true)}
            className="w-full rounded-lg border border-line bg-bg-sunk px-4 py-3 text-left text-sm text-muted transition hover:border-line-strong hover:text-ink"
          >
            Start a discussion about this tool...
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading discussion">
          {[1, 2].map((i) => (
            <div key={`discussion-skeleton-${i}`} className="h-20 animate-pulse rounded-xl border border-line bg-bg-sunk" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p role="status" className="mt-4 text-sm text-muted">No discussion yet for this tool.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {posts.map((post) => (
            <CommunityFeedItem key={post.id} post={post} onVote={handleVote} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  )
}
