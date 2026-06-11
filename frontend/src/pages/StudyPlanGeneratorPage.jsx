import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { Upload, FileText, ArrowRight, Loader2, Sparkles, Plus, X, Calendar, Clock, BookOpen, GraduationCap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, Card, WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

export default function StudyPlanGeneratorPage() {
  const navigate = useNavigate()
  const [courseName, setCourseName] = useState('')
  const [file, setFile] = useState(null)
  const [rawText, setRawText] = useState('')
  const [activeTab, setActiveTab] = useState('upload') // 'upload' | 'text'
  const [durationDays, setDurationDays] = useState(7)
  const [hoursPerDay, setHoursPerDay] = useState(2)
  const [confidenceLevel, setConfidenceLevel] = useState('Intermediate')
  const [priorityInput, setPriorityInput] = useState('')
  const [priorityTopics, setPriorityTopics] = useState([])
  const [status, setStatus] = useState('idle') // 'idle' | 'extracting' | 'planning' | 'optimizing' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const [dragActive, setDragActive] = useState(false)
  
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

  const addPriorityTopic = () => {
    if (priorityInput.trim() && !priorityTopics.includes(priorityInput.trim())) {
      setPriorityTopics([...priorityTopics, priorityInput.trim()])
      setPriorityInput('')
    }
  }

  const removePriorityTopic = (topicToRemove) => {
    setPriorityTopics(priorityTopics.filter(t => t !== topicToRemove))
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addPriorityTopic()
    }
  }

  const handleGeneratePlan = async () => {
    setErrorMessage('')
    setStatus('extracting')

    const formData = new FormData()
    formData.append('course_name', courseName)
    formData.append('duration_days', durationDays.toString())
    formData.append('hours_per_day', hoursPerDay.toString())
    formData.append('confidence_level', confidenceLevel)
    formData.append('priority_topics', priorityTopics.join(', '))

    if (activeTab === 'upload' && file) {
      formData.append('syllabus_file', file)
    } else {
      formData.append('topics', rawText)
    }

    const API = import.meta.env.VITE_API_URL || ''
    
    // Smooth scanning visualization
    setTimeout(() => {
      setStatus('planning')
    }, 1500)

    setTimeout(() => {
      setStatus('optimizing')
    }, 3200)

    try {
      const response = await fetch(`${API}/api/v1/generate-study-plan`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Server error creating plan.')
      }

      const data = await response.json()
      setStatus('success')
      navigate(`/study-plan/${data.share_id}`)
    } catch (err) {
      console.error(err)
      setErrorMessage(err.message || 'Something went wrong during plan generation.')
      setStatus('error')
    }
  }

  return (
    <>
      <Helmet>
        <title>Spaced-Repetition Study Plan Generator | AI Compass</title>
        <meta
          name="description"
          content="Generate a customized spaced-repetition study plan mapped to AI tools in AI Compass. Upload your syllabus or topics, set daily hours, and focus priority items."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl px-4 py-12 md:py-20">
        <section className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-elev px-3 py-1.5 text-xs font-semibold text-accent">
            <GraduationCap className="h-3.5 w-3.5" />
            AI Learning Companion
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl">
            <WordReveal>Spaced-Repetition Plan Generator</WordReveal>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted sm:text-lg">
            Create an optimized cognitive study schedule tailored to your exact constraints, focusing on hard topics and linking tools on AI Compass.
          </p>
        </section>

        <AnimatePresence mode="wait">
          {status === 'idle' || status === 'error' ? (
            <MotionDiv
              key="form"
              variants={sectionReveal}
              initial="initial"
              animate="animate"
              exit="exit"
              className="rounded-2xl border border-line bg-bg-elev p-6 md:p-8 space-y-6"
            >
              {/* Course Title */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1.5">Course / Exam Title</label>
                <input
                  type="text"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="e.g. CS201: Algorithms & Data Structures"
                  className="w-full rounded-xl border border-line bg-bg-sunk/30 px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
                />
              </div>

              {/* Upload or Text Content */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1.5">Syllabus or Topics Source</label>
                <div className="mb-4 flex border-b border-line pb-1">
                  <button
                    type="button"
                    onClick={() => { setActiveTab('upload'); setErrorMessage(''); }}
                    className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${
                      activeTab === 'upload' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    Upload Syllabus File
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('text'); setErrorMessage(''); }}
                    className={`px-4 py-2 text-sm font-bold transition-all border-b-2 ${
                      activeTab === 'text' ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    Paste Curriculum Text
                  </button>
                </div>

                {activeTab === 'upload' ? (
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={triggerUpload}
                    className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 px-4 text-center cursor-pointer transition-all ${
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
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
                      <Upload className="h-6 w-6 text-accent-ink" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-ink">
                      {file ? file.name : 'Drag & drop syllabus here'}
                    </p>
                    <p className="mt-1.5 text-xs text-muted">
                      {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Supports PDF, Word, TXT, or syllabus images (PNG, JPG, JPEG) up to 5MB'}
                    </p>
                  </div>
                ) : (
                  <textarea
                    rows={5}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Enter main course topics, lecture points, or test outline..."
                    className="w-full rounded-xl border border-line bg-bg-sunk/30 p-4 text-sm text-ink outline-none focus:border-accent"
                  />
                )}
              </div>

              {/* Priority Topics Tag Input */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1.5">Priority / High Difficulty Topics</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={priorityInput}
                    onChange={(e) => setPriorityInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="e.g. Binary Search Trees (Press Enter to add)"
                    className="flex-1 rounded-xl border border-line bg-bg-sunk/30 px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
                  />
                  <Button variant="secondary" onClick={addPriorityTopic} className="px-4">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                {priorityTopics.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {priorityTopics.map((topic) => (
                      <span
                        key={topic}
                        className="inline-flex items-center gap-1 rounded-full bg-accent-soft border border-accent/20 px-3 py-1 text-xs font-semibold text-accent-ink"
                      >
                        {topic}
                        <button
                          type="button"
                          onClick={() => removePriorityTopic(topic)}
                          className="hover:text-red-500 rounded-full"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Duration Slider and Hours Slider */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-line/60 bg-bg-sunk/20 p-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-ink flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-accent" /> Plan Duration
                    </label>
                    <span className="text-sm font-bold text-accent">{durationDays} days</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={30}
                    value={durationDays}
                    onChange={(e) => setDurationDays(parseInt(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-muted-2 mt-1">
                    <span>3 days</span>
                    <span>30 days</span>
                  </div>
                </div>

                <div className="rounded-xl border border-line/60 bg-bg-sunk/20 p-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-ink flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-accent" /> Daily Study Limit
                    </label>
                    <span className="text-sm font-bold text-accent">{hoursPerDay} hours/day</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={hoursPerDay}
                    onChange={(e) => setHoursPerDay(parseInt(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-muted-2 mt-1">
                    <span>1 hour</span>
                    <span>8 hours</span>
                  </div>
                </div>
              </div>

              {/* Confidence Level */}
              <div>
                <label className="block text-sm font-bold text-ink mb-1.5">Current Understanding / Confidence</label>
                <select
                  value={confidenceLevel}
                  onChange={(e) => setConfidenceLevel(e.target.value)}
                  className="w-full rounded-xl border border-line bg-bg-sunk/30 px-4 py-2.5 text-sm text-ink outline-none focus:border-accent appearance-none cursor-pointer"
                >
                  <option value="Beginner">Beginner (Need deep explanations and starter guides)</option>
                  <option value="Intermediate">Intermediate (Ready for practice problems and active review)</option>
                  <option value="Reviewing">Reviewing (Fast recap, summary cards, and exam simulations)</option>
                </select>
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
                  {errorMessage}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  className="w-full md:w-auto font-semibold"
                  onClick={handleGeneratePlan}
                  disabled={!courseName.trim()}
                >
                  Generate Study Plan <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </MotionDiv>
          ) : (
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
                {status === 'extracting' && 'Reading syllabus inputs...'}
                {status === 'planning' && 'Scheduling spaced repetitions...'}
                {status === 'optimizing' && 'Mapping tools on AI Compass...'}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted">
                {status === 'extracting' && 'Processing topics, prioritizing key inputs, and scanning images.'}
                {status === 'planning' && 'Structuring initial learning phases, active recalls, and reviews.'}
                {status === 'optimizing' && 'Finding matches inside the directory and validating tool slugs.'}
              </p>
              
              <div className="mt-8 flex w-full max-w-xs items-center justify-between relative">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-line -translate-y-1/2 z-0" />
                <div
                  className="absolute top-1/2 left-0 h-0.5 bg-accent -translate-y-1/2 z-0 transition-all duration-700"
                  style={{
                    width: status === 'extracting' ? '10%' : status === 'planning' ? '50%' : '90%'
                  }}
                />
                
                <div className="h-6 w-6 rounded-full bg-accent text-bg font-bold text-xs flex items-center justify-center z-10">1</div>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center z-10 transition-colors ${
                  status === 'planning' || status === 'optimizing' ? 'bg-accent text-bg font-bold text-xs' : 'bg-line text-muted font-bold text-xs'
                }`}>2</div>
                <div className={`h-6 w-6 rounded-full flex items-center justify-center z-10 transition-colors ${
                  status === 'optimizing' ? 'bg-accent text-bg font-bold text-xs' : 'bg-line text-muted font-bold text-xs'
                }`}>3</div>
              </div>
            </MotionDiv>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
