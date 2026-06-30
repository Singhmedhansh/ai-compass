import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Star, UploadCloud, CheckCircle2,
  FileCheck, Users, Layers, Award, ArrowRight,
  Plus, ShieldCheck, Copy, Check, RotateCcw
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

  // Syllabus parser states
  const [parserStep, setParserStep] = useState('idle') // idle, uploading, parsed
  const [uploadProgress, setUploadProgress] = useState(0)

  // Stacks states
  const [hasUpvoted, setHasUpvoted] = useState(false)
  const [upvoteCount, setUpvoteCount] = useState(42)
  const [stackTools, setStackTools] = useState(['Google Colab', 'Claude', 'v0.dev'])
  const [cloneStep, setCloneStep] = useState('idle') // idle, cloning, finished
  const [cloneProgress, setCloneProgress] = useState(0)

  // Discounts states
  const [activeDiscountItem, setActiveDiscountItem] = useState(null) // null, 'gh', 'notion', 'jb'
  const [verificationStep, setVerificationStep] = useState('idle') // idle, email_input, checking, code_revealed
  const [emailInput, setEmailInput] = useState('')
  const [isCodeCopied, setIsCodeCopied] = useState(false)

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
    }, 10000) // 10s rotation for longer interactive flows

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
        }, 120)
      }, 1200)
      return () => clearTimeout(t1)
    }
  }, [activeTab, parserStep])

  // Reset Stacks states on tab switch
  useEffect(() => {
    if (activeTab !== 'stacks') {
      setHasUpvoted(false)
      setUpvoteCount(42)
      setStackTools(['Google Colab', 'Claude', 'v0.dev'])
      setCloneStep('idle')
      setCloneProgress(0)
    }
  }, [activeTab])

  // Reset Discounts on tab switch
  useEffect(() => {
    if (activeTab !== 'discounts') {
      setActiveDiscountItem(null)
      setVerificationStep('idle')
      setEmailInput('')
      setIsCodeCopied(false)
    }
  }, [activeTab])

  const handleManualTabSelect = (tabId) => {
    setActiveTab(tabId)
    setIsHovered(true)
  }

  // Handle simulated upvoting particle animation
  const triggerUpvote = () => {
    if (hasUpvoted) {
      setUpvoteCount(prev => prev - 1)
      setHasUpvoted(false)
    } else {
      setUpvoteCount(prev => prev + 1)
      setHasUpvoted(true)
    }
  }

  // Simulate stack tools adding/toggling
  const handleAddToolToStack = (toolName) => {
    if (stackTools.includes(toolName)) {
      setStackTools(prev => prev.filter(t => t !== toolName))
    } else {
      setStackTools(prev => [...prev, toolName])
    }
  }

  // Simulate stack cloning sequence
  const startCloningStack = () => {
    setCloneStep('cloning')
    let prog = 0
    const interval = setInterval(() => {
      prog += 20
      setCloneProgress(prog)
      if (prog >= 100) {
        clearInterval(interval)
        setCloneStep('finished')
      }
    }, 150)
  }

  // Simulate Discount Verification Flow
  const startVerification = (discountId) => {
    setActiveDiscountItem(discountId)
    setVerificationStep('email_input')
  }

  const submitEmailVerification = () => {
    if (!emailInput.includes('@') || !emailInput.includes('.')) {
      return // Simple client validator
    }
    setVerificationStep('checking')
    setTimeout(() => {
      setVerificationStep('code_revealed')
    }, 1800)
  }

  const renderMockupContent = () => {
    switch (activeTab) {
      case 'parser':
        return (
          <div className="p-4 sm:p-6 w-full h-full flex flex-col justify-center min-h-[320px]">
            <AnimatePresence mode="wait">
              {parserStep === 'idle' && (
                <motion.div
                  key="parser-idle"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-line rounded-2xl p-6 sm:p-8 bg-bg-sunk/10 text-center"
                >
                  <UploadCloud className="h-10 w-10 text-accent mb-3 animate-bounce" />
                  <p className="text-sm font-semibold text-ink mb-1">Drag & Drop Syllabus PDF</p>
                  <p className="text-xs text-muted">Supports CS, Math, and Engineering course layouts</p>
                </motion.div>
              )}

              {parserStep === 'uploading' && (
                <motion.div
                  key="parser-uploading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center p-6 text-center w-full"
                >
                  <FileText className="h-10 w-10 text-accent mb-4 animate-pulse" />
                  <p className="text-sm font-semibold text-ink mb-2">Analyzing CS_101_Algorithms.pdf...</p>
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
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2 mb-1 text-emerald-600 dark:text-emerald-400">
                    <FileCheck className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-wider">Analysis Complete — 3 Topics Identified</span>
                  </div>

                  <div className="space-y-2">
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
          <div className="p-4 sm:p-6 w-full h-full flex flex-col justify-center min-h-[320px]">
            <AnimatePresence mode="wait">
              {cloneStep === 'idle' && (
                <motion.div
                  key="stack-builder"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="overflow-hidden rounded-2xl border border-line/40 bg-bg-elev/75 p-4 sm:p-5 shadow-sm space-y-4 w-full"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-sm sm:text-base font-semibold text-ink">AI Stack for CS Freshman</h4>
                      <p className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                        <Users className="h-3 w-3" /> Shared by StudentMedhansh
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={triggerUpvote}
                      className={`relative flex items-center gap-1 px-2.5 py-1 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        hasUpvoted
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold scale-105'
                          : 'bg-bg-sunk/50 border-line text-muted hover:text-ink hover:bg-bg-sunk'
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${hasUpvoted ? 'fill-emerald-500 text-emerald-500' : ''}`} />
                      <span>{upvoteCount}</span>
                      
                      {/* Floating Upvote particle feedback */}
                      {hasUpvoted && (
                        <motion.span
                          initial={{ opacity: 1, y: 0 }}
                          animate={{ opacity: 0, y: -20 }}
                          className="absolute -top-3 right-2 text-[10px] font-bold text-emerald-500"
                        >
                          +1
                        </motion.span>
                      )}
                    </button>
                  </div>

                  {/* Included Tools listing display */}
                  <div>
                    <span className="text-[10px] font-bold text-muted-2 uppercase tracking-wide block mb-1.5">Stack Contents ({stackTools.length})</span>
                    <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                      {stackTools.map(t => (
                        <span key={t} className="text-[10px] bg-bg-sunk/60 border border-line/40 rounded-lg px-2 py-0.5 text-ink-2 font-medium">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Interactive: allow toggling mock options */}
                  <div className="pt-2 border-t border-line/20">
                    <span className="text-[10px] font-bold text-muted-2 uppercase tracking-wide block mb-2">Interactive: Customize Stack</span>
                    <div className="flex flex-wrap gap-1">
                      {['Cursor', 'Notion', 'NotebookLM'].map(tool => {
                        const active = stackTools.includes(tool)
                        return (
                          <button
                            key={tool}
                            onClick={() => handleAddToolToStack(tool)}
                            className={`text-[10px] font-semibold px-2 py-1 rounded-md border flex items-center gap-1 cursor-pointer transition ${
                              active
                                ? 'bg-accent-soft border-accent/25 text-accent-ink'
                                : 'bg-bg-sunk/30 border-line text-muted hover:text-ink'
                            }`}
                          >
                            <Plus className={`h-3 w-3 transition-transform ${active ? 'rotate-45' : ''}`} /> {tool}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <button
                    onClick={startCloningStack}
                    className="w-full text-xs font-semibold bg-accent text-bg py-2.5 rounded-xl transition shadow-sm cursor-pointer hover:opacity-90"
                  >
                    Clone to Dashboard
                  </button>
                </motion.div>
              )}

              {cloneStep === 'cloning' && (
                <motion.div
                  key="stack-cloning"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center p-6 text-center w-full"
                >
                  <Layers className="h-10 w-10 text-accent mb-4 animate-spin" />
                  <p className="text-sm font-semibold text-ink mb-2">Configuring cloned stack on profile...</p>
                  <div className="w-full max-w-xs h-2 bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-100"
                      style={{ width: `${cloneProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted mt-1.5">{cloneProgress}% complete</span>
                </motion.div>
              )}

              {cloneStep === 'finished' && (
                <motion.div
                  key="stack-cloned-success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center p-6 text-center border border-emerald-500/20 bg-emerald-500/5 rounded-2xl w-full"
                >
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
                  <h4 className="text-sm font-semibold text-ink mb-1">Cloning Successful!</h4>
                  <p className="text-xs text-muted max-w-xs leading-relaxed mb-4">
                    The custom stack containing {stackTools.join(', ')} has been saved to your workspace profile dashboard.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCloneStep('idle')}
                      className="text-xs font-semibold border border-line bg-bg-elev px-3 py-1.5 rounded-xl text-muted hover:text-ink cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Start Over
                    </button>
                    <Link
                      to="/dashboard"
                      className="text-xs font-semibold bg-accent text-bg px-3 py-1.5 rounded-xl transition hover:opacity-90"
                    >
                      View Dashboard
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )

      case 'discounts':
        return (
          <div className="p-4 sm:p-6 w-full h-full flex flex-col justify-center min-h-[320px] w-full">
            <AnimatePresence mode="wait">
              {verificationStep === 'idle' && (
                <motion.div
                  key="discounts-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-2.5 w-full text-left"
                >
                  <span className="text-[10px] font-semibold text-muted-2 uppercase tracking-wide block mb-1">Interactive Discount Codes</span>

                  {/* GitHub card */}
                  <div className="p-3 rounded-xl border border-line bg-bg-elev flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-accent transition">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#1F2328] flex items-center justify-center text-white text-xs font-semibold shrink-0">GH</div>
                      <div>
                        <h5 className="text-xs font-semibold text-ink">GitHub Student Pack</h5>
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">100% Free Developer Suite</span>
                      </div>
                    </div>
                    <button
                      onClick={() => startVerification('gh')}
                      className="text-[10px] font-semibold bg-bg-sunk hover:bg-line border border-line text-ink-2 px-3 py-1.5 rounded-lg transition cursor-pointer w-full sm:w-auto text-center"
                    >
                      Claim Pack
                    </button>
                  </div>

                  {/* Notion card */}
                  <div className="p-3 rounded-xl border border-line bg-bg-elev flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-accent transition">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-black flex items-center justify-center text-white text-xs font-semibold shrink-0">N</div>
                      <div>
                        <h5 className="text-xs font-semibold text-ink">Notion Student Premium</h5>
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Free Block Upgrades</span>
                      </div>
                    </div>
                    <button
                      onClick={() => startVerification('notion')}
                      className="text-[10px] font-semibold bg-bg-sunk hover:bg-line border border-line text-ink-2 px-3 py-1.5 rounded-lg transition cursor-pointer w-full sm:w-auto text-center"
                    >
                      Claim Code
                    </button>
                  </div>

                  {/* JetBrains card */}
                  <div className="p-3 rounded-xl border border-line bg-bg-elev flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-accent transition">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-[#C96442] flex items-center justify-center text-white text-xs font-semibold shrink-0">JB</div>
                      <div>
                        <h5 className="text-xs font-semibold text-ink">JetBrains Student Suite</h5>
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Free Professional IDEs</span>
                      </div>
                    </div>
                    <button
                      onClick={() => startVerification('jb')}
                      className="text-[10px] font-semibold bg-bg-sunk hover:bg-line border border-line text-ink-2 px-3 py-1.5 rounded-lg transition cursor-pointer w-full sm:w-auto text-center"
                    >
                      Claim Pack
                    </button>
                  </div>
                </motion.div>
              )}

              {verificationStep === 'email_input' && (
                <motion.div
                  key="email-input-form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-4 w-full text-left"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-ink mb-1">Verify Academic Status</h4>
                    <p className="text-xs text-muted">Enter your university/school email to unlock the discount code.</p>
                  </div>

                  <div className="space-y-3">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="e.g. student@harvard.edu"
                      className="block w-full rounded-xl border border-line bg-bg-elev px-3 py-2 text-xs text-ink placeholder-muted shadow-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                    />

                    <div className="flex items-center gap-2">
                      <button
                        onClick={submitEmailVerification}
                        disabled={!emailInput.includes('@')}
                        className={`flex-1 text-xs font-semibold py-2 rounded-xl transition shadow-sm cursor-pointer text-center text-bg bg-accent ${
                          !emailInput.includes('@') ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        Verify & Unlock
                      </button>
                      <button
                        onClick={() => setVerificationStep('idle')}
                        className="text-xs font-semibold border border-line px-3 py-2 rounded-xl text-muted hover:text-ink cursor-pointer"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {verificationStep === 'checking' && (
                <motion.div
                  key="verifying-status"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center p-6 text-center w-full"
                >
                  <ShieldCheck className="h-10 w-10 text-accent mb-3 animate-pulse" />
                  <p className="text-sm font-semibold text-ink mb-1">Verifying academic credentials...</p>
                  <p className="text-xs text-muted">Connecting to academic registrar database</p>
                </motion.div>
              )}

              {verificationStep === 'code_revealed' && (
                <motion.div
                  key="promo-code-revealed"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center p-6 text-center border border-emerald-500/20 bg-emerald-500/5 rounded-2xl w-full"
                >
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
                  <h4 className="text-sm font-semibold text-ink mb-1">Verification Successful!</h4>
                  <p className="text-xs text-muted mb-4">Your student discount code is ready to copy.</p>

                  <div className="flex w-full max-w-xs items-center justify-between rounded-xl border border-line bg-bg-elev p-2.5 mb-4">
                    <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-extrabold tracking-wider pl-1.5">
                      AICOMPASS-STU-2026
                    </span>
                    <button
                      onClick={() => {
                        setIsCodeCopied(true)
                        setTimeout(() => setIsCodeCopied(false), 2000)
                      }}
                      className="rounded-lg p-1.5 border border-line bg-bg-sunk hover:bg-line transition text-ink-2 cursor-pointer"
                      title="Copy code"
                    >
                      {isCodeCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setVerificationStep('idle')
                      setEmailInput('')
                    }}
                    className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    View other discounts
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
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
