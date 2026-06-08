import { forwardRef } from 'react'
import { motion } from 'framer-motion'

import { pageEnter } from '../lib/motion'

const MotionDiv = motion.div

/**
 * RouteTransition — wraps a route's content with the pageEnter
 * variant for fade+lift transitions on navigation.
 *
 * Used by App.jsx inside <AnimatePresence mode="wait"> with
 * key={location.pathname} so AnimatePresence triggers exit/enter
 * on route changes. Replaces the old PageTransition.jsx (which
 * was only consumed by AdminPage and never functioned globally
 * because App.jsx's AnimatePresence had no keyed children).
 */
const RouteTransition = forwardRef(function RouteTransition({ children }, ref) {
  return (
    <MotionDiv
      ref={ref}
      variants={pageEnter}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </MotionDiv>
  )
})

export default RouteTransition
