import { Search, X } from 'lucide-react'

function SearchInput({
  value,
  onChange,
  onClear,
  onKeyDown,
  placeholder = 'Search AI tools...',
  style,
}) {
  const hasValue = Boolean(value)

  const handleChange = (event) => {
    onChange?.(event.target.value)
  }

  const handleClear = () => {
    if (onClear) {
      onClear()
      return
    }

    onChange?.('')
  }

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />

      <input
        type="search"
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={style}
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
    </div>
  )
}

export default SearchInput
