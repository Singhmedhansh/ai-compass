// Storage access can be denied even when `window` exists. Privacy
// browsers that block all site data, embedded webviews, and third-party
// iframes throw a SecurityError on the first `localStorage` read. A read
// that runs during render — the theme lookup in the header components
// (CardNav, Navbar) — then takes the whole page down instead of breaking
// only the feature that wanted storage. These helpers swallow the throw
// so a blocked visitor still gets a working page.

export function readStorage(key) {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorage(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // storage blocked — no-op
  }
}
