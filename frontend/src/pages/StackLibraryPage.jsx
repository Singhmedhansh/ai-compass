import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { motion } from 'framer-motion'
import {
  Search, ArrowUpRight, Star, User, BookOpen, Layers
} from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, CompassLoader } from '../components/ui'

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
}

export default function StackLibraryPage() {
  const navigate = useNavigate()
  const [stacks, setStacks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isLoggedIn] = useState(() => {
    try {
      return Boolean(JSON.parse(localStorage.getItem('user') || 'null'))
    } catch {
      return false
    }
  })

  useEffect(() => {
    let active = true
    async function loadStacks() {
      try {
        setLoading(true)
        const res = await fetch('/api/v1/public-stacks')
        if (res.ok && active) {
          const data = await res.json()
          setStacks(data)
        }
      } catch (err) {
        toast.error('Failed to load shared stacks.')
      } finally {
        if (active) setLoading(false)
      }
    }
    loadStacks()
    return () => {
      active = false
    }
  }, [])

  const handleUpvote = async (e, stackId) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isLoggedIn) {
      toast.error('Please login to upvote shared stacks!')
      return
    }

    try {
      const res = await fetch(`/api/v1/public-stacks/${stackId}/upvote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!res.ok) throw new Error()
      const data = await res.json()

      setStacks(prev =>
        prev.map(s => {
          if (s.id === stackId) {
            return { ...s, upvotes: data.upvotes, has_voted: data.has_voted }
          }
          return s
        }).sort((a, b) => b.upvotes - a.upvotes)
      )

      if (data.has_voted) {
        toast.success('Upvoted toolkit!')
      } else {
        toast.info('Removed upvote')
      }
    } catch {
      toast.error('Could not submit vote.')
    }
  }

  const handleClone = async (e, stackId) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isLoggedIn) {
      toast.error('Please login to clone stacks to your profile!')
      return
    }

    try {
      const res = await fetch(`/api/v1/public-stacks/${stackId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!res.ok) throw new Error()
      const data = await res.json()

      toast.success(`Successfully cloned toolkit: "${data.name}"! Check your Dashboard.`, {
        action: {
          label: 'View Dashboard',
          onClick: () => navigate('/dashboard')
        }
      })
    } catch {
      toast.error('Could not clone stack.')
    }
  }

  // Filter stacks based on name, tool slug/name, or creator
  const filteredStacks = stacks.filter(stack => {
    const q = search.toLowerCase()
    return (
      stack.name.toLowerCase().includes(q) ||
      stack.creator_name.toLowerCase().includes(q) ||
      (stack.goal && stack.goal.toLowerCase().includes(q)) ||
      (stack.tools && stack.tools.some(t => t.toLowerCase().includes(q)))
    )
  })

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>Community AI Toolkits & Stacks | AI Compass</title>
        <meta
          name="description"
          content="Browse public AI toolkits, workflows, and custom stacks shared by developers and students on AI Compass. Upvote and clone to your dashboard."
        />
        <link rel="canonical" href="https://ai-compass.in/stacks" />
      </Helmet>

      {/* Header section */}
      <section className="relative overflow-hidden rounded-3xl border border-line/40 bg-bg-elev p-6 md:p-8 shadow-xl mb-8">
        <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-semibold uppercase tracking-wider mb-3">
            <Layers className="h-3.5 w-3.5" /> Community Gallery
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl leading-[1.15]">
            Community Stack Library
          </h1>
          <p className="mt-3 text-muted text-sm md:text-base leading-relaxed max-w-3xl">
            Explore verified AI toolkits shared by other students and developers. Upvote useful setups, and clone them directly to your dashboard to customize your own AI workflow.
          </p>
        </div>
      </section>

      {/* Search Bar */}
      <div className="relative mb-6 max-w-md">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-5 w-5 text-muted" aria-hidden="true" />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, tools, or creator..."
          className="block w-full rounded-2xl border border-line bg-bg-elev py-2.5 pl-10 pr-4 text-sm text-ink placeholder-muted shadow-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
        />
      </div>

      {loading ? (
        <div className="flex h-60 items-center justify-center">
          <CompassLoader />
        </div>
      ) : filteredStacks.length > 0 ? (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {filteredStacks.map((stack) => (
            <motion.div
              key={stack.id}
              variants={fadeUp}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line/40 bg-bg-elev/75 hover:bg-bg-elev backdrop-blur-md p-6 shadow-sm hover:shadow-md transition-all"
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">
                      {stack.name}
                    </h3>
                    <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                      <User className="h-3 w-3" /> Shared by {stack.creator_name}
                    </p>
                  </div>

                  {/* Upvote controls */}
                  <button
                    type="button"
                    onClick={(e) => handleUpvote(e, stack.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      stack.has_voted
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold'
                        : 'bg-bg-sunk/50 border-line text-muted hover:text-ink hover:bg-bg-sunk'
                    }`}
                  >
                    <Star className={`h-3.5 w-3.5 ${stack.has_voted ? 'fill-emerald-500 text-emerald-500' : ''}`} />
                    <span>{stack.upvotes}</span>
                  </button>
                </div>

                {stack.goal && (
                  <p className="text-xs sm:text-sm text-ink-2 mb-4 leading-normal italic line-clamp-2">
                    &ldquo;{stack.goal}&rdquo;
                  </p>
                )}

                {/* Metadata badges */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {stack.budget && (
                    <span className="text-[10px] font-semibold uppercase bg-accent-soft/50 text-accent-ink px-2 py-0.5 rounded-md border border-accent/10">
                      Budget: {stack.budget}
                    </span>
                  )}
                  {stack.platform && (
                    <span className="text-[10px] font-semibold uppercase bg-bg-sunk text-muted px-2 py-0.5 rounded-md border border-line">
                      Platform: {stack.platform}
                    </span>
                  )}
                  {stack.level && (
                    <span className="text-[10px] font-semibold uppercase bg-bg-sunk text-muted px-2 py-0.5 rounded-md border border-line">
                      Skill: {stack.level}
                    </span>
                  )}
                </div>

                {/* Toolkit visual representations */}
                <div className="mb-6">
                  <span className="text-xs font-semibold text-muted-2 uppercase tracking-wide block mb-2">Included Tools ({stack.tools.length})</span>
                  <div className="flex flex-wrap gap-2">
                    {stack.tools.slice(0, 5).map(slug => (
                      <span
                        key={`${stack.id}-${slug}`}
                        className="text-xs bg-bg-sunk/60 border border-line/40 rounded-lg px-2.5 py-1 text-ink-2 font-medium"
                      >
                        {slug.replace('-', ' ')}
                      </span>
                    ))}
                    {stack.tools.length > 5 && (
                      <span className="text-xs bg-bg-sunk text-muted rounded-lg px-2 py-1 font-semibold">
                        +{stack.tools.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-line/20 mt-auto">
                <Link
                  to={`/stacks/${stack.id}?stack_id=${stack.id}`}
                  className="flex-1 text-center text-xs font-semibold bg-accent hover:opacity-90 text-bg py-2 rounded-xl transition shadow-sm"
                >
                  View Toolkit
                </Link>
                <button
                  type="button"
                  onClick={(e) => handleClone(e, stack.id)}
                  className="flex-1 text-xs font-semibold bg-bg-sunk hover:bg-line border border-line text-ink-2 py-2 rounded-xl transition cursor-pointer"
                >
                  Clone to Profile
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-bg-sunk py-16 text-center">
          <BookOpen className="h-8 w-8 text-muted mx-auto" />
          <h2 className="mt-4 text-lg font-semibold text-ink">No matching toolkits found</h2>
          <p className="text-sm text-muted mt-1">Try refining your search terms or check back later.</p>
        </div>
      )}
    </div>
  )
}
