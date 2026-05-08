import { useEffect, useState } from 'react'

import Button from './Button'

export default function ReviewsSection({ slug, isLoggedIn }) {
  const [reviews, setReviews] = useState([])
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const API = import.meta.env.VITE_API_URL || ''

  useEffect(() => {
    let active = true

    const loadReviews = async () => {
      try {
        const response = await fetch(`${API}/api/v1/tools/${slug}/reviews`, { credentials: 'include' })
        const data = await response.json()

        if (!active) {
          return
        }

        setReviews(Array.isArray(data.reviews) ? data.reviews : [])
        setMessage(data.message || '')
      } catch {
        if (active) {
          setReviews([])
          setMessage('Unable to load reviews right now.')
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
        setMessage('')
        try {
          const refreshed = await fetch(`${API}/api/v1/tools/${slug}/reviews`, { credentials: 'include' })
          const refreshedData = await refreshed.json()
          setReviews(Array.isArray(refreshedData.reviews) ? refreshedData.reviews : [])
          setMessage(refreshedData.message || '')
        } catch {
          setReviews([])
          setMessage('Unable to load reviews right now.')
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
            className="w-full rounded-lg border border-line bg-bg-elev p-3 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{body.length}/1000</span>
            <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Posting...' : 'Post Review'}
            </Button>
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">
          <a href="/login" className="text-accent hover:underline">Log in</a> to write a review
        </p>
      )}

      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{message || 'No reviews yet. Be the first!'}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-line bg-bg-sunk p-4">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-ink">{review.user || 'Anonymous'}</strong>
                <span className="text-xs text-muted">
                  {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-2">{review.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
