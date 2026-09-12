/**
 * Builds a link into the Stack Architect wizard, optionally carrying the
 * answers the current page already knows.
 *
 * The SEO landing pages (/best-free-ai-tools, /best-coding-tools,
 * /alternatives/*) know a visitor's intent before they ever reach the wizard.
 * Passing it through as query params lets ToolFinderPage open on the first
 * *unanswered* question instead of a cold Q1 — see readWizardPrefill() in
 * pages/ToolFinderPage.jsx, which validates every value against the option
 * lists before it is trusted.
 *
 * Recognised keys: goal, use_case, budget. Anything else is dropped here so a
 * typo in a caller can't silently produce a junk URL.
 */
export const FINDER_PATH = '/ai-tool-finder'

const ALLOWED_KEYS = ['goal', 'use_case', 'budget']

export function finderPath(params) {
  if (!params) return FINDER_PATH

  const search = new URLSearchParams()
  ALLOWED_KEYS.forEach((key) => {
    const value = params[key]
    if (typeof value === 'string' && value.trim()) {
      search.set(key, value.trim())
    }
  })

  const query = search.toString()
  return query ? `${FINDER_PATH}?${query}` : FINDER_PATH
}

export default finderPath

/**
 * Maps a catalog category onto one of the wizard's six `goal` options.
 *
 * Used by /alternatives/<slug>, which knows the category of the tool the
 * visitor is currently looking at but not which wizard goal that implies.
 * Matching is substring-based because the catalog uses several spellings for
 * the same idea ("Coding", "Coding & Programming", "Developer Tools").
 *
 * Order matters: "Research & Productivity" should resolve to research, and
 * "Design & Creative" to creating, so the more specific tests come first.
 * Returns '' when nothing matches, which simply yields an unparameterised
 * link rather than a wrong guess.
 */
const CATEGORY_GOAL_RULES = [
  ['coding', ['cod', 'develop', 'program']],
  ['research', ['research', 'study']],
  ['creating', ['design', 'image', 'video', 'audio', 'creative', 'animation', 'graphic']],
  ['learning', ['course', 'education', 'tutorial', 'learn']],
  ['writing', ['writ', 'chat', 'email', 'marketing', 'sales', 'support', 'communication']],
  ['productivity', ['productivity', 'business', 'operation']],
]

export function goalForCategory(category) {
  const needle = String(category || '').toLowerCase()
  if (!needle) return ''
  const rule = CATEGORY_GOAL_RULES.find(([, tokens]) =>
    tokens.some((token) => needle.includes(token)),
  )
  return rule ? rule[0] : ''
}
