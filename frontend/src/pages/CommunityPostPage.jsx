import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useParams, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'

import CommunityFeedItem from '../components/community/CommunityFeedItem'
import Button from '../components/ui/Button'
import ErrorState from '../components/ErrorState'
import { inferErrorVariant } from '../utils/errorState'

function CommunityPostPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const [commentBody, setCommentBody] = useState('')
  const [commentError, setCommentError] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const [isLoggedIn] = useState(() => {
    try {
      return Boolean(JSON.parse(localStorage.getItem('user') || 'null'))
    } catch {
      return false
    }
  })

  useEffect(() => {
    const controller = new AbortController()

    async function loadPost() {
      try {
        setLoading(true)
        const response = await fetch(`/api/v1/community/posts/${id}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) {
          const httpErr = new Error(`HTTP ${response.status}: ${response.statusText}`)
          httpErr.status = response.status
          throw httpErr
        }
        const data = await response.json()
        setPost(data)
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(inferErrorVariant(err))
          setPost(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadPost()
    return () => controller.abort()
  }, [id, retryNonce])

  const handlePostVote = async (postId, voteType) => {
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
        setPost((prev) => {
          if (!prev) return prev
          const nextVote = prev.user_vote === voteType ? 0 : voteType
          return { ...prev, score: data.score, user_vote: nextVote === 0 ? null : voteType }
        })
      } else {
        toast.error('Could not save your vote. Please try again.')
      }
    } catch {
      toast.error('Could not save your vote. Please try again.')
    }
  }

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    try {
      const response = await fetch(`/api/v1/community/posts/${postId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        toast.success('Post deleted')
        navigate('/community')
      } else {
        toast.error('Could not delete post')
      }
    } catch {
      toast.error('Could not delete post')
    }
  }

  const handleCommentVote = async (commentId, voteType) => {
    if (!isLoggedIn) {
      toast.error('Please log in to vote on comments')
      return
    }
    try {
      const response = await fetch(`/api/v1/community/comments/${commentId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote_type: voteType }),
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setPost((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            comments: prev.comments.map((c) => {
              if (c.id !== commentId) return c
              const nextVote = c.user_vote === voteType ? 0 : voteType
              return { ...c, score: data.score, user_vote: nextVote === 0 ? null : voteType }
            }),
          }
        })
      } else {
        toast.error('Could not save your vote. Please try again.')
      }
    } catch {
      toast.error('Could not save your vote. Please try again.')
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return
    try {
      const response = await fetch(`/api/v1/community/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setPost((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            comments: prev.comments.filter((c) => c.id !== commentId),
            comment_count: Math.max(0, (prev.comment_count || 1) - 1),
          }
        })
        toast.success('Comment deleted')
      } else {
        toast.error('Could not delete comment')
      }
    } catch {
      toast.error('Could not delete comment')
    }
  }

  const handleCommentSubmit = async () => {
    if (commentBody.trim().length < 2) {
      setCommentError('Comment must be at least 2 characters')
      return
    }
    setSubmittingComment(true)
    setCommentError('')
    try {
      const response = await fetch(`/api/v1/community/posts/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody }),
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setCommentBody('')
        setRetryNonce((n) => n + 1)
      } else if (data.error) {
        setCommentError(data.error)
      }
    } catch {
      setCommentError('Unable to post comment right now.')
    } finally {
      setSubmittingComment(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-40 animate-pulse rounded-xl border border-line bg-bg-sunk" aria-busy="true" aria-label="Loading post" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <ErrorState
          variant={error || 'notfound'}
          onRetry={error === 'notfound' ? undefined : () => setRetryNonce((n) => n + 1)}
          secondaryAction={{ label: 'Back to Community', to: '/community' }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>{`${post.title} — AI Compass Community`}</title>
        <meta name="description" content={post.body.slice(0, 160)} />
        <link rel="canonical" href={`https://ai-compass.in/community/${post.id}`} />
      </Helmet>

      <Link to="/community" className="text-sm text-muted hover:text-ink transition-colors">
        ← Back to Community
      </Link>

      <div className="mt-4">
        <CommunityFeedItem post={post} onVote={handlePostVote} onDelete={handleDeletePost} linkToDetail={false} />
        <div className="ml-14 mt-2">
          <p className="text-sm text-ink-2 whitespace-pre-wrap">{post.body}</p>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-line bg-bg-elev p-6">
        <h2 className="text-lg font-semibold text-ink">Comments ({post.comments.length})</h2>

        {isLoggedIn ? (
          <div className="mt-4 space-y-2">
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add a comment..."
              maxLength={1000}
              rows={3}
              className="w-full rounded-lg border border-line bg-bg-sunk p-3 text-sm text-ink outline-none transition placeholder:text-muted hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{commentBody.length}/1000</span>
              <Button variant="primary" onClick={handleCommentSubmit} disabled={submittingComment}>
                {submittingComment ? (
                  <>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  'Comment'
                )}
              </Button>
            </div>
            {commentError ? <p role="alert" className="text-xs text-danger">{commentError}</p> : null}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-accent bg-accent-soft p-3 text-sm">
            <p className="font-medium text-accent-ink">Log in to comment</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/login"
                state={{ from: location.pathname }}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
              >
                Log In
              </Link>
              <Link
                to="/register"
                state={{ from: location.pathname }}
                className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent-ink outline-none transition hover:bg-bg-elev focus-visible:ring-2 focus-visible:ring-accent"
              >
                Register Free
              </Link>
            </div>
          </div>
        )}

        {post.comments.length === 0 ? (
          <p role="status" className="mt-4 text-sm text-muted">No comments yet. Be the first to reply.</p>
        ) : (
          <div aria-live="polite" className="mt-4 space-y-3">
            {post.comments.map((comment) => (
              <article key={comment.id} className="flex gap-3 rounded-xl border border-line bg-bg-sunk p-4 items-start">
                <div className="flex flex-col items-center justify-center shrink-0 gap-0.5 select-none bg-bg-elev/50 rounded-lg p-1 border border-line/20">
                  <button
                    type="button"
                    onClick={() => handleCommentVote(comment.id, comment.user_vote === 1 ? 0 : 1)}
                    className={`p-1 rounded hover:bg-bg-elev transition text-xs leading-none ${
                      comment.user_vote === 1 ? 'text-emerald-500 font-bold' : 'text-muted'
                    }`}
                    aria-label="Upvote comment"
                  >
                    ▲
                  </button>
                  <span className="text-xs font-bold tabular-nums text-ink">{comment.score || 0}</span>
                  <button
                    type="button"
                    onClick={() => handleCommentVote(comment.id, comment.user_vote === -1 ? 0 : -1)}
                    className={`p-1 rounded hover:bg-bg-elev transition text-xs leading-none ${
                      comment.user_vote === -1 ? 'text-rose-500 font-bold' : 'text-muted'
                    }`}
                    aria-label="Downvote comment"
                  >
                    ▼
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-ink">{comment.author}</strong>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">
                        {comment.created_at ? new Date(comment.created_at).toLocaleDateString() : ''}
                      </span>
                      {comment.can_delete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-muted hover:text-danger transition-colors"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-ink-2 whitespace-pre-wrap">{comment.body}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default CommunityPostPage
