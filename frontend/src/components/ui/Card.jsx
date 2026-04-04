import clsx from 'clsx'
import { Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import Badge from './Badge'

const avatarPalette = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
]

const pricingClasses = {
  free: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  freemium: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  paid: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100',
}

const domainMap = {
  ChatGPT: 'openai.com',
  Claude: 'anthropic.com',
  Grammarly: 'grammarly.com',
  'Notion AI': 'notion.so',
  Quillbot: 'quillbot.com',
  'GitHub Copilot': 'github.com',
  'GitHub Student Developer Pack': 'github.com',
  'Visual Studio Code': 'code.visualstudio.com',
  Cursor: 'cursor.sh',
  NeetCode: 'neetcode.io',
  'Hugging Face': 'huggingface.co',
  'Google Colab': 'colab.research.google.com',
  'Vercel v0': 'vercel.com',
  Streamlit: 'streamlit.io',
  Supabase: 'supabase.com',
  Groq: 'groq.com',
  Perplexity: 'perplexity.ai',
  Midjourney: 'midjourney.com',
  'DALL-E': 'openai.com',
  'Stable Diffusion': 'stability.ai',
  'Leonardo AI': 'leonardo.ai',
  'Runway Gen-4': 'runwayml.com',
  ElevenLabs: 'elevenlabs.io',
  Canva: 'canva.com',
  Figma: 'figma.com',
  Notion: 'notion.so',
  Obsidian: 'obsidian.md',
  Todoist: 'todoist.com',
  Zapier: 'zapier.com',
  Make: 'make.com',
  Replit: 'replit.com',
  Codeium: 'codeium.com',
  Tabnine: 'tabnine.com',
  'JetBrains Student License': 'jetbrains.com',
  Excalidraw: 'excalidraw.com',
  'Mermaid.js': 'mermaid.js.org',
  DataWrapper: 'datawrapper.de',
  'Julius AI': 'julius.ai',
  'Napkin AI': 'napkin.ai',
  'Whimsical AI': 'whimsical.com',
  Tome: 'tome.app',
  Gamma: 'gamma.app',
  DeepL: 'deepl.com',
  Elicit: 'elicit.com',
  Consensus: 'consensus.app',
  'Semantic Scholar': 'semanticscholar.org',
  'Research Rabbit': 'researchrabbit.ai',
  Zotero: 'zotero.org',
  'Copy.ai': 'copy.ai',
  Jasper: 'jasper.ai',
  Writesonic: 'writesonic.com',
  'Hemingway Editor': 'hemingwayapp.com',
  ProWritingAid: 'prowritingaid.com',
}

function slugify(value = '') {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function getAvatarClass(name = '') {
  const firstChar = (name || '').trim().charAt(0).toLowerCase()

  if (firstChar >= 'a' && firstChar <= 'e') {
    return 'bg-indigo-500 text-white'
  }

  if (firstChar >= 'f' && firstChar <= 'j') {
    return 'bg-purple-500 text-white'
  }

  if (firstChar >= 'k' && firstChar <= 'o') {
    return 'bg-green-500 text-white'
  }

  if (firstChar >= 'p' && firstChar <= 't') {
    return 'bg-amber-500 text-white'
  }

  if (firstChar >= 'u' && firstChar <= 'z') {
    return 'bg-red-500 text-white'
  }

  const code = name
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0)

  return avatarPalette[code % avatarPalette.length]
}

function Card({ tool = {} }) {
  const navigate = useNavigate()
  const [imgError, setImgError] = useState(false)

  const name = tool.name || 'Unknown Tool'
  const description = tool.shortDescription || tool.description || 'No description available.'
  const category = tool.category || 'coding'
  const rating = Math.max(0, Math.min(5, Number(tool.rating) || 0))
  const pricing = (tool.pricing || 'free').toLowerCase()
  const slug = tool.slug || slugify(name)
  const domain = domainMap[name] || name.toLowerCase().replace(/\s+/g, '') + '.com'
  const logoUrl = `https://logo.clearbit.com/${domain}`

  useEffect(() => {
    setImgError(false)
  }, [name])

  const ratingStars = Array.from({ length: 5 }, (_, index) => {
    const active = index < Math.round(rating)

    return (
      <Star
        key={`${name}-star-${index}`}
        className={clsx('h-4 w-4', active ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600')}
      />
    )
  })

  return (
    <button
      type="button"
      onClick={() => navigate(`/tools/${slug}`)}
      className="group flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-500 dark:focus-visible:ring-offset-slate-950"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden" aria-hidden="true">
          {!imgError ? (
            <img
              src={logoUrl}
              alt={`${name} logo`}
              className="h-10 w-10 rounded-lg bg-white p-1 object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className={clsx(
                'flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white',
                getAvatarClass(name),
              )}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{name}</h3>
          <p
            className="mt-1 overflow-hidden text-sm text-slate-600 dark:text-slate-300"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Badge label={category} variant={category} />

        <div className="flex items-center gap-1" aria-label={`Rated ${rating} out of 5`}>
          {ratingStars}
        </div>

        <span
          className={clsx(
            'rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
            pricingClasses[pricing] || pricingClasses.free,
          )}
        >
          {tool.pricing || 'Free'}
        </span>
      </div>
    </button>
  )
}

export default Card