import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Loader2, MessageSquare } from 'lucide-react'

import Button from './Button'

export default function ReviewsSection({ slug, isLoggedIn }) {
  const location = useLocation()
  const [reviews, setReviews] = useState([])
  const [body, setBody] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const API = import.meta.env.VITE_API_URL || ''

  useEffect(() => {
    let active = true

    const loadReviews = async () => {
      try {
        setLoadError(false)
        const response = await fetch(`${API}/api/v1/tools/${slug}/reviews`, { credentials: 'include' })
        const data = await response.json()

        if (!active) {
          return
        }

        setReviews(Array.isArray(data.reviews) ? data.reviews : [])
      } catch {
        if (active) {
          setReviews([])
          setLoadError(true)
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadReviews()

    return () => {
      active = false
    }
  }, [API, slug])

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      setError('Please log in to write a review')
      return
    }

    if (body.trim().length < 10) {
      setError('Review must be at least 10 characters')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/v1/tools/${slug}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
        credentials: 'include',
      })
      const data = await response.json()

      if (data.success) {
        setBody('')
        try {
          const refreshed = await fetch(`${API}/api/v1/tools/${slug}/reviews`, { credentials: 'include' })
          const refreshedData = await refreshed.json()
          setReviews(Array.isArray(refreshedData.reviews) ? refreshedData.reviews : [])
        } catch {
          setReviews([])
        }
      } else if (data.error) {
        setError(data.error)
      }
    } catch {
      setError('Unable to submit review right now.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleVote = async (reviewId, voteType) => {
    if (!isLoggedIn) {
      setError('Please log in to vote on reviews')
      return
    }

    try {
      const response = await fetch(`${API}/api/v1/reviews/${reviewId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote_type: voteType }),
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setReviews((prev) =>
          prev.map((r) => {
            if (r.id === reviewId) {
              const currentVote = r.user_vote === voteType ? 0 : voteType
              return {
                ...r,
                score: data.score,
                user_vote: currentVote === 0 ? null : voteType,
              }
            }
            return r
          })
        )
      }
    } catch {
      console.error('Error submitting vote')
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-bg-elev p-6">
      <h2 className="text-lg font-semibold text-ink">Reviews</h2>

      {isLoggedIn ? (
        <div className="mt-4 space-y-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Share your experience with this tool... (min 10 characters)"
            maxLength={1000}
            rows={4}
            className="w-full rounded-lg border border-line bg-bg-sunk p-3 text-sm text-ink outline-none transition placeholder:text-muted hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{body.length}/1000</span>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Posting...
                </>
              ) : (
                'Post Review'
              )}
            </Button>
          </div>
          {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-accent bg-accent-soft p-3 text-sm">
          <p className="font-medium text-accent-ink">Log in to write a review</p>
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

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[1, 2].map((i) => (
            <div key={`skeleton-review-${i}`} className="flex animate-pulse gap-3 rounded-xl border border-line bg-bg-sunk p-4">
              <div className="h-8 w-8 shrink-0 rounded-full bg-line" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-4 w-24 rounded bg-line" />
                  <div className="h-3 w-16 rounded bg-line" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full rounded bg-line" />
                  <div className="h-3 w-4/5 rounded bg-line" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <section
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl border border-line bg-bg-sunk px-6 py-10 text-center"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm" aria-hidden="true">
            {loadError ? (
              <AlertTriangle className="h-5 w-5 text-muted" />
            ) : (
              <MessageSquare className="h-5 w-5 text-muted" />
            )}
          </div>
          <h3 className="mt-4 text-base font-semibold text-ink">
            {loadError ? "Couldn't load reviews" : 'No reviews yet'}
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            {loadError
              ? 'Refresh the page to try again.'
              : 'Be the first to share your experience with this tool.'}
          </p>
        </section>
      ) : (
        <div aria-live="polite" className="mt-4 space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="flex gap-3 rounded-xl border border-line bg-bg-sunk p-4 items-start">
              {/* Vote buttons */}
              <div className="flex flex-col items-center justify-center shrink-0 gap-0.5 select-none bg-bg-elev/50 rounded-lg p-1 border border-line/20">
                <button
                  type="button"
                  onClick={() => handleVote(review.id, review.user_vote === 1 ? 0 : 1)}
                  className={`p-1 rounded hover:bg-bg-elev transition text-xs leading-none ${
                    review.user_vote === 1 ? 'text-emerald-500 font-bold' : 'text-muted'
                  }`}
                  aria-label="Upvote review"
                >
                  ▲
                </button>
                <span className="text-xs font-bold tabular-nums text-ink">{review.score || 0}</span>
                <button
                  type="button"
                  onClick={() => handleVote(review.id, review.user_vote === -1 ? 0 : -1)}
                  className={`p-1 rounded hover:bg-bg-elev transition text-xs leading-none ${
                    review.user_vote === -1 ? 'text-rose-500 font-bold' : 'text-muted'
                  }`}
                  aria-label="Downvote review"
                >
                  ▼
                </button>
              </div>

              <div
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white"
              >
                {(review.user || 'A').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <strong className="text-sm text-ink">{review.user || 'Anonymous'}</strong>
                    {review.is_student_verified && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border border-indigo-500/10">
                        🎓 Verified Student
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-2 whitespace-pre-wrap">{review.body}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
