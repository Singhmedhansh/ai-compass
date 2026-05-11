import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'aiCompass:compareTray'
const CHANGE_EVENT = 'aiCompass:compare:change'

export const MAX_COMPARE = 3

function readFromStorage() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []
  } catch {
    return []
  }
}

function writeToStorage(value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    // Native `storage` event does not fire in the same tab — dispatch a custom event so
    // every mounted instance of useCompare in this tab re-reads the source of truth.
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function useCompare() {
  const [selected, setSelected] = useState(readFromStorage)

  useEffect(() => {
    const sync = () => setSelected(readFromStorage())
    window.addEventListener('storage', sync)
    window.addEventListener(CHANGE_EVENT, sync)
    return () => {
      window.removeEventListener('storage', sync)
      window.removeEventListener(CHANGE_EVENT, sync)
    }
  }, [])

  const isSelected = useCallback((slug) => selected.includes(slug), [selected])

  const toggle = useCallback((slug) => {
    if (!slug) return
    setSelected((prev) => {
      let next
      if (prev.includes(slug)) {
        next = prev.filter((value) => value !== slug)
      } else if (prev.length >= MAX_COMPARE) {
        return prev
      } else {
        next = [...prev, slug]
      }
      writeToStorage(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setSelected([])
    writeToStorage([])
  }, [])

  return {
    selected,
    isSelected,
    toggle,
    clear,
    count: selected.length,
    isAtMax: selected.length >= MAX_COMPARE,
  }
}

export default useCompare
