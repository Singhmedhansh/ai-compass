import clsx from 'clsx'
import { Check, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import useCompare from '../../hooks/useCompare'

const IconWrap = motion.span

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
        'inline-flex h-10 w-10 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-accent md:h-8 md:w-8',
        selected
          ? 'border border-accent bg-accent text-bg'
          : 'border border-line bg-bg-elev text-muted hover:border-line-strong hover:text-ink',
        disabled && !selected && 'cursor-not-allowed opacity-50 hover:border-line hover:text-muted',
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <IconWrap
          key={selected ? 'check' : 'plus'}
          initial={{ opacity: 0, scale: 0.7, rotate: -18 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.8, rotate: 18 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center"
          aria-hidden="true"
        >
          {selected ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </IconWrap>
      </AnimatePresence>
    </button>
  )
}
