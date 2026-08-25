import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import AuthLayout from '../components/auth/AuthLayout'
import Button from '../components/ui/Button'

const MotionForm = motion.form

// Shown right after a founder's first login — the server rejects every
// other authenticated request until this succeeds (see
// enforce_password_change_gate in app/__init__.py), so this page has no
// "skip" option. Framed as the last step before the Growth Hub, not a
// chore blocking it.
export default function ChangePasswordPage() {
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const shakeControls = useAnimationControls()

  useEffect(() => {
    let storedUser = null
    try {
      storedUser = JSON.parse(localStorage.getItem('user') || 'null')
    } catch {
      storedUser = null
    }
    if (!storedUser) {
      navigate('/login', { replace: true })
    } else if (!storedUser.must_change_password) {
      navigate('/growth-hub', { replace: true })
    }
  }, [navigate])

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
      const response = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: password }),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update your password. Please try again.')
      }

      localStorage.setItem('user', JSON.stringify(payload))
      window.dispatchEvent(new Event('userLoggedIn'))
      toast.success('Password set — welcome to your Growth Hub!')
      navigate('/growth-hub', { replace: true })
    } catch (requestError) {
      setError(requestError.message || 'Unable to update your password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="One last step"
      title="Set your password"
      subtitle="Swap the temporary password from your email for one only you know — then you're straight into your Growth Hub."
    >
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
              autoComplete="new-password"
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
            autoComplete="new-password"
            className={`w-full rounded-lg border bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 transition-colors focus:outline-none focus:ring-2 ${error ? 'border-danger focus:border-danger focus:ring-danger' : 'border-line focus:border-accent focus:ring-accent'}`}
            placeholder="Re-enter new password"
          />
        </div>

        <Button variant="primary" type="submit" disabled={submitting} className="w-full font-semibold">
          {submitting ? 'Setting password...' : 'Set password & continue'}
        </Button>

        {error ? (
          <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </MotionForm>
    </AuthLayout>
  )
}
