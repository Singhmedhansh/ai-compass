import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import { AnimatedGrid, AnimatedItem } from '../components/AnimatedGrid'
import GuidesSection from '../components/GuidesSection'
import { Card, SkeletonCard } from '../components/ui'
import ParticleBackground from '../components/ui/ParticleBackground'

const MotionSection = motion.section
const MotionDiv = motion.div
const MotionLink = motion(Link)

const sectionReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: 'easeOut', staggerChildren: 0.08 },
  },
}

const cardReveal = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
}

const CATEGORIES = [
  { name: 'Coding', emoji: '💻' },
  { name: 'Writing', emoji: '✍️' },
  { name: 'Research', emoji: '🔍' },
  { name: 'Productivity', emoji: '⚡' },
  { name: 'Image Gen', emoji: '🎨' },
  { name: 'Video Gen', emoji: '🎬' },
]

const STEPS = [
  { step: '1', title: 'Browse Categories', detail: 'Explore curated categories across the AI landscape.' },
  { step: '2', title: 'Find Your Tools', detail: 'Compare ratings, pricing, and strengths side by side.' },
  { step: '3', title: 'Build Your Stack', detail: 'Save a personalized set of tools for daily work.' },
]

export default function HomePage() {
  const [tools, setTools] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/tools')
      .then((r) => r.json())
      .then((data) => {
        const allTools = Array.isArray(data) ? data : data.results || data.tools || []
        const featuredTools = allTools.filter(
          (t) => t.featured === true || t.featured === 1 || t.featured === 'true' || t.featured === '1'
        )
        const toNumber = (value) => Number(value || 0)
        const prioritized = (featuredTools.length ? featuredTools : allTools)
          .slice()
          .sort((a, b) => toNumber(b.rating) - toNumber(a.rating))
          .slice(0, 6)

        setTools(prioritized)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])



  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div
        className="relative overflow-hidden text-center py-20 px-4"
        style={{ backgroundColor: '#0a0a1a', minHeight: '400px' }}
      >
        <ParticleBackground />
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/4 w-80 h-80 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute top-32 right-1/4 w-64 h-64 rounded-full bg-purple-600/20 blur-3xl" />
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative z-[1] text-5xl font-bold text-white mb-4"
        >
          Find the perfect AI tool for your workflow
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="relative z-[1] text-gray-400 text-lg mb-8"
        >
          Discover, compare, and bookmark the best AI products for coding, writing, research, and daily execution.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="relative z-[1] flex gap-4 justify-center"
        >
          <Link
            to="/tools"
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-500 transition"
          >
            Browse All Tools
          </Link>
          <Link
            to="/ai-tool-finder"
            className="border border-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition"
          >
            Get My AI Stack
          </Link>
        </motion.div>
      </div>

      <GuidesSection />

      <MotionSection
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={sectionReveal}
        className="bg-gray-50 dark:bg-gray-950"
      >
        <div className="max-w-6xl mx-auto px-4 py-16">
          <motion.h2 variants={cardReveal} className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
            Featured Tools
          </motion.h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array(6)
                .fill(0)
                .map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <AnimatedGrid className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tools.map((tool) => (
                <AnimatedItem key={tool.slug || tool.name}>
                  <Card tool={tool} />
                </AnimatedItem>
              ))}
            </AnimatedGrid>
          )}
        </div>
      </MotionSection>

      <MotionSection
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        variants={sectionReveal}
        className="bg-gray-50 dark:bg-gray-950 py-16 px-4"
      >
        <div className="max-w-6xl mx-auto">
          <motion.h2 variants={cardReveal} className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
            Browse by Category
          </motion.h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORIES.map((category, index) => (
              <MotionLink
                key={category.name}
                to={`/tools?category=${encodeURIComponent(category.name)}`}
                variants={cardReveal}
                whileHover={{ y: -4, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20, delay: index * 0.03 }}
                className="rounded-lg border border-gray-200 bg-white p-4 text-center transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="text-3xl mb-2">{category.emoji}</div>
                <p className="font-semibold text-sm text-gray-900 dark:text-white">{category.name} →</p>
              </MotionLink>
            ))}
          </div>
        </div>
      </MotionSection>

      <MotionSection
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.25 }}
        variants={sectionReveal}
        className="bg-gray-50 dark:bg-gray-950 py-16 px-4"
      >
        <div className="max-w-6xl mx-auto">
          <motion.h2 variants={cardReveal} className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
            How it works
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((item, index) => (
              <motion.div
                key={item.title}
                variants={cardReveal}
                whileHover={{ y: -4, scale: 1.01 }}
                transition={{ duration: 0.4, delay: index * 0.12 }}
                className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="text-3xl font-bold text-indigo-600 mb-2">Step {item.step}</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">{item.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </MotionSection>
    </div>
  )
}
