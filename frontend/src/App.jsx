import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { HelmetProvider } from 'react-helmet-async'

import ErrorBoundary from './components/ErrorBoundary'
import FeedbackWidget from './components/FeedbackWidget'
import Footer from './components/Footer'
import OfflineBanner from './components/OfflineBanner'
import RouteTransition from './components/RouteTransition'
import CompareTray from './components/ui/CompareTray'
import CompassLoader from './components/ui/CompassLoader'
import Navbar from './components/ui/Navbar'
import ScrollProgress from './components/ui/ScrollProgress'
import CookieConsent from './components/ui/CookieConsent'
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
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const VerificationPendingPage = lazy(() => import('./pages/VerificationPendingPage'))
const ClerkTestPage = lazy(() => import('./pages/ClerkTestPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const SubmitPage = lazy(() => import('./pages/SubmitPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const BestAIToolsForStudents = lazy(() => import('./pages/BestAIToolsForStudents'))
const BestAIToolsForTeachers = lazy(() => import('./pages/BestAIToolsForTeachers'))
const BestFreeAITools = lazy(() => import('./pages/BestFreeAITools'))
const BestCodingTools = lazy(() => import('./pages/BestCodingTools'))
const BestJasperAlternatives = lazy(() => import('./pages/BestJasperAlternatives'))
const BestMurfAlternatives = lazy(() => import('./pages/BestMurfAlternatives'))
const BestSynthesiaAlternatives = lazy(() => import('./pages/BestSynthesiaAlternatives'))
const BestAIToolsForFictionWriters = lazy(() => import('./pages/BestAIToolsForFictionWriters'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function RouteFallback() {
  return <CompassLoader full size={64} />
}

function TransitionLayout() {
  const location = useLocation()
  
  return (
    <RouteTransition key={location.pathname}>
      <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </RouteTransition>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
      if (storedUser && storedUser.is_verified === false && location.pathname !== '/verify-email-pending') {
        navigate('/verify-email-pending', { replace: true })
      }
    } catch (e) {
      // ignore
    }
  }, [location.pathname, navigate])

  return (
    <Routes location={location}>
      <Route element={<TransitionLayout />}>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/tools" element={<DirectoryPage />} />
            <Route path="/tools/:slug" element={<ToolDetailPage />} />
            <Route path="/alternatives/:slug" element={<AlternativesPage />} />
            <Route path="/ai-tool-finder" element={<ToolFinderPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:slug" element={<CollectionPage />} />
            <Route path="/compare" element={<ComparePage />} />
            {/* Path-based comparisons (indexable, SEO-targeted). Slug format
                is "<a>-vs-<b>"; the same component handles both URL shapes. */}
            <Route path="/compare/:pair" element={<ComparePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email-pending" element={<VerificationPendingPage />} />
            <Route path="/clerk-test" element={<ClerkTestPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/best-ai-tools-for-students" element={<BestAIToolsForStudents />} />
            <Route path="/best-ai-tools-for-teachers" element={<BestAIToolsForTeachers />} />
            <Route path="/best-free-ai-tools" element={<BestFreeAITools />} />
            <Route path="/best-coding-tools-for-students" element={<BestCodingTools />} />
            <Route path="/best-jasper-alternatives" element={<BestJasperAlternatives />} />
            <Route path="/best-murf-alternatives" element={<BestMurfAlternatives />} />
            <Route path="/best-synthesia-alternatives" element={<BestSynthesiaAlternatives />} />
            <Route path="/best-ai-tools-for-fiction-writers" element={<BestAIToolsForFictionWriters />} />
            <Route path="*" element={<NotFoundPage />} />
        </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <HelmetProvider>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <ScrollToTop />
          <ScrollProgress />
          <div className="min-h-screen flex flex-col bg-bg text-ink">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-bg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-accent"
            >
              Skip to main content
            </a>
            <Navbar />
            <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
              <AnimatedRoutes />
            </main>
            <Footer />
            <CompareTray />
            <FeedbackWidget />
            <OfflineBanner />
            <CookieConsent />
          </div>
        </BrowserRouter>
      </MotionConfig>
    </HelmetProvider>
  )
}
