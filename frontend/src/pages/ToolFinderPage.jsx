import { Check, RotateCcw, Save, Code, GraduationCap, PenTool, Mic, Briefcase, Layout, BarChart, Zap, BookOpen, Terminal, Globe, Wand2, Star, SlidersHorizontal, Bug, Search, MessageSquare, Bookmark, Palette, Film, Calendar, FileText, Megaphone, Plug, Bot, FlaskConical } from 'lucide-react'
import { useEffect, useRef, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import { ToolLogo, WordReveal, Dropdown, SEO } from '../components/ui'
import { outboundUrl, OUTBOUND_REL } from '../utils/outbound'

const PREDEFINED_STACKS = [
  { id: 'custom', label: 'Custom (Start from scratch)', category: 'All', description: 'Answer a few questions to find the perfect tools.', icon: Wand2, answers: null },
  { 
    id: 'student', 
    label: 'Ultimate Student Stack', 
    category: 'Student',
    description: 'Ace your exams & write better papers.',
    icon: GraduationCap,
    answers: { goal: ['learning', 'research', 'writing'], use_case: 'study-guides', budget: 'free', platform: ['web', 'mobile'], level: 'beginner' } 
  },
  { 
    id: 'coding', 
    label: 'Coding & Dev Stack', 
    category: 'Developer',
    description: 'Build apps and squash bugs faster.',
    icon: Code,
    answers: { goal: ['coding'], use_case: 'build-app', budget: 'any', platform: ['web', 'desktop'], level: 'intermediate' } 
  },
  { 
    id: 'creator', 
    label: 'Content Creator Stack', 
    category: 'Creator',
    description: 'Edit videos and generate stunning images.',
    icon: Star,
    answers: { goal: ['creating'], use_case: 'video-editing', budget: 'any', platform: ['web', 'desktop'], level: 'intermediate' } 
  },
  {
    id: 'writer',
    label: 'Novelist & Writer Stack',
    category: 'Professional',
    description: 'Draft, format, and edit long-form content.',
    icon: PenTool,
    answers: { goal: ['writing'], use_case: 'write-essays', budget: 'freemium', platform: ['web', 'desktop'], level: 'intermediate' }
  },
  {
    id: 'research',
    label: 'Academic Researcher',
    category: 'Professional',
    description: 'Literature search and citation management.',
    icon: BookOpen,
    answers: { goal: ['research'], use_case: 'literature-search', budget: 'any', platform: ['web', 'desktop'], level: 'advanced' }
  },
  {
    id: 'productivity',
    label: 'Productivity Ninja',
    category: 'Professional',
    description: 'Manage tasks and automate your workflow.',
    icon: Zap,
    answers: { goal: ['productivity'], use_case: 'task-management', budget: 'freemium', platform: ['web', 'mobile'], level: 'intermediate' }
  },
  {
    id: 'marketing',
    label: 'Marketer & Copywriter',
    category: 'Creator',
    description: 'Generate marketing copy & social posts.',
    icon: Briefcase,
    answers: { goal: ['writing', 'creating'], use_case: 'copywriting', budget: 'any', platform: ['web'], level: 'intermediate' }
  },
  {
    id: 'design',
    label: 'Visual Designer Stack',
    category: 'Creator',
    description: 'Text-to-image and beautiful presentation slides.',
    icon: Layout,
    answers: { goal: ['creating'], use_case: 'image-generation', budget: 'any', platform: ['web', 'desktop'], level: 'advanced' }
  },
  {
    id: 'language',
    label: 'Language Learner',
    category: 'Student',
    description: 'Practice speaking and translate texts seamlessly.',
    icon: Globe,
    answers: { goal: ['learning'], use_case: 'language-learning', budget: 'free', platform: ['mobile', 'web'], level: 'beginner' }
  },
  {
    id: 'startup',
    label: 'Startup Founder Stack',
    category: 'Developer',
    description: 'Rapid prototyping and connecting APIs.',
    icon: Terminal,
    answers: { goal: ['productivity', 'coding'], use_case: 'automation-zapier', budget: 'freemium', platform: ['web'], level: 'intermediate' }
  },
  {
    id: 'audio',
    label: 'Podcaster & Audio Stack',
    category: 'Creator',
    description: 'Generate voiceovers and edit audio tracks.',
    icon: Mic,
    answers: { goal: ['creating'], use_case: 'audio-voice', budget: 'any', platform: ['desktop', 'web'], level: 'intermediate' }
  },
  {
    id: 'data',
    label: 'Data Analyst Stack',
    category: 'Professional',
    description: 'Extract info and compile data tables.',
    icon: BarChart,
    answers: { goal: ['research', 'coding'], use_case: 'data-analysis', budget: 'any', platform: ['desktop', 'web'], level: 'advanced' }
  }
]

function TemplateGallery({ onSelect }) {
  const [activeFilter, setActiveFilter] = useState('All')
  const categories = ['All', 'Student', 'Creator', 'Developer', 'Professional']

  const filteredStacks = useMemo(() => {
    if (activeFilter === 'All') return PREDEFINED_STACKS
    return PREDEFINED_STACKS.filter(s => s.category === activeFilter || s.id === 'custom')
  }, [activeFilter])

  return (
    <div className="w-full flex flex-col items-center animate-in fade-in duration-500">
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              activeFilter === cat 
                ? 'bg-ink text-bg shadow-sm' 
                : 'bg-bg-elev text-ink-2 hover:bg-bg-sunk ring-1 ring-inset ring-line'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      
      <motion.div 
        layout 
        className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <AnimatePresence>
          {filteredStacks.map((stack) => {
            const Icon = stack.icon
            const isCustom = stack.id === 'custom'
            
            return (
              <motion.button
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={stack.id}
                onClick={() => onSelect(stack.id)}
                className={`group relative flex h-full flex-col items-start gap-3 rounded-2xl p-5 text-left transition-all outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isCustom 
                    ? 'border-2 border-dashed border-accent bg-accent-soft/20 shadow-sm hover:border-accent hover:bg-accent-soft/40 hover:shadow-accent/20' 
                    : 'border border-line bg-bg-elev shadow-sm hover:border-accent/50 hover:shadow-md'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  isCustom ? 'bg-accent text-bg shadow-sm' : 'bg-bg-sunk text-ink group-hover:bg-accent-soft group-hover:text-accent-ink'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className={`text-base font-semibold ${isCustom ? 'text-accent-ink' : 'text-ink'}`}>
                    {stack.label}
                  </h3>
                  <p className="mt-1 text-xs text-muted leading-relaxed line-clamp-2">
                    {stack.description}
                  </p>
                </div>
              </motion.button>
            )
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function WizardProgress({ answers }) {
  const steps = QUESTIONS.map((q) => {
    const answer = answers[q.id]
    const isAnswered = Array.isArray(answer) ? answer.length > 0 : Boolean(answer)
    return { label: q.label, isAnswered }
  })
  const answeredCount = steps.filter((s) => s.isAnswered).length

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{answeredCount} of {TOTAL_QUESTIONS} answered</span>
        <span className="text-xs font-semibold text-accent-ink">{Math.round((answeredCount / TOTAL_QUESTIONS) * 100)}%</span>
      </div>
      <div className="flex gap-1.5">
        {steps.map((step, i) => (
          <div
            key={i}
            title={step.label}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step.isAnswered ? 'bg-accent' : 'bg-line-strong'}`}
          />
        ))}
      </div>
    </div>
  )
}

function getAspectBucket() {
  if (typeof window === 'undefined') {
    return 'landscape'
  }

  const ratio = window.innerWidth / Math.max(window.innerHeight, 1)
  if (ratio < 0.95) {
    return 'portrait'
  }
  if (ratio > 1.9) {
    return 'ultrawide'
  }
  return 'landscape'
}

const GOAL_OPTIONS = [
  { id: 'learning', label: 'Learning', icon: GraduationCap, desc: 'Study, exam prep, and new skills' },
  { id: 'coding', label: 'Coding', icon: Code, desc: 'Build apps, debug, and write scripts' },
  { id: 'writing', label: 'Writing', icon: PenTool, desc: 'Essays, copy, editing, and grammar' },
  { id: 'research', label: 'Research', icon: BookOpen, desc: 'Papers, citations, and literature search' },
  { id: 'creating', label: 'Creating', icon: Palette, desc: 'Images, video, audio, and slides' },
  { id: 'productivity', label: 'Productivity', icon: Zap, desc: 'Tasks, notes, meetings, and automation' },
]

const SUB_CATEGORIES = {
  learning: [
    { id: 'exam-prep', label: 'Exam prep', desc: 'Prepare for exams, generate quiz questions.', icon: GraduationCap, primary: true },
    { id: 'study-guides', label: 'Study guides', desc: 'Summarize topics and create study guides.', icon: FileText, primary: true },
    { id: 'math-science', label: 'Math & Science', desc: 'Solve equations and explain complex concepts.', icon: FlaskConical, primary: false },
    { id: 'language-learning', label: 'Language learning', desc: 'Practice speaking and translate texts.', icon: Globe, primary: false },
  ],
  coding: [
    { id: 'build-app', label: 'Build a web app', desc: 'Generate boilerplate and build app features.', icon: Code, primary: true },
    { id: 'debugging', label: 'Debugging', desc: 'Find errors and explain broken code.', icon: Bug, primary: true },
    { id: 'learning-code', label: 'Learning to code', desc: 'Explain syntax and teach coding concepts.', icon: BookOpen, primary: false },
    { id: 'api-integration', label: 'API Integration', desc: 'Connect services and write API clients.', icon: Plug, primary: false },
  ],
  writing: [
    { id: 'write-essays', label: 'Write essays', desc: 'Draft outlines, thesis statements, and paragraphs.', icon: PenTool, primary: true },
    { id: 'copywriting', label: 'Copywriting', desc: 'Generate marketing copies and social posts.', icon: Megaphone, primary: true },
    { id: 'grammar-editor', label: 'Grammar & Editing', desc: 'Check spelling and improve writing style.', icon: Search, primary: false },
    { id: 'translation', label: 'Translation', desc: 'Translate text between multiple languages.', icon: MessageSquare, primary: false },
  ],
  research: [
    { id: 'review-papers', label: 'Review papers', desc: 'Summarize academic articles and PDFs.', icon: BookOpen, primary: true },
    { id: 'literature-search', label: 'Literature search', desc: 'Find academic papers and sources.', icon: Search, primary: true },
    { id: 'data-analysis', label: 'Data analysis', desc: 'Extract info and compile data tables.', icon: BarChart, primary: false },
    { id: 'citation-maker', label: 'Citations', desc: 'Format APA, MLA, and other citations.', icon: Bookmark, primary: false },
  ],
  creating: [
    { id: 'image-generation', label: 'Image generation', desc: 'Create visuals from text descriptions.', icon: Palette, primary: true },
    { id: 'video-editing', label: 'Video generation', desc: 'Generate clips and edit videos.', icon: Film, primary: true },
    { id: 'audio-voice', label: 'Audio & Voice', desc: 'TTS, music, and voice voiceovers.', icon: Mic, primary: false },
    { id: 'presentation-slides', label: 'Slides & Decks', desc: 'Create presentation slides and layouts.', icon: Layout, primary: false },
  ],
  productivity: [
    { id: 'task-management', label: 'Task management', desc: 'Track tasks, schedules, and workflows.', icon: Calendar, primary: true },
    { id: 'note-taking', label: 'Note-taking', desc: 'Organize notes and document info.', icon: FileText, primary: true },
    { id: 'meeting-summaries', label: 'Meeting summaries', desc: 'Transcribe and summarize audio.', icon: Mic, primary: false },
    { id: 'automation-zapier', label: 'Workflow automation', desc: 'Connect apps and automate tasks.', icon: Bot, primary: false },
  ],
}

const BUDGET_OPTIONS = [
  { id: 'free', label: 'Free only' },
  { id: 'freemium', label: 'Freemium' },
  { id: 'any', label: 'Any budget' },
]

const PLATFORM_OPTIONS = [
  { id: 'web', label: 'Web browser' },
  { id: 'desktop', label: 'Desktop app' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'api', label: 'API / Code' },
]

const LEVEL_OPTIONS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
]

const QUESTIONS = [
  {
    id: 'goal',
    label: 'Use case',
    activeHeading: "What's your primary goal?",
    activeHelper: 'Pick all that apply — you can refine these anytime.',
    options: GOAL_OPTIONS,
    type: 'chips',
    multiSelect: true,
  },
  {
    id: 'use_case',
    label: 'Specifics',
    activeHeading: 'What specifically do you want to do?',
    activeHelper: 'Optional — describe your goal, or press Continue to skip this step.',
    type: 'text',
  },
  {
    id: 'budget',
    label: 'Budget',
    activeHeading: "What's your budget?",
    activeHelper: 'Free is fine — we rank by fit, not price.',
    options: BUDGET_OPTIONS,
    type: 'chips',
  },
  {
    id: 'platform',
    label: 'Platform',
    activeHeading: 'Where do you work?',
    activeHelper: 'Pick every surface you use — we match tools that fit.',
    options: PLATFORM_OPTIONS,
    type: 'chips',
    multiSelect: true,
  },
  {
    id: 'level',
    label: 'Level',
    activeHeading: 'How comfortable are you with tech?',
    activeHelper: 'No wrong answer — this just calibrates the rec list.',
    options: LEVEL_OPTIONS,
    type: 'chips',
  },
]

const TOTAL_QUESTIONS = QUESTIONS.length
const QUESTION_FLOW = QUESTIONS.map((q) => q.id)

const PRICING_PILL_CLASS = {
  free: 'bg-accent-soft text-accent-ink',
  freemium: 'bg-bg-sunk text-ink-2 ring-1 ring-inset ring-line',
  paid: 'bg-bg-sunk text-ink-2 ring-1 ring-inset ring-line',
}

const GOAL_NOUN = {
  coding: 'coder',
  writing: 'writer',
  research: 'researcher',
  learning: 'learner',
  creating: 'creator',
  productivity: 'productivity-focused user',
}

const BUDGET_CLAUSE = {
  free: 'on free tier',
  freemium: 'on freemium pricing',
  any: 'with any budget',
}

const PLATFORM_CLAUSE = {
  web: 'working from a web browser',
  desktop: 'working from a desktop app',
  mobile: 'working from mobile',
  api: 'working through API or code',
}

const posthog = typeof window !== 'undefined' ? window.posthog : undefined

function captureWizardEvent(event, properties) {
  try {
    // Debug log to confirm the wizard event fires locally
    try { console.debug && console.debug('captureWizardEvent', event, properties) } catch {}
    posthog?.capture?.(event, properties)
  } catch (err) {
    /* telemetry must never break the wizard */
    try { console.warn && console.warn('captureWizardEvent error', err && err.message) } catch {}
  }
}

function snapshotAnswers(answers) {
  return {
    goal: Array.isArray(answers.goal) ? [...answers.goal] : answers.goal,
    use_case: answers.use_case || '',
    budget: answers.budget || '',
    platform: Array.isArray(answers.platform) ? [...answers.platform] : answers.platform,
    level: answers.level || '',
  }
}

function normalizeTool(rawTool) {
  const name = rawTool?.name || 'Unknown Tool'
  const description = rawTool?.description || rawTool?.shortDescription || rawTool?.tagline || ''
  const pricing = rawTool?.pricing || rawTool?.price || rawTool?.pricingType || rawTool?.pricing_type || 'Free'
  const category = rawTool?.category || rawTool?.subCategory || 'General'
  const platformLabel = Array.isArray(rawTool?.platforms)
    ? rawTool.platforms.join(', ')
    : rawTool?.platform || 'Web'

  return {
    ...rawTool,
    id: rawTool?.id || name,
    name,
    description,
    pricing,
    category,
    platformLabel,
    reason: rawTool?.reason || 'Strong overall match for your preferences.',
    rating: Number(rawTool?.rating || rawTool?.averageRating || rawTool?.average_rating || 0),
  }
}

function getPricingPillClass(pricing = '') {
  return PRICING_PILL_CLASS[String(pricing || '').toLowerCase().trim()] || PRICING_PILL_CLASS.free
}

function getToolUrl(tool = {}) {
  return outboundUrl(tool)
}

function articleFor(nextWord = '') {
  return /^[aeiouAEIOU]/.test(nextWord.trim()) ? 'an' : 'a'
}

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  return value ? [value] : []
}

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function joinPretty(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function buildPersona(answers) {
  const { goal, use_case, budget, platform, level } = answers
  const goals = asList(goal)
  const platforms = asList(platform)
  if (goals.length === 0 && !use_case && !budget && platforms.length === 0 && !level) {
    return null
  }

  const goalNoun = joinPretty(goals.map((g) => GOAL_NOUN[g]).filter(Boolean))
  const budgetClause = BUDGET_CLAUSE[budget]
  const platformClause = joinPretty(platforms.map((p) => PLATFORM_CLAUSE[p]).filter(Boolean))

  let lead
  if (level && goalNoun) {
    lead = `For ${articleFor(level)} ${level} ${goalNoun}`
  } else if (goalNoun) {
    lead = `For ${articleFor(goalNoun)} ${goalNoun}`
  } else if (level) {
    lead = `For ${articleFor(level)} ${level} user`
  } else {
    lead = 'Looking for tools'
  }

  const clauses = []
  if (use_case && use_case.trim()) clauses.push(`who wants to ${use_case.trim()}`)
  if (budgetClause) clauses.push(budgetClause)
  if (platformClause) clauses.push(platformClause)

  return clauses.length > 0 ? `${lead} ${clauses.join(', ')}:` : `${lead}:`
}

function QuestionRow({ index, question, answer, isActive, onActivate, onSelect, onTextChange, onNext, textInputRef, selectedGoals }) {
  const indexLabel = String(index).padStart(2, '0')
  const isMulti = Boolean(question.multiSelect)
  const isAnswered = isMulti
    ? Array.isArray(answer) && answer.length > 0
    : Boolean(answer)
  const selectedCount = isMulti && Array.isArray(answer) ? answer.length : 0

  const answerLabel = (() => {
    if (!isAnswered) return '— pending —'
    if (question.type === 'text') return answer
    if (isMulti) {
      return answer
        .map((id) => question.options?.find((o) => o.id === id)?.label || id)
        .join(', ')
    }
    const opt = question.options?.find((o) => o.id === answer)
    return opt?.label || answer
  })()

  const wrapperClasses = isActive
    ? 'rounded-2xl border border-accent bg-bg-elev shadow-sm ring-2 ring-accent/20 transition-shadow'
    : 'rounded-2xl border border-line bg-bg-elev transition-colors hover:border-line-strong'

  const header = (
    <div className="flex items-start gap-3 p-4">
      <span
        className={`mt-1 w-7 flex-shrink-0 font-mono text-xs tracking-wider ${
          isActive ? 'text-accent' : 'text-muted-2'
        }`}
      >
        {indexLabel}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {question.label}
          {isActive ? (
            <span className="ml-2 text-muted-2">· Question {index} of {TOTAL_QUESTIONS}</span>
          ) : null}
        </span>
        {isActive ? (
          <span className="text-base font-semibold text-ink">{question.activeHeading}</span>
        ) : isAnswered ? (
          <span className="text-base font-medium text-ink">{answerLabel}</span>
        ) : (
          <span className="text-sm text-muted-2">— pending —</span>
        )}
      </div>

      <div className="mt-1 flex-shrink-0">
        {isActive ? (
          <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border-2 border-accent" />
        ) : isAnswered ? (
          <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-bg">
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border border-line-strong" />
        )}
      </div>
    </div>
  )

  // Sub-categories progressive disclosure logic
  const goals = selectedGoals || []
  const allSubs = Array.isArray(goals) ? goals.flatMap(g => SUB_CATEGORIES[g] || []) : []
  const primarySubs = allSubs.filter(sub => sub.primary)
  const nicheSubs = allSubs.filter(sub => !sub.primary)

  const isNicheOrCustom = answer && !primarySubs.some(sub => sub.label === answer)
  const [showOther, setShowOther] = useState(Boolean(isNicheOrCustom))

  return (
    <div className={wrapperClasses}>
      {isActive ? (
        <>
          {header}
          <div className="px-4 pb-4 pl-12">
            {question.id === 'use_case' ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{question.activeHelper}</p>

                {goals.length === 0 ? (
                  <p className="rounded-lg border border-line bg-bg-sunk px-3 py-2.5 text-sm text-muted">
                    Go back and select a goal first — relevant options will appear here.
                  </p>
                ) : (
                  <>
                    {/* Primary sub-category cards */}
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 mt-1">
                      {primarySubs.map((sub) => {
                        const SubIcon = sub.icon
                        const isSelected = answer === sub.label
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              onTextChange(sub.label)
                              window.setTimeout(() => onNext(), 280)
                            }}
                            className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-accent ${
                              isSelected
                                ? 'border-accent bg-accent-soft/30 ring-1 ring-accent'
                                : 'border-line bg-bg hover:border-accent/40 hover:shadow-sm'
                            }`}
                          >
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                              isSelected ? 'bg-accent text-bg' : 'bg-bg-sunk text-muted group-hover:bg-accent-soft'
                            }`}>
                              <SubIcon className="h-4 w-4" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <span className="block text-sm font-semibold text-ink">{sub.label}</span>
                              <span className="block text-xs text-muted-2 leading-snug">{sub.desc}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Progressive disclosure */}
                    {(nicheSubs.length > 0 || true) ? (
                      <div className="mt-0.5">
                        <button
                          type="button"
                          onClick={() => setShowOther(!showOther)}
                          className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
                        >
                          {showOther ? 'Hide other options' : 'Other options...'}
                        </button>
                      </div>
                    ) : null}

                    {showOther && (
                      <div className="mt-2 space-y-3 pt-3 border-t border-dashed border-line animate-in fade-in duration-200">
                        {nicheSubs.length > 0 && (
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {nicheSubs.map((sub) => {
                              const SubIcon = sub.icon
                              const isSelected = answer === sub.label
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() => {
                                    onTextChange(sub.label)
                                    window.setTimeout(() => onNext(), 280)
                                  }}
                                  className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all focus:outline-none focus:ring-2 focus:ring-accent ${
                                    isSelected
                                      ? 'border-accent bg-accent-soft/30 ring-1 ring-accent'
                                      : 'border-line bg-bg hover:border-accent/40'
                                  }`}
                                >
                                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                    isSelected ? 'bg-accent text-bg' : 'bg-bg-sunk text-muted'
                                  }`}>
                                    <SubIcon className="h-4 w-4" aria-hidden="true" />
                                  </div>
                                  <div className="min-w-0">
                                    <span className="block text-sm font-semibold text-ink">{sub.label}</span>
                                    <span className="block text-xs text-muted-2 leading-snug">{sub.desc}</span>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          <label htmlFor="custom-use-case" className="text-xs font-medium text-muted">
                            Describe your own specifics:
                          </label>
                          <input
                            id="custom-use-case"
                            type="text"
                            ref={textInputRef}
                            className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                            placeholder="e.g. build a specific API client, translate research documents..."
                            value={(!allSubs.some(s => s.label === answer) && answer) || ''}
                            onChange={(e) => onTextChange(e?.target?.value ?? '')}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); onNext() }
                            }}
                            maxLength={120}
                            style={{ fontSize: 16 }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center justify-between gap-3 mt-2">
                  <span className="text-xs text-muted-2">Select a category above or press Continue to skip</span>
                  <Button variant="primary" size="sm" onClick={onNext}>Continue</Button>
                </div>
              </div>
            ) : question.type === 'text' ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{question.activeHelper}</p>
                <input
                  type="text"
                  ref={textInputRef}
                  className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  placeholder="e.g. building a frontend web application, formatting research citations... or skip ahead"
                  value={answer || ''}
                  onChange={(e) => onTextChange(e?.target?.value ?? '')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onNext()
                    }
                  }}
                  maxLength={120}
                  style={{ fontSize: 16 }}
                  autoFocus
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-2 transition-colors hover:text-muted">
                    Press Continue to skip this step
                  </span>
                  <Button variant="primary" size="sm" onClick={onNext}>
                    Continue →
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{question.activeHelper}</p>

                {question.id === 'goal' ? (
                  // Goal — visual icon cards in a 2×3 grid
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-1">
                    {question.options.map((opt) => {
                      const GoalIcon = opt.icon
                      const selected = Array.isArray(answer) && answer.includes(opt.id)
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onSelect(opt.id)}
                          className={`group relative flex flex-col gap-2.5 rounded-xl border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            selected
                              ? 'border-accent bg-accent-soft/20 shadow-sm ring-1 ring-accent'
                              : 'border-line bg-bg hover:border-accent/40 hover:shadow-sm'
                          }`}
                        >
                          {selected && (
                            <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-accent">
                              <Check className="h-2.5 w-2.5 text-bg" />
                            </span>
                          )}
                          <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                            selected
                              ? 'bg-accent text-bg'
                              : 'bg-bg-sunk text-muted group-hover:bg-accent-soft group-hover:text-accent-ink'
                          }`}>
                            <GoalIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <span className={`block text-sm font-semibold ${
                              selected ? 'text-accent-ink' : 'text-ink'
                            }`}>{opt.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted">{opt.desc}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  // Budget, Platform, Level — horizontal pill chips
                  <div className="flex max-w-full gap-2 overflow-x-auto pb-1.5 scrollbar-none sm:flex-wrap sm:overflow-visible">
                    {question.options.map((opt) => {
                      const selected = isMulti
                        ? Array.isArray(answer) && answer.includes(opt.id)
                        : answer === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onSelect(opt.id)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            selected
                              ? 'border-accent bg-accent-soft text-accent-ink scale-105'
                              : 'border-line bg-bg-elev text-ink hover:border-accent'
                          }`}
                          style={selected ? { animation: 'wf-select-pulse 0.2s ease-out' } : undefined}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                {isMulti ? (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-muted-2">
                      {selectedCount > 0
                        ? `${selectedCount} selected — pick more or continue`
                        : 'Pick all that apply'}
                    </span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onNext}
                      disabled={selectedCount === 0}
                    >
                      Continue
                    </Button>
                  </div>
                ) : (
                  <p className="pt-0.5 text-xs text-muted-2">
                    Pick one — we&apos;ll move to the next question automatically.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onActivate}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-2xl"
        >
          {header}
        </button>
      )}
    </div>
  )
}

function PreviewCard({ tool, rank }) {
  const navigate = useNavigate()
  const [showBreakdown, setShowBreakdown] = useState(false)
  const tierBits = [tool.pricing, tool.platformLabel].filter(Boolean).join(' · ')

  const breakdown = tool.match_breakdown || { category: true, budget: true, platform: true, experience: true }
  const confidence = tool.match_confidence || 85

  return (
    <div
      className="relative flex flex-col gap-2 rounded-xl border border-line bg-bg-elev p-3 hover:border-accent/40 transition-colors cursor-pointer"
      onClick={() => {
        try {
          window.posthog?.capture?.('tool_card_clicked', {
            tool_name: tool.name,
            tool_slug: tool.slug,
            category: tool.category,
            rank: rank,
            source: 'wizard_result',
          })
        } catch (e) {
          /* noop */
        }
        navigate(`/tools/${tool.slug || ''}`)
      }}
    >
      <div className="grid grid-cols-[36px_1fr_auto] items-start gap-3 w-full">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-bg-sunk" aria-hidden="true">
          <ToolLogo tool={tool} size={32} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            <span className="truncate font-semibold text-ink">{tool.name}</span>
            {tierBits ? <span className="truncate text-xs font-normal text-muted">{tierBits}</span> : null}
          </div>
          <p className="mt-1 text-sm italic leading-snug text-muted">
            <span className="mr-1.5 not-italic text-[11px] font-semibold uppercase tracking-wide text-accent-ink">why</span>
            {tool.reason || tool._reason}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-xs text-muted-2">#{rank}</span>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-ink shrink-0">
            {confidence}% Match
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-1 pt-2 border-t border-line/40 w-full text-[11px] text-muted-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowBreakdown(prev => !prev)
          }}
          className="hover:text-accent font-semibold transition"
        >
          {showBreakdown ? 'Hide details' : 'Why it matches →'}
        </button>

        {getToolUrl(tool) ? (
          <a
            href={getToolUrl(tool)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-accent font-medium hover:translate-x-0.5 transition-transform"
          >
            Explore →
          </a>
        ) : null}
      </div>

      {showBreakdown && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="mt-1.5 rounded-lg bg-bg-sunk/60 p-2.5 text-[11px] space-y-1 text-ink-2 border border-line/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-muted">Goal Alignment</span>
            <span className="font-medium text-accent-ink">{breakdown.category ? '✓ category match' : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Budget Fit</span>
            <span className="font-medium text-accent-ink">{breakdown.budget ? '✓ pricing match' : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Platforms Supported</span>
            <span className="font-medium text-accent-ink">{breakdown.platform ? '✓ OS compatibility' : '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Tech Difficulty</span>
            <span className="font-medium text-accent-ink">{breakdown.experience ? '✓ calibrated level' : '—'}</span>
          </div>
          {breakdown.use_case && (
            <div className="flex items-center justify-between">
              <span className="text-muted">Specific Task</span>
              <span className="font-medium text-accent-ink">✓ targeted fit</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ResultCard({ tool, index, navigate }) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const isTopMatch = index === 0
  const tierBits = [tool.pricing, tool.platformLabel].filter(Boolean).join(' · ')
  const breakdown = tool.match_breakdown || { category: true, budget: true, platform: true, experience: true }
  const confidence = tool.match_confidence || 85

  return (
    <article
      onClick={() => navigate(`/tools/${tool.slug || ''}`)}
      className="group relative flex h-full min-w-0 flex-col rounded-2xl border border-line bg-bg-elev p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-bg-sunk" aria-hidden="true">
            <ToolLogo tool={tool} size={36} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-ink">{tool.name}</h3>
              {isTopMatch && (
                <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent-ink">★ Best</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted">{tool.category || 'General'}</p>
          </div>
        </div>

        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-ink shrink-0">
          {confidence}% Match
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-xs italic leading-snug text-muted">✨ {tool.reason || tool._reason}</p>
      <p className="mt-2 line-clamp-2 text-sm leading-snug text-ink-2">{tool.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getPricingPillClass(tool.pricing)}`}>
          {String(tool.pricing || 'Free').toUpperCase()}
        </span>
        <span className="inline-flex items-center rounded-full bg-bg-sunk px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-2 ring-1 ring-inset ring-line">
          {String(tool.platformLabel || 'Web').toUpperCase()}
        </span>
      </div>

      {/* Breakdown trigger */}
      <div className="flex items-center justify-between mt-auto pt-4 border-t border-line/45 w-full text-xs text-muted-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowBreakdown(prev => !prev)
          }}
          className="hover:text-accent font-semibold transition"
        >
          {showBreakdown ? 'Hide details' : 'Why this fits →'}
        </button>

        <a
          href={getToolUrl(tool)}
          target="_blank"
          rel={OUTBOUND_REL}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-accent font-semibold hover:opacity-85 transition-opacity"
        >
          Visit Tool
        </a>
      </div>

      {showBreakdown && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className="mt-3 rounded-xl bg-bg-sunk/45 p-3 border border-line/25 text-[11px] leading-relaxed text-ink-2"
        >
          <div className="mb-2 font-semibold uppercase tracking-wider text-[9px] text-muted-2">Fit Analysis</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="flex items-center gap-2">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${breakdown.category ? 'bg-accent-soft text-accent-ink' : 'bg-bg-elev text-muted-2'}`}>
                {breakdown.category ? '✓' : '—'}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">Goal Alignment</p>
                <p className="text-[10px] text-muted truncate">{breakdown.category ? 'Category match' : 'No match'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${breakdown.budget ? 'bg-accent-soft text-accent-ink' : 'bg-bg-elev text-muted-2'}`}>
                {breakdown.budget ? '✓' : '—'}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">Pricing Plan</p>
                <p className="text-[10px] text-muted truncate">{breakdown.budget ? 'Budget match' : 'No match'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${breakdown.platform ? 'bg-accent-soft text-accent-ink' : 'bg-bg-elev text-muted-2'}`}>
                {breakdown.platform ? '✓' : '—'}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">Platforms</p>
                <p className="text-[10px] text-muted truncate">{breakdown.platform ? 'OS compatible' : 'Incompatible'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${breakdown.experience ? 'bg-accent-soft text-accent-ink' : 'bg-bg-elev text-muted-2'}`}>
                {breakdown.experience ? '✓' : '—'}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-ink truncate">Tech Difficulty</p>
                <p className="text-[10px] text-muted truncate">{breakdown.experience ? 'Calibrated level' : 'Uncalibrated'}</p>
              </div>
            </div>

            {breakdown.use_case && (
              <div className="col-span-2 flex items-center gap-2 border-t border-line/20 pt-2 mt-1">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[9px] font-bold text-accent-ink">
                  ✓
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-ink truncate">Custom Use-Case</p>
                  <p className="text-[10px] text-muted truncate">Targeted task fit</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  )
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse items-start gap-3 rounded-xl border border-line bg-bg-elev p-3">
          <div className="h-9 w-9 flex-shrink-0 rounded-lg bg-bg-sunk" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3 w-2/3 rounded bg-bg-sunk" />
            <div className="h-2 w-full rounded bg-bg-sunk" />
            <div className="h-2 w-4/5 rounded bg-bg-sunk" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LivePreview({ answers, results, loading, error, canSeeResults, onSeeResults }) {
  const persona = buildPersona(answers)
  const top3 = results.slice(0, 3)
  const remaining = Math.max(0, results.length - 3)
  const hasResults = top3.length > 0

  return (
    <aside className="self-start rounded-2xl border border-line bg-bg-elev p-5 sm:p-6 lg:sticky lg:top-24">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Live preview</span>
        {hasResults ? (
          <span className="text-xs text-muted">{top3.length} of {results.length} shown</span>
        ) : null}
      </div>

      {persona ? (
        <p className="mb-5 rounded-lg border border-dashed border-line-strong bg-bg-sunk px-3 py-2.5 text-sm leading-relaxed text-ink-2">
          {persona}
        </p>
      ) : (
        <p className="mb-5 text-sm text-muted">Pick a few answers and we&apos;ll show your top picks here.</p>
      )}

      {error ? (
        <p className="rounded-lg border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          Couldn&apos;t fetch preview. Try again in a moment.
        </p>
      ) : loading && !hasResults ? (
        <SkeletonRows />
      ) : hasResults ? (
        <div className="flex flex-col gap-3">
          {top3.map((tool, index) => (
            <PreviewCard key={tool.slug || tool.name || index} tool={tool} rank={index + 1} />
          ))}
        </div>
      ) : persona ? (
        <p className="text-sm text-muted">No matches yet — try widening your answers.</p>
      ) : null}

      {hasResults ? (
        <div className="mt-4 flex flex-col gap-2">
          {remaining > 0 ? (
            <span className="text-xs text-muted">+ {remaining} more in the full result</span>
          ) : null}
          <Button
            variant="primary"
            size="sm"
            onClick={onSeeResults}
            disabled={!canSeeResults}
            className="w-full"
            title={canSeeResults ? undefined : 'Pick a goal and your level first'}
          >
            See full results →
          </Button>
        </div>
      ) : null}
    </aside>
  )
}

function ToolFinderPage() {
  const navigate = useNavigate()
  const [hasStarted, setHasStarted] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState(null)
  const [viewMode, setViewMode] = useState('wizard')
  const [selectedStackId, setSelectedStackId] = useState('custom')
  const [answers, setAnswers] = useState({ goal: [], use_case: '', budget: '', platform: [], level: '' })
  const [results, setResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [savingStack, setSavingStack] = useState(false)
  const [error, setError] = useState('')
  const [aspectBucket, setAspectBucket] = useState(getAspectBucket)
  const [pendingCompletion, setPendingCompletion] = useState(null)
  const [pendingStackSwitch, setPendingStackSwitch] = useState(false)
  const wizardStartedRef = useRef(false)
  const wizardCompletedRef = useRef(false)
  const useCaseInputRef = useRef(null)

  const canSeeResults = (
    (Array.isArray(answers.goal) ? answers.goal.length > 0 : Boolean(answers.goal))
    && Boolean(answers.level)
  )


  useEffect(() => {
    const onResize = () => {
      setAspectBucket(getAspectBucket())
    }

    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (window.posthog) {
      window.posthog.capture('$pageview')
    }
  }, [])

  // Safely clear use_case if it's no longer mapped to the selected goals
  useEffect(() => {
    if (!answers.goal || answers.goal.length === 0) {
      if (answers.use_case) {
        setAnswers(prev => ({ ...prev, use_case: '' }))
      }
      return
    }

    const validSubLabels = answers.goal.flatMap(g => SUB_CATEGORIES[g] || []).map(sub => sub.label)
    const allSubCategoryLabels = Object.values(SUB_CATEGORIES).flatMap(subs => subs).map(sub => sub.label)

    if (answers.use_case && allSubCategoryLabels.includes(answers.use_case) && !validSubLabels.includes(answers.use_case)) {
      setAnswers(prev => ({ ...prev, use_case: '' }))
    }
  }, [answers.goal])

  let user = null
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch {
    user = null
  }
  const isLoggedIn = Boolean(user)

  // Debounced live-preview fetch — fires whenever answers change.
  useEffect(() => {
    const hasGatingAnswer = (
      (Array.isArray(answers.goal) ? answers.goal.length > 0 : Boolean(answers.goal))
      || Boolean(answers.budget)
      || (Array.isArray(answers.platform) ? answers.platform.length > 0 : Boolean(answers.platform))
      || Boolean(answers.level)
    )
    if (!hasGatingAnswer) {
      setResults([])
      setError('')
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoadingResults(true)
      setError('')
      try {
        const API = import.meta.env.VITE_API_URL || ''
        const response = await fetch(`${API}/api/v1/finder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(answers),
          signal: controller.signal,
        })
        const responsePayload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(responsePayload.error || 'Unable to generate preview right now.')
        }
        const tools = Array.isArray(responsePayload?.tools) ? responsePayload.tools.map(normalizeTool) : []
        if (!controller.signal.aborted) {
          setResults(tools)
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Unable to generate preview right now.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingResults(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [answers])

  useEffect(() => {
    if (!loadingResults && results.length === 0 && canSeeResults && !error) {
      const event = new CustomEvent('ai-compass-proactive-help', {
        detail: {
          message: 'No tools match your exact stack criteria? Visit our Help Center or submit feedback for tailored assistance.'
        }
      })
      window.dispatchEvent(event)
    }
  }, [loadingResults, results.length, canSeeResults, error])

  const handleStartWizard = () => {
    if (wizardStartedRef.current) return
    wizardStartedRef.current = true
    captureWizardEvent('wizard_started')
    setHasStarted(true)
    setActiveQuestion('goal')
  }

  const writeAnswer = (key, value) => {
    setAnswers((previous) => ({
      ...previous,
      [key]: key === 'use_case' ? normalizeOptionalText(value) : value,
    }))
  }

  const trackStepCompletion = (question, answerSelected) => {
    captureWizardEvent('wizard_step_completed', {
      step_number: QUESTION_FLOW.indexOf(question.id) + 1,
      question_title: question.activeHeading,
      answer_selected: answerSelected,
    })
  }

  // Move focus to the next unanswered question (or finish). Guarded so a
  // late auto-advance can't yank the user if they've already moved on.
  const goToQuestionAfter = (question, answerSelected, nextAnswers = answers) => {
    const i = QUESTION_FLOW.indexOf(question.id)
    const next = QUESTIONS[i + 1]
    trackStepCompletion(question, answerSelected)
    if (!next) {
      setPendingCompletion({ answers: snapshotAnswers(nextAnswers) })
    }
    setActiveQuestion((prev) => (prev === question.id ? (next ? next.id : null) : prev))
  }

  const handleQuestionSelect = (question, value) => {
    if (question.multiSelect) {
      // Multi-select: toggle only — the user taps several, then "Continue".
      setAnswers((previous) => {
        const current = Array.isArray(previous[question.id]) ? previous[question.id] : []
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value]
        return { ...previous, [question.id]: next }
      })
      return
    }
    // Single-select: record, let the highlight register, then auto-advance.
    const nextAnswers = { ...answers, [question.id]: value }
    writeAnswer(question.id, value)
    window.setTimeout(() => goToQuestionAfter(question, value, nextAnswers), 280)
  }

  const handleQuestionContinue = (question) => {
    try {
      const selectedAnswer = question.type === 'text'
        ? normalizeOptionalText(useCaseInputRef.current?.value ?? answers?.[question.id] ?? '')
        : answers?.[question.id]

      goToQuestionAfter(question, selectedAnswer ?? (question.type === 'text' ? '' : selectedAnswer), answers)
    } catch (error) {
      console.error('Wizard Step 2 transition failed:', {
        error,
        message: error?.message,
        stack: error?.stack,
      })
      toast.error('Could not continue. Please try again.')
    }
  }

  const handleRestart = () => {
    wizardStartedRef.current = false
    wizardCompletedRef.current = false
    setSelectedStackId('custom')
    setAnswers({ goal: [], use_case: '', budget: '', platform: [], level: '' })
    setResults([])
    setError('')
    setPendingCompletion(null)
    setPendingStackSwitch(false)
    setHasStarted(false)
    setActiveQuestion(null)
    setViewMode('wizard')
  }

  const handlePredefinedStack = (stackId) => {
    setSelectedStackId(stackId)
    if (stackId === 'custom') {
      handleRestart()
      setHasStarted(true)
      setActiveQuestion('goal')
      return
    }
    const stack = PREDEFINED_STACKS.find((s) => s.id === stackId)
    if (stack && stack.answers) {
      wizardStartedRef.current = true
      setHasStarted(true)
      setAnswers(stack.answers)
      setActiveQuestion(null)
      // Switch to results view once the fetch completes (handled by the
      // useEffect below that watches loadingResults + results).
      // We flag our intent here so the watcher knows to flip the view.
      setPendingStackSwitch(true)
    }
  }

  useEffect(() => {
    if (!pendingCompletion || loadingResults || results.length === 0 || wizardCompletedRef.current) {
      return
    }

    wizardCompletedRef.current = true
    captureWizardEvent('wizard_completed', {
      total_steps: TOTAL_QUESTIONS,
      answers: pendingCompletion.answers,
    })
    setPendingCompletion(null)
  }, [loadingResults, pendingCompletion, results.length])

  // When a predefined stack template is selected, wait for the fetch to finish
  // and then switch to the results view. If no results come back, stay in the
  // wizard so the user can tweak their answers instead of seeing a blank screen.
  useEffect(() => {
    if (!pendingStackSwitch || loadingResults) return
    setPendingStackSwitch(false)
    if (results.length > 0) {
      setViewMode('results')
    } else {
      toast.error('No tools matched this stack — try adjusting the answers.')
    }
  }, [pendingStackSwitch, loadingResults, results.length])

  const handleSaveStack = async () => {
    if (!user) {
      toast.error('Please login to save your stack')
      setTimeout(() => {
        navigate('/login')
      }, 1500)
      return
    }

    setSavingStack(true)

    try {
      const API = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${API}/api/v1/stack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          // dashboard renders these as strings; flatten arrays for backward compat
          goal: Array.isArray(answers.goal) ? answers.goal.join(', ') : answers.goal,
          budget: answers.budget,
          platform: Array.isArray(answers.platform) ? answers.platform.join(', ') : answers.platform,
          level: answers.level,
          tools: results.map((tool) => tool.slug || tool.name),
        }),
      })

      if (response.ok) {
        toast.success('Stack saved to your dashboard!')
      } else {
        toast.error('Could not save stack, try again')
      }
    } catch {
      toast.error('Could not save stack, try again')
    } finally {
      setSavingStack(false)
    }
  }

  if (viewMode === 'results') {
    const resultsMaxW = aspectBucket === 'ultrawide' ? 'max-w-7xl' : aspectBucket === 'portrait' ? 'max-w-4xl' : 'max-w-6xl'

    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className={`mx-auto w-full ${resultsMaxW}`}>
          <div className="rounded-2xl border border-line bg-bg-elev px-4 py-3 sm:px-5">
            <h2 className="text-xl font-semibold text-ink sm:text-2xl">{results.length} tools picked for you</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleRestart}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Start over
              </Button>

              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => {
                  setViewMode('wizard')
                  setActiveQuestion(null)
                }}
              >
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                Refine answers
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveStack}
                disabled={savingStack || results.length === 0}
                title={isLoggedIn ? undefined : 'Log in to save'}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {savingStack ? 'Saving...' : isLoggedIn ? 'Save stack' : 'Log in to save'}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((tool, index) => (
              <ResultCard
                key={tool.slug || tool.name || index}
                tool={tool}
                index={index}
                navigate={navigate}
              />
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <SEO
        title="AI Stack Architect | AI Compass"
        description="Design your custom AI stack. Answer a few questions to get hand-picked, verified tools matching your exact major, budget, and platforms."
      />
      <section className="rounded-3xl border border-line bg-bg-elev p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl"><WordReveal>AI Stack Architect</WordReveal></h1>
            <p className="mt-2 text-sm text-muted sm:text-base">
              {hasStarted 
                ? `Answer ${TOTAL_QUESTIONS} quick questions — pick an option and we'll move you to the next automatically.`
                : "Choose a template stack to instantly discover tools, or build your own custom stack."}
            </p>
          </div>
          {hasStarted && (
            <div className="sm:w-[260px] shrink-0 flex justify-end">
              <Button variant="secondary" onClick={handleRestart} size="sm">
                <RotateCcw className="mr-2 h-4 w-4" /> Start Over
              </Button>
            </div>
          )}
        </div>

        {!hasStarted ? (
          <TemplateGallery onSelect={handlePredefinedStack} />
        ) : (
          <>
            <style>{`
              @keyframes wf-select-pulse {
                0%   { transform: scale(1); }
                50%  { transform: scale(1.06); }
                100% { transform: scale(1.05); }
              }
            `}</style>
            <WizardProgress answers={answers} />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.2fr] md:gap-8">
            <div className="flex flex-col gap-3">
              {QUESTIONS.map((question, idx) => (
                <QuestionRow
                  key={question.id}
                  index={idx + 1}
                  question={question}
                  answer={answers[question.id]}
                  isActive={activeQuestion === question.id}
                  onActivate={() => setActiveQuestion(question.id)}
                  onSelect={(value) => handleQuestionSelect(question, value)}
                  onTextChange={(value) => writeAnswer(question.id, value)}
                  onNext={() => handleQuestionContinue(question)}
                  textInputRef={question.id === 'use_case' ? useCaseInputRef : undefined}
                  selectedGoals={answers.goal}
                />
              ))}

            {hasStarted && !activeQuestion ? (
              <div className="rounded-2xl border border-accent/40 bg-accent-soft/40 p-4">
                <p className="text-sm font-semibold text-ink">You&apos;re all set ✓</p>
                <p className="mt-0.5 text-sm text-muted">
                  {canSeeResults
                    ? 'Your matches are ready — open the full list whenever you want.'
                    : 'Pick a goal and your level above to unlock your full results.'}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-3"
                  disabled={!canSeeResults}
                  onClick={() => setViewMode('results')}
                >
                  See full results →
                </Button>
              </div>
            ) : null}
          </div>

          <LivePreview
            answers={answers}
            results={results}
            loading={loadingResults}
            error={error}
            canSeeResults={canSeeResults}
            onSeeResults={() => setViewMode('results')}
          />
        </div>
          </>
        )}

      </section>
    </div>
  )
}

export default ToolFinderPage
