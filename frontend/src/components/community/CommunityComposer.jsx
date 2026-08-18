import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Loader2, Tag, X } from 'lucide-react'

import Button from '../ui/Button'

const POST_TYPES = [
  { value: 'discussion', label: 'Discussion' },
  { value: 'question', label: 'Question' },
  { value: 'news', label: 'News' },
  { value: 'showcase', label: 'Showcase' },
]

function ToolTagPicker({ tool, onSelect, onClear }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/suggestions?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        if (res.ok) {
          const data = await res.json()
          setSuggestions((Array.isArray(data) ? data : []).filter((item) => item.type === 'tool' && item.slug))
        }
      } catch {
        // suggestions are best-effort
      }
    }, 200)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [query])

  if (tool) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">
        <Tag className="h-3 w-3" /> {tool.label}
        <button type="button" onClick={onClear} aria-label="Remove tagged tool" className="ml-0.5">
          <X className="h-3 w-3" />
        </button>
      </span>
    )
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setShowDropdown(true)
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Tag a tool (optional)"
        className="w-48 rounded-full border border-line bg-bg-elev px-3 py-1 text-xs text-ink outline-none transition placeholder:text-muted hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
      />
      {showDropdown && query.trim().length >= 2 && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-bg-elev shadow-lg">
          {suggestions.map((item) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => {
                onSelect({ slug: item.slug, label: item.label })
                setQuery('')
                setSuggestions([])
                setShowDropdown(false)
              }}
              className="block w-full truncate px-3 py-2 text-left text-xs text-ink hover:bg-bg-sunk"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CommunityComposer({ isLoggedIn, toolSlug = null, onCreated, onCancel }) {
  const location = useLocation()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [postType, setPostType] = useState('discussion')
  const [taggedTool, setTaggedTool] = useState(toolSlug ? { slug: toolSlug, label: toolSlug } : null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-accent bg-accent-soft p-3 text-sm">
        <p className="font-medium text-accent-ink">Log in to start a discussion</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            to="/login"
            state={{ from: location.pathname }}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
          >
            Log In
          </Link>
          <Link
            to="/register"
            state={{ from: location.pathname }}
            className="rounded-lg border border-accent px-3 py-1.5 text-xs font-semibold text-accent-ink outline-none transition hover:bg-bg-elev focus-visible:ring-2 focus-visible:ring-accent"
          >
            Register Free
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async () => {
    if (title.trim().length < 5) {
      setError('Title must be at least 5 characters')
      return
    }
    if (body.trim().length < 10) {
      setError('Body must be at least 10 characters')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/v1/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, post_type: postType, tool_slug: taggedTool?.slug || null }),
        credentials: 'include',
      })
      const data = await response.json()

      if (data.success) {
        setTitle('')
        setBody('')
        setPostType('discussion')
        if (!toolSlug) setTaggedTool(null)
        onCreated?.(data.id)
      } else if (data.error) {
        setError(data.error)
      }
    } catch {
      setError('Unable to create post right now.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        maxLength={200}
        className="w-full rounded-lg border border-line bg-bg-sunk p-3 text-sm text-ink outline-none transition placeholder:text-muted hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="What's on your mind? Share news, ask a question, or start a discussion... (min 10 characters)"
        maxLength={2000}
        rows={4}
        className="w-full rounded-lg border border-line bg-bg-sunk p-3 text-sm text-ink outline-none transition placeholder:text-muted hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {POST_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setPostType(t.value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${
                postType === t.value
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-bg-elev text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
          {!toolSlug && (
            <ToolTagPicker
              tool={taggedTool}
              onSelect={setTaggedTool}
              onClear={() => setTaggedTool(null)}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{body.length}/2000</span>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Posting...
              </>
            ) : (
              'Post'
            )}
          </Button>
        </div>
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  )
}
