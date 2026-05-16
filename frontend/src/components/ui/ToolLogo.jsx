import { useState } from 'react'

// Every catalog record points tool.icon at /static/icons/<slug>.svg, but that
// directory only contains default.png — so the old "curated" step 404'd on all
// 398 tools and then leaned on Google's favicon API, which returns a generic
// globe (HTTP 200) for unknown domains and never triggers onError. We now use
// the same proven chain as the Best*/Alternatives pages:
//   DuckDuckGo favicon (404s cleanly on miss) -> emoji tile -> letter tile.
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
  const domain = getDomain(tool?.url || tool?.website || tool?.link)
  // 'favicon' -> 'emoji' (if available) -> 'letter'
  const [stage, setStage] = useState(domain ? 'favicon' : (getEmoji(tool) ? 'emoji' : 'letter'))

  const boxStyle = {
    width: size,
    height: size,
    borderRadius: size * 0.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  }

  if (stage === 'favicon' && domain) {
    return (
      <img
        src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
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
