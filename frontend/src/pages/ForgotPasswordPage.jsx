import { useState, useEffect } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import AuthLayout from '../components/auth/AuthLayout'
import Button from '../components/ui/Button'

const MotionForm = motion.form

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const shakeControls = useAnimationControls()

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

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Email is required.')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || 'Something went wrong. Please try again.')
      }

      setSuccess(true)
      toast.success('Recovery link sent successfully!')
    } catch (requestError) {
      setError(requestError.message || 'Unable to send recovery email.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Recovery"
      title="Reset Password"
      subtitle={success ? "Check your inbox for a recovery link" : "Enter your email address to retrieve your account"}
    >
      {success ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm text-accent-ink">
            If an account is associated with this email address, a password reset link has been sent to it.
          </p>
          <div className="text-center mt-6">
            <Link to="/login" className="font-semibold text-accent hover:underline text-sm">
              Return to login
            </Link>
          </div>
        </div>
      ) : (
        <MotionForm className="mt-6 space-y-4" onSubmit={handleSubmit} animate={shakeControls} noValidate>
          <div>
            <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-ink-2">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={`w-full rounded-lg border bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 transition-colors focus:outline-none focus:ring-2 ${error ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line focus:border-accent focus:ring-accent'}`}
              placeholder="you@example.com"
            />
          </div>

          <Button variant="primary" type="submit" disabled={submitting} className="w-full font-semibold">
            {submitting ? 'Sending Link...' : 'Send Recovery Link'}
          </Button>

          {error ? (
            <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-muted">
            Remembered your password?{' '}
            <Link to="/login" className="font-semibold text-accent hover:underline">
              Login
            </Link>
          </p>
        </MotionForm>
      )}
    </AuthLayout>
  )
}
