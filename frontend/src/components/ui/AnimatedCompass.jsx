import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const TICK_COUNT = 24

const CATEGORIES = [
  { label: 'Coding', angle: 0, to: '/tools?category=Coding' },
  { label: 'Writing', angle: 45, to: '/tools?category=Writing' },
  { label: 'Research', angle: 90, to: '/tools?category=Research' },
  { label: 'Study', angle: 135, to: '/tools?q=study' },
  { label: 'Productivity', angle: 180, to: '/tools?category=Productivity' },
  { label: 'Design', angle: 225, to: '/tools?q=design' },
  { label: 'Image', angle: 270, to: '/tools?category=Image Gen' },
  { label: 'Video', angle: 315, to: '/tools?category=Video Gen' },
]

const SLICE = 360 / CATEGORIES.length
const NEEDLE_TRANSITION = 'transform 450ms cubic-bezier(0.22, 1, 0.36, 1)'

function nearestCategoryFor(cursorAngleDeg) {
  const normalized = ((cursorAngleDeg % 360) + 360) % 360
  return Math.round(normalized / SLICE) % CATEGORIES.length
}

export default function AnimatedCompass({ size = 340, className = '' }) {
  const wrapRef = useRef(null)
  const needleRef = useRef(null)
  // Cumulative rotation so we always take the shortest arc rather than
  // winding the long way around (e.g. from 350° → 10° goes +20°, not -340°).
  const rotationRef = useRef(0)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined

    let lastIndex = -1
    let rafId = 0
    let pendingX = 0
    let pendingY = 0

    const updateNeedle = () => {
      rafId = 0
      const wrap = wrapRef.current
      const needle = needleRef.current
      if (!wrap || !needle) return

      const rect = wrap.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = pendingX - cx
      const dy = pendingY - cy

      // Cursor angle from compass center (0° = north, clockwise).
      const cursorAngle = (Math.atan2(dx, -dy) * 180) / Math.PI

      // Snap to the nearest category — needle only ever rests on a label.
      const idx = nearestCategoryFor(cursorAngle)
      const targetAngle = CATEGORIES[idx].angle

      // Shortest-arc delta from current modular angle to target.
      const currentMod = ((rotationRef.current % 360) + 360) % 360
      let delta = targetAngle - currentMod
      if (delta > 180) delta -= 360
      if (delta <= -180) delta += 360

      rotationRef.current += delta
      needle.style.transform = `rotate(${rotationRef.current}deg)`

      if (idx !== lastIndex) {
        lastIndex = idx
        setActiveIndex(idx)
      }
    }

    const handleMove = (e) => {
      pendingX = e.clientX
      pendingY = e.clientY
      if (!rafId) rafId = window.requestAnimationFrame(updateNeedle)
    }

    const handleScroll = () => {
      if (!rafId) rafId = window.requestAnimationFrame(updateNeedle)
    }

    window.addEventListener('mousemove', handleMove, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('scroll', handleScroll)
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [])

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
      ref={wrapRef}
      className={`relative ${className}`}
      style={{ width: containerSize, height: containerSize }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
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
          <Link
            key={cat.label}
            to={cat.to}
            aria-label={`Browse ${cat.label} AI tools`}
            className="absolute left-1/2 top-1/2 cursor-pointer select-none whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] outline-none transition-all duration-300 hover:!opacity-100 hover:!text-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            style={{
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${isActive ? 1.15 : 1})`,
              color: isActive ? 'var(--accent)' : 'var(--muted-2)',
              opacity: isActive ? 1 : 0.45,
              textShadow: isActive ? '0 0 16px color-mix(in oklab, var(--accent) 65%, transparent)' : 'none',
              letterSpacing: '0.18em',
            }}
          >
            {cat.label}
          </Link>
        )
      })}

      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <circle cx="100" cy="100" r="86" fill="none" stroke="var(--accent)" strokeOpacity="0.55" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="64" fill="none" stroke="var(--accent)" strokeOpacity="0.25" strokeWidth="1" />
        <circle cx="100" cy="100" r="42" fill="none" stroke="var(--accent)" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="2 4" />

        {ticks}

        <g
          ref={needleRef}
          style={{
            // 50% 50% + fill-box pivots around the bbox center, which for
            // these two polygons sits exactly on (100, 100) — the compass
            // center dot. The needle now rotates in place instead of
            // translating off-center.
            transformOrigin: '50% 50%',
            transformBox: 'fill-box',
            willChange: 'transform',
            transition: NEEDLE_TRANSITION,
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
