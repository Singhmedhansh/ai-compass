import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const href = window.location.href
    const queryStart = href.indexOf('?')
    
    if (queryStart === -1) {
      navigate('/login?error=no_params', { replace: true })
      return
    }

    const queryString = href.substring(queryStart + 1)
    const params = {}
    
    queryString.split('&').forEach(pair => {
      const [key, ...rest] = pair.split('=')
      if (key) {
        params[decodeURIComponent(key)] = decodeURIComponent(
          rest.join('=').replace(/\+/g, ' ')
        )
      }
    })

    console.log('Parsed params:', params)

    if (params.name && params.email && params.id) {
      localStorage.setItem('user', JSON.stringify({
        name: params.name,
        email: params.email,
        id: params.id,
        picture: params.picture || ''
      }))
      navigate('/dashboard', { replace: true })
    } else {
      console.log('Missing params, got:', params)
      navigate('/login?error=missing_params', { replace: true })
    }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950">
      <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mb-4"/>
      <p className="text-white text-lg">Signing you in...</p>
    </div>
  )
}