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
  // Source progression: 'curated' (tool.icon from catalog) -> 'google' favicon
  // -> 'duckduckgo' favicon -> 'fallback' (initial-letter circle).
  // 'curated' takes precedence because hand-set or Clearbit URLs are sharper
  // and 404 cleanly when missing; the Google favicon API returns a generic
  // globe placeholder (HTTP 200) for unknown domains, which never triggers
  // onError, so relying on it alone left obscure tools with a globe in the UI.
  if (source === 'curated') {
    const explicit = (tool?.icon || '').trim()
    return explicit || null
  }

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
  // Start with the curated icon if the catalog has one; otherwise jump straight
  // to the favicon chain. Tools without tool.icon set ('curated' resolves null)
  // skip past the curated step on first render and fail forward to google.
  const initialSource = (tool?.icon || '').trim() ? 'curated' : 'google'
  const [logoSource, setLogoSource] = useState(initialSource)
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
            if (currentSource === 'curated') {
              return 'google'
            }
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
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--bg)',
        fontWeight: 700,
        fontSize: 20,
      }}
    >
      {getFallbackLetter(tool)}
    </div>
  )
}

export default ToolLogo
