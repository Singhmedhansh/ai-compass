import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import AuthLayout from '../components/auth/AuthLayout'
import SocialAuthButtons from '../components/auth/SocialAuthButtons'
import Button from '../components/ui/Button'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const successMessage = location.state?.message || ''

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
      window.dispatchEvent(new Event('userLoggedIn'))

      const firstName = (payload.name || 'there').split(' ')[0]
      toast.success(`Welcome back, ${firstName}! 👋`, {
        duration: 3000,
      })

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

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
            className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-ink-2">
            Password
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 pr-10 text-sm text-ink placeholder:text-muted-2 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
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
      </form>

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
