import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'

import { Navbar } from './components/ui'
import AdminPage from './pages/AdminPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import CollectionPage from './pages/CollectionPage'
import CollectionsPage from './pages/CollectionsPage'
import DashboardPage from './pages/DashboardPage'
import DirectoryPage from './pages/DirectoryPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ToolDetailPage from './pages/ToolDetailPage'
import ToolFinderPage from './pages/ToolFinderPage'

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

function App() {
  const [runtimeError, setRuntimeError] = useState('')

  useEffect(() => {
    const handleError = (event) => {
      const message = event?.error?.message || event?.message || 'Unknown runtime error'
      setRuntimeError(String(message))
    }

    const handleRejection = (event) => {
      const reason = event?.reason
      const message = typeof reason === 'string' ? reason : reason?.message || 'Unhandled promise rejection'
      setRuntimeError(String(message))
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
        {runtimeError ? (
          <div className="mx-auto mt-4 w-full max-w-7xl rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Runtime error: {runtimeError}
          </div>
        ) : null}
        <ScrollToTop />
        <Navbar />
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/tools" element={<DirectoryPage />} />
          <Route path="/tools/:slug" element={<ToolDetailPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:slug" element={<CollectionPage />} />
          <Route path="/ai-tool-finder" element={<ToolFinderPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
