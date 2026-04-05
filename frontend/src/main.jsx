import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { Toaster } from 'sonner'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1e1b4b', color: '#fff', border: '1px solid #4f46e5' },
        }}
      />
      <App />
    </HelmetProvider>
  </StrictMode>,
)
