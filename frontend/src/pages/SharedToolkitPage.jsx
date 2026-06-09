import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { BookOpen, Sparkles, ArrowRight, Loader2, RefreshCw } from 'lucide-react'

import { Button } from '../components/ui'
import ToolLogo from '../components/ui/ToolLogo'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

export default function SharedToolkitPage() {
  const { shareId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [data, setData] = useState(null)

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || ''
    
    async function loadSharedStack() {
      try {
        setLoading(true)
        setError(false)
        const response = await fetch(`${API}/api/v1/shared-toolkit/${shareId}`)
        if (!response.ok) {
          throw new Error('Shared toolkit not found')
        }
        const toolkit = await response.json()
        setData(toolkit)
      } catch (err) {
        console.error(err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    if (shareId) {
      loadSharedStack()
    }
  }, [shareId])

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
        <p className="mt-4 text-sm text-muted">Retrieving shared toolkit...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-ink">Toolkit not found</h2>
        <p className="mt-2 text-sm text-muted">
          This shared link may have expired or is incorrect. Try parsing your own syllabus to generate a new toolkit!
        </p>
        <Button variant="primary" className="mt-6 font-semibold" onClick={() => navigate('/syllabus-parser')}>
          Go to Syllabus Parser
        </Button>
      </div>
    )
  }

  return (
    <>
      <Helmet>
        <title>{data.course_name} Study Toolkit | AI Compass</title>
        <meta
          name="description"
          content={`Explore the curated AI student toolkit for ${data.course_name} (${data.subject_area}) containing hand-selected productivity, coding, or research tools.`}
        />
      </Helmet>

      <div className="mx-auto max-w-5xl px-4 py-12 md:py-20">
        <div className="mb-10 rounded-2xl border border-line bg-bg-elev p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-accent">Shared {data.subject_area} Toolkit</span>
            <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">{data.course_name}</h1>
            <p className="mt-2 text-sm text-muted">
              Curated resource stack created from course syllabus text and assignments.
            </p>
          </div>
          <div className="shrink-0">
            <Button variant="primary" className="font-semibold gap-2" onClick={() => navigate('/syllabus-parser')}>
              Parse Your Syllabus <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
        >
          {data.recommendations?.map((rec) => (
            <div
              key={rec.slug}
              className="group relative flex flex-col justify-between rounded-2xl border border-line bg-bg-elev/40 p-6 shadow-sm hover:border-line-strong hover:bg-bg-elev/80 transition-all duration-300"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ToolLogo tool={rec} size={40} />
                    <div>
                      <h3 className="font-bold text-ink group-hover:text-accent transition-colors">{rec.name}</h3>
                      <span className="text-xs text-muted">{rec.category}</span>
                    </div>
                  </div>
                  <span className="rounded-full bg-bg-sunk px-2.5 py-0.5 text-xs font-bold text-ink-2 border border-line">
                    {rec.pricing}
                  </span>
                </div>
                <p className="mt-4 text-sm text-muted line-clamp-2">{rec.tagline}</p>
                
                {/* Syllabus relevance bubble */}
                <div className="mt-4 rounded-xl border border-accent/20 bg-accent-soft/30 p-3.5">
                  <div className="flex gap-2">
                    <BookOpen className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                    <p className="text-xs leading-relaxed text-ink-2 font-medium">
                      <strong className="text-accent font-semibold">Syllabus Fit:</strong> {rec.custom_reason}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 border-t border-line/60 pt-4 flex justify-between items-center">
                <span className="text-xs font-bold text-muted-2">Rating: {rec.rating} ★</span>
                <button
                  onClick={() => navigate(`/tools/${rec.slug}`)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                >
                  Explore Tool details <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </MotionDiv>

        <div className="mt-12 text-center border-t border-line pt-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1.5 text-xs font-semibold text-accent mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Make your own toolkit
          </div>
          <h2 className="text-xl font-bold text-ink">Have your own syllabus file?</h2>
          <p className="mt-2 text-sm text-muted max-w-sm mx-auto">
            Drop your own PDF, Word document, or course code to find tools designed for your semester.
          </p>
          <Button variant="secondary" className="mt-6 font-semibold" onClick={() => navigate('/syllabus-parser')}>
            Try Syllabus Parser Free
          </Button>
        </div>
      </div>
    </>
  )
}
