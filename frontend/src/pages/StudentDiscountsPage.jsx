import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { 
  GraduationCap, 
  CheckCircle, 
  Search, 
  ArrowUpRight, 
  Percent, 
  Sparkles, 
  Star, 
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

import { Button, ToolLogo } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div
const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }
const ITEMS_PER_PAGE = 12

export default function StudentDiscountsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [discounts, setDiscounts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [unidaysOnly, setUnidaysOnly] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || ''
    
    async function loadDiscounts() {
      try {
        setLoading(true)
        setError(false)
        const response = await fetch(`${API}/api/v1/student-discounts`)
        if (!response.ok) {
          throw new Error('Failed to retrieve student discounts')
        }
        const data = await response.json()
        setDiscounts(data.results || [])
      } catch (err) {
        console.error('Error fetching student discounts:', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    loadDiscounts()
  }, [])

  // Get unique categories for filter chips
  const categories = useMemo(() => {
    const cats = new Set()
    discounts.forEach(item => {
      if (item.category) {
        cats.add(item.category)
      }
    })
    return ['All', ...Array.from(cats).sort()]
  }, [discounts])

  // Filter list based on search, category and UNiDAYS toggle
  const filteredDiscounts = useMemo(() => {
    return discounts.filter(item => {
      // UNiDAYS filter
      if (unidaysOnly && !item.unidays_verified) {
        return false
      }
      
      // Category filter
      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false
      }
      
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchName = (item.name || '').toLowerCase().includes(query)
        const matchTagline = (item.tagline || '').toLowerCase().includes(query)
        const matchDetail = (item.pricingDetail || '').toLowerCase().includes(query)
        const matchCategory = (item.category || '').toLowerCase().includes(query)
        return matchName || matchTagline || matchDetail || matchCategory
      }
      
      return true
    })
  }, [discounts, searchQuery, selectedCategory, unidaysOnly])

  // Reset page when filters or options change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedCategory, unidaysOnly])

  // Paginated subset of filtered tools
  const totalPages = Math.ceil(filteredDiscounts.length / ITEMS_PER_PAGE)
  const paginatedDiscounts = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredDiscounts.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredDiscounts, currentPage])

  return (
    <>
      <Helmet>
        <title>Student AI Discounts & UNiDAYS Deals | AI Compass</title>
        <meta
          name="description"
          content="Save on student writing assistants, coding copilots, study planners, and image editors. View verified UNiDAYS partner discounts and .edu student perks."
        />
      </Helmet>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Premium Hero Header */}
        <section className="text-center relative py-12 md:py-16 overflow-hidden rounded-3xl bg-bg-elev/40 border border-line/40 px-6 shadow-xl backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-accent/5 pointer-events-none" />
          <span className="inline-flex items-center rounded-full bg-accent-soft px-3.5 py-1 text-xs font-semibold text-accent-ink mb-4">
            <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
            Education Hub
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl md:text-5xl lg:text-6xl">
            Student AI Discounts <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-accent to-accent-ink bg-clip-text text-transparent">& UNiDAYS Deals</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted sm:text-lg leading-relaxed">
            Unlock premium AI tools for your study, programming, and creative needs. 
            We fetch active student benefits, free tiers via .edu address, and verified UNiDAYS partnerships.
          </p>

          {/* Quick Stat Counter */}
          {!loading && !error && discounts.length > 0 && (
            <div className="mt-6 flex justify-center gap-6 text-sm text-ink-2">
              <span className="flex items-center gap-1.5 font-medium">
                <Percent className="h-4 w-4 text-accent" />
                {discounts.length} Active Perks
              </span>
              <span className="w-px h-4 bg-line self-center" />
              <span className="flex items-center gap-1.5 font-medium">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                {discounts.filter(d => d.unidays_verified).length} UNiDAYS Partners
              </span>
            </div>
          )}
        </section>

        {/* Filter Toolbar */}
        <section className="mt-12">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border border-line bg-bg-elev/50 p-6 rounded-2xl shadow-sm">
            {/* Search Input */}
            <div className="relative max-w-md w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5" aria-hidden="true">
                <Search className="h-4 w-4 text-muted" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search deals, tools, pricing details..."
                className="block w-full rounded-xl border border-line bg-bg py-2.5 pl-10 pr-4 text-sm text-ink placeholder-muted outline-none transition focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* UNiDAYS Toggle Switch */}
            <div className="flex items-center gap-3 self-start md:self-auto">
              <span className="text-sm font-medium text-ink-2">Show UNiDAYS Verified Only</span>
              <button
                type="button"
                role="switch"
                aria-checked={unidaysOnly}
                onClick={() => setUnidaysOnly(!unidaysOnly)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none focus:ring-2 focus:ring-accent ${
                  unidaysOnly ? 'bg-emerald-500' : 'bg-line-strong'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-bg shadow ring-0 transition duration-200 ease-in-out ${
                    unidaysOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Horizontal Category Scroll */}
          {categories.length > 2 && (
            <div className="mt-6 flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide border transition-all duration-200 ${
                    selectedCategory === cat
                      ? 'bg-accent border-accent text-bg shadow-sm shadow-accent/20'
                      : 'bg-bg-elev border-line text-ink-2 hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Results Grid */}
        <div className="mt-10">
          {loading ? (
            <div className="flex h-60 flex-col items-center justify-center text-center">
              <div className="relative flex h-10 w-10 items-center justify-center">
                <div className="absolute h-8 w-8 animate-ping rounded-full bg-accent opacity-20" />
                <Sparkles className="h-5 w-5 text-accent animate-pulse" />
              </div>
              <p className="mt-4 text-sm text-muted">Scanning educational catalog...</p>
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md rounded-2xl border border-rose-500/10 bg-rose-500/5 p-6 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
              <h3 className="mt-4 text-base font-bold text-ink">Failed to load discounts</h3>
              <p className="mt-1 text-sm text-muted">
                Our server encountered an issue retrieving pricing detail cards. Please refresh or try again later.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 text-rose-500 border border-rose-500/20 hover:bg-rose-500/10"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </div>
          ) : paginatedDiscounts.length === 0 ? (
            <div className="rounded-2xl border border-line bg-bg-elev/40 py-16 px-4 text-center">
              <GraduationCap className="mx-auto h-12 w-12 text-muted opacity-40 mb-3" />
              <h3 className="text-lg font-bold text-ink">No student deals match your filters</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                Try refining your search query, selecting another category filter, or switching off the UNiDAYS verification toggle.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategory('All')
                  setUnidaysOnly(false)
                }}
                className="mt-4 text-sm font-semibold text-accent hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              <MotionDiv
                variants={sectionReveal}
                initial="initial"
                whileInView="animate"
                viewport={REVEAL_VIEWPORT}
                className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                <AnimatePresence mode="popLayout">
                  {paginatedDiscounts.map((tool) => (
                    <motion.article
                      key={tool.slug}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.22 }}
                      className="flex flex-col justify-between rounded-2xl border border-line/50 glass-card p-6 hover:border-accent hover:shadow-[0_4px_20px_-4px_rgba(47,179,137,0.15)] transition-all duration-300 group"
                    >
                      <div>
                        {/* Logo, Name, Verified Indicator */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <ToolLogo tool={tool} size={44} />
                            <div>
                              <h3 className="text-base font-bold text-ink group-hover:text-accent transition">
                                <Link to={`/tools/${tool.slug}`}>{tool.name}</Link>
                              </h3>
                              {tool.category && (
                                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                                  {tool.category}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* UNiDAYS verified check */}
                          {tool.unidays_verified && (
                            <span 
                              title="UNiDAYS Verified Partner" 
                              className="flex h-6 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0 shadow-sm"
                            >
                              <CheckCircle className="h-3 w-3 shrink-0" />
                              UNiDAYS
                            </span>
                          )}
                        </div>

                        {/* Tagline */}
                        <p className="mt-4 text-xs leading-relaxed text-ink-2 min-h-[2.5rem] line-clamp-2">
                          {tool.tagline}
                        </p>

                        {/* Details Badge */}
                        <div className="mt-4 border-t border-line/60 pt-4">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted block mb-1">
                            Curated Deal
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-ink border border-accent/10">
                              <Percent className="h-3 w-3" />
                              {tool.discount_val}
                            </span>
                            <span className="text-xs font-medium text-ink-2 capitalize">
                              ({tool.pricing})
                            </span>
                          </div>
                        </div>
                        
                        {/* Exact pricingDetail text */}
                        {tool.pricingDetail && (
                          <p className="mt-2 text-[11px] leading-normal text-muted italic line-clamp-2">
                            "{tool.pricingDetail}"
                          </p>
                        )}
                      </div>

                      {/* Bottom Actions */}
                      <div className="mt-6 flex items-center justify-between border-t border-line/40 pt-4">
                        {tool.rating > 0 ? (
                          <div className="flex items-center gap-1" title={`Rating: ${tool.rating}`}>
                            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                            <span className="text-xs font-bold text-ink">{tool.rating.toFixed(1)}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-muted">
                            <Star className="h-3.5 w-3.5" />
                            <span className="text-xs">Unrated</span>
                          </div>
                        )}
                        
                        <Link
                          to={`/tools/${tool.slug}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-ink hover:underline transition"
                        >
                          Claim Perk
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </MotionDiv>

              {/* Enhanced Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-12 flex items-center justify-center gap-2 border border-line bg-bg-elev/40 backdrop-blur-md p-3 rounded-2xl max-w-sm mx-auto shadow-md">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-bg text-ink-2 hover:bg-bg-sunk hover:text-ink disabled:opacity-40 disabled:pointer-events-none transition"
                    aria-label="Previous Page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    const isFirst = page === 1
                    const isLast = page === totalPages
                    const isWithinRange = Math.abs(page - currentPage) <= 1
                    
                    if (isFirst || isLast || isWithinRange) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`h-9 w-9 rounded-xl text-xs font-bold transition-all ${
                            currentPage === page
                              ? 'bg-accent text-bg shadow-sm shadow-accent/20'
                              : 'border border-line bg-bg text-ink-2 hover:bg-bg-sunk hover:text-ink'
                          }`}
                        >
                          {page}
                        </button>
                      )
                    }
                    
                    if (
                      (page === 2 && currentPage > 3) ||
                      (page === totalPages - 1 && currentPage < totalPages - 2)
                    ) {
                      return (
                        <span key={page} className="text-muted px-1 text-xs">
                          ...
                        </span>
                      )
                    }
                    
                    return null
                  })}

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-bg text-ink-2 hover:bg-bg-sunk hover:text-ink disabled:opacity-40 disabled:pointer-events-none transition"
                    aria-label="Next Page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
