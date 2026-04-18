import { useState } from 'react'

function getDomain(url) {
  if (!url) {
    return null
  }

  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    try {
      return new URL(`https://${url}`).hostname.replace(/^www\./, '')
    } catch {
      return null
    }
  }
}

function getLogoUrl(tool, source) {
  const domain = getDomain(tool?.url || tool?.website || tool?.link)

  if (!domain) {
    return null
  }

  if (source === 'duckduckgo') {
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`
  }

  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

function getFallbackLetter(tool) {
  const name = String(tool?.name || '').trim()
  if (!name) {
    return '?'
  }

  return name[0].toUpperCase()
}

function ToolLogo({ tool, size = 48 }) {
  const [logoSource, setLogoSource] = useState('google')
  const url = getLogoUrl(tool, logoSource)
  const shouldShowImage = Boolean(url) && logoSource !== 'fallback'

  if (shouldShowImage) {
    return (
      <img
        src={url}
        alt={tool?.name || 'Tool logo'}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.2,
          objectFit: 'contain',
          background: '#fff',
          padding: 3,
        }}
        onError={() => {
          setLogoSource((currentSource) => {
            if (currentSource === 'google') {
              return 'duckduckgo'
            }

            return 'fallback'
          })
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.2,
        background: '#6366f1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: 20,
      }}
    >
      {getFallbackLetter(tool)}
    </div>
  )
}

export default ToolLogo
