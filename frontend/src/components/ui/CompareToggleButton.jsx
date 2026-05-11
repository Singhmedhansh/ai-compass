import clsx from 'clsx'
import { Check, Plus } from 'lucide-react'

import useCompare from '../../hooks/useCompare'

export default function CompareToggleButton({ slug, toolName }) {
  const { isSelected, toggle, isAtMax } = useCompare()

  if (!slug) return null

  const selected = isSelected(slug)
  const disabled = isAtMax && !selected
  const name = toolName || 'this tool'

  let label
  if (disabled) {
    label = `Compare full — remove a tool to add ${name}`
  } else if (selected) {
    label = `Remove ${name} from compare`
  } else {
    label = `Add ${name} to compare`
  }

  const handleClick = (event) => {
    event.stopPropagation()
    event.preventDefault()
    if (disabled) return
    toggle(slug)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center rounded-full p-1.5 outline-none transition focus-visible:ring-2 focus-visible:ring-accent',
        selected
          ? 'border border-accent bg-accent text-bg'
          : 'border border-line bg-bg-elev text-muted hover:border-line-strong hover:text-ink',
        disabled && !selected && 'cursor-not-allowed opacity-50 hover:border-line hover:text-muted',
      )}
    >
      {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
    </button>
  )
}
