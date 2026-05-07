import clsx from 'clsx'

const variantClasses = {
  coding: 'bg-bg-sunk text-ink-2 ring-line',
  writing: 'bg-bg-sunk text-ink-2 ring-line',
  research: 'bg-bg-sunk text-ink-2 ring-line',
  productivity: 'bg-bg-sunk text-ink-2 ring-line',
  'image gen': 'bg-bg-sunk text-ink-2 ring-line',
  'video gen': 'bg-bg-sunk text-ink-2 ring-line',
  free: 'bg-bg-sunk text-ink-2 ring-line',
}

function Badge({ label, variant = 'coding', className }) {
  const variantKey = typeof variant === 'string' ? variant.toLowerCase() : 'coding'

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset',
        variantClasses[variantKey] || variantClasses.coding,
        className,
      )}
    >
      {label}
    </span>
  )
}

export default Badge
