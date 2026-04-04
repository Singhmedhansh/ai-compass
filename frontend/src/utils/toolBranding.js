const avatarPalette = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
]

export const domainMap = {
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

export function getToolDomain(name = '') {
  if (!name) {
    return 'example.com'
  }

  return domainMap[name] || `${name.toLowerCase().replace(/\s+/g, '')}.com`
}

export function getAvatarClass(name = '') {
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