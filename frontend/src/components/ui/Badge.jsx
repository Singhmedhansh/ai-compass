import clsx from 'clsx'

const variantClasses = {
  coding:
    'bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:ring-blue-500/30',
  writing:
    'bg-purple-100 text-purple-700 ring-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:ring-purple-500/30',
  research:
    'bg-green-100 text-green-700 ring-green-200 dark:bg-green-500/20 dark:text-green-300 dark:ring-green-500/30',
  productivity:
    'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30',
  'image gen':
    'bg-pink-100 text-pink-700 ring-pink-200 dark:bg-pink-500/20 dark:text-pink-300 dark:ring-pink-500/30',
  'video gen':
    'bg-red-100 text-red-700 ring-red-200 dark:bg-red-500/20 dark:text-red-300 dark:ring-red-500/30',
  free: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30',
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
