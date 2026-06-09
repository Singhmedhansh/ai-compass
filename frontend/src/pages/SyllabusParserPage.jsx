import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { Upload, FileText, CheckCircle, Share2, Clipboard, ArrowRight, Loader2, Sparkles, BookOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, Card, WordReveal } from '../components/ui'
import ToolLogo from '../components/ui/ToolLogo'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

export default function SyllabusParserPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [rawText, setRawText] = useState('')
  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'text'
  const [status, setStatus] = useState('idle') // 'idle' | 'extracting' | 'analyzing' | 'matching' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const [result, setResult] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [copied, setCopied] = useState(false)
  
  const fileInputRef = useRef(null)

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0]
      const ext = droppedFile.name.split('.').pop().toLowerCase()
      if (['pdf', 'docx', 'txt', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        setFile(droppedFile)
      } else {
        setErrorMessage('Unsupported file type. Please upload a PDF, DOCX, TXT, PNG, JPG, JPEG, or WEBP file.')
      }
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const triggerUpload = () => {
    fileInputRef.current?.click()
  }

  const handleSyllabusParse = async () => {
    if (activeTab === 'upload' && !file) {
      setErrorMessage('Please select a file to parse.')
      return
    }
    if (activeTab === 'text' && !rawText.trim()) {
      setErrorMessage('Please enter syllabus text.')
      return
    }

    setErrorMessage('')
    setStatus('extracting')

    const formData = new FormData()
    if (activeTab === 'upload') {
      formData.append('file', file)
    } else {
      formData.append('text', rawText)
    }

    const API = import.meta.env.VITE_API_URL || ''
    
    // Simulate steps for clean scanning experience
    setTimeout(() => {
      setStatus('analyzing')
    }, 1500)

    setTimeout(() => {
      setStatus('matching')
    }, 3200)

    try {
      const response = await fetch(`${API}/api/v1/parse-syllabus`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Server error parsing syllabus.')
      }

      const data = await response.json()
      setResult(data)
      setStatus('success')
    } catch (err) {
      console.error(err)
      setErrorMessage(err.message || 'Something went wrong during syllabus analysis.')
      setStatus('error')
    }
  }

  const handleCopyLink = () => {
    if (!result) return
    const link = `${window.location.origin}/shared-toolkit/${result.share_id}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveToProfile = async () => {
    if (!result) return
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || 'null')
      if (!storedUser) {
        navigate('/login?redirect=/syllabus-parser')
        return
      }

      const API = import.meta.env.VITE_API_URL || ''
      const payload = {
        goal: result.subject_area || 'study',
        budget: 'freemium',
        platform: 'web',
        level: 'intermediate',
        tools: result.recommendations.map(r => r.slug),
      }

      const response = await fetch(`${API}/api/v1/stack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        alert('Toolkit successfully saved to your profile dashboard!')
      } else {
        throw new Error('Save failed')
      }
    } catch (err) {
      alert('Could not save toolkit. Please try again.')
    }
  }

  return (
    <>
      <Helmet>
        <title>Course Syllabus Parser — AI Semester Toolkit | AI Compass</title>
        <meta
          name="description"
          content="Upload your course syllabus PDF or Docx. Automatically scan your assignments, grading criteria, and tech requirements to build a personalized AI toolpack."
        />
      </Helmet>

      <div className="mx-auto max-w-5xl px-4 py-12 md:py-20">
        <section className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1.5 text-xs font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            AI Semester Toolpack Generator
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl">
            <WordReveal>Map your semester syllabus to AI</WordReveal>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
            Upload your syllabus file or paste its text. Our analyzer maps assignment topics, schedules, and exams to verified AI tools tailored to your classes.
          </p>
        </section>

        <AnimatePresence mode="wait">
          {status === 'idle' || status === 'error' ? (
            <MotionDiv
              key="uploader"
              variants={sectionReveal}
              initial="initial"
              animate="animate"
              exit="exit"
              className="rounded-2xl border border-line bg-bg-elev p-6 md:p-8"
            >
              <div className="mb-6 flex justify-center border-b border-line pb-1">
                <button
                  onClick={() => { setActiveTab('upload'); setErrorMessage(''); }}
                  className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${
                    activeTab === 'upload' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  Upload File
                </button>
                <button
                  onClick={() => { setActiveTab('text'); setErrorMessage(''); }}
                  className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${
                    activeTab === 'text' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  Paste Text
                </button>
              </div>

              {activeTab === 'upload' ? (
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={triggerUpload}
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 px-4 text-center cursor-pointer transition-all ${
                    dragActive ? 'border-accent bg-accent-soft/20' : 'border-line hover:border-line-strong bg-bg-sunk/30'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileChange}
                  />
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
                    <Upload className="h-7 w-7 text-accent-ink" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-ink">
                    {file ? file.name : 'Drag & drop your syllabus here'}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace` : 'Supports PDF, DOCX, TXT, PNG, JPG, JPEG, WEBP (Max 5MB)'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  <textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste your syllabus text here, including course description, grading policy, assignments, and schedule modules..."
                    className="rounded-xl border border-line bg-bg-sunk/30 p-4 text-sm text-ink outline-none focus:border-accent"
                  />
                </div>
              )}

              {errorMessage && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
                  {errorMessage}
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <Button
                  variant="primary"
                  className="w-full md:w-auto font-semibold"
                  onClick={handleSyllabusParse}
                  disabled={activeTab === 'upload' ? !file : !rawText.trim()}
                >
                  Analyze Syllabus <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </MotionDiv>
          ) : status === 'extracting' || status === 'analyzing' || status === 'matching' ? (
            <MotionDiv
              key="loader"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col items-center justify-center rounded-2xl border border-line bg-bg-elev p-12 text-center"
            >
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft/40">
                <Loader2 className="h-10 w-10 animate-spin text-accent-ink" />
                <div className="absolute inset-0 rounded-full border-2 border-accent/20 animate-ping" />
              </div>
              <h2 className="mt-6 text-xl font-bold text-ink">
                {status === 'extracting' && 'Extracting syllabus text...'}
                {status === 'analyzing' && 'Analyzing modules & requirements...'}
                {status === 'matching' && 'Matching with 400+ curated AI tools...'}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted">
                {status === 'extracting' && 'Reading syllabus text structures. This takes a couple of seconds.'}
                {status === 'analyzing' && 'Identifying coding projects, essay assignments, research labs, or math tasks...'}
                {status === 'matching' && 'Selecting high-quality freemium matching toolpacks and building explanations.'}
              </p>
              
              {/* Scanning visual timeline */}
              <div className="mt-8 flex w-full max-w-xs items-center justify-between relative">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-line -translate-y-1/2 z-0" />
                <div
                  className="absolute top-1/2 left-0 h-0.5 bg-accent -translate-y-1/2 z-0 transition-all duration-700"
                  style={{
                    width: status === 'extracting' ? '10%' : status === 'analyzing' ? '50%' : '90%'
                  }}
                />
                
                <div className={`h-6 w-6 rounded-full flex items-center justify-center z-10 transition-colors ${
                  status === 'extracting' ? 'bg-accent text-bg font-bold text-xs' : 'bg-accent text-bg font-bold text-xs'
                }`}>1</div>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center z-10 transition-colors ${
                  status === 'analyzing' || status === 'matching' ? 'bg-accent text-bg font-bold text-xs' : 'bg-line text-muted font-bold text-xs'
                }`}>2</div>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center z-10 transition-colors ${
                  status === 'matching' ? 'bg-accent text-bg font-bold text-xs' : 'bg-line text-muted font-bold text-xs'
                }`}>3</div>
              </div>
            </MotionDiv>
          ) : (
            <MotionDiv
              key="results"
              variants={sectionReveal}
              initial="initial"
              animate="animate"
              className="space-y-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-accent">{result?.subject_area} Toolkit</span>
                  <h2 className="mt-1 text-2xl font-bold text-ink">{result?.course_name}</h2>
                  <p className="mt-1 text-sm text-muted">
                    Matched {result?.recommendations?.length} tools based on syllabus technology requirements: {result?.technologies?.join(', ')}.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={handleCopyLink} className="font-semibold gap-2">
                    {copied ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Share2 className="h-4 w-4" />}
                    {copied ? 'Copied!' : 'Share Link'}
                  </Button>
                  <Button variant="primary" onClick={handleSaveToProfile} className="font-semibold gap-2">
                    <Clipboard className="h-4 w-4" /> Save Toolkit
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {result?.recommendations?.map((rec) => (
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
              </div>

              <div className="flex justify-center">
                <Button variant="secondary" onClick={() => setStatus('idle')} className="font-semibold">
                  Parse Another Syllabus
                </Button>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
