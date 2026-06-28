import { useContext } from 'react'
import { ToolCountContext } from '../context/ToolCountContext'

export function useCatalogStats() {
  const context = useContext(ToolCountContext)
  if (!context) {
    return { totalTools: 400, roundedToolsCount: 400, roundedToolsText: '400+' }
  }
  return context
}
