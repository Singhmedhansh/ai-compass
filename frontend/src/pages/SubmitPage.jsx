import { useState } from 'react'
import { motion } from 'framer-motion'

import PageTransition from '../components/PageTransition'

const CATEGORIES = [
  'Writing & Chat',
  'Coding',
  'Image Generation',
  'Video Generation',
  'Audio & Voice',
  'Research',
  'Productivity',
  'Marketing',
  'Other',
]

const INITIAL_FORM = {
  name: '',
  url: '',
  category: 'Writing & Chat',
  reason: '',
}

export default function SubmitPage() {
  const [formData, setFormData] = useState(INITIAL_FORM)
  const [submitted, setSubmitted] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setFormData(INITIAL_FORM)
  }

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <motion.section
          className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Submit a Tool</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            Know an AI tool we&apos;re missing? Let us know.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Tool name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="e.g. Notion AI"
              />
            </div>

            <div>
              <label htmlFor="url" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Tool URL
              </label>
              <input
                id="url"
                name="url"
                type="text"
                required
                value={formData.url}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Category
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="reason" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
                Why it&apos;s useful
              </label>
              <textarea
                id="reason"
                name="reason"
                rows={4}
                required
                value={formData.reason}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                placeholder="Share what makes this tool helpful for students, creators, or developers..."
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Submit
            </button>
          </form>

          {submitted && (
            <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-600/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              Thanks! We&apos;ll review your submission.
            </div>
          )}
        </motion.section>
      </main>
    </PageTransition>
  )
}
