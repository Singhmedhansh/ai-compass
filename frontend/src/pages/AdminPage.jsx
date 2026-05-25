import { motion } from 'framer-motion'
import { Eye, EyeOff, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import SearchInput from '../components/ui/SearchInput'

// ESLint no-unused-vars doesn't recognise JSX namespaced tags (<MotionDiv>)
// as a usage of `motion`. Alias to constants to satisfy the rule — same
// pattern as the Best* listicle pages.
const MotionDiv = motion.div
const MotionSpan = motion.span

const ADMIN_EMAILS = ['singhmedhansh07@gmail.com']
const TOOLS_PAGE_SIZE = 15
const TABS = ['Overview', 'Tools', 'Sync', 'Submissions', 'Feedback', 'Analytics', 'Email', 'Newsletter', 'Flags', 'Users', 'Reviews']

const EMPTY_TOOL = {
  slug: '', name: '', tagline: '', description: '', category: '',
  subCategory: '', pricing: '', link: '', affiliate_url: '',
  features: '', tags: '', use_cases: '', last_verified_at: '',
  studentPerk: false, hidden: false,
}

const fade = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
}

function getToolSlug(tool = {}) {
  if (tool.slug) return String(tool.slug)
  return String(tool.name || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
}

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const listToText = (v) => (Array.isArray(v) ? v.join(', ') : v || '')

const INPUT = 'mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'
const BTN_PRIMARY = 'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-60'
const BTN_GHOST = 'rounded-lg border border-line-strong px-4 py-2 text-sm font-semibold text-ink-2 transition hover:bg-bg-sunk disabled:opacity-60'
const ICON_BTN = 'rounded-md border border-line-strong p-1.5 text-ink-2 transition hover:bg-bg-sunk'

function Card({ children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-line bg-bg-elev p-5 shadow-sm ${className}`}>
      {children}
    </section>
  )
}

/* ---------- Full tool editor (create + edit) ---------- */
function ToolForm({ initial, isNew, onClose, onSaved }) {
  const [form, setForm] = useState({
    ...EMPTY_TOOL, ...initial,
    features: listToText(initial?.features),
    tags: listToText(initial?.tags),
    use_cases: listToText(initial?.use_cases ?? initial?.useCases),
  })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async () => {
    if (!form.name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      const opts = { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }
      await api(isNew ? '/api/v1/admin/tools' : `/api/v1/admin/tools/${encodeURIComponent(getToolSlug(form))}`, opts)
      toast.success(isNew ? 'Tool created' : 'Tool updated')
      onSaved(); onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const field = (label, key, opts = {}) => (
    <label className="block">
      <span className="text-xs font-medium text-muted">{label}</span>
      {opts.textarea
        ? <textarea value={form[key]} onChange={set(key)} rows={opts.rows || 3} className={INPUT} />
        : <input
            type={opts.type || 'text'}
            value={form[key]}
            onChange={set(key)}
            placeholder={opts.placeholder}
            className={INPUT}
          />}
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <MotionDiv
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-bg-elev p-6 shadow-2xl"
      >
        <h3 className="text-xl font-semibold text-ink">{isNew ? 'Add New Tool' : `Edit: ${form.name}`}</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('Name *', 'name')}
          {field(isNew ? 'Slug (auto if blank)' : 'Slug (locked)', 'slug', { placeholder: 'auto-generated' })}
          {field('Tagline', 'tagline')}
          {field('Category', 'category')}
          {field('Sub-category', 'subCategory')}
          {field('Pricing', 'pricing', { placeholder: 'Free / Freemium / Paid' })}
          {field('Website / link', 'link')}
          {field('Affiliate URL', 'affiliate_url', { placeholder: 'optional' })}
          {field('Last tested (date)', 'last_verified_at', { type: 'date', placeholder: 'YYYY-MM-DD' })}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4">
          {field('Description', 'description', { textarea: true })}
          {field('Features (comma-separated)', 'features', { textarea: true, rows: 2 })}
          {field('Tags (comma-separated)', 'tags')}
          {field('Use cases (comma-separated)', 'use_cases')}
        </div>
        <div className="mt-4 flex gap-6 text-sm text-ink-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.studentPerk} onChange={set('studentPerk')} /> Student-friendly</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.hidden} onChange={set('hidden')} /> Hidden</label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className={BTN_GHOST}>Cancel</button>
          <button onClick={submit} disabled={saving} className={BTN_PRIMARY}>
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </MotionDiv>
    </div>
  )
}

function AdminPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('Overview')
  const [authed, setAuthed] = useState(false)
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState({})
  const [tools, setTools] = useState([])
  const [users, setUsers] = useState([])
  const [reviews, setReviews] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [feedback, setFeedback] = useState([])
  const [feedbackUnread, setFeedbackUnread] = useState(0)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsErr, setAnalyticsErr] = useState('')
  const [flags, setFlags] = useState([])
  const [newsletterSubs, setNewsletterSubs] = useState([])
  const [newsletterStats, setNewsletterStats] = useState({ count: 0, new_today: 0, new_this_week: 0 })
  const [catalogDiff, setCatalogDiff] = useState({ db_only: [], json_only: [], matched_count: 0, db_total: 0, json_total: 0 })
  const [catalogDiffLoading, setCatalogDiffLoading] = useState(false)
  const [cacheBusy, setCacheBusy] = useState(false)

  const [toolsQuery, setToolsQuery] = useState('')
  const [toolsPage, setToolsPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [digestBusy, setDigestBusy] = useState('')
  const [liDrafts, setLiDrafts] = useState(null)
  const [bcSubject, setBcSubject] = useState("What's new on AI Compass ✨")
  const [bcBody, setBcBody] = useState(
    "<p>Hey — it's been a while. We've shipped a lot since you last visited:</p>"
    + "<ul>"
    + "<li><b>Sign in with GitHub</b> — one click, no password.</li>"
    + "<li><b>Much faster &amp; more reliable</b> — pages load instantly and the crashes are gone.</li>"
    + "<li><b>Redesigned dashboard</b> — save and edit your own AI stack.</li>"
    + "<li><b>400+ hand-tested tools</b>, with new ones added regularly.</li>"
    + "<li><b>Smarter tool finder</b> — answer 4 quick questions, get tools picked for you.</li>"
    + "</ul>"
    + "<p>Come see what fits your workflow now — it's still free and takes ~40 seconds.</p>"
  )
  const [bcBusy, setBcBusy] = useState('')
  const [liBusy, setLiBusy] = useState(false)

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || 'null')
    if (!u || !(u.is_admin || ADMIN_EMAILS.includes(u.email))) {
      navigate('/')
      return
    }
    setAuthed(true)
  }, [navigate])

  const reloadTools = useCallback(async () => {
    const data = await api('/api/v1/tools')
    setTools(Array.isArray(data) ? data : data.results || [])
  }, [])

  useEffect(() => {
    if (!authed) return
    let on = true
    ;(async () => {
      try {
        const [s, t, u, r] = await Promise.all([
          api('/api/v1/admin/stats').catch(() => ({})),
          api('/api/v1/tools').catch(() => []),
          api('/api/v1/admin/users').catch(() => []),
          api('/api/v1/admin/reviews').catch(() => ({ reviews: [] })),
        ])
        if (!on) return
        setStats(s || {})
        setTools(Array.isArray(t) ? t : t.results || [])
        setUsers(Array.isArray(u) ? u : [])
        setReviews(Array.isArray(r.reviews) ? r.reviews : [])
      } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [authed])

  useEffect(() => {
    if (!authed) return
    if (activeTab === 'Submissions') api('/api/v1/admin/submissions?status=pending').then(setSubmissions).catch(() => setSubmissions([]))
    if (activeTab === 'Feedback') {
      api('/api/v1/admin/feedback')
        .then((d) => { setFeedback(d.feedback || []); setFeedbackUnread(d.unread || 0) })
        .catch(() => { setFeedback([]); setFeedbackUnread(0) })
    }
    if (activeTab === 'Analytics') {
      setAnalyticsErr('')
      api('/api/v1/admin/analytics').then(setAnalytics).catch((e) => setAnalyticsErr(e.message || 'Failed to load analytics'))
    }
    if (activeTab === 'Flags') api('/api/v1/admin/flags').then(setFlags).catch(() => setFlags([]))
    if (activeTab === 'Newsletter') {
      api('/api/v1/admin/newsletter')
        .then((d) => {
          setNewsletterSubs(Array.isArray(d.subscribers) ? d.subscribers : [])
          setNewsletterStats({
            count: d.count || 0,
            new_today: d.new_today || 0,
            new_this_week: d.new_this_week || 0,
          })
        })
        .catch(() => {
          setNewsletterSubs([])
          setNewsletterStats({ count: 0, new_today: 0, new_this_week: 0 })
        })
    }
    if (activeTab === 'Sync') {
      setCatalogDiffLoading(true)
      api('/api/v1/admin/catalog-diff')
        .then((d) => setCatalogDiff({
          db_only: Array.isArray(d.db_only) ? d.db_only : [],
          json_only: Array.isArray(d.json_only) ? d.json_only : [],
          matched_count: d.matched_count || 0,
          db_total: d.db_total || 0,
          json_total: d.json_total || 0,
        }))
        .catch(() => setCatalogDiff({ db_only: [], json_only: [], matched_count: 0, db_total: 0, json_total: 0 }))
        .finally(() => setCatalogDiffLoading(false))
    }
  }, [activeTab, authed])

  const reloadCatalogDiff = useCallback(async () => {
    setCatalogDiffLoading(true)
    try {
      const d = await api('/api/v1/admin/catalog-diff')
      setCatalogDiff({
        db_only: Array.isArray(d.db_only) ? d.db_only : [],
        json_only: Array.isArray(d.json_only) ? d.json_only : [],
        matched_count: d.matched_count || 0,
        db_total: d.db_total || 0,
        json_total: d.json_total || 0,
      })
    } catch {
      // Surface load failures via toast — the table will just stay
      // stale rather than wipe the existing view.
      toast.error('Failed to refresh catalog diff')
    } finally {
      setCatalogDiffLoading(false)
    }
  }, [])

  const clearCache = useCallback(async () => {
    setCacheBusy(true)
    try {
      const d = await api('/api/v1/admin/clear-cache', { method: 'POST' })
      toast.success(d.message || 'Cache cleared and reloaded')
      // Pull fresh data into the open dashboard so what we show matches
      // what the public site now serves.
      reloadTools()
      reloadCatalogDiff()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setCacheBusy(false)
    }
  }, [reloadTools, reloadCatalogDiff])

  const filteredTools = useMemo(() => {
    const q = toolsQuery.trim().toLowerCase()
    if (!q) return tools
    return tools.filter((t) =>
      String(t.name || '').toLowerCase().includes(q) || String(t.category || '').toLowerCase().includes(q))
  }, [tools, toolsQuery])

  const totalPages = Math.max(1, Math.ceil(filteredTools.length / TOOLS_PAGE_SIZE))
  const pageTools = useMemo(() => {
    const p = Math.min(toolsPage, totalPages)
    return filteredTools.slice((p - 1) * TOOLS_PAGE_SIZE, p * TOOLS_PAGE_SIZE)
  }, [filteredTools, toolsPage, totalPages])
  useEffect(() => { setToolsPage(1) }, [toolsQuery])

  const openEdit = async (tool) => {
    try {
      const data = await api(`/api/v1/admin/tools/${encodeURIComponent(getToolSlug(tool))}`)
      setEditing({ tool: data.tool, isNew: false })
    } catch (e) { toast.error(e.message) }
  }
  const toggleHide = async (tool) => {
    try {
      const next = !tool.hidden
      await api(`/api/v1/admin/tools/${encodeURIComponent(getToolSlug(tool))}/hide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: next }),
      })
      await reloadTools(); toast.success(next ? 'Tool hidden' : 'Tool visible')
    } catch (e) { toast.error(e.message) }
  }
  const setAffiliate = async (tool) => {
    const url = window.prompt(`Affiliate URL for ${tool.name} (blank to clear):`, tool.affiliate_url || '')
    if (url === null) return
    try {
      await api(`/api/v1/admin/tools/${encodeURIComponent(getToolSlug(tool))}/affiliate`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ affiliate_url: url.trim() }),
      })
      await reloadTools(); toast.success('Affiliate link updated')
    } catch (e) { toast.error(e.message) }
  }
  const removeTool = async (tool) => {
    if (!window.confirm(`Delete "${tool.name}" permanently?`)) return
    try {
      await api(`/api/v1/admin/tools/${encodeURIComponent(getToolSlug(tool))}`, { method: 'DELETE' })
      await reloadTools(); toast.success('Tool deleted')
    } catch (e) { toast.error(e.message) }
  }
  const runDigest = async (dry) => {
    setDigestBusy(dry ? 'dry' : 'send')
    try {
      const d = await api(`/api/v1/admin/digest?${dry ? 'dry_run=1' : ''}`, { method: 'POST' })
      toast.success(`${d.status}: ${d.new_tools ?? d.seeded ?? 0} new · ${d.recipients ?? 0} recipients${d.delivered != null ? ` · ${d.delivered} sent` : ''}`)
    } catch (e) { toast.error(e.message) } finally { setDigestBusy('') }
  }
  const sendTestEmail = async () => {
    setDigestBusy('test')
    try {
      const d = await api('/api/v1/admin/digest/test', { method: 'POST' })
      if (d.status === 'sent') toast.success(d.message)
      else toast.error(d.message || d.status)
    } catch (e) { toast.error(e.message) } finally { setDigestBusy('') }
  }
  const loadLinkedinDrafts = async () => {
    setLiBusy(true)
    try {
      const d = await api('/api/v1/admin/linkedin-drafts?n=5')
      setLiDrafts(d)
      if (!d.count) toast.message(d.message || 'No tools to build a post from.')
    } catch (e) { toast.error(e.message) } finally { setLiBusy(false) }
  }
  const runBroadcast = async (mode) => {
    if (mode === 'send' && !window.confirm('Send this announcement to ALL opted-in users now? This is real and immediate. Use “Send test to me” first.')) return
    setBcBusy(mode)
    try {
      const d = await api('/api/v1/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: bcSubject, body: bcBody, mode }),
      })
      if (d.status === 'dry_run') toast.success(`${d.recipients} recipients (no email sent)`)
      else if (d.status === 'sent' && d.test) toast.success(d.message)
      else if (d.status === 'sent') toast.success(`Delivered to ${d.delivered}/${d.recipients} users`)
      else toast.error(d.message || d.status)
    } catch (e) { toast.error(e.message) } finally { setBcBusy('') }
  }
  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied — paste into LinkedIn`)
    } catch {
      toast.error('Copy failed — select the text and copy manually')
    }
  }
  const reviewSubmission = async (id, action) => {
    try {
      await api(`/api/v1/admin/submissions/${id}/${action}`, { method: 'POST' })
      setSubmissions((s) => s.filter((x) => x.id !== id))
      toast.success(action === 'approve' ? 'Approved & added to catalog' : 'Rejected')
    } catch (e) { toast.error(e.message) }
  }
  const markFeedbackRead = async (id) => {
    try {
      await api(`/api/v1/admin/feedback/${id}/read`, { method: 'POST' })
      setFeedback((f) => f.map((x) => (x.id === id ? { ...x, is_read: true } : x)))
      setFeedbackUnread((n) => Math.max(0, n - 1))
    } catch (e) { toast.error(e.message) }
  }
  const deleteFeedback = async (id) => {
    if (!window.confirm('Delete this feedback?')) return
    try {
      await api(`/api/v1/admin/feedback/${id}`, { method: 'DELETE' })
      setFeedback((f) => f.filter((x) => x.id !== id))
    } catch (e) { toast.error(e.message) }
  }
  const setFlag = async (key, patch) => {
    try {
      const d = await api(`/api/v1/admin/flags/${encodeURIComponent(key)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      setFlags((fs) => {
        const exists = fs.some((f) => f.key === key)
        return exists ? fs.map((f) => (f.key === key ? { ...f, ...d } : f)) : [...fs, d]
      })
    } catch (e) { toast.error(e.message) }
  }

  if (!authed) return null

  const tabKey = activeTab

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 rounded-2xl border border-line bg-bg-elev p-6 shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Catalog, monetisation, email, analytics — all changes persist in the database.</p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-5 border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`relative pb-3 text-sm font-semibold transition-colors ${activeTab === t ? 'text-accent-ink' : 'text-muted hover:text-ink'}`}>
            {t}
            {activeTab === t && <MotionSpan layoutId="admintab" className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
          </button>
        ))}
      </nav>

      <MotionDiv key={tabKey} variants={fade} initial="hidden" animate="show">
        {activeTab === 'Overview' && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[['Total Tools', stats.total_tools], ['Total Users', stats.total_users], ['New Today', stats.new_users_today], ['Free Tools', stats.free_tools]].map(([k, v]) => (
              <Card key={k}>
                <p className="text-xs uppercase tracking-wide text-muted">{k}</p>
                <p className="mt-2 text-3xl font-bold text-ink">{loading ? '…' : (v ?? 0)}</p>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'Tools' && (
          <Card>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-ink">Tools ({filteredTools.length})</h2>
              <div className="flex gap-2">
                <div className="w-64"><SearchInput value={toolsQuery} onChange={setToolsQuery} onClear={() => setToolsQuery('')} placeholder="Search name/category" /></div>
                <button onClick={() => setEditing({ tool: { ...EMPTY_TOOL }, isNew: true })} className={`flex items-center gap-1.5 ${BTN_PRIMARY}`}>
                  <Plus className="h-4 w-4" /> Add Tool
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="border-b border-line text-muted">
                  <th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Category</th>
                  <th className="px-3 py-2 font-semibold">Pricing</th><th className="px-3 py-2 font-semibold">Affiliate</th>
                  <th className="px-3 py-2 font-semibold">Status</th><th className="px-3 py-2 font-semibold">Actions</th>
                </tr></thead>
                <tbody>
                  {pageTools.map((tool) => (
                    <tr key={getToolSlug(tool)} className="border-b border-line/60 transition-colors hover:bg-bg-sunk/50">
                      <td className="px-3 py-2 font-medium text-ink">{tool.name}</td>
                      <td className="px-3 py-2 text-muted">{tool.category || '—'}</td>
                      <td className="px-3 py-2 text-muted">{tool.pricing || '—'}</td>
                      <td className="px-3 py-2">{tool.affiliate_url ? <span className="text-accent-ink">✓</span> : <span className="text-muted-2">—</span>}</td>
                      <td className="px-3 py-2">{tool.hidden ? <span className="text-danger">Hidden</span> : <span className="text-accent-ink">Live</span>}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1.5">
                          <button onClick={() => openEdit(tool)} title="Edit" className={ICON_BTN}><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setAffiliate(tool)} title="Affiliate URL" className={ICON_BTN}><Link2 className="h-4 w-4" /></button>
                          <button onClick={() => toggleHide(tool)} title={tool.hidden ? 'Show' : 'Hide'} className={ICON_BTN}>{tool.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                          <button onClick={() => removeTool(tool)} title="Delete" className="rounded-md border border-danger/40 p-1.5 text-danger transition hover:bg-danger-soft"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted">Page {toolsPage}/{totalPages}</span>
              <div className="flex gap-2">
                <button disabled={toolsPage <= 1} onClick={() => setToolsPage((p) => p - 1)} className={`${BTN_GHOST} px-3 py-1`}>Prev</button>
                <button disabled={toolsPage >= totalPages} onClick={() => setToolsPage((p) => p + 1)} className={`${BTN_GHOST} px-3 py-1`}>Next</button>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'Submissions' && (
          <Card>
            <h2 className="mb-4 text-xl font-semibold text-ink">Pending Submissions ({submissions.length})</h2>
            <div className="space-y-3">
              {submissions.map((s) => (
                <div key={s.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-ink">{s.name} <span className="text-xs text-muted">· {s.category} · {s.pricing_model}</span></p>
                      <a href={s.website} target="_blank" rel="noreferrer" className="text-xs text-accent-ink">{s.website}</a>
                      <p className="mt-1 text-sm text-muted">{s.description}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => reviewSubmission(s.id, 'approve')} className={`${BTN_PRIMARY} px-3 py-1.5 text-xs`}>Approve</button>
                      <button onClick={() => reviewSubmission(s.id, 'reject')} className={`${BTN_GHOST} px-3 py-1.5 text-xs`}>Reject</button>
                    </div>
                  </div>
                </div>
              ))}
              {submissions.length === 0 && <p className="text-sm text-muted">No pending submissions.</p>}
            </div>
          </Card>
        )}

        {activeTab === 'Feedback' && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">
                User Feedback
                <span className="ml-2 text-sm font-normal text-muted">
                  ({feedback.length} total{feedbackUnread > 0 ? `, ${feedbackUnread} unread` : ''})
                </span>
              </h2>
            </div>
            <div className="space-y-3">
              {feedback.map((f) => (
                <div
                  key={f.id}
                  className={`rounded-xl border p-4 ${f.is_read ? 'border-line bg-bg-elev' : 'border-accent/50 bg-accent-soft/30'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm text-ink">{f.message}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
                        <span>{new Date(f.created_at).toLocaleString()}</span>
                        {f.email && (
                          <a href={`mailto:${f.email}`} className="text-accent-ink hover:underline">{f.email}</a>
                        )}
                        {f.user_email && !f.email && (
                          <span>logged in: {f.user_email}</span>
                        )}
                        {f.page_url && (
                          <a href={f.page_url} target="_blank" rel="noreferrer" className="truncate text-accent-ink hover:underline" title={f.page_url}>
                            {f.page_url.replace(/^https?:\/\/[^/]+/, '') || '/'}
                          </a>
                        )}
                      </div>
                      {f.user_agent && (
                        <p className="mt-1 truncate text-[11px] text-muted-2" title={f.user_agent}>{f.user_agent}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {!f.is_read && (
                        <button onClick={() => markFeedbackRead(f.id)} className={`${BTN_GHOST} px-3 py-1.5 text-xs`}>
                          Mark read
                        </button>
                      )}
                      <button onClick={() => deleteFeedback(f.id)} className={`${ICON_BTN}`} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {feedback.length === 0 && (
                <p className="text-sm text-muted">No feedback yet — the widget appears bottom-right on every page.</p>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'Analytics' && (
          <div className="space-y-4">
            {analyticsErr ? (
              <Card><p className="text-sm text-danger">{analyticsErr}</p></Card>
            ) : !analytics ? (
              <Card><p className="text-sm text-muted">Loading analytics…</p></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[['Outbound clicks', analytics.outbound?.total], ['Affiliate clicks', analytics.outbound?.affiliate], ['Clicks (30d)', analytics.outbound?.last_30d], ['Favorites', analytics.favorites_total]].map(([k, v]) => (
                    <Card key={k}><p className="text-xs uppercase text-muted">{k}</p><p className="mt-2 text-2xl font-bold text-ink">{v ?? 0}</p></Card>
                  ))}
                </div>
                {(analytics.outbound?.monetization_gaps || []).length > 0 && (
                  <Card>
                    <h3 className="font-semibold text-ink">💸 Monetization gaps</h3>
                    <p className="mb-3 mt-1 text-xs text-muted">
                      High-traffic tools with no affiliate link yet — these clicks earn nothing. Sign up for these programs first, then paste the referral URL via each tool&apos;s “Affiliate” action in the Tools tab.
                    </p>
                    {(analytics.outbound?.monetization_gaps || []).map((r) => (
                      <div key={r.slug} className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
                        <span className="text-ink-2">{r.name || r.slug}</span>
                        <span className="flex items-center gap-3">
                          <span className="text-xs text-muted">{r.clicks} clicks</span>
                          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">no affiliate</span>
                        </span>
                      </div>
                    ))}
                  </Card>
                )}
                <Card>
                  <h3 className="mb-3 font-semibold text-ink">Top clicked tools</h3>
                  {(analytics.outbound?.top || []).map((r) => (
                    <div key={r.slug} className="flex items-center justify-between border-b border-line/60 py-1.5 text-sm">
                      <span className="text-ink-2">{r.name || r.slug}</span>
                      <span className="flex items-center gap-3">
                        {r.has_affiliate ? (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent-ink">✓ affiliate</span>
                        ) : (
                          <span className="rounded-full bg-bg-sunk px-2 py-0.5 text-[11px] font-semibold text-muted">no affiliate</span>
                        )}
                        <span className="font-semibold text-ink">{r.clicks}</span>
                      </span>
                    </div>
                  ))}
                  {(analytics.outbound?.top || []).length === 0 && <p className="text-sm text-muted">No clicks recorded yet.</p>}
                </Card>
              </>
            )}
          </div>
        )}

        {activeTab === 'Email' && (
          <div className="space-y-4">
            <Card>
              <h2 className="text-xl font-semibold text-ink">New-tools Email Digest</h2>
              <p className="mt-1 text-sm text-muted">
                Dry run previews new tools &amp; recipient count without sending anything. Send digest emails all opted-in users (each with an unsubscribe link). Sends automatically once a day when there are new tools — this is for a manual run. Requires <code className="rounded bg-bg-sunk px-1 py-0.5 text-xs">RESEND_API_KEY</code> on the server.
              </p>
              <div className="mt-4 flex gap-2">
                <button disabled={!!digestBusy} onClick={() => runDigest(true)} className={BTN_GHOST}>{digestBusy === 'dry' ? 'Checking…' : 'Dry run'}</button>
                <button disabled={!!digestBusy} onClick={sendTestEmail} className={BTN_GHOST}>{digestBusy === 'test' ? 'Sending…' : 'Send test to me'}</button>
                <button disabled={!!digestBusy} onClick={() => { if (window.confirm('Send the digest email to ALL opted-in users now? This is real — use “Send test to me” first to verify delivery.')) runDigest(false) }} className={BTN_PRIMARY}>{digestBusy === 'send' ? 'Sending…' : 'Send digest'}</button>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-semibold text-ink">LinkedIn post drafts</h2>
              <p className="mt-1 text-sm text-muted">
                Ready-to-paste posts built from your 5 most recently added/updated tools. Generate, tweak if you like, copy, and post to the AI Compass Company Page. (No LinkedIn API needed — you post manually.)
              </p>
              <div className="mt-4">
                <button disabled={liBusy} onClick={loadLinkedinDrafts} className={BTN_PRIMARY}>
                  {liBusy ? 'Generating…' : (liDrafts ? 'Regenerate' : 'Generate drafts')}
                </button>
              </div>

              {liDrafts?.count > 0 && (
                <div className="mt-5 space-y-5">
                  <p className="text-xs text-muted">
                    Built from: {(liDrafts.tools || []).join(', ')}
                  </p>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink">Roundup post (all 5)</h3>
                      <button onClick={() => copyText(liDrafts.roundup, 'Roundup post')} className={BTN_GHOST}>Copy</button>
                    </div>
                    <textarea
                      readOnly
                      value={liDrafts.roundup}
                      rows={10}
                      className="w-full resize-y rounded-lg border border-line bg-bg-sunk p-3 font-mono text-xs text-ink-2"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink">Spotlight post (newest tool)</h3>
                      <button onClick={() => copyText(liDrafts.spotlight, 'Spotlight post')} className={BTN_GHOST}>Copy</button>
                    </div>
                    <textarea
                      readOnly
                      value={liDrafts.spotlight}
                      rows={9}
                      className="w-full resize-y rounded-lg border border-line bg-bg-sunk p-3 font-mono text-xs text-ink-2"
                    />
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <h2 className="text-xl font-semibold text-ink">Announcement / re-engagement email</h2>
              <p className="mt-1 text-sm text-muted">
                A one-off broadcast to all opted-in users (each with an unsubscribe link) — separate from the new-tools digest. Edit the subject &amp; body, <b>Dry run</b> to see the recipient count, <b>Send test to me</b> to preview delivery, then <b>Send to all</b>. Simple HTML allowed (&lt;p&gt;, &lt;b&gt;, &lt;a&gt;, &lt;ul&gt;&lt;li&gt;).
              </p>
              <input
                value={bcSubject}
                onChange={(e) => setBcSubject(e.target.value)}
                placeholder="Subject"
                className="mt-4 w-full rounded-lg border border-line bg-bg-sunk px-3 py-2 text-sm text-ink"
              />
              <textarea
                value={bcBody}
                onChange={(e) => setBcBody(e.target.value)}
                rows={10}
                placeholder="Email body (simple HTML)"
                className="mt-2 w-full resize-y rounded-lg border border-line bg-bg-sunk p-3 font-mono text-xs text-ink-2"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button disabled={!!bcBusy} onClick={() => runBroadcast('dry')} className={BTN_GHOST}>{bcBusy === 'dry' ? 'Checking…' : 'Dry run'}</button>
                <button disabled={!!bcBusy} onClick={() => runBroadcast('test')} className={BTN_GHOST}>{bcBusy === 'test' ? 'Sending…' : 'Send test to me'}</button>
                <button disabled={!!bcBusy} onClick={() => runBroadcast('send')} className={BTN_PRIMARY}>{bcBusy === 'send' ? 'Sending…' : 'Send to all'}</button>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'Flags' && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">Feature Flags</h2>
              <button onClick={() => { const k = window.prompt('New flag key (e.g. pro_tier):'); if (k) setFlag(k.trim(), { enabled: false }) }} className={BTN_PRIMARY}>+ New flag</button>
            </div>
            <div className="space-y-2">
              {flags.map((f) => (
                <div key={f.key} className="flex items-center justify-between rounded-xl border border-line p-3">
                  <span className="font-mono text-sm text-ink-2">{f.key}</span>
                  <button onClick={() => setFlag(f.key, { enabled: !f.enabled })}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${f.enabled ? 'bg-accent text-bg' : 'bg-bg-sunk text-ink-2'}`}>
                    {f.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
              {flags.length === 0 && <p className="text-sm text-muted">No flags yet.</p>}
            </div>
          </Card>
        )}

        {activeTab === 'Users' && (
          <Card>
            <h2 className="mb-4 text-xl font-semibold text-ink">Users ({users.length})</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="border-b border-line text-muted">
                  <th className="px-3 py-2 font-semibold">Email</th><th className="px-3 py-2 font-semibold">Name</th><th className="px-3 py-2 font-semibold">Joined</th><th className="px-3 py-2 font-semibold">Admin</th>
                </tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-line/60">
                      <td className="px-3 py-2 text-ink-2">{u.email}</td>
                      <td className="px-3 py-2 text-ink">{u.name || '—'}</td>
                      <td className="px-3 py-2 text-muted">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2 text-accent-ink">{u.is_admin ? '✓' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === 'Sync' && (
          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-ink">Catalog sync</h2>
                <p className="mt-1 text-sm text-muted">
                  Drift between <code className="rounded bg-bg-sunk px-1.5 py-0.5 text-xs">tools.json</code> (seed) and the <code className="rounded bg-bg-sunk px-1.5 py-0.5 text-xs">catalog_tools</code> DB table (source of truth). Use this when a tool has been removed from JSON but is still serving from the DB, or when a tool was added to JSON after the initial seed and never made it into the DB.
                </p>
              </div>
              <div className="flex items-end gap-4 text-sm">
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-ink">{catalogDiff.json_total}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-2">JSON</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-ink">{catalogDiff.db_total}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-2">DB</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-ink">{catalogDiff.matched_count}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-2">In both</div>
                </div>
                <button onClick={reloadCatalogDiff} className={BTN_GHOST} disabled={catalogDiffLoading}>
                  {catalogDiffLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-bg-sunk/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Reload catalog cache</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Forces the live worker to reload every tool from the database and rebuild the search index. Run this after syncing pricing or other changes straight to the DB so they appear on the public site immediately — no redeploy needed.
                </p>
              </div>
              <button onClick={clearCache} disabled={cacheBusy} className={`${BTN_PRIMARY} shrink-0`}>
                {cacheBusy ? 'Reloading…' : 'Clear cache'}
              </button>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-2">
                In DB but not in JSON ({catalogDiff.db_only.length})
              </h3>
              <p className="mt-1 text-xs text-muted">
                Removed from JSON but still in the live catalog. <b>Hide</b> keeps the row (metadata, affiliate URL) but excludes it from the public directory. <b>Delete</b> hard-removes the row.
              </p>
              {catalogDiff.db_only.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No drift in this direction.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead><tr className="border-b border-line text-muted">
                      <th className="px-3 py-2 font-semibold">Slug</th>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold text-right">Actions</th>
                    </tr></thead>
                    <tbody>
                      {catalogDiff.db_only.map((row) => (
                        <tr key={row.slug} className="border-b border-line/60">
                          <td className="px-3 py-2 font-mono text-xs text-ink-2">{row.slug}</td>
                          <td className="px-3 py-2 text-ink">{row.name}</td>
                          <td className="px-3 py-2 text-muted">{row.category || '—'}</td>
                          <td className="px-3 py-2">
                            {row.hidden ? (
                              <span className="rounded-full bg-bg-sunk px-2 py-0.5 text-xs text-ink-2">Hidden</span>
                            ) : (
                              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-ink">Live</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-2">
                              {!row.hidden && (
                                <button
                                  onClick={async () => {
                                    try {
                                      await api(`/api/v1/admin/tools/${encodeURIComponent(row.slug)}/hide`, { method: 'POST' })
                                      toast.success(`Hid ${row.name}`)
                                      reloadCatalogDiff()
                                    } catch (e) { toast.error(e.message) }
                                  }}
                                  className={BTN_GHOST}
                                >
                                  Hide
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  if (!window.confirm(`Delete ${row.name} (${row.slug}) from the DB? This is irreversible.`)) return
                                  try {
                                    await api(`/api/v1/admin/tools/${encodeURIComponent(row.slug)}`, { method: 'DELETE' })
                                    toast.success(`Deleted ${row.name}`)
                                    reloadCatalogDiff()
                                  } catch (e) { toast.error(e.message) }
                                }}
                                className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger-soft"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-8">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-2">
                In JSON but not in DB ({catalogDiff.json_only.length})
              </h3>
              <p className="mt-1 text-xs text-muted">
                Added to <code className="rounded bg-bg-sunk px-1 py-0.5 text-[10px]">tools.json</code> after the initial seed; never imported into the live catalog. <b>Import</b> upserts the JSON record into <code className="rounded bg-bg-sunk px-1 py-0.5 text-[10px]">catalog_tools</code> and primes the cache.
              </p>
              {catalogDiff.json_only.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No drift in this direction.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead><tr className="border-b border-line text-muted">
                      <th className="px-3 py-2 font-semibold">Slug</th>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold text-right">Actions</th>
                    </tr></thead>
                    <tbody>
                      {catalogDiff.json_only.map((row) => (
                        <tr key={row.slug} className="border-b border-line/60">
                          <td className="px-3 py-2 font-mono text-xs text-ink-2">{row.slug}</td>
                          <td className="px-3 py-2 text-ink">{row.name}</td>
                          <td className="px-3 py-2 text-muted">{row.category || '—'}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={async () => {
                                try {
                                  await api(`/api/v1/admin/catalog-import/${encodeURIComponent(row.slug)}`, { method: 'POST' })
                                  toast.success(`Imported ${row.name}`)
                                  reloadCatalogDiff()
                                } catch (e) { toast.error(e.message) }
                              }}
                              className={BTN_PRIMARY}
                            >
                              Import
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'Newsletter' && (
          <Card>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-ink">Newsletter subscribers</h2>
                <p className="mt-1 text-sm text-muted">
                  Public homepage signups (no account required). Same recipient pool as the digest send — these addresses get every &quot;new tools&quot; email, with a one-click unsubscribe link in each one.
                </p>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-ink">{newsletterStats.count}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-2">Total</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-ink">{newsletterStats.new_this_week}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-2">Last 7d</div>
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-ink">{newsletterStats.new_today}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-2">Today</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead><tr className="border-b border-line text-muted">
                  <th className="px-3 py-2 font-semibold">Email</th>
                  <th className="px-3 py-2 font-semibold">Joined</th>
                  <th className="px-3 py-2 font-semibold w-12"></th>
                </tr></thead>
                <tbody>
                  {newsletterSubs.map((s) => (
                    <tr key={s.id} className="border-b border-line/60">
                      <td className="px-3 py-2 text-ink-2">{s.email}</td>
                      <td className="px-3 py-2 text-muted tabular-nums">
                        {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Remove ${s.email} from the newsletter?`)) return
                            try {
                              await api(`/api/v1/admin/newsletter/${s.id}`, { method: 'DELETE' })
                              setNewsletterSubs((prev) => prev.filter((x) => x.id !== s.id))
                              setNewsletterStats((prev) => ({
                                ...prev,
                                count: Math.max(0, (prev.count || 0) - 1),
                              }))
                              toast.success('Subscriber removed')
                            } catch (e) {
                              toast.error(e.message)
                            }
                          }}
                          className="rounded-md border border-danger/40 p-1.5 text-danger transition hover:bg-danger-soft"
                          title="Remove subscriber"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {newsletterSubs.length === 0 && (
                <p className="mt-4 text-sm text-muted">
                  No newsletter subscribers yet. Signups land here from the homepage form.
                </p>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'Reviews' && (
          <Card>
            <h2 className="mb-4 text-xl font-semibold text-ink">Reviews ({reviews.length})</h2>
            <div className="space-y-3">
              {reviews.map((r) => (
                <div key={r.id} className="flex items-start justify-between rounded-xl border border-line p-4">
                  <div><p className="font-medium text-ink">{r.user} · <span className="text-xs text-muted">{r.tool_slug}</span></p><p className="mt-1 text-sm text-muted">{r.body}</p></div>
                  <button onClick={async () => {
                    if (!window.confirm('Delete this review?')) return
                    try { await api(`/api/v1/admin/reviews/${r.id}`, { method: 'DELETE' }); setReviews((p) => p.filter((x) => x.id !== r.id)); toast.success('Deleted') }
                    catch (e) { toast.error(e.message) }
                  }} className="rounded-md border border-danger/40 p-2 text-danger transition hover:bg-danger-soft"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              {reviews.length === 0 && <p className="text-sm text-muted">No reviews.</p>}
            </div>
          </Card>
        )}
      </MotionDiv>

      {editing && <ToolForm initial={editing.tool} isNew={editing.isNew} onClose={() => setEditing(null)} onSaved={reloadTools} />}
    </div>
  )
}

export default AdminPage
