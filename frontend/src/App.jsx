import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, MotionConfig } from 'framer-motion'

import Footer from './components/Footer'
import RouteTransition from './components/RouteTransition'
import CompareTray from './components/ui/CompareTray'
import Navbar from './components/ui/Navbar'
import ScrollProgress from './components/ui/ScrollProgress'
// HomePage stays eager — it's the most common first paint
import HomePage from './pages/HomePage'

// Everything else loads on demand, dropping the initial bundle
const DirectoryPage = lazy(() => import('./pages/DirectoryPage'))
const ToolDetailPage = lazy(() => import('./pages/ToolDetailPage'))
const AlternativesPage = lazy(() => import('./pages/AlternativesPage'))
const ToolFinderPage = lazy(() => import('./pages/ToolFinderPage'))
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'))
const CollectionPage = lazy(() => import('./pages/CollectionPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const SubmitPage = lazy(() => import('./pages/SubmitPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const BestAIToolsForStudents = lazy(() => import('./pages/BestAIToolsForStudents'))
const BestFreeAITools = lazy(() => import('./pages/BestFreeAITools'))
const BestCodingTools = lazy(() => import('./pages/BestCodingTools'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <RouteTransition key={location.pathname}>
        <Suspense fallback={<RouteFallback />}>
          <Routes location={location}>
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/tools" element={<DirectoryPage />} />
            <Route path="/tools/:slug" element={<ToolDetailPage />} />
            <Route path="/alternatives/:slug" element={<AlternativesPage />} />
            <Route path="/ai-tool-finder" element={<ToolFinderPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:slug" element={<CollectionPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/best-ai-tools-for-students" element={<BestAIToolsForStudents />} />
            <Route path="/best-free-ai-tools" element={<BestFreeAITools />} />
            <Route path="/best-coding-tools-for-students" element={<BestCodingTools />} />
          </Routes>
        </Suspense>
      </RouteTransition>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ScrollToTop />
        <ScrollProgress />
        <div className="min-h-screen flex flex-col bg-bg text-ink">
          <Navbar />
          <main className="flex-1">
            <AnimatedRoutes />
          </main>
          <Footer />
          <CompareTray />
        </div>
      </BrowserRouter>
    </MotionConfig>
  )
}
