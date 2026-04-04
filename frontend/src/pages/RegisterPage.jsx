import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function RegisterPage() {
  const navigate = useNavigate()

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

      navigate('/login', {
        state: {
          message: 'Account created successfully. Please sign in.',
        },
      })
    } catch (requestError) {
      setServerError(requestError.message || 'Unable to create account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full items-center justify-center px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="mt-2 text-sm text-slate-400">Join AI Compass and save your favorite tools.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="register-name" className="mb-1.5 block text-sm font-medium text-slate-200">
              Full name
            </label>
            <input
              id="register-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              autoComplete="name"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              placeholder="Jane Doe"
            />
            {fieldErrors.fullName ? <p className="mt-1 text-xs text-red-400">{fieldErrors.fullName}</p> : null}
          </div>

          <div>
            <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium text-slate-200">
              Email
            </label>
            <input
              id="register-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              placeholder="you@example.com"
            />
            {fieldErrors.email ? <p className="mt-1 text-xs text-red-400">{fieldErrors.email}</p> : null}
          </div>

          <div>
            <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium text-slate-200">
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
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              placeholder="At least 8 characters"
            />
            {fieldErrors.password ? <p className="mt-1 text-xs text-red-400">{fieldErrors.password}</p> : null}
          </div>

          <div>
            <label htmlFor="register-confirm-password" className="mb-1.5 block text-sm font-medium text-slate-200">
              Confirm password
            </label>
            <input
              id="register-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              placeholder="Re-enter your password"
            />
            {fieldErrors.confirmPassword ? <p className="mt-1 text-xs text-red-400">{fieldErrors.confirmPassword}</p> : null}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-700"
          >
            {submitting ? 'Creating account...' : 'Create Account'}
          </button>

          {serverError ? <p className="text-sm text-red-400">{serverError}</p> : null}
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-indigo-300 hover:text-indigo-200">
            Login
          </Link>
        </p>
      </section>
    </main>
  )
}

export default RegisterPage
