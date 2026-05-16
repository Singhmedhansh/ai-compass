import { motion } from 'framer-motion'

import { useCountUp } from '../../lib/motion'

/**
 * Drop-in animated number. Replaces the `react-countup` package, whose
 * 6.5.3 build has broken ESM/CJS interop under Vite/Rollup — its default
 * export resolved to an object, so `<CountUp/>` threw React error #130
 * and (with no error boundary at the time) blanked the entire app.
 *
 * Uses the in-house framer-motion useCountUp hook so we stay on one
 * animation primitive and carry zero extra dependencies.
 *
 * @param {number} end - Target value to count up to.
 * @param {number} duration - Seconds to reach the target. Default 1.2.
 */
export default function CountUp({ end = 0, duration = 1.2 }) {
  const value = useCountUp(Number(end) || 0, { duration })
  return <motion.span>{value}</motion.span>
}
