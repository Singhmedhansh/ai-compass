import { useState } from 'react'

// Logos resolve through a FIRST-PARTY proxy (/icon/<domain>) so privacy
// blockers (Brave Shields, uBlock, corp networks) can't strip them the way
// they block a direct icons.duckduckgo.com request — that was leaving a
// large share of users with bland letter tiles site-wide. The server
// fetches + caches the favicon (DuckDuckGo, then Google s2) and 404s on a
// genuine miss so the chain still degrades:
//   /icon proxy -> emoji tile -> letter tile.
function getDomain(url) {
  if (!url) return null
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

// Deterministic pastel color from tool name — no two adjacent cards look identical
function getAccentColor(name = '') {
  const hues = [210, 160, 280, 340, 30, 190, 130, 260, 50, 310]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return hues[Math.abs(hash) % hues.length]
}

function ToolLogo({ tool, size = 48 }) {
  let customIcon = tool?.icon || tool?.logoUrl || tool?.logo_url
  if (customIcon) {
    const isLocalStatic = customIcon.startsWith('/static/icons/') && !customIcon.endsWith('default.png')
    const isClearbit = customIcon.includes('clearbit.com')
    if (isLocalStatic || isClearbit) customIcon = null
  }

  const domain = getDomain(tool?.website || tool?.link || tool?.url)

  // 'custom' -> 'favicon' -> 'emoji' -> 'letter'
  const [stage, setStage] = useState(
    customIcon ? 'custom' : (domain ? 'favicon' : (getEmoji(tool) ? 'emoji' : 'letter'))
  )
  // Track whether the image has finished loading (for shimmer effect)
  const [imgLoaded, setImgLoaded] = useState(false)

  const hue = getAccentColor(tool?.name)

  const boxStyle = {
    width: size,
    height: size,
    borderRadius: size * 0.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  }

  // Shimmer placeholder shown while image fetches
  const shimmer = (
    <div
      style={{
        ...boxStyle,
        position: 'relative',
        background: 'var(--bg-sunk)',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
          animation: 'shimmer-logo 1.4s infinite',
        }}
      />
    </div>
  )

  if (stage === 'custom' && customIcon) {
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        {!imgLoaded && shimmer}
        <img
          src={customIcon}
          alt={tool?.name ? `${tool.name} logo` : 'Tool logo'}
          loading="lazy"
          decoding="async"
          style={{
            ...boxStyle,
            objectFit: 'contain',
            background: 'var(--logo-bg, #fff)',
            padding: 3,
            position: imgLoaded ? 'static' : 'absolute',
            top: 0,
            left: 0,
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgLoaded(true)
            setStage(domain ? 'favicon' : (getEmoji(tool) ? 'emoji' : 'letter'))
          }}
        />
      </div>
    )
  }

  if (stage === 'favicon' && domain) {
    return (
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        {!imgLoaded && shimmer}
        <img
          src={`/icon/${domain}`}
          alt={tool?.name ? `${tool.name} logo` : 'Tool logo'}
          loading="lazy"
          decoding="async"
          style={{
            ...boxStyle,
            objectFit: 'contain',
            background: 'var(--logo-bg, #fff)',
            padding: 3,
            position: imgLoaded ? 'static' : 'absolute',
            top: 0,
            left: 0,
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
          onLoad={() => setImgLoaded(true)}
          onError={() => {
            setImgLoaded(true)
            setStage(getEmoji(tool) ? 'emoji' : 'letter')
          }}
        />
      </div>
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
        background: `hsl(${hue} 55% 48%)`,
        color: '#fff',
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
