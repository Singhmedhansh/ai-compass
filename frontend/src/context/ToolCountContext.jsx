import React, { createContext, useContext, useState, useEffect } from 'react'

export const ToolCountContext = createContext()

export function useToolCount() {
  const context = useContext(ToolCountContext)
  if (!context) {
    return { totalTools: 400, roundedToolsCount: 400, roundedToolsText: '400+' }
  }
  return context
}

// The Flask shell inlines the real count as window.__AIC_BOOT__ (see
// app/routes.py::_boot_state_script). Reading it here means the header,
// hero and auth panel render the true figure on the first paint instead of
// showing the 400 placeholder and then snapping to the real number once a
// ~300ms round trip to /api/v1/stats comes back.
function seededToolCount() {
  try {
    const seeded = window.__AIC_BOOT__?.total_tools
    return typeof seeded === 'number' && seeded > 0 ? seeded : null
  } catch {
    return null
  }
}

export function ToolCountProvider({ children }) {
  const seeded = seededToolCount()
  const [totalTools, setTotalTools] = useState(seeded ?? 400) // Fallback default

  useEffect(() => {
    // Already handed the number by the shell — skip the request entirely.
    if (seeded !== null) return undefined

    let mounted = true
    fetch('/api/v1/stats')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (mounted && data && typeof data.total_tools === 'number') {
          setTotalTools(data.total_tools)
        }
      })
      .catch(() => {
        // Fallback is already set
      })
    return () => {
      mounted = false
    }
  }, [seeded])

  // Round down to the nearest 10 (e.g. 447 -> 440)
  const roundedToolsCount = Math.floor(totalTools / 10) * 10
  const roundedToolsText = `${roundedToolsCount}+`

  return (
    <ToolCountContext.Provider value={{ totalTools, roundedToolsCount, roundedToolsText }}>
      {children}
    </ToolCountContext.Provider>
  )
}
