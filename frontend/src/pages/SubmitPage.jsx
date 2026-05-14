import { useState } from 'react'

import Button from '../components/ui/Button'

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    setSubmitted(false)

    try {
      const response = await fetch('/api/v1/submit-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      })

      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to submit right now. Please try again.')
      }

      setSubmitted(true)
      setFormData(INITIAL_FORM)
    } catch (requestError) {
      setError(requestError.message || 'Unable to submit right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-ink">Submit a Tool</h1>
        <p className="mt-2 text-sm text-muted">
          Know an AI tool we&apos;re missing? Let us know.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-ink-2">
              Tool name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent"
              placeholder="e.g. Notion AI"
            />
          </div>

          <div>
            <label htmlFor="url" className="mb-1 block text-sm font-medium text-ink-2">
              Tool URL
            </label>
            <input
              id="url"
              name="url"
              type="text"
              required
              value={formData.url}
              onChange={handleChange}
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-ink-2">
              Category
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent"
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reason" className="mb-1 block text-sm font-medium text-ink-2">
              Why it&apos;s useful
            </label>
            <textarea
              id="reason"
              name="reason"
              rows={4}
              required
              value={formData.reason}
              onChange={handleChange}
              className="w-full rounded-lg border border-line bg-bg-elev px-3 py-2 text-sm text-ink placeholder:text-muted-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent"
              placeholder="Share what makes this tool helpful for students, creators, or developers..."
            />
          </div>

          <Button variant="primary" type="submit" disabled={submitting} className="font-semibold">
            {submitting ? 'Submitting...' : 'Submit'}
          </Button>
        </form>

        {submitted && (
          <div className="mt-4 rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm text-accent-ink">
            Thanks! Your submission has been received — we&apos;ll review and add it to the catalog if it&apos;s a good fit.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
      </section>
    </div>
  )
}
