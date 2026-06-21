import { useState, useEffect, useRef } from 'react'
import { Search, X, Tag, Lightbulb, ExternalLink } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'

function SearchInput({
  value,
  onChange,
  onClear,
  onKeyDown,
  placeholder = 'Search AI tools...',
  style,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const dropdownRef = useRef(null)
  const hasValue = Boolean(value)

  // Fetch suggestions with a debounce
  useEffect(() => {
    const q = (value || '').trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }

    const controller = new AbortController()
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const API = import.meta.env.VITE_API_URL || ''
        const res = await fetch(`${API}/api/v1/suggestions?q=${encodeURIComponent(q)}`, {
          signal: controller.signal
        })
        if (res.ok) {
          const data = await res.json()
          setSuggestions(data)
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Error fetching suggestions:', err)
        }
      } finally {
        setLoading(false)
      }
    }, 150)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [value])

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleChange = (event) => {
    onChange?.(event.target.value)
    setShowDropdown(true)
  }

  const handleClear = () => {
    if (onClear) {
      onClear()
    } else {
      onChange?.('')
    }
    setSuggestions([])
    setShowDropdown(false)
  }

  const handleSuggestionClick = (item) => {
    setShowDropdown(false)
    
    if (item.type === 'tool') {
      // Slugify the name to navigate to details page directly
      const slug = item.label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      navigate(`/tools/${slug}`)
    } else {
      // Clean tag names (e.g. "#writing" -> "writing")
      const cleanVal = item.label.startsWith('#') ? item.label.substring(1) : item.label
      onChange?.(cleanVal)
      
      // If we are not on the search/catalog page, navigate there
      if (location.pathname !== '/tools') {
        navigate(`/tools?q=${encodeURIComponent(cleanVal)}`)
      }
    }
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />

      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setShowDropdown(false)
          }
          onKeyDown?.(e)
        }}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
        className="h-10 w-full rounded-xl border border-line bg-bg-elev pl-10 pr-10 text-sm text-ink outline-none transition placeholder:text-muted hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
      />

      {hasValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted transition-colors hover:bg-bg-sunk hover:text-ink-2"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* Suggestion Dropdown */}
      {showDropdown && (suggestions.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-line bg-bg-elev py-1.5 shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
          {loading && suggestions.length === 0 ? (
            <div className="px-4 py-2 text-xs text-muted flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              Searching suggestions...
            </div>
          ) : (
            suggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSuggestionClick(item)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-bg-sunk/80 focus:bg-bg-sunk outline-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-base">
                    {item.type === 'tool' ? (
                      item.icon || '🛠️'
                    ) : item.type === 'tag' ? (
                      <Tag className="h-3.5 w-3.5 text-accent-ink" aria-hidden="true" />
                    ) : (
                      <Lightbulb className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <span className="block font-semibold text-ink truncate">{item.label}</span>
                    <span className="block text-[11px] text-muted truncate">{item.sub}</span>
                  </div>
                </div>
                
                {item.type === 'tool' && (
                  <ExternalLink className="h-3 w-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default SearchInput
