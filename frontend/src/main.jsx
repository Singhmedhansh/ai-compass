import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster } from 'sonner'
import App from './App.jsx'
import { toApiUrl } from './config/api.js'

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
        position="top-right"
        closeButton
        toastOptions={{
          style: {
            background: 'var(--bg-elev)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.12))',
          },
          classNames: {
            closeButton:
              'border border-line bg-bg-elev text-ink-2 hover:bg-bg-sunk',
          },
        }}
      />
      <App />
    </HelmetProvider>
  </StrictMode>,
)
