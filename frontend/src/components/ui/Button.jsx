import clsx from 'clsx'

const variantClasses = {
  primary:
    'bg-accent text-bg shadow-sm hover:opacity-90 focus-visible:ring-accent disabled:opacity-50',
  secondary:
    'border border-line-strong bg-transparent text-ink hover:bg-bg-sunk focus-visible:ring-accent disabled:text-muted',
  ghost:
    'bg-transparent text-ink-2 hover:bg-bg-sunk focus-visible:ring-accent disabled:text-muted',
  // Third tier, below secondary: reads as a link, not a button. For utility
  // actions sitting next to a real CTA (tours, "learn more", skip) that
  // shouldn't compete with it for the click.
  tertiary:
    'bg-transparent px-0 text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:ring-accent disabled:text-muted-2',
}

const sizeClasses = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

function Button({
  variant = 'primary',
  size = 'md',
  className,
  onClick,
  disabled = false,
  children,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed',
        variantClasses[variant] || variantClasses.primary,
        sizeClasses[size] || sizeClasses.md,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button
