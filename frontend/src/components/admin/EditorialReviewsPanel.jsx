import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Send } from 'lucide-react'

// The queue of commissioned reviews and the editor that fulfils them (see
// app/editorial.py). This is where the product is actually delivered: an
// order sits here owing someone a published page, and the panel's job is to
// make that debt impossible to lose track of.

const INPUT =
  'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'
const BTN_PRIMARY =
  'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-60'
const BTN_GHOST =
  'rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-bg-sunk disabled:opacity-60'

const STATUS_TONE = {
  ordered: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  drafting: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  published: 'border-accent/40 bg-accent-soft text-accent-ink',
  declined: 'border-line bg-bg-sunk text-muted',
  refunded: 'border-line bg-bg-sunk text-muted',
}

// Server-side error codes, said in words. These are the publish guards, and
// an operator who sees "body_too_short_to_publish" has to go read Python to
// find out what to do about it.
const ERRORS = {
  body_too_short_to_publish: 'Too short to publish — a commissioned review needs at least a couple of real paragraphs.',
  verdict_required_to_publish: 'Add a verdict before publishing. The verdict is the thing people quote.',
  review_already_in_progress: 'That tool already has a review in the queue.',
  invalid_score: 'Score must be a number between 0 and 5.',
}

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(ERRORS[data.error] || data.error || `Request failed (${res.status})`)
  return data
}

const EMPTY_ORDER = { tool_slug: '', contact_email: '', amount_paid: '', brief: '' }

function linesToList(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
}

function listToLines(items) {
  return (Array.isArray(items) ? items : []).filter((i) => typeof i === 'string').join('\n')
}

function screenshotsToLines(items) {
  return (Array.isArray(items) ? items : [])
    .filter((s) => s && typeof s === 'object' && s.url)
    .map((s) => (s.caption ? `${s.url} | ${s.caption}` : s.url))
    .join('\n')
}

function linesToScreenshots(text) {
  return linesToList(text).map((line) => {
    const [url, ...caption] = line.split('|')
    return { url: url.trim(), caption: caption.join('|').trim() || null }
  })
}

function Editor({ review, onSaved, onError }) {
  const [form, setForm] = useState(() => ({
    headline: review.headline || '',
    author_name: review.author_name || '',
    score: review.score ?? '',
    body: review.body || '',
    verdict: review.verdict || '',
    pros: listToLines(review.pros),
    cons: listToLines(review.cons),
    screenshots: screenshotsToLines(review.screenshots),
    admin_note: review.admin_note || '',
  }))
  const [saving, setSaving] = useState(false)

  const words = form.body.trim() ? form.body.trim().split(/\s+/).length : 0

  const save = async (status) => {
    setSaving(true)
    onError('')
    try {
      const data = await api(`/api/v1/reviews/admin/orders/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          score: form.score === '' ? null : Number(form.score),
          pros: linesToList(form.pros),
          cons: linesToList(form.cons),
          screenshots: linesToScreenshots(form.screenshots),
          ...(status ? { status } : {}),
        }),
      })
      onSaved(data.review)
    } catch (err) {
      onError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="mt-4 space-y-3 border-t border-line pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="sm:col-span-2 block">
          <span className="text-xs font-semibold text-ink-2">Headline</span>
          <input className={INPUT} value={form.headline} onChange={set('headline')}
                 placeholder="Cursor, after a week of real work" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-2">Score / 5</span>
          <input className={INPUT} value={form.score} onChange={set('score')} placeholder="3.5" />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-ink-2">Byline</span>
        <input className={INPUT} value={form.author_name} onChange={set('author_name')}
               placeholder="Your name — a review nobody signed is not worth citing" />
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-ink-2">
          Body <span className="font-normal text-muted-2">· {words} words · blank line between paragraphs</span>
        </span>
        <textarea className={`${INPUT} font-mono text-xs`} rows={12} value={form.body} onChange={set('body')}
                  placeholder="What you did with it, what happened, what broke." />
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-ink-2">Verdict</span>
        <textarea className={INPUT} rows={2} value={form.verdict} onChange={set('verdict')}
                  placeholder="Who should buy this, and who should wait." />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-ink-2">Pros <span className="font-normal text-muted-2">· one per line</span></span>
          <textarea className={INPUT} rows={4} value={form.pros} onChange={set('pros')} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink-2">Cons <span className="font-normal text-muted-2">· one per line</span></span>
          <textarea className={INPUT} rows={4} value={form.cons} onChange={set('cons')} />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-semibold text-ink-2">
          Screenshots <span className="font-normal text-muted-2">· one per line, <code>url | caption</code></span>
        </span>
        <textarea className={`${INPUT} font-mono text-xs`} rows={3} value={form.screenshots}
                  onChange={set('screenshots')} placeholder="/static/reviews/cursor-diff.png | The diff view, mid-refactor" />
      </label>

      <label className="block">
        <span className="text-xs font-semibold text-ink-2">Admin note <span className="font-normal text-muted-2">· never published</span></span>
        <input className={INPUT} value={form.admin_note} onChange={set('admin_note')}
               placeholder="Refunded 12 Sep — we already use this commercially." />
      </label>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button className={BTN_GHOST} disabled={saving} onClick={() => save('drafting')}>
          Save draft
        </button>
        <button className={BTN_PRIMARY} disabled={saving} onClick={() => save('published')}>
          {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <Send className="mr-1.5 inline h-3.5 w-3.5" />}
          {review.status === 'published' ? 'Save & keep published' : 'Publish'}
        </button>
        {review.status === 'published' && (
          <button className={BTN_GHOST} disabled={saving} onClick={() => save('drafting')}>
            Unpublish
          </button>
        )}
        <button className={BTN_GHOST} disabled={saving} onClick={() => save('refunded')}>
          Mark refunded
        </button>
        {review.status === 'published' && (
          <a href={`/tools/${review.tool_slug}`} target="_blank" rel="noreferrer"
             className="text-xs font-semibold text-accent hover:underline">
            View the page →
          </a>
        )}
      </div>
    </div>
  )
}

export default function EditorialReviewsPanel() {
  const [reviews, setReviews] = useState([])
  const [availability, setAvailability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_ORDER)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/api/v1/reviews/admin/queue')
      setReviews(data.reviews || [])
      setAvailability(data.availability || null)
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load the review queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    setSaving(true)
    try {
      await api('/api/v1/reviews/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount_paid: Number(form.amount_paid) || 0 }),
      })
      setForm(EMPTY_ORDER)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not create the commission')
    } finally {
      setSaving(false)
    }
  }

  const open = reviews.filter((r) => r.status === 'ordered' || r.status === 'drafting')
  const revenue = reviews
    .filter((r) => r.status !== 'refunded')
    .reduce((sum, r) => sum + (r.amount_paid || 0), 0)

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Owed', open.length, 'reviews not yet published'],
          ['Slots left', availability?.slots_left ?? '—', 'this month'],
          ['Published', reviews.filter((r) => r.status === 'published').length, 'all time'],
          ['Revenue', `$${revenue.toFixed(2)}`, 'commissions, less refunds'],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border border-line bg-bg-elev p-4">
            <div className="text-xs font-semibold text-muted">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</div>
            <div className="text-[11px] text-muted-2">{hint}</div>
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-ink-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-2">
          Commissions ({reviews.length})
        </h3>
        <button className={BTN_GHOST} onClick={() => setShowForm((v) => !v)}>
          <Plus className="mr-1 inline h-3.5 w-3.5" /> Add by hand
        </button>
      </div>

      {showForm && (
        <div className="grid gap-3 rounded-2xl border border-line bg-bg-sunk/40 p-4 sm:grid-cols-2">
          <p className="text-xs text-muted sm:col-span-2">
            For an invoiced deal, a comp, or a review we decided to write ourselves — anything that
            did not come through PayPal.
          </p>
          <input className={INPUT} placeholder="tool-slug" value={form.tool_slug}
                 onChange={(e) => setForm((f) => ({ ...f, tool_slug: e.target.value.trim().toLowerCase() }))} />
          <input className={INPUT} placeholder="contact@example.com" value={form.contact_email}
                 onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value.trim() }))} />
          <input className={INPUT} placeholder="Amount paid (0 for a comp)" value={form.amount_paid}
                 onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))} />
          <input className={INPUT} placeholder="Brief (optional)" value={form.brief}
                 onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))} />
          <div className="sm:col-span-2">
            <button className={BTN_PRIMARY} disabled={saving || !form.tool_slug} onClick={create}>
              {saving ? 'Adding…' : 'Add commission'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing commissioned yet. The product lives on <a href="/sponsor#review" className="font-semibold text-accent hover:underline">/sponsor</a>.
        </p>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-line bg-bg-elev p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{r.tool_slug}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[r.status] || STATUS_TONE.declined}`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {r.contact_email || 'no contact'} · ${Number(r.amount_paid || 0).toFixed(2)}
                    {r.due_at && r.status !== 'published' && ` · due ${new Date(r.due_at).toLocaleDateString()}`}
                    {r.published_at && ` · published ${new Date(r.published_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button className={BTN_GHOST} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                  {openId === r.id ? 'Close' : r.status === 'ordered' ? 'Write it' : 'Edit'}
                </button>
              </div>

              {r.brief && openId === r.id && (
                <p className="mt-3 rounded-xl border border-line bg-bg-sunk px-3 py-2 text-xs leading-relaxed text-ink-2">
                  <strong className="font-semibold">Their brief:</strong> {r.brief}
                </p>
              )}

              {openId === r.id && (
                <Editor
                  review={r}
                  onError={setError}
                  onSaved={(updated) => {
                    setReviews((rows) => rows.map((row) => (row.id === updated.id ? updated : row)))
                    setError('')
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
