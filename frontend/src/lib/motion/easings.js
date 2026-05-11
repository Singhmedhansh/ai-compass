/**
 * Motion easing curves and durations.
 *
 * Mirrors the CSS tokens (--ease-* / --motion-*) so Framer Motion
 * animations and CSS transitions share the same timing vocabulary.
 * Update both this file and the corresponding CSS tokens together.
 */

export const easings = {
  standard: [0.4, 0, 0.2, 1],
  enter:    [0, 0, 0.2, 1],
  exit:     [0.4, 0, 1, 1],
}

export const durations = {
  fast: 0.15,   // matches --motion-fast: 150ms
  base: 0.25,   // matches --motion-base: 250ms
  slow: 0.4,    // matches --motion-slow: 400ms
}
