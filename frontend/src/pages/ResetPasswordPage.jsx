import { useState, useEffect } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'
import AuthLayout from '../components/auth/AuthLayout'
import Button from '../components/ui/Button'

const MotionForm = motion.form

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const shakeControls = useAnimationControls()

  const queryParams = new URLSearchParams(location.search)
  const token = queryParams.get('token')

  useEffect(() => {
    if (!token) {
      setError('Password reset token is missing. Please request a new recovery link.')
    }
  }, [token])

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

    if (!token) {
      setError('Password reset token is missing.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || 'The reset link is invalid or has expired.')
      }

      setSuccess(true)
      toast.success('Password updated successfully!')
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (requestError) {
      setError(requestError.message || 'Unable to reset password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Security"
      title="Create New Password"
      subtitle={success ? "Redirecting you to login..." : "Enter your new password below"}
    >
      {success ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm text-accent-ink">
            Your password has been reset successfully. Redirecting you to login...
          </p>
        </div>
      ) : (
        <MotionForm className="mt-6 space-y-4" onSubmit={handleSubmit} animate={shakeControls} noValidate>
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-ink-2">
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={`w-full rounded-lg border bg-bg-elev px-3 py-2 pr-10 text-sm text-ink placeholder:text-muted-2 transition-colors focus:outline-none focus:ring-2 ${error ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line focus:border-accent focus:ring-accent'}`}
                placeholder="At least 8 characters"
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

          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-ink-2">
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={`w-full rounded-lg border bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 transition-colors focus:outline-none focus:ring-2 ${error ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line focus:border-accent focus:ring-accent'}`}
              placeholder="Re-enter new password"
            />
          </div>

          <Button variant="primary" type="submit" disabled={submitting || !token} className="w-full font-semibold">
            {submitting ? 'Resetting Password...' : 'Reset Password'}
          </Button>

          {error ? (
            <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <p className="mt-6 text-center text-sm text-muted">
            Back to{' '}
            <Link to="/login" className="font-semibold text-accent hover:underline">
              Login
            </Link>
          </p>
        </MotionForm>
      )}
    </AuthLayout>
  )
}
