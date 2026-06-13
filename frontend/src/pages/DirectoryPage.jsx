import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ChevronDown, GraduationCap, SearchX, Sparkles } from 'lucide-react'
import { Button, Dropdown, SearchInput, SEO, SkeletonCard, WordReveal, GridBackground } from '../components/ui'
import CategorySection from '../components/tools/CategorySection'
import FlatToolGrid from '../components/tools/FlatToolGrid'
import ErrorState from '../components/ErrorState'
import { drawerSlideUp, frostedDropdown, sectionReveal } from '../lib/motion'
import { inferErrorVariant } from '../utils/errorState'

// Static fallback covers the ~100ms before /api/v1/stats responds — kept close to the live count so the meta never reads as broken.
const FALLBACK_TOOL_COUNT = 400


const STUDENT_TOP_FALLBACK = [
  {
    slug: 'claude',
    name: 'Claude',
    tagline: 'Strong for long documents and careful reasoning',
    pricing: 'Free',
    student_friendly: true,
    featured: true,
    url: 'claude.ai',
  },
  {
    slug: 'chatgpt',
    name: 'ChatGPT',
    tagline: 'Fast all-rounder for writing, coding, and brainstorming',
    pricing: 'Free',
    student_friendly: true,
    featured: true,
    url: 'chatgpt.com',
  },
  {
    slug: 'github-copilot',
    name: 'GitHub Copilot',
    tagline: 'Inline coding help for students in VS Code',
    pricing: 'Free',
    student_friendly: true,
    featured: true,
    url: 'github.com/features/copilot',
  },
  {
    slug: 'perplexity-ai',
    name: 'Perplexity',
    tagline: 'Research with citations and quick source finding',
    pricing: 'Free',
    student_friendly: true,
    url: 'perplexity.ai',
  },
  {
    slug: 'notion-ai',
    name: 'Notion AI',
    tagline: 'Notes, planning, and study guides in one workspace',
    pricing: 'Free',
    student_friendly: true,
    url: 'notion.so/product/ai',
  },
  {
    slug: 'grammarly',
    name: 'Grammarly',
    tagline: 'Last-pass writing polish for essays and emails',
    pricing: 'Free',
    student_friendly: true,
    url: 'grammarly.com',
  },
]

const MotionDiv = motion.div

// Minimum tools for a category to earn its own hub section. Below this,
// the category is reachable only via the bottom "show all" disclosure.
const HUB_MIN_PER_SECTION = 6

function categorySlug(canonical = '') {
  return canonical
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const CATEGORY_OPTIONS = ['All', 'Coding', 'Writing', 'Research', 'Productivity', 'Design', 'Image Gen', 'Video Gen', 'Audio', 'Courses']
const SORT_OPTIONS = [
  { value: 'Trending',   label: 'Trending' },
  { value: 'Newest',     label: 'Newest' },
  { value: 'Top Rated',  label: 'Top Rated' },
  { value: 'Free First', label: 'Free First' },
]

// Maps the short filter label shown in the UI to the canonical category string
// stored in tools.json. Labels that already equal the canonical value
// (Coding, Research, Productivity) are intentionally omitted — they pass through.
const CATEGORY_FILTER_MAP = {
  Writing: 'Writing & Chat',
  Design: 'Design & Graphics',
  'Image Gen': 'Image Generation',
  'Video Gen': 'Video Generation',
  Audio: 'Audio & Voice',
  Courses: 'Courses & Tutorials',
}

function mapTool(rawTool) {
  return {
    slug: rawTool.slug,
    name: rawTool.name,
    description: rawTool.description || rawTool.shortDescription || rawTool.summary || '',
    shortDescription: rawTool.shortDescription || rawTool.description || rawTool.summary,
    category: rawTool.category || 'coding',
    rating: Number(rawTool.rating || rawTool.averageRating || rawTool.average_rating || 0),
    pricing: rawTool.pricing || rawTool.pricingType || rawTool.pricing_type || 'Free',
    createdAt: rawTool.createdAt || rawTool.created_at || rawTool.publishedAt || rawTool.published_at,
    reviews: Number(rawTool.reviewCount || rawTool.reviews || rawTool.total_reviews || 0),
    logo: rawTool.logo,
    emoji: rawTool.emoji,
    icon: rawTool.icon,
    url: rawTool.url || rawTool.website || rawTool.link,
    website: rawTool.website || rawTool.url || rawTool.link,
    logo_url: rawTool.logo_url || rawTool.logoUrl,
    logo_emoji: rawTool.logo_emoji || rawTool.emoji,
    accent_color: rawTool.accent_color,
    tagline: rawTool.tagline,
    featured: rawTool.featured === true,
    student_friendly: rawTool.student_friendly === true || rawTool.student_perk === true || rawTool.studentPerk === true,
    pricingDetail: rawTool.pricingDetail || rawTool.pricing_detail || '',
    uniHack: rawTool.uniHack || '',
    academic_integrity_rating: rawTool.academic_integrity_rating,
    academic_warning: rawTool.academic_warning,
    curation_score: rawTool.curation_score,
    popularity_score: rawTool.popularity_score,
    _score: rawTool._score,
  }
}

// Canonical category -> the short label DirectoryPage's filter expects in
// ?category= (inverse of CATEGORY_FILTER_MAP). Pass-through when equal.
const CANONICAL_TO_FILTER_LABEL = {
  'Writing & Chat': 'Writing',
  'Design & Graphics': 'Design',
  'Image Generation': 'Image Gen',
  'Video Generation': 'Video Gen',
  'Audio & Voice': 'Audio',
  'Courses & Tutorials': 'Courses',
}

// Per Phase 2: curation_score DESC; featured floats ahead within a score
// tie; fall back to popularity_score when curation_score is null.
function rankTools(list, n = 6) {
  const scoreOf = (t) =>
    t.curation_score ?? t.popularity_score ?? Number.NEGATIVE_INFINITY

  return [...list]
    .sort((a, b) => {
      const diff = scoreOf(b) - scoreOf(a)
      if (diff !== 0) return diff
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0)
    })
    .slice(0, n)
}

function pickTopTools(tools, canonicalCategory, n = 6) {
  return rankTools(
    tools.filter((t) => t.category === canonicalCategory),
    n,
  )
}

function getNormalizedCategory(value = '') {
  return value.toLowerCase().trim()
}

function toCanonicalCategory(value = '') {
  return CATEGORY_FILTER_MAP[value] || value
}

function getTrendingScore(tool) {
  const ratingWeight = (Number(tool.rating) || 0) * 2
  const reviewWeight = Math.min(100, Number(tool.reviews) || 0) * 0.05
  const freshnessBonus = tool.createdAt ? 0.5 : 0

  return ratingWeight + reviewWeight + freshnessBonus
}

function buildDirectorySummary(tools) {
  const counts = new Map()

  for (const tool of tools) {
    const category = (tool.category || 'Uncategorized').trim() || 'Uncategorized'
    counts.set(category, (counts.get(category) || 0) + 1)
  }

  const sections = [...counts.entries()]
    .filter(([, total]) => total >= HUB_MIN_PER_SECTION)
    .sort((a, b) => {
      const diff = b[1] - a[1]
      if (diff !== 0) return diff
      return a[0].localeCompare(b[0])
    })
    .map(([canonical, total]) => ({
      canonical,
      slug: categorySlug(canonical),
      total,
      top: pickTopTools(tools, canonical, 6),
    }))

  const featuredTools = rankTools(tools.filter((tool) => tool.featured), 6)
  const studentTop = featuredTools.length >= 6
    ? featuredTools
    : rankTools(tools.filter((tool) => tool.student_friendly), 6)

  return {
    sections,
    studentTop: studentTop.length > 0 ? studentTop : STUDENT_TOP_FALLBACK,
    total: tools.length,
  }
}


function DirectoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialCategory = searchParams.get('category') || 'All'
  const queryFromParams = searchParams.get('q') || ''
  const [searchQuery, setSearchQuery] = useState(queryFromParams)
  const categoryFromParams = searchParams.get('category') || 'All'
  const actuallyFreeOnly = searchParams.get('actually_free') === 'true'
  const studentOnly = searchParams.get('student_only') === 'true'

  const [tools, setTools] = useState([])
  const [directorySummary, setDirectorySummary] = useState(null)
  const [searchMeta, setSearchMeta] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  // error is null when fine, otherwise one of 'offline' | 'server' (see
  // utils/errorState.js). retryNonce is bumped on "Try again" so the
  // useEffect re-runs without us having to factor the fetch out.
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [catalogCount, setCatalogCount] = useState(null)
  const [category, setCategory] = useState(
    CATEGORY_OPTIONS.find((item) => item.toLowerCase() === categoryFromParams.toLowerCase()) || 'All',
  )
  const [sortBy, setSortBy] = useState('Trending')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [showAllOpened, setShowAllOpened] = useState(false)
  const [zeroResultsFallbackActive, setZeroResultsFallbackActive] = useState(false)
  const latestRequestIdRef = useRef(0)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const hasSearchQuery = queryFromParams.trim().length > 0
  const isRootHub = !hasSearchQuery && category === 'All' && !actuallyFreeOnly && !studentOnly
  const displayCount = catalogCount && catalogCount > 0 ? catalogCount : FALLBACK_TOOL_COUNT
  const hubToolCount = directorySummary?.total && directorySummary.total > 0
    ? directorySummary.total
    : displayCount

  // Tracks the query value WE last wrote to the URL, so the sync effect below can
  // tell an external URL change (navbar search, back/forward, deep link) apart
  // from the echo of our our own setSearchParams call. Without this guard the effect
  // reverted `searchQuery` to the URL's *trimmed* value on every keystroke, which
  // made it impossible to type a trailing space — i.e. you couldn't type a second
  // word, and in production the input appeared frozen after the first search.
  const lastPushedQueryRef = useRef(queryFromParams)

  useEffect(() => {
    // Only adopt the URL query when it changed externally, never as a reaction to
    // our own write. `searchQuery` stays the source of truth for the controlled
    // input, so in-progress text (including spaces) is never clobbered.
    if (queryFromParams !== lastPushedQueryRef.current) {
      lastPushedQueryRef.current = queryFromParams
      setSearchQuery(queryFromParams)
    }

    const normalizedCategory = CATEGORY_OPTIONS.find(
      (item) => item.toLowerCase() === categoryFromParams.toLowerCase(),
    ) || 'All'
    if (category !== normalizedCategory) {
      setCategory(normalizedCategory)
    }
  }, [queryFromParams, categoryFromParams, category])

  const updateUrlParams = (nextCategory, nextQuery, nextTags = null, nextFree = null, nextStudent = null) => {
    const nextParams = new URLSearchParams(searchParams)
    const query = (nextQuery || '').trim()
    const tags = (nextTags || '').trim()

    if (nextCategory && nextCategory !== 'All') {
      nextParams.set('category', nextCategory)
    } else {
      nextParams.delete('category')
    }

    if (query) {
      nextParams.set('q', query)
    } else {
      nextParams.delete('q')
    }

    if (tags) {
      nextParams.set('tags', tags)
    } else {
      nextParams.delete('tags')
    }

    const freeVal = nextFree !== null ? nextFree : actuallyFreeOnly
    if (freeVal) {
      nextParams.set('actually_free', 'true')
    } else {
      nextParams.delete('actually_free')
    }

    const studentVal = nextStudent !== null ? nextStudent : studentOnly
    if (studentVal) {
      nextParams.set('student_only', 'true')
    } else {
      nextParams.delete('student_only')
    }

    // Record what we pushed so the sync effect treats this as our own write,
    // not external navigation, and leaves the user's in-progress text alone.
    lastPushedQueryRef.current = query
    setSearchParams(nextParams, { replace: true })
  }

  const handleSearchChange = (value) => {
    setSearchQuery(value)
    updateUrlParams(category, value)
  }

  const handleCategoryChange = (value) => {
    setCategory(value)
    updateUrlParams(value, searchQuery)
  }

  const launchAcademicPlanners = () => {
    const nextQuery = 'productivity'
    setCategory('All')
    setSearchQuery(nextQuery)
    updateUrlParams('All', nextQuery)
  }

  const connectCivilServiceUtilities = () => {
    const nextQuery = 'exam prep'
    setCategory('All')
    setSearchQuery(nextQuery)
    updateUrlParams('All', nextQuery, 'exam,test prep')
  }

  useEffect(() => {
    const controller = new AbortController()
    const requestId = ++latestRequestIdRef.current
    const API = import.meta.env.VITE_API_URL || ''
    const normalizedQuery = queryFromParams.trim()
    const normalizedCategory = category?.trim() || 'All'
    const canonicalCategory = toCanonicalCategory(normalizedCategory)
    const normalizedTags = (searchParams.get('tags') || '').trim()
    const isRemoteSearch = Boolean(normalizedQuery)
    const isTaggedSearch = Boolean(normalizedTags)
    const shouldLoadSummary = !isRemoteSearch && normalizedCategory === 'All' && !actuallyFreeOnly && !studentOnly && !showAllOpened


    // WHY 300ms: hit the backend after the user stops typing for one quarter
    // second — short enough that the page feels live, long enough that a
    // 12-character query fires 1 request instead of 12. No delay on the bare
    // directory load (empty query) since that's a single page-init fetch.
    const debounceDelay = isRemoteSearch ? 300 : 0

    async function loadTools() {
      setIsLoading(true)
      setError(null)
      try {
        const abortTimeout = setTimeout(() => controller.abort(), 15000)
        const endpoint = isTaggedSearch
          ? `${API}/api/v1/tools/by-tags?${new URLSearchParams({
              tags: normalizedTags,
            }).toString()}`
          : isRemoteSearch
          ? `${API}/api/v1/search?${new URLSearchParams({
              q: normalizedQuery,
              ...(canonicalCategory !== 'All' ? { category: canonicalCategory } : {}),
              ...(actuallyFreeOnly ? { actually_free: 'true' } : {}),
              ...(studentOnly ? { student_only: 'true' } : {}),
            }).toString()}`
          : shouldLoadSummary
            ? `${API}/api/v1/tools?fields=summary`
            : `${API}/api/v1/tools?fields=card&${new URLSearchParams({
                ...(actuallyFreeOnly ? { actually_free: 'true' } : {}),
                ...(studentOnly ? { student_only: 'true' } : {}),
              }).toString()}`


        const response = await fetch(endpoint, { signal: controller.signal })
        clearTimeout(abortTimeout)

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`)
        }
        const data = await response.json()
        if (requestId !== latestRequestIdRef.current || controller.signal.aborted) {
          return
        }

        const payload = Array.isArray(data) ? data : (data.results || [])
        const mappedTools = payload.map(mapTool)

        setSearchMeta(
          isRemoteSearch && !isTaggedSearch
            ? {
                fuzzy_matched: Boolean(data.fuzzy_matched),
                suggested_query: data.suggested_query || null,
                fallback: Boolean(data.fallback),
                fallback_detected: Boolean(data.fallback_detected),
                original_query: data.original_query || normalizedQuery,
                message: data.message || null,
                llm_matched: Boolean(data.llm_matched),
              }
            : null,
        )

        if (shouldLoadSummary && !Array.isArray(data)) {
          setDirectorySummary({
            total: typeof data.total === 'number' ? data.total : mappedTools.length,
            studentTop: (data.studentTop || []).map(mapTool),
            sections: (data.sections || []).map((section) => ({
              ...section,
              top: (section.top || []).map(mapTool),
            })),
          })
          setCatalogCount(typeof data.total === 'number' ? data.total : mappedTools.length)
          setTools([])
          return
        }

        if (shouldLoadSummary && Array.isArray(data)) {
          const summary = buildDirectorySummary(mappedTools)
          setDirectorySummary(summary)
          setCatalogCount(summary.total)
          setTools([])
          return
        }

        setDirectorySummary(null)
        setTools(mappedTools)
        setCatalogCount(typeof data.total === 'number' ? data.total : mappedTools.length)
      } catch (err) {
        if (requestId !== latestRequestIdRef.current || controller.signal.aborted) {
          return
        }

        if (err.name === 'AbortError') {
          console.warn('API request timeout, falling back to empty state')
          setError(null)
          setTools([])
        } else {
          console.error('DirectoryPage fetch error:', err)
          setError(inferErrorVariant(err))
        }
      } finally {
        if (requestId === latestRequestIdRef.current && !controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    const debounceTimer = setTimeout(loadTools, debounceDelay)
    return () => {
      clearTimeout(debounceTimer)
      controller.abort()
    }
  }, [queryFromParams, category, retryNonce, searchParams, showAllOpened, actuallyFreeOnly, studentOnly])


  const filteredTools = useMemo(() => {
    const normalizedSearch = queryFromParams.trim().toLowerCase()

    // 1. Always filter by category (backend might have done it, but this is safe)
    const byCategory = tools.filter((tool) => {
      if (category === 'All') {
        return true
      }
      return getNormalizedCategory(tool.category) === getNormalizedCategory(toCanonicalCategory(category))
    })

    const byFree = actuallyFreeOnly ? byCategory.filter((tool) => {
      const pricing = (tool.pricing || '').toLowerCase()
      return pricing.includes('free') || pricing.includes('freemium')
    }) : byCategory

    const byStudent = studentOnly ? byFree.filter((tool) => tool.student_friendly) : byFree

    // 2. If it's a remote search, skip substring filtering (which breaks semantic matches)
    //    If it's NOT a remote search, do standard substring filtering.
    const bySearch = hasSearchQuery ? byStudent : byStudent.filter((tool) => {
      if (!normalizedSearch) {
        return true
      }
      const normalizedName = (tool.name || '').toLowerCase()
      const normalizedDescription = (tool.description || '').toLowerCase()
      return normalizedName.includes(normalizedSearch) || normalizedDescription.includes(normalizedSearch)
    })


    const sorted = [...bySearch]

    sorted.sort((a, b) => {
      if (sortBy === 'Newest') {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      }

      if (sortBy === 'Top Rated') {
        return (b.rating || 0) - (a.rating || 0)
      }

      if (sortBy === 'Free First') {
        const isFreeA = (a.pricing || '').toLowerCase().includes('free')
        const isFreeB = (b.pricing || '').toLowerCase().includes('free')

        if (isFreeA !== isFreeB) {
          return isFreeA ? -1 : 1
        }

        return (b.rating || 0) - (a.rating || 0)
      }

      // If we performed a semantic search, trust the backend's `_score` if it exists
      if (hasSearchQuery && a._score !== undefined && b._score !== undefined) {
        return b._score - a._score
      }

      return getTrendingScore(b) - getTrendingScore(a)
    })

    return sorted
  }, [category, queryFromParams, hasSearchQuery, sortBy, tools])

  const hubSections = useMemo(() => {
    if (directorySummary?.sections?.length) {
      return directorySummary.sections
    }

    const counts = new Map()
    for (const t of tools) {
      const cat = t.category
      if (cat) counts.set(cat, (counts.get(cat) || 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= HUB_MIN_PER_SECTION)
      .sort((a, b) => b[1] - a[1])
      .map(([canonical, total]) => ({
        canonical,
        slug: categorySlug(canonical),
        total,
        top: pickTopTools(tools, canonical, 6),
      }))
  }, [directorySummary, tools])

  const studentTop = useMemo(() => {
    if (directorySummary?.studentTop?.length) {
      return directorySummary.studentTop
    }

    const featured = rankTools(tools.filter((t) => t.featured), 6)
    if (featured.length >= 6) return featured
    const studentFriendly = rankTools(tools.filter((t) => t.student_friendly), 6)
    return studentFriendly.length > 0 ? studentFriendly : STUDENT_TOP_FALLBACK
  }, [directorySummary, tools])

  const handleReset = () => {
    setSortBy('Trending')
    updateUrlParams('All', '', null, false, false)
  }


  const closeDrawer = () => {
    setShowMobileFilters(false)
    triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!showMobileFilters) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeDrawer()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showMobileFilters])

  useEffect(() => {
    if (!showMobileFilters || !panelRef.current) return
    const focusable = panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
    focusable[0]?.focus()
  }, [showMobileFilters])

  const handlePanelKeyDown = (e) => {
    if (e.key !== 'Tab') return
    const focusable = panelRef.current?.querySelectorAll(FOCUSABLE_SELECTOR)
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const trimmedSearchTerm = queryFromParams.trim()
  const hasFilter = category !== 'All' || actuallyFreeOnly || studentOnly
  const viewMode = hasSearchQuery ? 'search' : hasFilter ? 'filter' : 'hub'

  useEffect(() => {
    setZeroResultsFallbackActive(
      Boolean(
        !isLoading &&
        !error &&
        searchMeta?.fallback_detected &&
        filteredTools.length === 0,
      ),
    )
  }, [isLoading, error, searchMeta, filteredTools])

  useEffect(() => {
    if (!isLoading && !error && filteredTools.length === 0) {
      const event = new CustomEvent('ai-compass-proactive-help', {
        detail: {
          message: 'Could not find the tool you are looking for? Visit our Help Center for guides or submit feedback for support.'
        }
      })
      window.dispatchEvent(event)
    }
  }, [isLoading, error, filteredTools.length])

  const scrollToCategory = (slug) => {
    document
      .getElementById(`cat-${slug}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const displaySearchTerm = trimmedSearchTerm.length > 40
    ? `${trimmedSearchTerm.slice(0, 40)}…`
    : trimmedSearchTerm

  let emptyHeading
  let emptyBody
  if (hasSearchQuery && hasFilter) {
    emptyHeading = `No ${category} tools match "${displaySearchTerm}"`
    emptyBody = searchMeta?.message || 'Try a different category or rephrase your search.'
  } else if (hasSearchQuery) {
    emptyHeading = searchMeta?.message ? 'We searched everywhere...' : `No tools match "${displaySearchTerm}"`
    emptyBody = searchMeta?.message || 'Try a different search term, or browse by category.'
  } else if (hasFilter) {
    emptyHeading = `No tools in ${category} yet`
    emptyBody = 'Try a different category, or reset to see all tools.'
  } else {
    emptyHeading = 'No tools found'
    emptyBody = 'Try resetting the filters.'
  }

  return (
    <div
      className="container main-content mx-auto w-full max-w-7xl"
    >
      <SEO
        title={`${displayCount} Free AI Tools for Students — Tested & Ranked`}
        description={`Find your perfect AI tool in 30 seconds. ${displayCount} hand-tested tools — free, freemium & paid. Filter by writing, coding, research, design. No account needed.`}
        path="/tools"
      />
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'Are all tools on AI Compass free?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Most tools have a free tier. Filter by "Free" to see zero-cost tools only. We label every tool as Free, Freemium, or Paid.',
                },
              },
              {
                '@type': 'Question',
                name: 'Do I need to sign up to use AI Compass?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'No account needed. Browse, filter, compare, and visit any of our tools without signing up.',
                },
              },
              {
                '@type': 'Question',
                name: 'How do I find the right AI tool for me?',
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: 'Use the AI Tool Finder — answer 4 questions and get a personalised recommendation in 10 seconds. Or filter by category: Writing, Coding, Research, Design, Image Generation.',
                },
              },
            ],
          })}
        </script>
      </Helmet>
      <MotionDiv variants={sectionReveal} initial="initial" animate="animate">
        <GridBackground className="px-4 py-8 sm:px-6 lg:px-8 border-b border-line mb-8">
          <section className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl"><WordReveal>AI Tools Directory</WordReveal></h1>
            <span className="text-sm font-medium tabular-nums text-muted">
              {isLoading ? 'Loading...' : `${isRootHub ? hubToolCount : filteredTools.length} tools`}
            </span>
            {/* Mobile Filters Button */}
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={showMobileFilters}
              aria-controls="mobile-filters-drawer"
              onClick={() => setShowMobileFilters(true)}
              className="md:hidden ml-auto rounded-xl border border-line bg-bg-elev px-4 py-2 text-sm font-semibold text-ink-2 shadow-sm"
            >
              Filters
            </button>
          </section>
        </GridBackground>

      {/* Mobile Filter Drawer */}
      <AnimatePresence>
        {showMobileFilters && (
          <Fragment key="mobile-drawer">
            <MotionDiv
              key="mobile-drawer-backdrop"
              variants={frostedDropdown}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={closeDrawer}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
            />
            <MotionDiv
              key="mobile-drawer-panel"
              ref={panelRef}
              variants={drawerSlideUp}
              initial="initial"
              animate="animate"
              exit="exit"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-filters-title"
              id="mobile-filters-drawer"
              onKeyDown={handlePanelKeyDown}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-bg-elev px-6 pt-6 shadow-2xl md:hidden"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="mobile-filters-title" className="text-lg font-bold text-ink">Filters</h2>
                <button
                  type="button"
                  onClick={closeDrawer}
                  aria-label="Close filters"
                  className="text-2xl text-muted hover:text-ink"
                >
                  &times;
                </button>
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-ink-2">Category</label>
                <Dropdown
                  value={category}
                  onChange={handleCategoryChange}
                  options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))}
                  label="Filter category"
                />
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-ink-2">Sort By</label>
                <Dropdown
                  value={sortBy}
                  onChange={setSortBy}
                  options={SORT_OPTIONS}
                  label="Sort tools"
                />
              </div>
              <div className="mb-4 flex flex-col gap-2">
                <label className="block text-xs font-semibold text-ink-2">Discounts & Pricing</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => updateUrlParams(category, searchQuery, null, !actuallyFreeOnly, studentOnly)}
                    className={`flex flex-1 justify-center items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      actuallyFreeOnly
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-line bg-bg-elev text-ink-2'
                    }`}
                  >
                    Actually Free
                  </button>
                  <button
                    type="button"
                    onClick={() => updateUrlParams(category, searchQuery, null, actuallyFreeOnly, !studentOnly)}
                    className={`flex flex-1 justify-center items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                      studentOnly
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-line bg-bg-elev text-ink-2'
                    }`}
                  >
                    Student Perks
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1 font-semibold" onClick={closeDrawer}>Apply</Button>
                <Button variant="secondary" className="flex-1 font-semibold" onClick={() => { handleReset(); closeDrawer() }}>Reset</Button>
              </div>

            </MotionDiv>
          </Fragment>
        )}
      </AnimatePresence>

      <div className="mb-4">
        <SearchInput
          value={searchQuery}
          onChange={handleSearchChange}
          onClear={() => handleSearchChange('')}
          placeholder="Search or describe what you need..."
          style={{ fontSize: 16 }}
        />
      </div>

      {/* Task pills for quick-search */}
      <div className="mb-6 flex flex-wrap gap-2 items-center">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted mr-1">Quick Tasks:</span>
        {[
          { label: "Write Essays", query: "essay writing" },
          { label: "Summarize PDFs", query: "summarize pdf documents" },
          { label: "Code & Debug", query: "coding helper debug" },
          { label: "Exam Prep", query: "exam test preparation study" },
          { label: "Design Graphics", query: "design logos presentation slides" },
          { label: "Transcribe Lecture", query: "transcribe lecture audio to text" }
        ].map((task) => (
          <button
            key={task.label}
            type="button"
            onClick={() => handleSearchChange(task.query)}
            className="rounded-xl border border-line bg-bg-elev px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent transition shadow-sm"
          >
            {task.label}
          </button>
        ))}
      </div>


      <section className="sticky top-16 z-20 mb-6 rounded-2xl border border-line glass-nav p-4 shadow-sm backdrop-blur">
        {viewMode === 'hub' ? (
          <div className="filters-row flex gap-2 overflow-x-auto pb-1">
            {hubSections.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => scrollToCategory(c.slug)}
                className="whitespace-nowrap rounded-full border border-transparent bg-bg-sunk px-3 py-1.5 text-sm font-semibold text-ink-2 transition hover:bg-bg-elev focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {c.canonical}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="filters-row flex gap-2 overflow-x-auto pb-1">
              {CATEGORY_OPTIONS.map((option) => {
                const active = option === category

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleCategoryChange(option)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      active
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-transparent bg-bg-sunk text-ink-2 hover:bg-bg-elev'
                    }`}
                  >
                    {option}
                  </button>
                )
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
              <div className="md:w-[220px] w-full">
                <Dropdown
                  value={sortBy}
                  onChange={setSortBy}
                  options={SORT_OPTIONS}
                  label="Sort tools"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateUrlParams(category, searchQuery, null, !actuallyFreeOnly, studentOnly)}
                  className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    actuallyFreeOnly
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-line bg-bg-elev text-ink-2 hover:bg-bg-sunk'
                  }`}
                >
                  Actually Free
                </button>
                <button
                  type="button"
                  onClick={() => updateUrlParams(category, searchQuery, null, actuallyFreeOnly, !studentOnly)}
                  className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    studentOnly
                      ? 'border-accent bg-accent-soft text-accent-ink'
                      : 'border-line bg-bg-elev text-ink-2 hover:bg-bg-sunk'
                  }`}
                >
                  Student Perks
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      </MotionDiv>

      {viewMode !== 'hub' && (
        <>
          {error && (
            <ErrorState
              variant={error}
              onRetry={() => {
                setError(null)
                setRetryNonce((n) => n + 1)
              }}
              className="mt-4"
            />
          )}

          {!isLoading && !error && searchMeta?.fuzzy_matched && searchMeta?.suggested_query && (
            <div className="mb-4 rounded-lg border border-accent/20 bg-accent-soft px-4 py-2.5 text-sm text-ink">
              Showing results for <strong className="font-medium">{searchMeta.suggested_query}</strong>.
              {' '}Searched for <em className="text-muted">{searchMeta.original_query}</em>.
            </div>
          )}

          {!isLoading && !error && searchMeta?.llm_matched && searchMeta?.message && (
            <div className="mb-4 rounded-xl border border-accent/20 bg-accent-soft px-5 py-4 text-sm text-ink flex gap-3 items-start shadow-sm">
              <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <p className="pt-0.5 font-medium leading-relaxed">{searchMeta.message}</p>
            </div>
          )}

          {!isLoading && !error && searchMeta?.fallback && filteredTools.length > 0 && (
            <div className="mb-4 rounded-lg border border-line bg-bg-sunk px-4 py-2.5 text-sm text-muted">
              No exact matches for <em>{searchMeta.original_query}</em>. Showing trending tools — try a different keyword or browse by category.
            </div>
          )}

          {zeroResultsFallbackActive && (
            <motion.section
              variants={sectionReveal}
              initial="initial"
              animate="animate"
              className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 px-6 py-12 text-white shadow-[0_32px_120px_rgba(15,23,42,0.45)] sm:px-8 lg:px-10"
            >
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),transparent_52%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_35%)]"
                aria-hidden="true"
              />
              <div className="relative mx-auto max-w-4xl">
                <div className="mx-auto max-w-2xl text-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                    <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                    Smart zero-results fallback
                  </div>
                  <h2 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Looking for an Exam Strategy or Study Roadmap?
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                    Your search did not map cleanly to a direct tool. Switch into a planning path or jump straight to civil service prep utilities.
                  </p>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={launchAcademicPlanners}
                    className="group flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-white/6 p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-cyan-300/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/80">Card A</p>
                          <h3 className="mt-2 text-xl font-semibold text-white">Launch AI Academic Planners</h3>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 p-2 text-cyan-200 transition group-hover:border-cyan-300/40 group-hover:bg-cyan-400/10">
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-300">
                        Refresh the search matrix with optimized Productivity and Research keywords to surface planning, notes, and workflow utilities.
                      </p>
                    </div>
                    <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-200">
                      <GraduationCap className="h-4 w-4" />
                      Re-run with study-planning intent
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={connectCivilServiceUtilities}
                    className="group flex h-full flex-col justify-between rounded-3xl border border-white/10 bg-white/6 p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-emerald-300/40 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/80">Card B</p>
                          <h3 className="mt-2 text-xl font-semibold text-white">Connect to Civil Service Utilities</h3>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/5 p-2 text-emerald-200 transition group-hover:border-emerald-300/40 group-hover:bg-emerald-400/10">
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-slate-300">
                        Dynamically query the catalog for tools tagged around exam and test-prep workflows, then surface the most relevant study companions.
                      </p>
                    </div>
                    <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-200">
                      <SearchX className="h-4 w-4" />
                      Pull exam and test-prep tools
                    </div>
                  </button>
                </div>
              </div>
            </motion.section>
          )}

          {!error && isLoading && (
            <div className="tools-grid grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={`directory-skeleton-${i}`} />
              ))}
            </div>
          )}

          {!isLoading && !error && filteredTools.length > 0 && (
            <FlatToolGrid
              key={`${category}-${sortBy}-${queryFromParams}`}
              tools={filteredTools}
            />
          )}

          {!isLoading && !error && filteredTools.length === 0 && !zeroResultsFallbackActive && (
            <section
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-line bg-bg-sunk px-6 py-16 text-center"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-bg-elev shadow-sm" aria-hidden="true">
                <SearchX className="h-7 w-7 text-muted" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-ink">{emptyHeading}</h2>
              <p className="mt-2 text-sm text-muted">{emptyBody}</p>
              <div className="mt-6">
                <Button variant="secondary" onClick={handleReset}>
                  Reset filters
                </Button>
              </div>
            </section>
          )}
        </>
      )}

      {viewMode === 'hub' && (
        <div>
          <CategorySection
            id="cat-students"
            title="Top picks for students"
            tools={studentTop}
            seeAllHref="/best-ai-tools-for-students"
            seeAllLabel="See the student guide"
            emphasis
          />

          {hubSections.map((c) => (
            <CategorySection
              key={c.slug}
              id={`cat-${c.slug}`}
              title={c.canonical}
              tools={c.top}
              seeAllHref={`/tools?category=${encodeURIComponent(
                CANONICAL_TO_FILTER_LABEL[c.canonical] || c.canonical,
              )}`}
              seeAllLabel={`See all ${c.total} ${c.canonical} tools`}
            />
          ))}

          <details
            className="group mt-2 overflow-hidden rounded-2xl border border-line bg-bg-elev"
            onToggle={(e) => {
              if (e.currentTarget.open) setShowAllOpened(true)
            }}
          >
              <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-4 text-sm font-semibold text-ink-2 marker:content-none [&::-webkit-details-marker]:hidden">
              Show all {isRootHub ? hubToolCount : filteredTools.length} tools
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-6 pt-2">
              {showAllOpened && <FlatToolGrid tools={filteredTools} />}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

export default DirectoryPage
