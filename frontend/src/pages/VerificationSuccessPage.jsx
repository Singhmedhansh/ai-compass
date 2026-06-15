import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/auth/AuthLayout'
import Button from '../components/ui/Button'
import { CheckCircle2 } from 'lucide-react'

export default function VerificationSuccessPage() {
  const navigate = useNavigate()
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    try {
      const localUser = JSON.parse(localStorage.getItem('user') || 'null')
      if (localUser) {
        localUser.is_verified = true
        localStorage.setItem('user', JSON.stringify(localUser))
        window.dispatchEvent(new Event('userLoggedIn'))
        setIsLoggedIn(true)
      }
    } catch (e) {
      // ignore
    }
  }, [])

  return (
    <AuthLayout
      eyebrow="Verification Successful"
      title="You are all set!"
      subtitle="Your email address has been successfully verified."
    >
      <div className="mt-8 flex flex-col items-center text-center space-y-6">
        <div className="relative flex items-center justify-center h-20 w-20 rounded-full bg-accent-soft text-accent">
          <CheckCircle2 size={48} />
        </div>

        <div className="space-y-2">
          <p className="text-base text-ink-2 font-medium">
            Welcome to the AI Compass community!
          </p>
          <p className="text-sm text-muted max-w-sm">
            Enjoy full access to AI Compass, personalize your saved stacks, compare language models, and find the perfect tools to boost your academic and creative projects.
          </p>
        </div>

        <div className="w-full pt-4">
          {isLoggedIn ? (
            <Button
              variant="primary"
              onClick={() => navigate('/dashboard')}
              className="w-full font-semibold"
            >
              Go to Dashboard
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => navigate('/login')}
              className="w-full font-semibold"
            >
              Sign In to AI Compass
            </Button>
          )}
        </div>

        <p className="text-sm text-muted">
          Need help? Contact us at{' '}
          <Link to="/contact" className="text-accent hover:underline font-semibold transition-colors">
            Support
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
