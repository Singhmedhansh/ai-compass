/**
 * Framer Motion variant objects for v2.1 motion design language.
 *
 * All variants follow the named-states pattern. Apply via:
 *   <motion.div variants={pageEnter} initial="initial" animate="animate" />
 *
 * Easing curves and durations imported from ./easings — same timing
 * vocabulary as the CSS --ease-* / --motion-* tokens. Update both
 * together if changes are needed.
 */

import { easings, durations } from './easings'

// Reusable transition shapes
const standardT  = { duration: durations.base, ease: easings.standard }
const enterT     = { duration: durations.base, ease: easings.enter }
const exitT      = { duration: durations.base, ease: easings.exit }
const slowEnterT = { duration: durations.slow, ease: easings.enter }
const fastT      = { duration: durations.fast, ease: easings.standard }

// Route-level transitions — consumed by RouteTransition (K-2-5).
export const pageEnter = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: enterT },
  exit:    { opacity: 0, y: -20, transition: exitT },
}

// Marketing section reveals on scroll. Pair with whileInView or
// useScrollReveal hook (K-2-3).
export const sectionReveal = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0, transition: slowEnterT },
}

// List cascades — parent orchestrator + child item.
// <motion.ul variants={staggerParent} initial="initial" animate="animate">
//   {items.map(i => <motion.li key={i.id} variants={staggerChild}>...</motion.li>)}
// </motion.ul>
export const staggerParent = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
}
export const staggerChild = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: enterT },
}

// Card hover-lift. Alternative to inline CSS transition-all
// hover:-translate-y-0.5. CSS-only sites can stay on Tailwind
// utilities — both share timing via the motion tokens.
// <motion.div variants={cardHover} initial="rest" whileHover="hover" />
export const cardHover = {
  rest:  { y: 0,  transition: fastT },
  hover: { y: -2, transition: fastT },
}

// Modal overlay + panel. Use AnimatePresence for clean exit.
export const modalBackdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: standardT },
  exit:    { opacity: 0, transition: standardT },
}
export const modalPanel = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: enterT },
  exit:    { opacity: 0, scale: 0.96, y: 8, transition: exitT },
}

// Navbar wordmark → compact mark crossfade on scroll. Apply to BOTH
// siblings inside AnimatePresence (mode="wait") or absolute-positioned
// siblings for layout stability.
export const wordmarkCollapse = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: fastT },
  exit:    { opacity: 0, transition: fastT },
}

// Hero panel scale-on-reveal. Viewport-trigger one-shot version.
// For scroll-position-driven version (anthropic.com Pattern 2),
// use useScrollProgress hook (K-2-3).
// <motion.div variants={heroScaleOnReveal} initial="initial"
//             whileInView="animate" viewport={{ once: true, amount: 0.3 }} />
export const heroScaleOnReveal = {
  initial: { scale: 0.85, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: slowEnterT },
}

// Frosted backdrop primitive — for modals, mobile drawer, dropdowns.
// Consumer applies backdrop-filter blur themselves (Tailwind:
// backdrop-blur-sm/md/lg). This variant is opacity fade only.
// Apple's mega-menu inspiration; full mega-menu is overkill for
// AI Compass's 2-entry Guides dropdown, but the backdrop primitive
// is reusable for LoginModal + mobile hamburger.
export const frostedDropdown = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: standardT },
  exit:    { opacity: 0, transition: standardT },
}
