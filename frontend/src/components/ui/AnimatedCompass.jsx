import { useEffect, useMemo, useRef, useState } from 'react'

const TICK_COUNT = 24

const CATEGORIES = [
  { label: 'Coding', angle: 0 },
  { label: 'Writing', angle: 45 },
  { label: 'Research', angle: 90 },
  { label: 'Study', angle: 135 },
  { label: 'Productivity', angle: 180 },
  { label: 'Design', angle: 225 },
  { label: 'Image', angle: 270 },
  { label: 'Video', angle: 315 },
]

const FULL_ROTATIONS = 1.5

function shortestDelta(a, b) {
  const diff = ((a - b + 540) % 360) - 180
  return Math.abs(diff)
}

export default function AnimatedCompass({
  size = 340,
  className = '',
  trackRef,
}) {
  const [rotation, setRotation] = useState(0)
  const reduceMotion = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion.current) return undefined

    let frame = 0

    const compute = () => {
      const track = trackRef?.current
      if (!track) {
        setRotation(window.scrollY * 0.6)
        return
      }
      const rect = track.getBoundingClientRect()
      const viewportH = window.innerHeight
      const total = Math.max(rect.height + viewportH, 1)
      const scrolled = Math.min(Math.max(viewportH - rect.top, 0), total)
      const progress = scrolled / total
      setRotation(progress * 360 * FULL_ROTATIONS)
    }

    const handleScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        compute()
        frame = 0
      })
    }

    compute()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [trackRef])

  const normalizedRotation = ((rotation % 360) + 360) % 360

  const activeIndex = useMemo(() => {
    let best = 0
    let bestDelta = Infinity
    for (let i = 0; i < CATEGORIES.length; i += 1) {
      const delta = shortestDelta(CATEGORIES[i].angle, normalizedRotation)
      if (delta < bestDelta) {
        bestDelta = delta
        best = i
      }
    }
    return best
  }, [normalizedRotation])

  const ticks = Array.from({ length: TICK_COUNT }).map((_, i) => {
    const angle = (i * 360) / TICK_COUNT
    const isCardinal = i % 6 === 0
    const len = isCardinal ? 8 : 4
    return (
      <line
        key={i}
        x1="100"
        y1={`${10 + (isCardinal ? 0 : 2)}`}
        x2="100"
        y2={`${10 + len}`}
        stroke="var(--accent)"
        strokeOpacity={isCardinal ? 0.6 : 0.25}
        strokeWidth={isCardinal ? 1.5 : 1}
        strokeLinecap="round"
        transform={`rotate(${angle} 100 100)`}
      />
    )
  })

  const containerSize = size + 140
  const labelRadius = size * 0.55

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative ${className}`}
      style={{ width: containerSize, height: containerSize }}
    >
      <div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: size * 0.95,
          height: size * 0.95,
          transform: 'translate(-50%, -50%)',
          background:
            'radial-gradient(circle at center, color-mix(in oklab, var(--accent) 18%, transparent) 0%, transparent 65%)',
          filter: 'blur(22px)',
        }}
      />

      {CATEGORIES.map((cat, i) => {
        const rad = (cat.angle * Math.PI) / 180
        const x = Math.sin(rad) * labelRadius
        const y = -Math.cos(rad) * labelRadius
        const isActive = i === activeIndex
        return (
          <span
            key={cat.label}
            className="absolute left-1/2 top-1/2 select-none whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] transition-all duration-300"
            style={{
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${isActive ? 1.12 : 1})`,
              color: isActive ? 'var(--accent)' : 'var(--muted-2)',
              opacity: isActive ? 1 : 0.55,
              textShadow: isActive ? '0 0 14px color-mix(in oklab, var(--accent) 60%, transparent)' : 'none',
              letterSpacing: '0.18em',
            }}
          >
            {cat.label}
          </span>
        )
      })}

      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className="absolute left-1/2 top-1/2"
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <circle cx="100" cy="100" r="86" fill="none" stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="64" fill="none" stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="1" />
        <circle cx="100" cy="100" r="42" fill="none" stroke="var(--accent)" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="2 4" />

        {ticks}

        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: '100px 100px',
            transition: reduceMotion.current ? 'none' : 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <polygon points="100,22 92,108 100,100 108,108" fill="var(--accent)" />
          <polygon points="100,178 94,92 100,100 106,92" fill="color-mix(in oklab, var(--accent) 35%, #000)" />
        </g>

        <circle cx="100" cy="100" r="6" fill="var(--ink)" stroke="var(--accent)" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="2" fill="var(--bg)" />
      </svg>
    </div>
  )
}
