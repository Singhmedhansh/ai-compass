import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const href = window.location.href
    const queryStart = href.indexOf('?')

    if (queryStart === -1) {
      navigate('/login?error=no_params', { replace: true })
      return
    }

    const params = {}
    href.substring(queryStart + 1).split('&').forEach(pair => {
      const [key, ...rest] = pair.split('=')
      if (key) params[decodeURIComponent(key)] = decodeURIComponent(
        rest.join('=').replace(/\+/g, ' ')
      )
    })

    if (params.error) {
      navigate(`/login?error=${encodeURIComponent(params.error)}`, { replace: true })
      return
    }

    if (params.name && params.email && params.id) {
      const onboardingCompleted = params.onboarding_completed !== 'false'
      const user = {
        name: params.name,
        email: params.email,
        id: params.id,
        picture: params.picture || '',
        onboarding_completed: onboardingCompleted,
        is_verified: true, // OAuth users are always verified
      }
      localStorage.setItem('user', JSON.stringify(user))
      if (window.posthog && user) {
        window.posthog.identify(user.id, {
          email: user.email,
          is_verified: true,
          onboarding_completed: onboardingCompleted,
        });
      }
      window.dispatchEvent(new Event('userLoggedIn'))
      const firstName = params.name.split(' ')[0]
      toast.success(
        onboardingCompleted
          ? `Welcome back, ${firstName}!`
          : `Account created! Let's set up your experience, ${firstName} 🎉`
      )
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/login?error=missing_params', { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="text-lg font-medium text-ink">Signing you in...</p>
      <p className="mt-2 text-sm text-muted">Please wait</p>
    </div>
  )
}
