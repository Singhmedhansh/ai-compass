import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { selectMenu } from '../../lib/motion/variants'

const MotionDiv = motion.div

function Dropdown({ value, onChange, options, label, className }) {
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const baseId = useId()
  const optionId = (i) => `${baseId}-opt-${i}`
  const selected = options.find((o) => o.value === value)

  const openWithSelection = () => {
    const idx = options.findIndex((o) => o.value === value)
    setHighlightedIndex(idx >= 0 ? idx : 0)
    setOpen(true)
  }

  const openWithLast = () => {
    setHighlightedIndex(options.length - 1)
    setOpen(true)
  }

  const closeAndRefocus = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handleSelect = (optValue) => {
    onChange(optValue)
    closeAndRefocus()
  }

  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (e) => {
      if (menuRef.current?.contains(e.target)) return
      if (triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (!open || highlightedIndex < 0) return
    const el = menuRef.current?.querySelector(`#${CSS.escape(optionId(highlightedIndex))}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, highlightedIndex, baseId])

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openWithSelection()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        openWithLast()
      }
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      closeAndRefocus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => (i + 1) % options.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => (i - 1 + options.length) % options.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHighlightedIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHighlightedIndex(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (highlightedIndex >= 0) {
        handleSelect(options[highlightedIndex].value)
      }
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const handleTriggerClick = () => {
    if (open) {
      setOpen(false)
    } else {
      openWithSelection()
    }
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        aria-activedescendant={open && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-bg-elev px-3 text-sm text-ink outline-none transition hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="truncate">{selected?.label ?? label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {open && (
          <MotionDiv
            ref={menuRef}
            role="listbox"
            aria-label={label}
            variants={selectMenu}
            initial="initial"
            animate="animate"
            exit="exit"
            style={{ transformOrigin: 'top center' }}
            className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-bg-elev py-1 shadow-lg"
          >
            {options.map((opt, i) => {
              const isSelected = opt.value === value
              const isHighlighted = i === highlightedIndex
              return (
                <div
                  key={opt.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  onClick={() => handleSelect(opt.value)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${
                    isHighlighted ? 'bg-bg-sunk text-ink' : 'text-ink-2'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="h-4 w-4 text-accent" aria-hidden="true" />}
                </div>
              )
            })}
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Dropdown
