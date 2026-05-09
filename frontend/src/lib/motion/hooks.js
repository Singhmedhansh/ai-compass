/**
 * Custom React hooks for v2.1 motion design language.
 *
 * Three hooks covering Phase L's scroll-driven motion needs:
 *   - useScrollReveal:  IntersectionObserver-based viewport-trigger
 *   - useScrollProgress: scroll-position-driven motion value
 *   - useCountUp:        animate number from 0 to target
 *
 * All built on framer-motion v11 primitives. Compose them as needed
 * (e.g., trigger useCountUp when useScrollReveal reports inView=true).
 */

import { useEffect, useRef } from 'react'
import {
  useInView,
  useScroll,
  useMotionValue,
  useTransform,
  animate,
} from 'framer-motion'
import { easings } from './easings'

/**
 * useScrollReveal — viewport-trigger boolean.
 *
 * Returns [ref, inView]. Attach ref to element you want to track.
 * inView flips to true once element crosses the threshold; with
 * `once: true` (default), stays true after first trigger.
 *
 * @param {object} options
 * @param {number} options.threshold - 0..1, fraction of element
 *   visible to trigger inView. Default 0.2.
 * @param {boolean} options.once - If true (default), don't reset
 *   inView when element scrolls back out.
 * @returns {[React.RefObject, boolean]}
 *
 * @example
 *   const [ref, inView] = useScrollReveal()
 *   return <motion.div ref={ref}
 *                      variants={sectionReveal}
 *                      initial="initial"
 *                      animate={inView ? 'animate' : 'initial'} />
 */
export function useScrollReveal({ threshold = 0.2, once = true } = {}) {
  const ref = useRef(null)
  const inView = useInView(ref, { amount: threshold, once })
  return [ref, inView]
}

/**
 * useScrollProgress — MotionValue tracking scroll progress through
 * an element's scroll range.
 *
 * Returns Framer MotionValue<0..1> that consumers pipe through
 * useTransform to drive scroll-position-based animations (parallax,
 * scale-on-scroll). anthropic.com Pattern 2 (hero scale-up) is the
 * canonical use case.
 *
 * @param {React.RefObject} ref - Element to track. Typically a
 *   hero section.
 * @param {object} options
 * @param {Array} options.offset - Framer Motion scroll offset
 *   config. Default ['start end', 'end start'] = full progress as
 *   element scrolls through viewport. Common alternatives:
 *     ['start end', 'center center']   // entering → centered
 *     ['center center', 'end start']   // centered → leaving
 * @returns {MotionValue<number>} - 0 to 1 across the offset range.
 *
 * @example
 *   const ref = useRef(null)
 *   const progress = useScrollProgress(ref, {
 *     offset: ['start end', 'center center']
 *   })
 *   const scale = useTransform(progress, [0, 1], [0.85, 1])
 *   return <motion.div ref={ref} style={{ scale }}>...</motion.div>
 */
export function useScrollProgress(ref, options = {}) {
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: options.offset ?? ['start end', 'end start'],
  })
  return scrollYProgress
}

/**
 * useCountUp — animate a number from 0 to target.
 *
 * Returns MotionValue<number> consumers render directly inside a
 * motion component, or pipe through useTransform for formatting.
 *
 * Compose with useScrollReveal to trigger only when in view (the
 * canonical Phase J Feature 6 use case for CurationDiscipline's
 * 443 / 0 / 38 / 7d figures).
 *
 * @param {number} target - Final value to count up to.
 * @param {object} options
 * @param {number} options.duration - Seconds to reach target.
 *   Default 1.5.
 * @param {Array|string|Function} options.ease - Easing.
 *   Default easings.standard.
 * @param {boolean} options.enabled - Whether to run the animation.
 *   Default true. Set to inView from useScrollReveal to gate on
 *   viewport entry.
 * @returns {MotionValue<number>} - Integer-rounded value.
 *
 * @example
 *   const [ref, inView] = useScrollReveal()
 *   const count = useCountUp(443, { enabled: inView })
 *   return <motion.span ref={ref}>{count}</motion.span>
 *
 *   // For formatting:
 *   const formatted = useTransform(count, (v) => v.toLocaleString())
 *   return <motion.span ref={ref}>{formatted}</motion.span>
 */
export function useCountUp(target, options = {}) {
  const {
    duration = 1.5,
    ease = easings.standard,
    enabled = true,
  } = options

  const motionValue = useMotionValue(0)

  useEffect(() => {
    if (!enabled) return
    const controls = animate(motionValue, target, {
      duration,
      ease,
    })
    return controls.stop
  }, [target, duration, ease, enabled, motionValue])

  return useTransform(motionValue, (latest) => Math.round(latest))
}
