import { useEffect, useMemo, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import AuthLayout from '../components/auth/AuthLayout'
import SocialAuthButtons from '../components/auth/SocialAuthButtons'
import Button from '../components/ui/Button'

const MotionForm = motion.form

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const shakeControls = useAnimationControls()

  // Errors are computed eagerly but only surfaced once a field has been
  // blurred or the form submitted. Without this gate the "Full name is
  // required." message rendered on first paint (Antigravity flagged it).
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)

  const markTouched = (field) =>
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }))

  const fieldErrors = useMemo(() => {
    const errors = {
      fullName: '',
      email: '',
      password: '',
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

    return errors
  }, [fullName, email, password])

  const hasErrors = Object.values(fieldErrors).some(Boolean)

  useEffect(() => {
    if (!serverError) {
      shakeControls.set({ x: 0 })
      return
    }

    shakeControls.start({
      x: [0, -6, 6, -4, 4, 0],
      transition: { duration: 0.28, ease: 'easeInOut' },
    })
  }, [serverError, shakeControls])

  // Only show a field's error after the user has interacted with it
  // (blur) or attempted to submit — never on a pristine page load.
  const errorFor = (field) =>
    touched[field] || submitted ? fieldErrors[field] : ''

  async function handleSubmit(event) {
    event.preventDefault()
    setServerError('')
    setSubmitted(true)

    if (hasErrors || !email || !password || !fullName.trim()) {
      shakeControls.start({
        x: [0, -6, 6, -4, 4, 0],
        transition: { duration: 0.28, ease: 'easeInOut' },
      })
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

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        console.error('Register request failed', {
          status: response.status,
          payload,
        })
        setServerError(payload.error || 'Unable to create account.')
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

  const inputClass =
    'w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Create your account"
      subtitle="Join AI Compass and save your favorite tools."
    >
      <MotionForm className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate animate={shakeControls}>
        <div>
          <label htmlFor="register-name" className="mb-1.5 block text-sm font-medium text-ink-2">
            Full name
          </label>
          <input
            id="register-name"
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            onBlur={() => markTouched('fullName')}
            required
            autoComplete="name"
            className={`${inputClass} ${errorFor('fullName') ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
            placeholder="Jane Doe"
          />
          {errorFor('fullName') ? (
            <p className="mt-1 text-xs text-danger">{errorFor('fullName')}</p>
          ) : null}
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
            onBlur={() => markTouched('email')}
            required
            autoComplete="email"
            className={`${inputClass} ${errorFor('email') ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
            placeholder="you@example.com"
          />
          {errorFor('email') ? (
            <p className="mt-1 text-xs text-danger">{errorFor('email')}</p>
          ) : null}
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
            onBlur={() => markTouched('password')}
            required
            minLength={8}
            autoComplete="new-password"
            className={`${inputClass} ${errorFor('password') ? 'border-danger focus:border-danger focus:ring-danger' : ''}`}
            placeholder="At least 8 characters"
          />
          {errorFor('password') ? (
            <p className="mt-1 text-xs text-danger">{errorFor('password')}</p>
          ) : null}
        </div>

        <Button variant="primary" type="submit" disabled={submitting} className="w-full font-semibold">
          {submitting ? 'Creating account...' : 'Create Account'}
        </Button>

        {serverError ? <p className="text-sm text-danger">{serverError}</p> : null}
      </MotionForm>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-bg px-2 text-muted">or</span>
        </div>
      </div>

      <SocialAuthButtons verb="Sign up" />

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-accent hover:underline">
          Login
        </Link>
      </p>
    </AuthLayout>
  )
}

export default RegisterPage
