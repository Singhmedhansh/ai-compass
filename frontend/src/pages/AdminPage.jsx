import { Eye, EyeOff, Pencil, Plus, Trash2, Link2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import SearchInput from '../components/ui/SearchInput'

const ADMIN_EMAILS = ['singhmedhansh07@gmail.com']
const TOOLS_PAGE_SIZE = 15
const TABS = ['Overview', 'Tools', 'Submissions', 'Analytics', 'Email', 'Flags', 'Users', 'Reviews']

const EMPTY_TOOL = {
  slug: '', name: '', tagline: '', description: '', category: '',
  subCategory: '', pricing: '', link: '', affiliate_url: '',
  features: '', tags: '', use_cases: '', studentPerk: false, hidden: false,
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

function listToText(v) {
  return Array.isArray(v) ? v.join(', ') : (v || '')
}

/* ---------- Full tool editor (create + edit) ---------- */
function ToolForm({ initial, isNew, onClose, onSaved }) {
  const [form, setForm] = useState({
    ...EMPTY_TOOL,
    ...initial,
    features: listToText(initial?.features),
    tags: listToText(initial?.tags),
    use_cases: listToText(initial?.use_cases ?? initial?.useCases),
  })
  const [saving, setSaving] = useState(false)

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [k]: v }))
  }

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      const body = JSON.stringify(form)
      const headers = { 'Content-Type': 'application/json' }
      if (isNew) {
        await api('/api/v1/admin/tools', { method: 'POST', headers, body })
        toast.success('Tool created')
      } else {
        await api(`/api/v1/admin/tools/${encodeURIComponent(getToolSlug(form))}`, {
          method: 'PUT', headers, body,
        })
        toast.success('Tool updated')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const field = (label, key, opts = {}) => (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      {opts.textarea ? (
        <textarea
          value={form[key]} onChange={set(key)} rows={opts.rows || 3}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
      ) : (
        <input
          value={form[key]} onChange={set(key)} placeholder={opts.placeholder}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
      )}
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-700 bg-white p-6 shadow-xl dark:bg-gray-900">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          {isNew ? 'Add New Tool' : `Edit: ${form.name}`}
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field('Name *', 'name')}
          {field('Slug' + (isNew ? ' (auto if blank)' : ' (locked)'), 'slug', { placeholder: 'auto-generated' })}
          {field('Tagline', 'tagline')}
          {field('Category', 'category')}
          {field('Sub-category', 'subCategory')}
          {field('Pricing', 'pricing', { placeholder: 'Free / Freemium / Paid' })}
          {field('Website / link', 'link')}
          {field('Affiliate URL', 'affiliate_url', { placeholder: 'optional' })}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4">
          {field('Description', 'description', { textarea: true, rows: 3 })}
          {field('Features (comma-separated)', 'features', { textarea: true, rows: 2 })}
          {field('Tags (comma-separated)', 'tags')}
          {field('Use cases (comma-separated)', 'use_cases')}
        </div>
        <div className="mt-4 flex gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={!!form.studentPerk} onChange={set('studentPerk')} />
            Student-friendly
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={!!form.hidden} onChange={set('hidden')} />
            Hidden
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-700 dark:text-gray-300">
            Cancel
          </button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Card({ children }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">{children}</section>
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
  const [analytics, setAnalytics] = useState(null)
  const [flags, setFlags] = useState([])

  const [toolsQuery, setToolsQuery] = useState('')
  const [toolsPage, setToolsPage] = useState(1)
  const [editing, setEditing] = useState(null) // {tool, isNew}
  const [digestBusy, setDigestBusy] = useState('')

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

  // lazy-load tab data
  useEffect(() => {
    if (!authed) return
    if (activeTab === 'Submissions') api('/api/v1/admin/submissions?status=pending').then(setSubmissions).catch(() => {})
    if (activeTab === 'Analytics') api('/api/v1/admin/analytics').then(setAnalytics).catch(() => {})
    if (activeTab === 'Flags') api('/api/v1/admin/flags').then(setFlags).catch(() => {})
  }, [activeTab, authed])

  const filteredTools = useMemo(() => {
    const q = toolsQuery.trim().toLowerCase()
    if (!q) return tools
    return tools.filter((t) =>
      String(t.name || '').toLowerCase().includes(q) ||
      String(t.category || '').toLowerCase().includes(q))
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
    } catch (e) {
      toast.error(e.message)
    }
  }

  const toggleHide = async (tool) => {
    try {
      const next = !tool.hidden
      await api(`/api/v1/admin/tools/${encodeURIComponent(getToolSlug(tool))}/hide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: next }),
      })
      await reloadTools()
      toast.success(next ? 'Tool hidden' : 'Tool visible')
    } catch (e) { toast.error(e.message) }
  }

  const setAffiliate = async (tool) => {
    const url = window.prompt(`Affiliate URL for ${tool.name} (blank to clear):`, tool.affiliate_url || '')
    if (url === null) return
    try {
      await api(`/api/v1/admin/tools/${encodeURIComponent(getToolSlug(tool))}/affiliate`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliate_url: url.trim() }),
      })
      await reloadTools()
      toast.success('Affiliate link updated')
    } catch (e) { toast.error(e.message) }
  }

  const removeTool = async (tool) => {
    if (!window.confirm(`Delete "${tool.name}" permanently?`)) return
    try {
      await api(`/api/v1/admin/tools/${encodeURIComponent(getToolSlug(tool))}`, { method: 'DELETE' })
      await reloadTools()
      toast.success('Tool deleted')
    } catch (e) { toast.error(e.message) }
  }

  const runDigest = async (dry) => {
    setDigestBusy(dry ? 'dry' : 'send')
    try {
      const data = await api(`/api/v1/admin/digest?${dry ? 'dry_run=1' : ''}`, { method: 'POST' })
      toast.success(`${data.status}: ${data.new_tools ?? data.seeded ?? 0} new · ${data.recipients ?? 0} recipients${data.delivered != null ? ` · ${data.delivered} sent` : ''}`)
    } catch (e) { toast.error(e.message) } finally { setDigestBusy('') }
  }

  const reviewSubmission = async (id, action) => {
    try {
      await api(`/api/v1/admin/submissions/${id}/${action}`, { method: 'POST' })
      setSubmissions((s) => s.filter((x) => x.id !== id))
      toast.success(action === 'approve' ? 'Approved & added to catalog' : 'Rejected')
    } catch (e) { toast.error(e.message) }
  }

  const setFlag = async (key, patch) => {
    try {
      const data = await api(`/api/v1/admin/flags/${encodeURIComponent(key)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      setFlags((fs) => fs.map((f) => (f.key === key ? { ...f, ...data } : f)))
    } catch (e) { toast.error(e.message) }
  }

  if (!authed) return null

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Catalog, monetisation, email, analytics — all changes persist in the database.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-5 border-b border-gray-200 dark:border-gray-800">
        {TABS.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`pb-3 text-sm font-semibold ${activeTab === t ? 'border-b-2 border-indigo-500 text-indigo-500' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
            {t}
          </button>
        ))}
      </nav>

      {activeTab === 'Overview' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ['Total Tools', stats.total_tools],
            ['Total Users', stats.total_users],
            ['New Today', stats.new_users_today],
            ['Free Tools', stats.free_tools],
          ].map(([k, v]) => (
            <Card key={k}>
              <p className="text-xs uppercase tracking-wide text-gray-500">{k}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{loading ? '…' : (v ?? 0)}</p>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'Tools' && (
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Tools ({filteredTools.length})</h2>
            <div className="flex gap-2">
              <div className="w-64"><SearchInput value={toolsQuery} onChange={setToolsQuery} onClear={() => setToolsQuery('')} placeholder="Search name/category" /></div>
              <button onClick={() => setEditing({ tool: { ...EMPTY_TOOL }, isNew: true })}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">
                <Plus className="h-4 w-4" /> Add Tool
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700">
                <th className="px-3 py-2">Name</th><th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Pricing</th><th className="px-3 py-2">Affiliate</th>
                <th className="px-3 py-2">Status</th><th className="px-3 py-2">Actions</th>
              </tr></thead>
              <tbody>
                {pageTools.map((tool) => (
                  <tr key={getToolSlug(tool)} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{tool.name}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{tool.category || '—'}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{tool.pricing || '—'}</td>
                    <td className="px-3 py-2">{tool.affiliate_url ? <span className="text-emerald-500">✓</span> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2">{tool.hidden ? <span className="text-amber-500">Hidden</span> : <span className="text-emerald-500">Live</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        <button onClick={() => openEdit(tool)} title="Edit" className="rounded border border-gray-300 p-1.5 dark:border-gray-700"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setAffiliate(tool)} title="Affiliate URL" className="rounded border border-gray-300 p-1.5 dark:border-gray-700"><Link2 className="h-4 w-4" /></button>
                        <button onClick={() => toggleHide(tool)} title={tool.hidden ? 'Show' : 'Hide'} className="rounded border border-gray-300 p-1.5 dark:border-gray-700">{tool.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                        <button onClick={() => removeTool(tool)} title="Delete" className="rounded border border-rose-300 p-1.5 text-rose-600 dark:border-rose-500/40"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-gray-500">Page {toolsPage}/{totalPages}</span>
            <div className="flex gap-2">
              <button disabled={toolsPage <= 1} onClick={() => setToolsPage((p) => p - 1)} className="rounded border border-gray-300 px-3 py-1 disabled:opacity-50 dark:border-gray-700">Prev</button>
              <button disabled={toolsPage >= totalPages} onClick={() => setToolsPage((p) => p + 1)} className="rounded border border-gray-300 px-3 py-1 disabled:opacity-50 dark:border-gray-700">Next</button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'Submissions' && (
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Pending Submissions ({submissions.length})</h2>
          <div className="space-y-3">
            {submissions.map((s) => (
              <div key={s.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{s.name} <span className="text-xs text-gray-500">· {s.category} · {s.pricing_model}</span></p>
                    <a href={s.website} target="_blank" rel="noreferrer" className="text-xs text-indigo-500">{s.website}</a>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{s.description}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => reviewSubmission(s.id, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">Approve</button>
                    <button onClick={() => reviewSubmission(s.id, 'reject')} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs dark:border-gray-700">Reject</button>
                  </div>
                </div>
              </div>
            ))}
            {submissions.length === 0 && <p className="text-sm text-gray-500">No pending submissions.</p>}
          </div>
        </Card>
      )}

      {activeTab === 'Analytics' && (
        <div className="space-y-4">
          {!analytics ? <Card><p className="text-sm text-gray-500">Loading…</p></Card> : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  ['Outbound clicks', analytics.outbound?.total],
                  ['Affiliate clicks', analytics.outbound?.affiliate],
                  ['Clicks (30d)', analytics.outbound?.last_30d],
                  ['Favorites', analytics.favorites_total],
                ].map(([k, v]) => (
                  <Card key={k}><p className="text-xs uppercase text-gray-500">{k}</p><p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">{v ?? 0}</p></Card>
                ))}
              </div>
              <Card>
                <h3 className="mb-3 font-semibold text-gray-900 dark:text-white">Top clicked tools</h3>
                {(analytics.outbound?.top || []).map((r) => (
                  <div key={r.slug} className="flex justify-between border-b border-gray-100 py-1.5 text-sm dark:border-gray-800">
                    <span className="text-gray-700 dark:text-gray-300">{r.slug}</span><span className="font-semibold">{r.clicks}</span>
                  </div>
                ))}
                {(analytics.outbound?.top || []).length === 0 && <p className="text-sm text-gray-500">No clicks recorded yet.</p>}
              </Card>
            </>
          )}
        </div>
      )}

      {activeTab === 'Email' && (
        <Card>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">New-tools Email Digest</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Dry-run shows how many new tools / recipients without sending. Send emails opted-in users.
            (Requires SMTP_* env vars set on the server.)
          </p>
          <div className="mt-4 flex gap-2">
            <button disabled={!!digestBusy} onClick={() => runDigest(true)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold disabled:opacity-60 dark:border-gray-700 dark:text-gray-200">
              {digestBusy === 'dry' ? 'Checking…' : 'Dry run'}
            </button>
            <button disabled={!!digestBusy} onClick={() => { if (window.confirm('Send the digest email to all opted-in users now?')) runDigest(false) }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {digestBusy === 'send' ? 'Sending…' : 'Send digest'}
            </button>
          </div>
        </Card>
      )}

      {activeTab === 'Flags' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Feature Flags</h2>
            <button onClick={() => {
              const k = window.prompt('New flag key (e.g. pro_tier):')
              if (k) setFlag(k.trim(), { enabled: false })
            }} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">+ New flag</button>
          </div>
          <div className="space-y-2">
            {flags.map((f) => (
              <div key={f.key} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                <span className="font-mono text-sm text-gray-800 dark:text-gray-200">{f.key}</span>
                <button onClick={() => setFlag(f.key, { enabled: !f.enabled })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${f.enabled ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                  {f.enabled ? 'ON' : 'OFF'}
                </button>
              </div>
            ))}
            {flags.length === 0 && <p className="text-sm text-gray-500">No flags yet.</p>}
          </div>
        </Card>
      )}

      {activeTab === 'Users' && (
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Users ({users.length})</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr className="border-b border-gray-200 text-gray-500 dark:border-gray-700">
                <th className="px-3 py-2">Email</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Joined</th><th className="px-3 py-2">Admin</th>
              </tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{u.email}</td>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{u.name || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-3 py-2">{u.is_admin ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'Reviews' && (
        <Card>
          <h2 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Reviews</h2>
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="flex items-start justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div><p className="font-medium text-gray-900 dark:text-gray-100">{r.user} · <span className="text-xs text-gray-500">{r.tool_slug}</span></p><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{r.body}</p></div>
                <button onClick={async () => {
                  if (!window.confirm('Delete this review?')) return
                  try { await api(`/api/v1/admin/reviews/${r.id}`, { method: 'DELETE' }); setReviews((p) => p.filter((x) => x.id !== r.id)); toast.success('Deleted') }
                  catch (e) { toast.error(e.message) }
                }} className="rounded border border-rose-300 p-2 text-rose-600 dark:border-rose-500/40"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {reviews.length === 0 && <p className="text-sm text-gray-500">No reviews.</p>}
          </div>
        </Card>
      )}

      {editing && (
        <ToolForm
          initial={editing.tool}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSaved={reloadTools}
        />
      )}
    </div>
  )
}

export default AdminPage
