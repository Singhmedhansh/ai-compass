import { useEffect, useState } from 'react'

export default function RatingWidget({ slug, isLoggedIn }) {
  const [ratingData, setRatingData] = useState({
    average: 0,
    count: 0,
    userRating: null,
  })
  const [hovered, setHovered] = useState(0)
  const [message, setMessage] = useState('')
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
      }
    }

    void loadRatings()

    return () => {
      active = false
    }
  }, [API, slug])

  const handleRate = async (value) => {
    if (!isLoggedIn) {
      alert('Please log in to rate this tool')
      return
    }

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
    }
  }

  const activeValue = hovered || ratingData.userRating || Math.round(ratingData.average)

  return (
    <div className="rounded-2xl border border-line bg-bg-elev p-6">
      <h2 className="text-lg font-semibold text-ink">Community Rating</h2>
      <div className="mt-4 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={star <= activeValue ? 'text-amber-400' : 'text-line-strong'}
            style={{ cursor: isLoggedIn ? 'pointer' : 'default', fontSize: 24 }}
            onMouseEnter={() => isLoggedIn && setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => handleRate(star)}
          >
            ★
          </span>
        ))}
      </div>

      {ratingData.count > 0 ? (
        <p className="mt-2 text-sm text-muted">
          {ratingData.average.toFixed(1)}★ out of 5 · {ratingData.count} rating{ratingData.count !== 1 ? 's' : ''}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">{message || 'Be the first to rate this tool!'}</p>
      )}

      {!isLoggedIn && (
        <p className="mt-2 text-sm text-muted">
          <a href="/login" className="text-accent hover:underline">Log in</a> to rate this tool
        </p>
      )}
    </div>
  )
}
