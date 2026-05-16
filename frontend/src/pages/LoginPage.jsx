import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import Button from '../components/ui/Button'
import CompassMark from '../components/ui/CompassMark'
import { API_BASE_URL } from '../config/api'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.6 2.3 12 2.3c-5.4 0-9.7 4.3-9.7 9.7s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.4 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.36 9.36 0 0 1 2.5-.34c.85 0 1.71.12 2.5.34 1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"
      />
    </svg>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const googleAuthUrl = `${API_BASE_URL}/auth/google`
  const githubAuthUrl = `${API_BASE_URL}/login/github`
  const linkedinAuthUrl = `${API_BASE_URL}/login/linkedin`

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
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-line bg-bg-elev p-6 shadow-xl sm:p-8">
        <div className="mb-5 flex justify-center">
          <CompassMark size={48} />
        </div>
        <h1 className="text-center text-2xl font-bold text-ink">Welcome back</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Sign in to your AI Compass account
        </p>

        {successMessage ? (
          <p className="mt-4 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm text-accent-ink">
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
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
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
                className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 pr-10 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
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
            <span className="bg-bg-elev px-2 text-muted">or</span>
          </div>
        </div>

        <div className="space-y-2.5">
          <a
            href={googleAuthUrl}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-bg-elev px-4 py-2.5 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
          >
            <GoogleIcon />
            Continue with Google
          </a>
          <a
            href={githubAuthUrl}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-bg-elev px-4 py-2.5 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
          >
            <GitHubIcon />
            Continue with GitHub
          </a>
          <a
            href={linkedinAuthUrl}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-bg-elev px-4 py-2.5 text-sm font-medium text-ink-2 transition hover:bg-bg-sunk"
          >
            <LinkedInIcon />
            Continue with LinkedIn
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-accent hover:underline">
            Register
          </Link>
        </p>
      </section>
    </div>
  )
}

export default LoginPage
