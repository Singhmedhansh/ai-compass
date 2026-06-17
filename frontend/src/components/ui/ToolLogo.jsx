import { useState } from 'react'

// Logos resolve through a FIRST-PARTY proxy (/icon/<domain>) so privacy
// blockers (Brave Shields, uBlock, corp networks) can't strip them the way
// they block a direct icons.duckduckgo.com request — that was leaving a
// large share of users with bland letter tiles site-wide. The server
// fetches + caches the favicon (DuckDuckGo, then Google s2) and 404s on a
// genuine miss so the chain still degrades:
//   /icon proxy -> emoji tile -> letter tile.
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

function getEmoji(tool) {
  const emoji = (tool?.logo_emoji || tool?.emoji || '').trim()
  return emoji || null
}

function getFallbackLetter(tool) {
  const name = String(tool?.name || '').trim()
  return name ? name[0].toUpperCase() : '?'
}

function ToolLogo({ tool, size = 48 }) {
  let customIcon = tool?.icon || tool?.logoUrl || tool?.logo_url
  if (customIcon) {
    const isLocalStatic = customIcon.startsWith('/static/icons/') && !customIcon.endsWith('default.png')
    const isClearbit = customIcon.includes('clearbit.com')
    if (isLocalStatic || isClearbit) {
      customIcon = null
    }
  }
  const domain = getDomain(tool?.website || tool?.link || tool?.url)
  
  // 'custom' -> 'favicon' -> 'emoji' -> 'letter'
  const [stage, setStage] = useState(
    customIcon ? 'custom' : (domain ? 'favicon' : (getEmoji(tool) ? 'emoji' : 'letter'))
  )

  const boxStyle = {
    width: size,
    height: size,
    borderRadius: size * 0.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }

  if (stage === 'custom' && customIcon) {
    return (
      <img
        src={customIcon}
        alt={tool?.name ? `${tool.name} logo` : 'Tool logo'}
        loading="lazy"
        style={{
          ...boxStyle,
          objectFit: 'contain',
          background: '#fff',
          padding: 3,
        }}
        onError={() => setStage(domain ? 'favicon' : (getEmoji(tool) ? 'emoji' : 'letter'))}
      />
    )
  }

  if (stage === 'favicon' && domain) {
    return (
      <img
        src={`/icon/${domain}`}
        alt={tool?.name ? `${tool.name} logo` : 'Tool logo'}
        loading="lazy"
        style={{
          ...boxStyle,
          objectFit: 'contain',
          background: '#fff',
          padding: 3,
        }}
        onError={() => setStage(getEmoji(tool) ? 'emoji' : 'letter')}
      />
    )
  }

  if (stage === 'emoji') {
    return (
      <div
        style={{ ...boxStyle, background: 'var(--bg-sunk)', fontSize: size * 0.55 }}
        aria-hidden="true"
      >
        {getEmoji(tool)}
      </div>
    )
  }

  return (
    <div
      style={{
        ...boxStyle,
        background: 'var(--accent)',
        color: 'var(--bg)',
        fontWeight: 700,
        fontSize: size * 0.42,
      }}
      aria-hidden="true"
    >
      {getFallbackLetter(tool)}
    </div>
  )
}

export default ToolLogo
