import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import AuthLayout from '../components/auth/AuthLayout'
import SocialAuthButtons from '../components/auth/SocialAuthButtons'
import Button from '../components/ui/Button'

const MotionForm = motion.form

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const shakeControls = useAnimationControls()

  const successMessage = location.state?.message || ''

  useEffect(() => {
    if (!error) {
      shakeControls.set({ x: 0 })
      return
    }

    shakeControls.start({
      x: [0, -6, 6, -4, 4, 0],
      transition: { duration: 0.28, ease: 'easeInOut' },
    })
  }, [error, shakeControls])

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search)
    if (queryParams.get('verified') === 'true') {
      // Clear stale user object (had is_verified:false) so the route guard
      // doesn't immediately bounce us back to /verify-email-pending.
      localStorage.removeItem('user')
      window.dispatchEvent(new Event('userLoggedIn'))
      toast.success('Email verified successfully! Please sign in to continue.', {
        duration: 5000,
      })
      navigate('/login', { replace: true })
    } else if (queryParams.get('error')) {
      const errorMsg = queryParams.get('error')
      let friendlyMsg = 'Verification failed.'
      if (errorMsg === 'invalid-or-expired-verification-token') {
        friendlyMsg = 'The verification link is invalid or has expired.'
      } else if (errorMsg === 'user-not-found') {
        friendlyMsg = 'User not found.'
      } else if (errorMsg === 'database-error') {
        friendlyMsg = 'A database error occurred during verification.'
      }
      toast.error(friendlyMsg, {
        duration: 5000,
      })
      navigate('/login', { replace: true })
    }
  }, [location.search, navigate])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || 'Invalid email or password.')
      }

      localStorage.setItem('user', JSON.stringify(payload))
      if (window.posthog && payload) {
        window.posthog.identify(payload.id, {
          email: payload.email,
          is_verified: payload.is_verified
        });
      }
      window.dispatchEvent(new Event('userLoggedIn'))

      const firstName = (payload.name || 'there').split(' ')[0]
      toast.success(`Welcome back, ${firstName}!`, {
        duration: 3000,
      })

      // If the account isn't verified yet, send them to the verification
      // pending page immediately (don't try to go to dashboard).
      if (payload.is_verified === false) {
        setTimeout(() => navigate('/verify-email-pending', { replace: true }), 400)
        return
      }

      // Honor return URL from <Link state={{ from: '...' }}> on the page that
      // sent the user here. Falls back to /dashboard if the user navigated
      // directly to /login. Reject obviously-bad return targets (login/register
      // themselves) so a refreshed login page doesn't bounce back to itself.
      const fromPath = location.state?.from
      const safeReturn = typeof fromPath === 'string'
        && fromPath.startsWith('/')
        && !fromPath.startsWith('/login')
        && !fromPath.startsWith('/register')
        ? fromPath
        : '/dashboard'

      setTimeout(() => {
        navigate(safeReturn, { replace: true })
      }, 800)

    } catch (requestError) {
      setError(requestError.message || 'Unable to sign in. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Sign in"
      title="Welcome back"
      subtitle="Sign in to your AI Compass account"
    >
      {successMessage ? (
        <p className="mt-6 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm text-accent-ink">
          {successMessage}
        </p>
      ) : null}

      <MotionForm className="mt-6 space-y-4" onSubmit={handleSubmit} animate={shakeControls} noValidate>
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-ink-2">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={`w-full rounded-lg border bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 transition-colors focus:outline-none focus:ring-2 ${error ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line focus:border-accent focus:ring-accent'}`}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="login-password" className="block text-sm font-medium text-ink-2">
              Password
            </label>
            <Link to="/forgot-password" className="text-xs text-accent hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className={`w-full rounded-lg border bg-bg-elev px-3 py-2 pr-10 text-sm text-ink placeholder:text-muted-2 transition-colors focus:outline-none focus:ring-2 ${error ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line focus:border-accent focus:ring-accent'}`}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-ink-2"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button variant="primary" type="submit" disabled={submitting} className="w-full font-semibold">
          {submitting ? 'Signing in...' : 'Sign In'}
        </Button>

        {error ? (
          <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </MotionForm>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-bg px-2 text-muted">or</span>
        </div>
      </div>

      <SocialAuthButtons verb="Continue" />

      <p className="mt-6 text-center text-sm text-muted">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-semibold text-accent hover:underline">
          Register
        </Link>
      </p>
    </AuthLayout>
  )
}

export default LoginPage
