import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { Share2, CheckCircle, ArrowRight, Calendar, Clock, BookOpen, AlertCircle, ArrowLeft, CheckSquare, Square } from 'lucide-react'

import { Button, Card, SkeletonToolDetail } from '../components/ui'
import ToolLogo from '../components/ui/ToolLogo'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

export default function StudyPlanViewerPage() {
  const { shareId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [planData, setPlanData] = useState(null)
  const [copied, setCopied] = useState(false)
  const [checkedTasks, setCheckedTasks] = useState({})
  const [activeDay, setActiveDay] = useState(1)

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || ''
    
    async function fetchPlan() {
      try {
        setLoading(true)
        setError(false)
        const response = await fetch(`${API}/api/v1/study-plans/${shareId}`)
        if (!response.ok) {
          throw new Error('Failed to retrieve study plan')
        }
        const data = await response.json()
        setPlanData(data)
        
        // Load checked tasks from LocalStorage
        try {
          const stored = localStorage.getItem(`study_plan_${shareId}_tasks`)
          if (stored) {
            setCheckedTasks(JSON.parse(stored))
          }
        } catch (e) {
          console.error('Error loading task checkboxes:', e)
        }
      } catch (err) {
        console.error('Error fetching plan:', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchPlan()
  }, [shareId])

  const toggleTask = (dayNum, taskIndex) => {
    const key = `${dayNum}-${taskIndex}`
    const updated = {
      ...checkedTasks,
      [key]: !checkedTasks[key]
    }
    setCheckedTasks(updated)
    localStorage.setItem(`study_plan_${shareId}_tasks`, JSON.stringify(updated))
  }

  const handleCopyLink = () => {
    const link = window.location.href
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute h-10 w-10 animate-ping rounded-full bg-accent opacity-20" />
          <Calendar className="h-6 w-6 text-accent animate-pulse" />
        </div>
        <p className="mt-4 text-sm text-muted">Retrieving study plan...</p>
      </div>
    )
  }

  if (error || !planData) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
        <h3 className="mt-4 text-lg font-bold text-ink">Study Plan Not Found</h3>
        <p className="mt-2 text-sm text-muted">
          The study plan might have expired, been deleted, or the share link is invalid.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <Button variant="secondary" onClick={() => navigate('/study-plan')} className="font-semibold">
            Create New Plan
          </Button>
          <Button variant="primary" onClick={() => navigate('/tools')} className="font-semibold">
            Browse AI Tools
          </Button>
        </div>
      </div>
    )
  }

  const { plan } = planData
  const days = plan.days || []
  const currentDayData = days.find(d => d.day_number === activeDay) || days[0]

  return (
    <>
      <Helmet>
        <title>{`${plan.course_name} — Study Plan | AI Compass`}</title>
        <meta
          name="description"
          content={`View and track study tasks for ${plan.course_name}. Mapped spaced-repetition schedules with recommended AI tools.`}
        />
      </Helmet>

      <div className="mx-auto max-w-5xl px-4 py-8 md:py-16">
        <button
          onClick={() => navigate('/study-plan')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-6 transition"
        >
          <ArrowLeft className="h-4 w-4" /> Create New Plan
        </button>

        {/* Header Summary */}
        <section className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between rounded-2xl border border-line bg-bg-elev p-6 md:p-8 shadow-md relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-transparent pointer-events-none" />
          <div className="relative z-10">
            <span className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-ink mb-2">
              Spaced-Repetition Active Schedule
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{plan.course_name}</h1>
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold text-ink-2">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4 text-accent" /> {plan.duration_days} Days
              </span>
              <span className="w-px h-4 bg-line self-center" />
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-accent" /> {plan.hours_per_day} Hours / Day
              </span>
            </div>
          </div>
          <div className="relative z-10 flex gap-2 self-start md:self-auto">
            <Button variant="secondary" onClick={handleCopyLink} className="font-semibold gap-2">
              {copied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Share2 className="h-4 w-4" />}
              {copied ? 'Copied Link!' : 'Share Plan'}
            </Button>
          </div>
        </section>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr]">
          {/* Day Navigation Sidemenu */}
          <aside className="space-y-2 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3 px-2">Days</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-1">
              {days.map((d) => {
                const dayNum = d.day_number
                const isActive = activeDay === dayNum
                
                // Calculate day completion rate
                const tasksForDay = d.tasks || []
                const completedForDay = tasksForDay.filter((_, idx) => checkedTasks[`${dayNum}-${idx}`]).length
                const pct = tasksForDay.length ? (completedForDay / tasksForDay.length) * 100 : 0

                return (
                  <button
                    key={`nav-day-${dayNum}`}
                    onClick={() => setActiveDay(dayNum)}
                    className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition-all ${
                      isActive
                        ? 'border-accent bg-accent/10 text-accent font-bold'
                        : 'border-line bg-bg-elev/40 text-ink-2 hover:border-line-strong hover:bg-bg-elev'
                    }`}
                  >
                    <span className="text-sm">Day {dayNum}</span>
                    <span className="text-[10px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full bg-bg-sunk text-ink-2 border border-line">
                      {Math.round(pct)}%
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          {/* Active Day Content */}
          <main className="space-y-6">
            <AnimatePresence mode="wait">
              <MotionDiv
                key={`day-card-${activeDay}`}
                variants={sectionReveal}
                initial="initial"
                animate="animate"
                exit="exit"
                className="rounded-2xl border border-line bg-bg-elev p-6 md:p-8 shadow-sm space-y-6"
              >
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-accent border border-accent/20 bg-accent-soft px-2.5 py-0.5 rounded-full">
                    {currentDayData.spaced_repetition_phase}
                  </span>
                  <h2 className="mt-3 text-xl font-bold text-ink">Day {activeDay}: {currentDayData.title}</h2>
                </div>

                {/* Study Checklist */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Tasks Checklist</h3>
                  <div className="space-y-2">
                    {currentDayData.tasks && currentDayData.tasks.length > 0 ? (
                      currentDayData.tasks.map((task, idx) => {
                        const isChecked = Boolean(checkedTasks[`${activeDay}-${idx}`])
                        return (
                          <div
                            key={`task-${activeDay}-${idx}`}
                            onClick={() => toggleTask(activeDay, idx)}
                            className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-bg-sunk/30 border-line/60 opacity-60'
                                : 'border-line bg-bg-elev hover:border-line-strong'
                            }`}
                          >
                            <span className="mt-0.5 shrink-0 text-accent">
                              {isChecked ? <CheckSquare className="h-5 w-5 fill-accent/10" /> : <Square className="h-5 w-5" />}
                            </span>
                            <span className={`text-sm text-ink-2 ${isChecked ? 'line-through' : ''}`}>{task}</span>
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-sm text-muted">No tasks defined for today.</p>
                    )}
                  </div>
                </div>

                {/* Recommended AI Tools */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted mb-3">Recommended Tools</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {currentDayData.recommended_tools && currentDayData.recommended_tools.length > 0 ? (
                      currentDayData.recommended_tools.map((rec) => (
                        <div
                          key={`rec-${rec.slug}`}
                          className="group relative flex flex-col justify-between rounded-xl border border-line bg-bg-elev/40 p-4 hover:border-line-strong hover:bg-bg-elev transition"
                        >
                          <div>
                            <div className="flex items-center gap-3">
                              <ToolLogo tool={rec} size={36} />
                              <div>
                                <h4 className="text-sm font-bold text-ink group-hover:text-accent transition">
                                  {rec.name}
                                </h4>
                                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                                  {rec.category}
                                </span>
                              </div>
                            </div>
                            <p className="mt-2 text-xs text-muted line-clamp-2">{rec.tagline}</p>
                          </div>
                          <div className="mt-4 border-t border-line/60 pt-3 flex justify-end">
                            <a
                              href={`/tools/${rec.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-accent hover:underline"
                            >
                              Details Page <ArrowRight className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-2 rounded-xl border border-line bg-bg-sunk/30 p-4 text-center text-xs text-muted-2">
                        No specific AI tools recommended for today's tasks.
                      </div>
                    )}
                  </div>
                </div>
              </MotionDiv>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </>
  )
}
