import React, { createContext, useContext, useState, useEffect } from 'react'

export const ToolCountContext = createContext()

export function useToolCount() {
  const context = useContext(ToolCountContext)
  if (!context) {
    return { totalTools: 400, roundedToolsCount: 400, roundedToolsText: '400+' }
  }
  return context
}

export function ToolCountProvider({ children }) {
  const [totalTools, setTotalTools] = useState(400) // Fallback default

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
        // Fallback is already set
      })
    return () => {
      mounted = false
    }
  }, [])

  // Round down to the nearest 10 (e.g. 447 -> 440)
  const roundedToolsCount = Math.floor(totalTools / 10) * 10
  const roundedToolsText = `${roundedToolsCount}+`

  return (
    <ToolCountContext.Provider value={{ totalTools, roundedToolsCount, roundedToolsText }}>
      {children}
    </ToolCountContext.Provider>
  )
}
