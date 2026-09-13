import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import SEO from '../components/ui/SEO'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const params = {}
    const href = window.location.href
    const queryStart = href.indexOf('?')
    if (queryStart !== -1) {
      href.substring(queryStart + 1).split('&').forEach(pair => {
        const [key, ...rest] = pair.split('=')
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(
          rest.join('=').replace(/\+/g, ' ')
        )
      })
    }

    if (params.error) {
      navigate(`/login?error=${encodeURIComponent(params.error)}`, { replace: true })
      return
    }

    // The account is read from the session, not from the URL. The backend
    // used to pass name/email/id/picture as query parameters, which meant
    // this page's own URL — captured by PostHog and GA4 as an ordinary
    // pageview, and kept in browser history — carried the user's email
    // address. The session cookie is already set by the time we land here,
    // so ask the server who this is instead.
    ;(async () => {
      try {
        const response = await fetch('/api/v1/auth/me', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
          navigate('/login?error=session_not_established', { replace: true })
          return
        }

        const me = await response.json()
        const onboardingCompleted = params.onboarding_completed !== 'false'
        const displayName = me.name || (me.email ? me.email.split('@')[0] : 'there')

        const user = {
          name: displayName,
          email: me.email || '',
          id: me.id,
          picture: me.picture || '',
          onboarding_completed: onboardingCompleted,
          is_verified: true, // OAuth users are always verified
        }
        localStorage.setItem('user', JSON.stringify(user))

        if (window.posthog) {
          window.posthog.identify(user.id, {
            is_verified: true,
            onboarding_completed: onboardingCompleted,
          })
        }

        window.dispatchEvent(new Event('userLoggedIn'))
        const firstName = displayName.split(' ')[0]
        toast.success(
          onboardingCompleted
            ? `Welcome back, ${firstName}!`
            : `Account created! Let's set up your experience, ${firstName} 🎉`
        )
        navigate('/dashboard', { replace: true })
      } catch {
        navigate('/login?error=callback_failed', { replace: true })
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center">
      <SEO noindex title="Signing you in" description="Completing your AI Compass sign-in." />
      <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      <p className="text-lg font-medium text-ink">Signing you in...</p>
      <p className="mt-2 text-sm text-muted">Please wait</p>
    </div>
  )
}
