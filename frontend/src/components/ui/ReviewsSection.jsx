import { useEffect, useState } from 'react'

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
      alert('Please log in to write a review')
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
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Reviews</h2>

      {isLoggedIn ? (
        <div className="mt-4 space-y-2">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Share your experience with this tool... (min 10 characters)"
            maxLength={1000}
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">{body.length}/1000</span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Posting...' : 'Post Review'}
            </button>
          </div>
          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          <a href="/login" className="text-indigo-600 hover:underline dark:text-indigo-300">Log in</a> to write a review
        </p>
      )}

      {reviews.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{message || 'No reviews yet. Be the first!'}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-gray-900 dark:text-white">{review.user || 'Anonymous'}</strong>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {review.created_at ? new Date(review.created_at).toLocaleDateString() : ''}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{review.body}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
