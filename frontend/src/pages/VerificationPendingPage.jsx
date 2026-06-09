import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import AuthLayout from '../components/auth/AuthLayout'
import Button from '../components/ui/Button'

export default function VerificationPendingPage() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || 'null')
  const email = user?.email || ''

  const [resending, setResending] = useState(false)
  const [error, setError] = useState('')

  async function handleResend() {
    if (!email) {
      toast.error('No email address associated with session.')
      return
    }

    setResending(true)
    setError('')

    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend verification link.')
      }

      toast.success(data.message || 'Verification link has been resent! Check your inbox.')
    } catch (err) {
      setError(err.message || 'Failed to send email.')
      toast.error(err.message || 'Failed to send email.')
    } finally {
      setResending(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // ignore
    }
    if (window.posthog) {
      window.posthog.reset()
    }
    localStorage.removeItem('user')
    window.dispatchEvent(new Event('userLoggedIn'))
    toast.success('Logged out successfully.')
    navigate('/login')
  }

  return (
    <AuthLayout
      eyebrow="Verification"
      title="Verify Your Email"
      subtitle="Your account is pending email validation before accessing fully protected features."
    >
      <div className="mt-6 space-y-6">
        <div className="rounded-lg border border-line glass-box p-4 backdrop-blur-sm">
          <p className="text-sm text-ink-2 mb-2">
            A confirmation link was dispatched to:
          </p>
          <p className="font-mono text-sm font-semibold text-accent break-all select-all">
            {email || 'No active session email'}
          </p>
        </div>

        <Button
          variant="primary"
          onClick={handleResend}
          disabled={resending || !email}
          className="w-full font-semibold"
        >
          {resending ? 'Resending Link...' : 'Resend Verification Link'}
        </Button>

        {error && (
          <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger text-center">
            {error}
          </p>
        )}

        <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted">
          <p className="text-center">
            Already verified? Make sure to check your spam/junk folder.
          </p>
          <button
            onClick={handleLogout}
            className="font-semibold text-accent hover:underline focus:outline-none"
          >
            Sign out / Login to another account
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}
