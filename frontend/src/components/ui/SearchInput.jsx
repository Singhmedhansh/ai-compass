import { Search, X } from 'lucide-react'

function SearchInput({
  value,
  onChange,
  onClear,
  onKeyDown,
  placeholder = 'Search AI tools...',
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
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-500" />

      <input
        type="search"
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
      />

      {hasValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export default SearchInput
