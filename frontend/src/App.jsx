import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { HelmetProvider } from 'react-helmet-async'

import ErrorBoundary from './components/ErrorBoundary'
import Footer from './components/Footer'
import RouteTransition from './components/RouteTransition'
import CompassLoader from './components/ui/CompassLoader'
import CardNav from './components/ui/CardNav'
import ScrollProgress from './components/ui/ScrollProgress'
// HomePage stays eager — it's the most common first paint
import HomePage from './pages/HomePage'

// Everything else loads on demand, dropping the initial bundle
const DirectoryPage = lazy(() => import('./pages/DirectoryPage'))
const ToolDetailPage = lazy(() => import('./pages/ToolDetailPage'))
const AlternativesPage = lazy(() => import('./pages/AlternativesPage'))

const CompareTray = lazy(() => import('./components/ui/CompareTray'))
const FeedbackWidget = lazy(() => import('./components/FeedbackWidget'))
const ProactiveHelpPrompt = lazy(() => import('./components/ui/ProactiveHelpPrompt'))
const OnboardingTour = lazy(() => import('./components/ui/OnboardingTour'))
const OnboardingWizard = lazy(() => import('./components/ui/OnboardingWizard'))
const OfflineBanner = lazy(() => import('./components/OfflineBanner'))
const CookieConsent = lazy(() => import('./components/ui/CookieConsent'))
const ToolFinderPage = lazy(() => import('./pages/ToolFinderPage'))
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'))
const CollectionPage = lazy(() => import('./pages/CollectionPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage'))
const ShareStackPage = lazy(() => import('./pages/ShareStackPage'))
const StackLibraryPage = lazy(() => import('./pages/StackLibraryPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const VerificationPendingPage = lazy(() => import('./pages/VerificationPendingPage'))
const VerificationSuccessPage = lazy(() => import('./pages/VerificationSuccessPage'))
const ClerkTestPage = lazy(() => import('./pages/ClerkTestPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const SubmitPage = lazy(() => import('./pages/SubmitPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const RefundsPage = lazy(() => import('./pages/RefundsPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const BestAIToolsForStudents = lazy(() => import('./pages/BestAIToolsForStudents'))
const BestAIToolsForTeachers = lazy(() => import('./pages/BestAIToolsForTeachers'))
const BestFreeAITools = lazy(() => import('./pages/BestFreeAITools'))
const BestCodingTools = lazy(() => import('./pages/BestCodingTools'))
const HowToGithubStudentPack = lazy(() => import('./pages/HowToGithubStudentPack'))
const HowToNotionStudent = lazy(() => import('./pages/HowToNotionStudent'))
const HowToJetBrainsStudent = lazy(() => import('./pages/HowToJetBrainsStudent'))
const SyllabusParserPage = lazy(() => import('./pages/SyllabusParserPage'))
const SharedToolkitPage = lazy(() => import('./pages/SharedToolkitPage'))
const StudentDiscountsPage = lazy(() => import('./pages/StudentDiscountsPage'))
const ModelComparisonPage = lazy(() => import('./pages/ModelComparisonPage'))

const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function ScrollToTop() {
  const { pathname, hash } = useLocation()

  // Handle scrolling when path or hash changes (including page loads)
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
    } else {
      const targetId = hash.startsWith('#') ? hash.slice(1) : hash
      if (targetId) {
        let attempts = 0
        const maxAttempts = 40 // Wait up to 2 seconds for lazy-loaded content

        const tryScroll = () => {
          const element = document.getElementById(targetId)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
            element.classList.add('hash-highlight')
            setTimeout(() => {
              element.classList.remove('hash-highlight')
            }, 2000)
          } else if (attempts < maxAttempts) {
            attempts++
            setTimeout(tryScroll, 50)
          }
        }
        tryScroll()
      }
    }
  }, [pathname, hash])

  // Handle clicks on hash links (even if current hash is unchanged)
  useEffect(() => {
    const handleHashLinkClick = (e) => {
      const anchor = e.target.closest('a')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (href && href.startsWith('#')) {
        const targetId = href.slice(1)
        e.preventDefault()
        
        const element = document.getElementById(targetId)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          element.classList.add('hash-highlight')
          setTimeout(() => {
            element.classList.remove('hash-highlight')
          }, 2000)
        }
        window.history.pushState(null, '', href)
      } else if (href && href.includes('#')) {
        const [path, targetHash] = href.split('#')
        const currentPath = window.location.pathname
        if (path === currentPath || path === '') {
          e.preventDefault()
          const element = document.getElementById(targetHash)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
            element.classList.add('hash-highlight')
            setTimeout(() => {
              element.classList.remove('hash-highlight')
            }, 2000)
          }
          window.history.pushState(null, '', href)
        }
      }
    }

    document.addEventListener('click', handleHashLinkClick)
    return () => document.removeEventListener('click', handleHashLinkClick)
  }, [])

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
      const protectedPaths = ['/dashboard', '/admin', '/profile', '/submit']
      if (storedUser && storedUser.is_verified === false && protectedPaths.some(p => location.pathname.startsWith(p))) {
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
            <Route path="/trending" element={<CollectionPage />} />
            <Route path="/compare" element={<ComparePage />} />
            {/* Path-based comparisons (indexable, SEO-targeted). Slug format
                is "<a>-vs-<b>"; the same component handles both URL shapes. */}
            <Route path="/compare/:pair" element={<ComparePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/u/:username" element={<PublicProfilePage />} />
            <Route path="/stacks" element={<StackLibraryPage />} />
            <Route path="/stacks/:userId" element={<ShareStackPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email-pending" element={<VerificationPendingPage />} />
            <Route path="/verify-success" element={<VerificationSuccessPage />} />
            <Route path="/clerk-test" element={<ClerkTestPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/submit" element={<SubmitPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/refunds" element={<RefundsPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/best-ai-tools-for-students" element={<BestAIToolsForStudents />} />
            <Route path="/best-ai-tools-for-teachers" element={<BestAIToolsForTeachers />} />
            <Route path="/best-free-ai-tools" element={<BestFreeAITools />} />
            <Route path="/best-coding-tools-for-students" element={<BestCodingTools />} />
            <Route path="/guides/github-student-pack" element={<HowToGithubStudentPack />} />
            <Route path="/guides/notion-student-premium" element={<HowToNotionStudent />} />
            <Route path="/guides/jetbrains-student-license" element={<HowToJetBrainsStudent />} />
            <Route path="/syllabus-parser" element={<SyllabusParserPage />} />
            <Route path="/shared-toolkit/:shareId" element={<SharedToolkitPage />} />
            <Route path="/student-discounts" element={<StudentDiscountsPage />} />
            <Route path="/model-comparison" element={<ModelComparisonPage />} />

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
            <CardNav />
            <main id="main-content" tabIndex={-1} className="flex-1 outline-none pt-[60px]">
              <AnimatedRoutes />
            </main>
            <Footer />
            <Suspense fallback={null}>
              <CompareTray />
              <FeedbackWidget />
              <ProactiveHelpPrompt />
              <OnboardingTour />
              <OnboardingWizard />
              <OfflineBanner />
              <CookieConsent />
            </Suspense>
          </div>
        </BrowserRouter>
      </MotionConfig>
    </HelmetProvider>
  )
}
