import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Star } from 'lucide-react'

export default function RatingWidget({ slug, isLoggedIn }) {
  const location = useLocation()
  const [ratingData, setRatingData] = useState({
    average: 0,
    count: 0,
    userRating: null,
  })
  const [hovered, setHovered] = useState(0)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const loginCtaRef = useRef(null)
  const API = import.meta.env.VITE_API_URL || ''

  const calculateNewAverage = (prevAverage, prevCount, oldRating, newRating, wasNewRating) => {
    if (wasNewRating) {
      const nextCount = prevCount + 1
      if (nextCount <= 0) {
        return newRating
      }
      return ((prevAverage * prevCount) + newRating) / nextCount
    }

    if (prevCount <= 0) {
      return newRating
    }

    return ((prevAverage * prevCount) - oldRating + newRating) / prevCount
  }

  useEffect(() => {
    let active = true

    const loadRatings = async () => {
      try {
        const response = await fetch(`${API}/api/v1/tools/${slug}/ratings`, { credentials: 'include' })
        const data = await response.json()

        if (!active) {
          return
        }

        setRatingData({
          average: Number(data.average || 0),
          count: Number(data.count || 0),
          userRating: data.user_rating ?? null,
        })
        setMessage(data.message || '')
      } catch {
        if (active) {
          setMessage('Unable to load ratings right now.')
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void loadRatings()

    return () => {
      active = false
    }
  }, [API, slug])

  useEffect(() => {
    if (!showLoginPrompt) return undefined
    const id = setTimeout(() => loginCtaRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [showLoginPrompt])

  const handleRate = async (value) => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true)
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`${API}/api/v1/tools/${slug}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setHovered(0)
        setRatingData((prev) => {
          const wasNewRating = !prev.userRating || prev.userRating === 0
          const nextAverage = calculateNewAverage(
            Number(prev.average || 0),
            Number(prev.count || 0),
            Number(prev.userRating || 0),
            value,
            wasNewRating,
          )

          return {
            ...prev,
            average: nextAverage,
            count: wasNewRating ? Number(prev.count || 0) + 1 : Number(prev.count || 0),
            userRating: value,
          }
        })
        setMessage(data.message || '')
      }
    } catch {
      setMessage('Unable to submit rating right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeValue = hovered || ratingData.userRating || Math.round(ratingData.average)

  return (
    <div className="rounded-2xl border border-line bg-bg-elev p-6">
      <h2 className="text-lg font-semibold text-ink">Community Rating</h2>

      {isLoading ? (
        <>
          <div className="mt-4 flex animate-pulse items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={`skeleton-star-${star}`} className="h-6 w-6 text-line" fill="none" />
            ))}
          </div>
          <div className="mt-2 h-4 w-32 animate-pulse rounded bg-line" />
        </>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = star <= activeValue
              return (
                <button
                  key={star}
                  type="button"
                  aria-label={`Rate ${star} ${star === 1 ? 'star' : 'stars'}`}
                  disabled={isSubmitting}
                  onMouseEnter={() => isLoggedIn && !isSubmitting && setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => handleRate(star)}
                  className="cursor-pointer rounded-md p-1 outline-none transition focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Star
                    className={`h-6 w-6 ${isFilled ? 'text-amber-400' : 'text-line-strong'}`}
                    fill={isFilled ? 'currentColor' : 'none'}
                  />
                </button>
              )
            })}
          </div>

          {ratingData.count > 0 ? (
            <p className="mt-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                {ratingData.average.toFixed(1)}
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              </span>
              {' '}out of 5 · {ratingData.count} rating{ratingData.count !== 1 ? 's' : ''}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">{message || 'Be the first to rate this tool!'}</p>
          )}

          {showLoginPrompt ? (
            <div className="mt-4 rounded-xl border border-accent bg-accent-soft p-3 text-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium text-accent-ink">Log in to rate this tool</p>
                <button
                  type="button"
                  className="self-start rounded text-xs font-semibold text-accent-ink outline-none transition hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={() => setShowLoginPrompt(false)}
                >
                  Close
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  ref={loginCtaRef}
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
          ) : null}
        </>
      )}
    </div>
  )
}
