import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import Button from '../components/ui/Button'
import CompassMark from '../components/ui/CompassMark'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  const fieldErrors = useMemo(() => {
    const errors = {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
    }

    if (fullName.trim().length === 0) {
      errors.fullName = 'Full name is required.'
    }

    if (email.length > 0 && !emailPattern.test(email)) {
      errors.email = 'Enter a valid email address.'
    }

    if (password.length > 0 && password.length < 8) {
      errors.password = 'Password must be at least 8 characters.'
    }

    if (confirmPassword.length > 0 && confirmPassword !== password) {
      errors.confirmPassword = 'Passwords must match.'
    }

    return errors
  }, [fullName, email, password, confirmPassword])

  const hasErrors = Object.values(fieldErrors).some(Boolean)

  async function handleSubmit(event) {
    event.preventDefault()
    setServerError('')

    if (hasErrors || !email || !password || !confirmPassword || !fullName.trim()) {
      setServerError('Please fix validation errors before submitting.')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          password,
        }),
      })

      const text = await response.text()

      if (!response.ok) {
        console.error('Register request failed', {
          status: response.status,
          body: text,
        })
        setServerError(text || 'Unable to create account.')
        return
      }

      // Preserve the original source page across register -> login -> destination,
      // so a user who clicked "Register" from /tools/<slug> lands back there
      // after logging in with their fresh account.
      navigate('/login', {
        state: {
          message: 'Account created successfully. Please sign in.',
          from: location.state?.from,
        },
      })
    } catch (requestError) {
      setServerError(requestError.message || 'Unable to create account.')
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
        <h1 className="text-center text-2xl font-bold text-ink">Create your account</h1>
        <p className="mt-2 text-center text-sm text-muted">Join AI Compass and save your favorite tools.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="register-name" className="mb-1.5 block text-sm font-medium text-ink-2">
              Full name
            </label>
            <input
              id="register-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              autoComplete="name"
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Jane Doe"
            />
            {fieldErrors.fullName ? <p className="mt-1 text-xs text-danger">{fieldErrors.fullName}</p> : null}
          </div>

          <div>
            <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium text-ink-2">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="you@example.com"
            />
            {fieldErrors.email ? <p className="mt-1 text-xs text-danger">{fieldErrors.email}</p> : null}
          </div>

          <div>
            <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium text-ink-2">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="At least 8 characters"
            />
            {fieldErrors.password ? <p className="mt-1 text-xs text-danger">{fieldErrors.password}</p> : null}
          </div>

          <div>
            <label htmlFor="register-confirm-password" className="mb-1.5 block text-sm font-medium text-ink-2">
              Confirm password
            </label>
            <input
              id="register-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Re-enter your password"
            />
            {fieldErrors.confirmPassword ? <p className="mt-1 text-xs text-danger">{fieldErrors.confirmPassword}</p> : null}
          </div>

          <Button variant="primary" type="submit" disabled={submitting} className="w-full font-semibold">
            {submitting ? 'Creating account...' : 'Create Account'}
          </Button>

          {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Login
          </Link>
        </p>
      </section>
    </div>
  )
}

export default RegisterPage
