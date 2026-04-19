const DEFAULT_API_URL =
  (typeof window !== 'undefined' && window.location?.origin) ||
  'https://ai-compass.in'

export const API_BASE_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, '')

export function toApiUrl(path) {
  if (!path) {
    return path
  }

  if (/^https?:\/\//i.test(path)) {
    return path
  }

  if (path.startsWith('/api/') || path.startsWith('/auth/')) {
    return `${API_BASE_URL}${path}`
  }

  return path
}
