import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster } from 'sonner'
import 'sonner/dist/styles.css'
import App from './App.jsx'
import { toApiUrl } from './config/api.js'
import { CurrencyProvider } from './context/CurrencyContext.jsx'


// --- Stale-deploy recovery -------------------------------------------------
// After a deploy, a tab that was open (or has a cached index.html) still
// references the OLD hashed chunk filenames. Those files no longer exist
// on the server, so the dynamic import rejects and the page goes blank
// (navbar/footer survive — they're in the already-loaded main bundle).
// Vite emits `vite:preloadError` for exactly this; chunk failures can also
// surface as an unhandledrejection. In both cases we force ONE reload to
// pull the fresh index.html + chunks. A sessionStorage guard prevents an
// infinite reload loop if the failure is genuine/persistent, and it's
// cleared after a healthy run so a LATER deploy can recover too.
const CHUNK_RELOAD_KEY = 'ac-reloaded-after-chunk-error'
// If a reload happened within this window and we're STILL failing, the
// problem isn't a stale deploy — stop reloading so we can't loop. A
// later deploy (timestamp older than the window) will recover normally.
const CHUNK_RELOAD_COOLDOWN_MS = 30_000

function recoverFromStaleChunk() {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
    if (Date.now() - last < CHUNK_RELOAD_COOLDOWN_MS) return
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  } catch {
    /* sessionStorage blocked — still attempt a single reload */
  }
  window.location.reload()
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  recoverFromStaleChunk()
})

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event?.reason?.message || event?.reason || '')
  if (
    /dynamically imported module|ChunkLoadError|Importing a module script failed|Failed to fetch dynamically/i.test(
      msg,
    )
  ) {
    recoverFromStaleChunk()
  }
})

// ---------------------------------------------------------------------------

const originalFetch = window.fetch.bind(window)

window.fetch = (input, init) => {
  if (typeof input === 'string') {
    const rewritten = toApiUrl(input)
    const wasRewritten = rewritten !== input
    return originalFetch(
      rewritten,
      wasRewritten ? { credentials: 'include', ...init } : init,
    )
  }

  if (input instanceof URL) {
    const original = input.toString()
    const rewritten = toApiUrl(original)
    const wasRewritten = rewritten !== original
    return originalFetch(
      rewritten,
      wasRewritten ? { credentials: 'include', ...init } : init,
    )
  }

  return originalFetch(input, init)
}

const applyAspectRatioFlag = () => {
  const root = document.documentElement
  const ratio = window.innerWidth / Math.max(window.innerHeight, 1)
  if (ratio < 0.95) {
    root.dataset.aspect = 'portrait'
    return
  }
  if (ratio > 1.9) {
    root.dataset.aspect = 'ultrawide'
    return
  }
  root.dataset.aspect = 'landscape'
}

applyAspectRatioFlag()
window.addEventListener('resize', applyAspectRatioFlag)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <Toaster
        position="bottom-left"
        richColors
        closeButton
        theme="dark"
        toastOptions={{
          classNames: {
            toast: 'font-medium',
          },
        }}
      />
      <CurrencyProvider>
        <App />
      </CurrencyProvider>
    </HelmetProvider>
  </StrictMode>,
)
