import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import Card from './Card'
import './ChromaGrid.css'

export const ChromaGrid = ({
  items = [],
  folders = null,
  onFoldersUpdated = null,
  glass = true,
  className = '',
  radius = 350,
  damping = 0.4,
  fadeOut = 0.6,
  ease = 'power3.out'
}) => {
  const rootRef = useRef(null)
  const fadeRef = useRef(null)
  const setX = useRef(null)
  const setY = useRef(null)
  const pos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    setX.current = gsap.quickSetter(el, '--x', 'px')
    setY.current = gsap.quickSetter(el, '--y', 'px')
    const { width, height } = el.getBoundingClientRect()
    pos.current = { x: width / 2, y: height / 2 }
    setX.current(pos.current.x)
    setY.current(pos.current.y)
  }, [])

  const moveTo = (x, y) => {
    gsap.to(pos.current, {
      x,
      y,
      duration: damping,
      ease,
      onUpdate: () => {
        setX.current?.(pos.current.x)
        setY.current?.(pos.current.y)
      },
      overwrite: true
    })
  }

  const handleMove = e => {
    if (!rootRef.current) return
    const r = rootRef.current.getBoundingClientRect()
    moveTo(e.clientX - r.left, e.clientY - r.top)
    gsap.to(fadeRef.current, { opacity: 0, duration: 0.25, overwrite: true })
  }

  const handleLeave = () => {
    gsap.to(fadeRef.current, {
      opacity: 1,
      duration: fadeOut,
      overwrite: true
    })
  }

  return (
    <div
      ref={rootRef}
      className={`chroma-grid ${className}`}
      style={{
        '--r': `${radius}px`
      }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      {items.map((tool, i) => (
        <div key={tool.slug || tool.name || i} className="chroma-card-wrapper">
          <Card
            tool={tool}
            folders={folders}
            onFoldersUpdated={onFoldersUpdated}
            glass={glass}
          />
        </div>
      ))}
      <div className="chroma-overlay" />
      <div ref={fadeRef} className="chroma-fade" />
    </div>
  )
}

export default ChromaGrid
