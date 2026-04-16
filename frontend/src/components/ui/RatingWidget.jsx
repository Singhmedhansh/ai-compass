import { useEffect, useState } from 'react'

export default function RatingWidget({ slug, isLoggedIn }) {
  const [average, setAverage] = useState(0)
  const [count, setCount] = useState(0)
  const [userRating, setUserRating] = useState(null)
  const [hovered, setHovered] = useState(0)
  const [message, setMessage] = useState('')
  const API = import.meta.env.VITE_API_URL || ''

  useEffect(() => {
    let active = true

    const loadRatings = async () => {
      try {
        const response = await fetch(`${API}/api/v1/tools/${slug}/ratings`, { credentials: 'include' })
        const data = await response.json()

        if (!active) {
          return
        }

        setAverage(Number(data.average || 0))
        setCount(Number(data.count || 0))
        setUserRating(data.user_rating ?? null)
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
        try {
          const refreshed = await fetch(`${API}/api/v1/tools/${slug}/ratings`, { credentials: 'include' })
          const refreshedData = await refreshed.json()
          setAverage(Number(refreshedData.average || 0))
          setCount(Number(refreshedData.count || 0))
          setUserRating(refreshedData.user_rating ?? null)
          setMessage(refreshedData.message || '')
        } catch {
          setMessage('Unable to load ratings right now.')
        }
      }
    } catch {
      setMessage('Unable to submit rating right now.')
    }
  }

  const activeValue = hovered || userRating || Math.round(average)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Community Rating</h2>
      <div className="mt-4 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={star <= activeValue ? 'text-amber-400' : 'text-gray-400'}
            style={{ cursor: isLoggedIn ? 'pointer' : 'default', fontSize: 24 }}
            onMouseEnter={() => isLoggedIn && setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => handleRate(star)}
          >
            ★
          </span>
        ))}
      </div>

      {count > 0 ? (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {average.toFixed(1)}★ out of 5 · {count} rating{count !== 1 ? 's' : ''}
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{message || 'Be the first to rate this tool!'}</p>
      )}

      {!isLoggedIn && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <a href="/login" className="text-indigo-600 hover:underline dark:text-indigo-300">Log in</a> to rate this tool
        </p>
      )}
    </div>
  )
}
