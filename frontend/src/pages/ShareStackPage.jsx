import { motion } from 'framer-motion'
import { ArrowLeft, Calendar, Copy, Check, ExternalLink, Grid3X3, Heart, Home, Share2, Sparkles, Wand2, Lock } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

import { Button, Card, CompassLoader } from '../components/ui'

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}

function normalizeTool(rawTool) {
  const resolvedUrl = rawTool?.affiliate_url || rawTool?.url || rawTool?.website || rawTool?.link || rawTool?.homepage || ''

  return {
    slug: rawTool?.slug,
    name: rawTool?.name || 'Unknown Tool',
    description: rawTool?.description || rawTool?.shortDescription || rawTool?.summary || '',
    shortDescription: rawTool?.shortDescription || rawTool?.description || rawTool?.summary || '',
    category: rawTool?.category || 'General',
    rating: Number(rawTool?.rating || rawTool?.averageRating || rawTool?.average_rating || 0),
    pricing: rawTool?.pricing || rawTool?.price || rawTool?.pricingType || rawTool?.pricing_type || 'Free',
    pricing_tiers: rawTool?.pricing_tiers || null,
    url: resolvedUrl,
    website: rawTool?.website || resolvedUrl,
    link: rawTool?.link || resolvedUrl,
  }
}

function toProperCase(text) {
  if (!text) return ''
  return text
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export default function ShareStackPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const stackId = searchParams.get('stack_id')

  const [savedStack, setSavedStack] = useState(null)
  const [allTools, setAllTools] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function loadStackData() {
      setLoading(true)
      setError('')

      try {
        let stackUrl = `/api/v1/stack?user_id=${encodeURIComponent(userId || '')}`
        if (stackId) {
          stackUrl = `/api/v1/stack?stack_id=${encodeURIComponent(stackId)}`
        }

        const [stackResponse, toolsResponse] = await Promise.all([
          fetch(stackUrl, { signal: controller.signal }),
          fetch('/api/v1/tools', { signal: controller.signal })
        ])

        const allToolsPayload = toolsResponse.ok ? await toolsResponse.json() : []
        const rawTools = Array.isArray(allToolsPayload)
          ? allToolsPayload
          : allToolsPayload?.results || allToolsPayload?.tools || []
        const normalizedAllTools = rawTools.map(normalizeTool)
        setAllTools(normalizedAllTools)

        if (stackResponse.status === 403) {
          setError('This stack has been set to private by its owner.')
        } else if (stackResponse.ok) {
          const stackPayload = await stackResponse.json()
          const resolvedStack = stackPayload?.stack || null
          setSavedStack(resolvedStack)
          if (!resolvedStack) {
            setError('This stack could not be found or has been cleared.')
          }
        } else {
          setError('This stack could not be found or has been cleared.')
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError('Failed to load this custom AI stack. Please try again.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    if (userId || stackId) {
      loadStackData()
    } else {
      setError('Invalid stack owner link.')
      setLoading(false)
    }

    return () => controller.abort()
  }, [userId, stackId])

  const matchedTools = useMemo(() => {
    if (!savedStack?.tools || allTools.length === 0) return []
    return savedStack.tools
      .map((toolSlug) => {
        const found = allTools.find((t) => String(t.slug || t.name).toLowerCase() === String(toolSlug).toLowerCase())
        if (found) return found
        // Return dummy object if not found
        return {
          slug: toolSlug,
          name: toProperCase(toolSlug.replace('-', ' ')),
          description: 'Custom added tool.',
          category: 'Custom',
          pricing: 'Free',
        }
      })
      .filter(Boolean)
  }, [savedStack?.tools, allTools])

  const stackCost = useMemo(() => {
    if (matchedTools.length === 0) return 0
    let total = 0
    for (const tool of matchedTools) {
      if (tool.pricing_tiers && tool.pricing_tiers.tiers) {
        const paidTiers = tool.pricing_tiers.tiers.filter((t) => typeof t.price_amount === 'number' && t.price_amount > 0)
        if (paidTiers.length > 0) {
          total += Math.min(...paidTiers.map((t) => t.price_amount))
        }
      }
    }
    return total;
  }, [matchedTools])

  const handleShareClick = () => {
    try {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      // noop
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 text-center">
        <CompassLoader full size={64} label="Loading shared stack…" />
      </div>
    )
  }

  if (error || !savedStack) {
    const isPrivateError = error === 'This stack has been set to private by its owner.'
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center animate-fade-in">
        <div aria-hidden="true" className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border ${isPrivateError ? 'border-amber-500/20 bg-amber-500/10 text-amber-500' : 'border-danger/20 bg-danger-soft text-danger'}`}>
          {isPrivateError ? <Lock className="h-5 w-5" /> : <Grid3X3 className="h-5 w-5" />}
        </div>
        <h1 className="mt-4 text-lg font-bold text-ink">{isPrivateError ? 'This stack is private' : 'Stack not found'}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {error || 'The requested stack does not exist or has been cleared by the owner.'}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" onClick={() => navigate('/tools')}>
            Browse AI Tools
          </Button>
          <Link to="/" className="text-xs text-muted hover:underline mt-2">Back to homepage</Link>
        </div>
      </div>
    )
  }

  const ownerDisplayName = toProperCase(savedStack.owner_name || 'AI Compass User')

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>{`${ownerDisplayName}'s Custom AI Tool Stack | AI Compass`}</title>
        <meta name="description" content={`Check out this custom-curated AI tool stack for ${savedStack.goal || 'learning'} on AI Compass. View pricing, reviews, and explore top recommendations.`} />
      </Helmet>

      <div className="flex flex-col gap-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            to="/tools"
            className="inline-flex items-center gap-1.5 rounded text-sm text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to directory
          </Link>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleShareClick}
            className="flex items-center gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Link copied!' : 'Share stack'}
          </Button>
        </div>

        {/* Hero Card */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="relative overflow-hidden rounded-2xl border border-accent/20 bg-accent-soft/10 p-6 md:p-8 shadow-sm backdrop-blur-sm"
        >
          <div className="absolute right-0 top-0 -mr-6 -mt-6 h-32 w-32 rounded-full bg-accent/5 blur-2xl" />
          
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-ink">
                <Sparkles className="h-3 w-3" />
                Community Curation
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
                {ownerDisplayName}&apos;s Custom Stack
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-ink-2">
                A custom-selected toolkit optimized for {savedStack.goal || 'academics'} on AI Compass.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center text-bg font-bold text-base">
                {ownerDisplayName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-accent/20 pt-6 sm:grid-cols-4 lg:grid-cols-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Primary Goal</p>
              <p className="mt-1 text-sm font-bold text-ink">{toProperCase(savedStack.goal || 'N/A')}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Budget</p>
              <p className="mt-1 text-sm font-bold text-ink">{toProperCase(savedStack.budget || 'N/A')}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Experience Level</p>
              <p className="mt-1 text-sm font-bold text-ink">{toProperCase(savedStack.level || 'N/A')}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Est. Pro Cost</p>
              <p className="mt-1 text-sm font-bold text-ink">${stackCost}/mo</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Total Tools</p>
              <p className="mt-1 text-sm font-bold text-ink">{matchedTools.length}</p>
            </div>
          </div>
        </motion.section>

        {/* Tools Grid */}
        <motion.section
          variants={stagger}
          initial="hidden"
          animate="show"
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Tools in Stack</h2>
            <span className="text-xs text-muted">{matchedTools.length} tools</span>
          </div>

          {matchedTools.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {matchedTools.map((tool) => (
                <Card key={tool.slug || tool.name} tool={tool} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line-strong bg-bg-sunk p-8 text-center text-sm text-muted">
              No tools loaded for this stack.
            </div>
          )}
        </motion.section>

        {/* CTA Footer Section */}
        <motion.section
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="mt-8 rounded-2xl border border-line bg-bg-elev p-6 text-center shadow-sm"
        >
          <h3 className="text-base font-bold text-ink sm:text-lg">Want to build your own custom AI stack?</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Take our interactive 5-step finder to get matching recommendations tailored precisely to your major, study habits, and budget.
          </p>
          <div className="mt-6 flex justify-center">
            <Button
              variant="primary"
              onClick={() => navigate('/ai-tool-finder')}
              className="flex items-center gap-1.5 px-6"
            >
              <Wand2 className="h-4 w-4" />
              Build My AI Stack
            </Button>
          </div>
        </motion.section>
      </div>
    </div>
  )
}
