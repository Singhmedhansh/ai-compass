function CompassMark({ size = 28, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="#0F1411" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#2FB389" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="#2FB389" strokeOpacity="0.35" strokeWidth="1" />
      <polygon points="32,14 27,34 32,32 37,34" fill="#2FB389" />
      <polygon points="32,50 28,30 32,32 36,30" fill="#0F5F47" />
      <circle cx="32" cy="32" r="2.5" fill="#FAFAF7" />
    </svg>
  )
}

export default CompassMark
