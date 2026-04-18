import { useEffect, useRef } from 'react'

const PARTICLE_COUNT = 90
const MAX_DISTANCE = 120

function createParticles(width, height) {
  const particles = []

  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const speed = 0.12 + Math.random() * 0.28
    const angle = Math.random() * Math.PI * 2

    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 1 + Math.random() * 1.6,
    })
  }

  return particles
}

export default function ParticleBackground() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    let animationFrame = null
    let width = 0
    let height = 0
    let particles = []

    const setCanvasSize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, Math.floor(rect.width))
      height = Math.max(1, Math.floor(rect.height))
      canvas.width = width
      canvas.height = height

      if (particles.length === 0) {
        particles = createParticles(width, height)
        return
      }

      for (const particle of particles) {
        particle.x = Math.min(width, Math.max(0, particle.x))
        particle.y = Math.min(height, Math.max(0, particle.y))
      }
    }

    const draw = () => {
      context.clearRect(0, 0, width, height)

      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i]

        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const distance = Math.hypot(dx, dy)

          if (distance <= MAX_DISTANCE) {
            const opacity = 1 - distance / MAX_DISTANCE
            context.strokeStyle = `rgba(147,112,219,${(0.3 * opacity).toFixed(3)})`
            context.lineWidth = 1
            context.beginPath()
            context.moveTo(a.x, a.y)
            context.lineTo(b.x, b.y)
            context.stroke()
          }
        }
      }

      for (const particle of particles) {
        context.fillStyle = 'rgba(255,255,255,0.6)'
        context.beginPath()
        context.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
        context.fill()
      }
    }

    const step = () => {
      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy

        if (particle.x <= 0 || particle.x >= width) {
          particle.vx *= -1
          particle.x = Math.min(width, Math.max(0, particle.x))
        }

        if (particle.y <= 0 || particle.y >= height) {
          particle.vy *= -1
          particle.y = Math.min(height, Math.max(0, particle.y))
        }
      }

      draw()
      animationFrame = window.requestAnimationFrame(step)
    }

    setCanvasSize()
    draw()

    if (!media.matches) {
      animationFrame = window.requestAnimationFrame(step)
    }

    const handleResize = () => {
      setCanvasSize()
      draw()
    }

    const handleMotionChange = () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = null
      }

      draw()

      if (!media.matches) {
        animationFrame = window.requestAnimationFrame(step)
      }
    }

    window.addEventListener('resize', handleResize)
    media.addEventListener('change', handleMotionChange)

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
      }
      window.removeEventListener('resize', handleResize)
      media.removeEventListener('change', handleMotionChange)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
}
