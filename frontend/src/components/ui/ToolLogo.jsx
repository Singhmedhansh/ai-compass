import { useState } from 'react'

const DOMAIN_MAP = {
  'chatgpt': 'openai.com',
  'claude': 'anthropic.com',
  'cursor': 'cursor.sh',
  'github copilot': 'github.com',
  'midjourney': 'midjourney.com',
  'perplexity ai': 'perplexity.ai',
  'perplexity': 'perplexity.ai',
  'grammarly': 'grammarly.com',
  'notion': 'notion.so',
  'notion ai': 'notion.so',
  'elevenlabs': 'elevenlabs.io',
  'canva': 'canva.com',
  'figma': 'figma.com',
  'vercel': 'vercel.com',
  'supabase': 'supabase.com',
  'hugging face': 'huggingface.co',
  'github': 'github.com',
  'google colab': 'colab.research.google.com',
  'streamlit': 'streamlit.io',
  'replit': 'replit.com',
  'groq': 'groq.com',
  'windsurf': 'codeium.com',
  'codeium': 'codeium.com',
  'tabnine': 'tabnine.com',
  'leetcode': 'leetcode.com',
  'neetcode': 'neetcode.io',
  'bolt.new': 'bolt.new',
  v0: 'v0.dev',
  gemini: 'google.com',
  mistral: 'mistral.ai',
  runway: 'runwayml.com',
  loom: 'loom.com',
  linear: 'linear.app',
  obsidian: 'obsidian.md',
}

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

function getLogoUrl(tool) {
  if (tool?.logo_url) {
    return tool.logo_url
  }

  const domain = getDomain(tool?.url || tool?.website || tool?.link)
    || DOMAIN_MAP[(tool?.name || '').toLowerCase().trim()]

  return domain ? `https://logo.clearbit.com/${domain}` : null
}

function ToolLogo({ tool, size = 48 }) {
  const [imgError, setImgError] = useState(false)
  const url = getLogoUrl(tool)

  if (url && !imgError) {
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
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.2,
        background: tool?.accent_color || '#6366f1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.4,
      }}
    >
      {tool?.emoji || tool?.logo_emoji || (tool?.name || '?')[0].toUpperCase()}
    </div>
  )
}

export default ToolLogo
