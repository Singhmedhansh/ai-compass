import { useEffect, useState } from 'react'

export function useCatalogStats() {
  const [totalTools, setTotalTools] = useState(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/v1/stats')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (mounted && data && typeof data.total_tools === 'number') {
          setTotalTools(data.total_tools)
        }
      })
      .catch(() => {
        // Silent failure — components render a static fallback when totalTools stays null.
      })
    return () => {
      mounted = false
    }
  }, [])

  return { totalTools }
}
