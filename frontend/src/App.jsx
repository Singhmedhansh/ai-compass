import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'

import Navbar from './components/ui/Navbar'
import HomePage from './pages/HomePage'
import DirectoryPage from './pages/DirectoryPage'
import ToolDetailPage from './pages/ToolDetailPage'
import ToolFinderPage from './pages/ToolFinderPage'
import CollectionsPage from './pages/CollectionsPage'
import CollectionPage from './pages/CollectionPage'
import DashboardPage from './pages/DashboardPage'
import ProfilePage from './pages/ProfilePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AdminPage from './pages/AdminPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import SubmitPage from './pages/SubmitPage'
import BestAIToolsForStudents from './pages/BestAIToolsForStudents'
import BestFreeAITools from './pages/BestFreeAITools'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/tools" element={<DirectoryPage />} />
        <Route path="/tools/:slug" element={<ToolDetailPage />} />
        <Route path="/ai-tool-finder" element={<ToolFinderPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:slug" element={<CollectionPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/submit" element={<SubmitPage />} />
        <Route path="/best-ai-tools-for-students" element={<BestAIToolsForStudents />} />
        <Route path="/best-free-ai-tools" element={<BestFreeAITools />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
        <Navbar />
        <AnimatedRoutes />
      </div>
    </BrowserRouter>
  )
}
