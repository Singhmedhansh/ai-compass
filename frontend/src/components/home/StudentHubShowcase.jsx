import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Star, Tag, UploadCloud, CheckCircle2,
  FileCheck, Users, Layers, Award, ArrowRight
} from 'lucide-react'
import MockupChrome from '../ui/MockupChrome'

const tabsData = [
  {
    id: 'parser',
    title: 'Syllabus AI Matching',
    tagline: 'Match tools to your curriculum',
    description: 'Upload your syllabus PDF. Our system extracts topics and matches them directly with the best hand-tested free AI tools for that specific course.',
    url: 'ai-compass.in/syllabus-parser',
    ctaText: 'Parse Syllabus',
    ctaLink: '/syllabus-parser'
  },
  {
    id: 'stacks',
    title: 'Community Stack Library',
    tagline: 'Browse and clone toolkits',
    description: 'Explore curated toolkit configurations shared by CS and engineering peers, upvote setups that work, and clone them to your profile with one click.',
    url: 'ai-compass.in/stacks',
    ctaText: 'Explore Library',
    ctaLink: '/stacks'
  },
  {
    id: 'discounts',
    title: 'Student Discount Vault',
    tagline: 'Claim premium licenses',
    description: 'Get verified for student-only access to premium developer tiers, free pro blocks, and discount perks on top-tier AI software.',
    url: 'ai-compass.in/student-discounts',
    ctaText: 'Claim Discounts',
    ctaLink: '/student-discounts'
  }
]

export default function StudentHubShowcase() {
  const [activeTab, setActiveTab] = useState('parser')
  const [isHovered, setIsHovered] = useState(false)
  const autoRotateTimer = useRef(null)

  // Syllabus parser demo states
  const [parserStep, setParserStep] = useState('idle') // idle, uploading, parsed
  const [uploadProgress, setUploadProgress] = useState(0)

  // Stacks demo states
  const [hasUpvoted, setHasUpvoted] = useState(false)
  const [upvoteCount, setUpvoteCount] = useState(42)
  const [isCloned, setIsCloned] = useState(false)

  // Discounts demo states
  const [claimedDiscounts, setClaimedDiscounts] = useState({})

  // Auto-rotate tabs if user is not interacting
  useEffect(() => {
    if (isHovered) {
      if (autoRotateTimer.current) clearInterval(autoRotateTimer.current)
      return
    }

    autoRotateTimer.current = setInterval(() => {
      setActiveTab(prev => {
        if (prev === 'parser') return 'stacks'
        if (prev === 'stacks') return 'discounts'
        return 'parser'
      })
    }, 8000)

    return () => {
      if (autoRotateTimer.current) clearInterval(autoRotateTimer.current)
    }
  }, [isHovered])

  // Parser upload animation loop
  useEffect(() => {
    if (activeTab !== 'parser') {
      setParserStep('idle')
      setUploadProgress(0)
      return
    }

    if (parserStep === 'idle') {
      const t1 = setTimeout(() => {
        setParserStep('uploading')
        let prog = 0
        const interval = setInterval(() => {
          prog += 10
          setUploadProgress(prog)
          if (prog >= 100) {
            clearInterval(interval)
            setParserStep('parsed')
          }
        }, 150)
      }, 1000)
      return () => clearTimeout(t1)
    }
  }, [activeTab, parserStep])

  // Reset Stacks states on tab switch
  useEffect(() => {
    if (activeTab !== 'stacks') {
      setHasUpvoted(false)
      setUpvoteCount(42)
      setIsCloned(false)
    }
  }, [activeTab])

  // Reset Discounts on tab switch
  useEffect(() => {
    if (activeTab !== 'discounts') {
      setClaimedDiscounts({})
    }
  }, [activeTab])

  const handleManualTabSelect = (tabId) => {
    setActiveTab(tabId)
    setIsHovered(true)
  }

  const renderMockupContent = () => {
    switch (activeTab) {
      case 'parser':
        return (
          <div className="p-6 h-full flex flex-col justify-center min-h-[320px]">
            <AnimatePresence mode="wait">
              {parserStep === 'idle' && (
                <motion.div
                  key="parser-idle"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-line rounded-2xl p-8 bg-bg-sunk/10 text-center"
                >
                  <UploadCloud className="h-10 w-10 text-accent mb-3 animate-bounce" />
                  <p className="text-sm font-bold text-ink mb-1">Drag & Drop Syllabus PDF</p>
                  <p className="text-xs text-muted">Supports CS, Math, and Engineering course layouts</p>
                </motion.div>
              )}

              {parserStep === 'uploading' && (
                <motion.div
                  key="parser-uploading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center p-8 text-center"
                >
                  <FileText className="h-10 w-10 text-accent mb-4 animate-pulse" />
                  <p className="text-sm font-bold text-ink mb-2">Analyzing CS_101_Algorithms.pdf...</p>
                  <div className="w-full max-w-xs h-2 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted mt-1.5">{uploadProgress}% uploaded</span>
                </motion.div>
              )}

              {parserStep === 'parsed' && (
                <motion.div
                  key="parser-parsed"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3.5"
                >
                  <div className="flex items-center gap-2 mb-2 text-emerald-600 dark:text-emerald-400">
                    <FileCheck className="h-5 w-5" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Analysis Complete — 3 Topics Identified</span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between p-3 rounded-xl border border-line bg-bg-sunk/30">
                      <div>
                        <span className="text-xs font-semibold text-ink block">1. Relational Databases</span>
                        <span className="text-[10px] text-muted">Weeks 1-4</span>
                      </div>
                      <span className="text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">
                        DBeaver (Free)
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl border border-line bg-bg-sunk/30">
                      <div>
                        <span className="text-xs font-semibold text-ink block">2. Frontend Architecture</span>
                        <span className="text-[10px] text-muted">Weeks 5-8</span>
                      </div>
                      <span className="text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">
                        v0.dev (Free tier)
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl border border-line bg-bg-sunk/30">
                      <div>
                        <span className="text-xs font-semibold text-ink block">3. Code Refactoring</span>
                        <span className="text-[10px] text-muted">Weeks 9-12</span>
                      </div>
                      <span className="text-[10px] font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded">
                        Claude Sonnet
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setParserStep('idle')}
                    className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    Reset and parse another syllabus
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )

      case 'stacks':
        return (
          <div className="p-6 h-full flex flex-col justify-center min-h-[320px]">
            <div className="overflow-hidden rounded-2xl border border-line/40 bg-bg-elev/75 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <h4 className="text-base font-semibold text-ink">AI Stack for CS Freshman</h4>
                  <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                    <Users className="h-3 w-3" /> Shared by StudentMedhansh
                  </p>
                </div>

                {/* Simulated Upvote Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (hasUpvoted) {
                      setUpvoteCount(42)
                      setHasUpvoted(false)
                    } else {
                      setUpvoteCount(43)
                      setHasUpvoted(true)
                    }
                  }}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    hasUpvoted
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold'
                      : 'bg-bg-sunk/50 border-line text-muted hover:text-ink hover:bg-bg-sunk'
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${hasUpvoted ? 'fill-emerald-500 text-emerald-500' : ''}`} />
                  <span>{upvoteCount}</span>
                </button>
              </div>

              <p className="text-xs text-ink-2 mb-4 leading-normal italic">
                &ldquo;curated selection of completely free AI developer modules for starting algorithms courses.&rdquo;
              </p>

              {/* Tools display */}
              <div className="flex flex-wrap gap-1.5 mb-5">
                <span className="text-[10px] bg-bg-sunk/60 border border-line/40 rounded-lg px-2 py-0.5 text-ink-2 font-medium">Google Colab</span>
                <span className="text-[10px] bg-bg-sunk/60 border border-line/40 rounded-lg px-2 py-0.5 text-ink-2 font-medium">Claude</span>
                <span className="text-[10px] bg-bg-sunk/60 border border-line/40 rounded-lg px-2 py-0.5 text-ink-2 font-medium">v0.dev</span>
              </div>

              {/* Action buttons simulation */}
              <div className="flex gap-2">
                <button
                  onClick={() => setIsCloned(true)}
                  className="flex-1 text-xs font-semibold bg-accent text-bg py-2 rounded-xl transition shadow-sm cursor-pointer"
                >
                  {isCloned ? (
                    <span className="flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Cloned to Profile!
                    </span>
                  ) : 'Clone Stack'}
                </button>
                {isCloned && (
                  <button
                    onClick={() => setIsCloned(false)}
                    className="text-xs text-muted hover:text-ink"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        )

      case 'discounts':
        return (
          <div className="p-6 h-full flex flex-col justify-center min-h-[320px] space-y-3">
            <span className="text-[10px] font-semibold text-muted-2 uppercase tracking-wide block mb-1">Interactive Discount Codes</span>

            <div className="p-3.5 rounded-xl border border-line bg-bg-elev flex items-center justify-between hover:border-accent transition">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-[#1F2328] flex items-center justify-center text-white text-xs font-semibold">GH</div>
                <div>
                  <h5 className="text-xs font-semibold text-ink">GitHub Student Developer Pack</h5>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">100% Free Pro Tools</span>
                </div>
              </div>
              <button
                onClick={() => setClaimedDiscounts(prev => ({ ...prev, gh: !prev.gh }))}
                className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                  claimedDiscounts.gh ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-bg-sunk hover:bg-line border-line text-ink-2'
                }`}
              >
                {claimedDiscounts.gh ? 'Claimed!' : 'Claim Pack'}
              </button>
            </div>

            <div className="p-3.5 rounded-xl border border-line bg-bg-elev flex items-center justify-between hover:border-accent transition">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-black flex items-center justify-center text-white text-xs font-semibold">N</div>
                <div>
                  <h5 className="text-xs font-semibold text-ink">Notion Student Premium</h5>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Free Personal Upgrade</span>
                </div>
              </div>
              <button
                onClick={() => setClaimedDiscounts(prev => ({ ...prev, notion: !prev.notion }))}
                className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                  claimedDiscounts.notion ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-bg-sunk hover:bg-line border-line text-ink-2'
                }`}
              >
                {claimedDiscounts.notion ? 'Claimed!' : 'Claim Upgrade'}
              </button>
            </div>

            <div className="p-3.5 rounded-xl border border-line bg-bg-elev flex items-center justify-between hover:border-accent transition">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-[#C96442] flex items-center justify-center text-white text-xs font-semibold">JB</div>
                <div>
                  <h5 className="text-xs font-semibold text-ink">JetBrains Student Suite</h5>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Free Professional IDEs</span>
                </div>
              </div>
              <button
                onClick={() => setClaimedDiscounts(prev => ({ ...prev, jb: !prev.jb }))}
                className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition cursor-pointer ${
                  claimedDiscounts.jb ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-bg-sunk hover:bg-line border-line text-ink-2'
                }`}
              >
                {claimedDiscounts.jb ? 'Claimed!' : 'Claim License'}
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const activeData = tabsData.find(t => t.id === activeTab)

  return (
    <section className="border-t border-line bg-bg py-20 relative overflow-hidden" onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent pointer-events-none" />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft text-accent text-xs font-semibold uppercase tracking-wider mb-4">
            <Award className="h-3.5 w-3.5" /> Student Hub Features
          </div>
          <h2 className="text-3xl font-semibold text-ink tracking-tight sm:text-4xl leading-[1.15]">
            Syllabi, Galleries, and Discounts
          </h2>
          <p className="mt-4 text-muted text-sm md:text-base leading-relaxed">
            AI Compass is more than a directory. Use the Student Hub to sync your course curriculum, share stacks with classmates, and claim premium software licenses for free.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: Tab Selectors */}
          <div className="lg:col-span-5 space-y-4">
            {tabsData.map((tab) => {
              const isActive = tab.id === activeTab
              return (
                <div
                  key={tab.id}
                  onClick={() => handleManualTabSelect(tab.id)}
                  className={`group cursor-pointer rounded-2xl border p-5 transition-all text-left relative overflow-hidden ${
                    isActive
                      ? 'bg-bg-elev border-accent shadow-md'
                      : 'border-line/60 bg-bg/50 hover:bg-bg-elev/40 hover:border-line'
                  }`}
                >
                  {/* Dynamic active status line indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="showcase-indicator"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-accent"
                    />
                  )}

                  <span className="text-[10px] font-semibold text-accent-ink tracking-wide block mb-1 uppercase">
                    {tab.tagline}
                  </span>
                  <h3 className="text-base font-semibold text-ink transition-colors group-hover:text-accent">
                    {tab.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {tab.description}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Right: Mockup Interface visualizer */}
          <div className="lg:col-span-7">
            <MockupChrome url={activeData.url}>
              <div className="bg-bg-elev/60 backdrop-blur-md min-h-[340px] flex items-center justify-center p-4">
                {renderMockupContent()}
              </div>
            </MockupChrome>

            {/* Bottom links CTA mapping to the actual page */}
            <div className="mt-6 flex justify-end">
              <Link
                to={activeData.ctaLink}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
              >
                {activeData.ctaText} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
