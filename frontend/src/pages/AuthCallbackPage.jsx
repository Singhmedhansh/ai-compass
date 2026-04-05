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

    if (params.name && params.email && params.id) {
      const user = {
        name: params.name,
        email: params.email,
        id: params.id,
        picture: params.picture || ''
      }
      localStorage.setItem('user', JSON.stringify(user))
      window.dispatchEvent(new Event('userLoggedIn'))
      toast.success(`Welcome back, ${params.name.split(' ')[0]}! 👋`)
      navigate('/dashboard', { replace: true })
    } else {
      navigate('/login?error=missing_params', { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mb-4"/>
      <p className="text-white text-lg font-medium">Signing you in...</p>
      <p className="text-gray-500 text-sm mt-2">Please wait</p>
    </div>
  )
}