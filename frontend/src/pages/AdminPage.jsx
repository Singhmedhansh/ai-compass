import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Link2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import SearchInput from '../components/ui/SearchInput'
import EditorialReviewsPanel from '../components/admin/EditorialReviewsPanel'
import ToolClaimsPanel from '../components/admin/ToolClaimsPanel'
import SponsorSlotsPanel from '../components/admin/SponsorSlotsPanel'
import ListingsPanel from '../components/admin/ListingsPanel'
import OutreachCampaignPanel from '../components/admin/OutreachCampaignPanel'
import PostSalePanel from '../components/admin/PostSalePanel'

// ESLint no-unused-vars doesn't recognise JSX namespaced tags (<MotionDiv>)
// as a usage of `motion`. Alias to constants to satisfy the rule — same
// pattern as the Best* listicle pages.
const MotionDiv = motion.div
const MotionSpan = motion.span

const ADMIN_EMAILS = ['singhmedhansh07@gmail.com']
const TOOLS_PAGE_SIZE = 15
const TABS = ['Overview', 'Tools', 'Sync', 'Submissions', 'Listings', 'Post-sale', 'Claims', 'Sponsors', 'Feedback', 'Analytics', 'Tier Breakdown', 'Email', 'Newsletter', 'Flags', 'Users', 'Reviews', 'Links', 'Outreach']

const EMPTY_TOOL = {
  slug: '', name: '', tagline: '', description: '', category: '',
  subCategory: '', pricing: '', link: '', affiliate_url: '',
  features: '', tags: '', use_cases: '', last_verified_at: '',
  studentPerk: false, hidden: false, editorial_blurb: '',
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
  // fetch() has no default timeout — a wedged backend request would otherwise
  // hang forever, leaving action buttons stuck on "Sending…" with no error.
  const { timeoutMs = 60000, ...fetchOpts } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // Declare the body as JSON. Without this header Flask's
  // request.get_json(silent=True) returns None no matter what was actually
  // sent, so every POST body from this panel was silently discarded and each
  // endpoint fell back to its defaults.
  //
  // That failed quietly rather than loudly, which is why it survived: an
  // endpoint whose flag defaults to the harmless value (approve, which
  // defaults to approved=true) looks like it works, while one whose flag
  // defaults to the SAFE value does the safe thing forever. The inbound
  // import defaults to a dry run, so "Import into campaign" ran a count and
  // reported 0 imported - correct behaviour for the request it actually
  // received, and nothing like the request that was intended.
  //
  // Only for string bodies: FormData must be left alone so the browser can
  // set its own multipart boundary, and an explicit Content-Type from a
  // caller always wins.
  const headers = { ...(fetchOpts.headers || {}) }
  const hasContentType = Object.keys(headers).some(
    (k) => k.toLowerCase() === 'content-type',
  )
  if (typeof fetchOpts.body === 'string' && !hasContentType) {
    headers['Content-Type'] = 'application/json'
  }

  let res
  try {
    res = await fetch(url, {
      credentials: 'include',
      signal: controller.signal,
      ...fetchOpts,
      headers,
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s — the server may be busy. Try again in a moment.`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
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
    <MotionDiv
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <MotionDiv
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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

        {/* Sponsored-tier only — never shown/editable for Free or Quick
            Review tools, since the blurb never displays for them either
            (see apply_editorial_blurb() in app/tool_cache.py). Gated on the
            server's _sponsored_active() result, not the raw `sponsored`
            flag, so a lapsed sponsorship also hides this to avoid editing
            a field that currently has no effect. */}
        {isNew ? null : form._sponsoredActive ? (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent-soft/20 p-4">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-accent">
                Editorial blurb (Sponsored only)
              </span>
              <span className="mt-1 block text-xs text-muted">
                Hand-written, AI-Compass-voiced copy shown instead of the founder's own description
                everywhere this tool appears. Leave blank to fall back to their description.
              </span>
              <textarea
                value={form.editorial_blurb}
                onChange={set('editorial_blurb')}
                rows={3}
                className={INPUT}
                placeholder="We tested this for two weeks and..."
              />
            </label>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-2">
            Editorial blurb is only available for Sponsored-tier tools — this tool isn't currently sponsored.
          </p>
        )}
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
    </MotionDiv>
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
  const [submissionsErr, setSubmissionsErr] = useState('')
  // The queue used to be pending-only, which meant the time-boxed perks an
  // approval grants were invisible the moment they started running.
  const [submissionStatus, setSubmissionStatus] = useState('pending')
  const [feedback, setFeedback] = useState([])
  const [feedbackUnread, setFeedbackUnread] = useState(0)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsErr, setAnalyticsErr] = useState('')
  const [tierStats, setTierStats] = useState(null)
  const [tierStatsErr, setTierStatsErr] = useState('')
  // Live PayPal credential health. This is a real OAuth round-trip against
  // PayPal on every load, not a config echo — the whole point is that a
  // config echo would have shown "client id set, secret set" and told us
  // nothing, while the credentials silently could not authenticate.
  const [paypalHealth, setPaypalHealth] = useState(null)
  const [paypalHealthErr, setPaypalHealthErr] = useState('')
  const [paypalHealthLoading, setPaypalHealthLoading] = useState(false)
  const [flags, setFlags] = useState([])
  const [newsletterSubs, setNewsletterSubs] = useState([])
  const [newsletterStats, setNewsletterStats] = useState({ count: 0, new_today: 0, new_this_week: 0 })
  const [catalogDiff, setCatalogDiff] = useState({ db_only: [], json_only: [], matched_count: 0, db_total: 0, json_total: 0 })
  const [catalogDiffLoading, setCatalogDiffLoading] = useState(false)
  const [cacheBusy, setCacheBusy] = useState(false)
  const [syncAllBusy, setSyncAllBusy] = useState(false)
  const [linkAudit, setLinkAudit] = useState({
    is_running: false,
    current_index: 0,
    total_count: 0,
    broken_links: [],
    last_completed: null
  })

  // Outreach pipeline states
  const [candidates, setCandidates] = useState([])
  const [outreachLogs, setOutreachLogs] = useState([])
  const [outreachSubTab, setOutreachSubTab] = useState('campaign')
  const [outreachFilter, setOutreachFilter] = useState('all')
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([])
  const [editingCandidate, setEditingCandidate] = useState(null)
  const [outreachBusy, setOutreachBusy] = useState(null)
  const [manualCandidate, setManualCandidate] = useState({ product_name: '', website_url: '', founder_name: '', email: '', tone: 'peer', tagline: '' })
  const [showManualAdd, setShowManualAdd] = useState(false)

  const [toolsQuery, setToolsQuery] = useState('')
  const [toolsPage, setToolsPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [digestBusy, setDigestBusy] = useState('')
  const [recapBusy, setRecapBusy] = useState('')
  const [reportBusy, setReportBusy] = useState('')
  const [liDrafts, setLiDrafts] = useState(null)
  const [bcSubject, setBcSubject] = useState("What's new on AI Compass")
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

  const [nlPrompt, setNlPrompt] = useState('Draft a weekly newsletter highlighting new AI models and student tools.')
  const [nlDraft, setNlDraft] = useState(null)
  const [nlPreviewHtml, setNlPreviewHtml] = useState(null)
  const [nlBusy, setNlBusy] = useState('')

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('user') || 'null')
    if (!u || !(u.is_admin || ADMIN_EMAILS.includes(u.email))) {
      navigate('/')
      return
    }
    setAuthed(true)
  }, [navigate])

  const reloadTools = useCallback(async () => {
    const data = await api('/api/v1/tools?fields=card')
    setTools(Array.isArray(data) ? data : data.results || [])
  }, [])

  useEffect(() => {
    if (!authed) return
    let on = true
    ;(async () => {
      try {
        const [s, t, u, r] = await Promise.all([
          api('/api/v1/admin/stats').catch(() => ({})),
          api('/api/v1/tools?fields=card').catch(() => []),
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
    if (activeTab === 'Submissions') {
      // A failed load must NOT render as an empty queue. It did, and a real
      // submission that the server could not read looked exactly like no
      // submission at all — so nobody knew to go looking.
      setSubmissionsErr('')
      api(`/api/v1/admin/submissions?status=${submissionStatus}`)
        .then((d) => setSubmissions(Array.isArray(d) ? d : []))
        .catch((e) => { setSubmissions([]); setSubmissionsErr(e.message || 'Could not load submissions.') })
    }
    if (activeTab === 'Feedback') {
      api('/api/v1/admin/feedback')
        .then((d) => { setFeedback(d.feedback || []); setFeedbackUnread(d.unread || 0) })
        .catch(() => { setFeedback([]); setFeedbackUnread(0) })
    }
    if (activeTab === 'Analytics') {
      setAnalyticsErr('')
      api('/api/v1/admin/analytics').then(setAnalytics).catch((e) => setAnalyticsErr(e.message || 'Failed to load analytics'))
    }
    if (activeTab === 'Tier Breakdown') {
      setTierStatsErr('')
      api('/api/v1/admin/tier-breakdown').then(setTierStats).catch((e) => setTierStatsErr(e.message || 'Failed to load tier breakdown'))
      loadPaypalHealth()
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
    if (activeTab === 'Links') {
      api('/api/v1/admin/audit-links')
        .then(setLinkAudit)
        .catch(() => {})
    }
    if (activeTab === 'Outreach') {
      loadOutreachData()
    }
  }, [activeTab, authed, submissionStatus])

  const loadPaypalHealth = useCallback(async () => {
    setPaypalHealthLoading(true)
    setPaypalHealthErr('')
    try {
      setPaypalHealth(await api('/api/v1/admin/diagnostics/paypal'))
    } catch (e) {
      setPaypalHealth(null)
      setPaypalHealthErr(e.message || 'Could not reach the diagnostic endpoint')
    } finally {
      setPaypalHealthLoading(false)
    }
  }, [])

  // Bumped whenever a background outreach job finishes, so self-contained
  // panels with their own state reload too rather than showing pre-job data.
  const [outreachRefreshKey, setOutreachRefreshKey] = useState(0)

  // Approved first, then the rest by newest.
  //
  // 'approved' means a human has reviewed the draft and it is cleared to
  // send, so it is the only status with an action pending on it. Leaving it
  // in id order buried it among sent/bounced/rejected rows and made the
  // send step a hunt.
  const sortApprovedFirst = useCallback((rows) => (
    [...rows].sort((a, b) => {
      const aa = a.status === 'approved' ? 0 : 1
      const bb = b.status === 'approved' ? 0 : 1
      if (aa !== bb) return aa - bb
      return (b.id || 0) - (a.id || 0)
    })
  ), [])

  const loadOutreachData = useCallback(async () => {
    setLoading(true)
    try {
      const [candData, logData] = await Promise.all([
        api('/api/v1/admin/outreach/candidates'),
        api('/api/v1/admin/outreach/logs')
      ])
      setCandidates(candData)
      setOutreachLogs(logData)
    } catch (e) {
      toast.error('Failed to load outreach pipeline data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Wait for a background outreach job and report what it actually did.
  //
  // Every one of these buttons used to fire its POST, toast "running in the
  // background", and then guess with two or three setTimeout reloads. Each
  // job is minutes of LLM and network calls, so the guesses expired long
  // before the work finished: the toast looked identical whether the job
  // rewrote nineteen drafts, rewrote none, or crashed. A button whose only
  // feedback is that it was clicked cannot be told apart from a broken one -
  // and for an afternoon, one of them was.
  //
  // The server already tracks this (_job_start/_job_finish behind
  // /job-status); nothing here needed building, only using.
  const pollOutreachJob = useCallback(async (kind, { toastId, describe }) => {
    const deadline = Date.now() + 10 * 60 * 1000
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() > deadline) {
        toast.error('This is taking longer than 10 minutes. It may still be '
          + 'running — reload to see what has landed.', { id: toastId })
        break
      }
      await new Promise((r) => setTimeout(r, 3000))
      let job = null
      try {
        job = await api('/api/v1/admin/outreach/job-status')
      } catch {
        continue  // transient; keep polling rather than reporting a failure
      }
      if (job && job.kind === kind && !job.running) {
        if (job.error) toast.error(`Failed: ${job.error}`, { id: toastId })
        else toast.success(describe(job.result || {}), { id: toastId })
        setOutreachRefreshKey((k) => k + 1)
        break
      }
      // Rows land as they are processed, so refresh while waiting - the list
      // filling up is the honest progress indicator.
      await loadOutreachData()
    }
    await loadOutreachData()
  }, [api, loadOutreachData])

  // Discovery/re-enrich/etc. chain per-candidate network calls sequentially
  // and can run for several minutes — polling job-status until it actually
  // finishes (rather than guessing with fixed timeouts) is what tells us
  // when it's safe to reload the candidate list and report a real result.
  const waitForOutreachJob = useCallback(async (kind, { intervalMs = 3000, timeoutMs = 10 * 60 * 1000 } = {}) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      let status = null
      try {
        status = await api('/api/v1/admin/outreach/job-status')
      } catch {
        // transient — keep polling
      }
      if (status && status.kind === kind && !status.running) {
        return status
      }
      await new Promise(r => setTimeout(r, intervalMs))
    }
    return null
  }, [])

  useEffect(() => {
    if (!authed || activeTab !== 'Links') return

    let intervalId = null
    const checkState = () => {
      api('/api/v1/admin/audit-links')
        .then(setLinkAudit)
        .catch(() => {})
    }

    if (linkAudit.is_running) {
      intervalId = setInterval(checkState, 2000)
    }
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [authed, activeTab, linkAudit.is_running])


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

  const syncAllUpdates = useCallback(async () => {
    if (!window.confirm('Are you sure you want to overwrite/update all database tools with data from tools.json?')) return
    setSyncAllBusy(true)
    try {
      const d = await api('/api/v1/admin/catalog-sync-all-updates', { method: 'POST' })
      toast.success(`Successfully synced database: ${d.applied} applied, ${d.failed} failed.`)
      reloadTools()
      reloadCatalogDiff()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSyncAllBusy(false)
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
      // sponsored_active gates the editorial-blurb field below — it's the
      // server's _sponsored_active() check (accounts for sponsored_until
      // expiry), not just the raw stored `sponsored` flag.
      setEditing({ tool: { ...data.tool, _sponsoredActive: data.sponsored_active }, isNew: false })
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
  const runRecap = async (dry) => {
    setRecapBusy(dry ? 'dry' : 'send')
    try {
      const d = await api(`/api/v1/admin/recap?${dry ? 'dry_run=1' : ''}`, { method: 'POST' })
      if (d.status === 'noop') toast.message(d.message || 'Nothing to report this week.')
      else toast.success(`${d.status}: ${d.recipients ?? 0} active members${d.delivered != null ? ` · ${d.delivered} sent` : ''}`)
    } catch (e) { toast.error(e.message) } finally { setRecapBusy('') }
  }
  const runFounderReports = async (dry) => {
    setReportBusy(dry ? 'dry' : 'send')
    try {
      const d = await api(`/api/v1/admin/founder-reports?${dry ? 'dry_run=1' : ''}`, { method: 'POST' })
      if (d.status === 'noop') toast.message(d.message || 'Nothing to report this month.')
      else if (d.status === 'deferred') toast.error(d.message || 'Send budget exhausted — deferred.')
      else toast.success(`${d.status}: ${d.reports ?? 0} listings${d.delivered != null ? ` · ${d.delivered} sent` : ''}`)
    } catch (e) { toast.error(e.message) } finally { setReportBusy('') }
  }
  const sendTestRecap = async () => {
    setRecapBusy('test')
    try {
      const d = await api('/api/v1/admin/recap/test', { method: 'POST' })
      if (d.status === 'sent') toast.success(`Sent to ${d.to} — ${d.threads} threads, ${d.board} board rows`)
      else toast.error(d.message || d.status)
    } catch (e) { toast.error(e.message) } finally { setRecapBusy('') }
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

  const draftNewsletter = async () => {
    setNlBusy('drafting')
    try {
      const d = await api('/api/v1/admin/emails/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: nlPrompt })
      })
      setNlDraft(d)
      setNlPreviewHtml(null)
      toast.success('Draft generated!')
    } catch (e) { toast.error(e.message) } finally { setNlBusy('') }
  }

  const previewNewsletter = async () => {
    if (!nlDraft) return
    setNlBusy('previewing')
    try {
      const d = await api('/api/v1/admin/emails/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nlDraft)
      })
      setNlPreviewHtml(d.html)
    } catch (e) { toast.error(e.message) } finally { setNlBusy('') }
  }

  const sendNewsletter = async () => {
    if (!nlDraft) return
    if (!window.confirm('Send this LLM-drafted newsletter to ALL opted-in users now?')) return
    setNlBusy('sending')
    try {
      const d = await api('/api/v1/admin/emails/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nlDraft)
      })
      toast.success(`Delivered to ${d.sent_count}/${d.total_attempted} users`)
    } catch (e) { toast.error(e.message) } finally { setNlBusy('') }
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-ink">
                {submissionStatus === 'pending' ? 'Pending' : submissionStatus === 'approved' ? 'Approved' : 'All'} Submissions ({submissions.length})
              </h2>
              <div className="flex gap-1 rounded-lg border border-line p-1">
                {['pending', 'approved', 'all'].map((k) => (
                  <button
                    key={k}
                    onClick={() => setSubmissionStatus(k)}
                    className={`rounded-md px-3 py-1 text-xs font-medium capitalize ${
                      submissionStatus === k ? 'bg-accent text-white' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {submissions.map((s) => (
                <div key={s.id} className={`rounded-xl border p-4 ${
                  // needs_manual_review outranks priority styling: a payment we
                  // could not confirm may be real money sitting unacknowledged,
                  // which is more urgent than a queue position.
                  s.payment_status === 'needs_manual_review'
                    ? 'border-orange-500/70 bg-orange-500/5'
                    : s.is_priority ? 'border-amber-400/60 bg-amber-500/5' : 'border-line'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    {/* The logo that will ship with the listing — the
                        founder's upload, or the favicon we fetched from
                        their domain at approval. Seeing it before approving
                        is the point; a wrong logo is easier to catch here
                        than on a live card. */}
                    {s.logo_url && (
                      <img
                        src={s.logo_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1"
                        title={s.logo_source === 'upload' ? 'Uploaded by the founder' : 'Fetched from their domain'}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">
                        {s.is_priority && <span className="mr-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">⚡ Priority · Paid</span>}
                        {s.payment_status === 'needs_manual_review' && <span className="mr-2 rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">⚠ Check PayPal — may have paid</span>}
                        {s.payment_status === 'unverified_review' && <span className="mr-2 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">Payment refused by PayPal</span>}
                        {s.name} <span className="text-xs text-muted">· {s.category} · {s.pricing_model}</span>
                      </p>
                      <a href={s.website} target="_blank" rel="noreferrer" className="text-xs text-accent-ink">{s.website}</a>
                      <p className="mt-1 text-sm text-muted">{s.description}</p>
                      {/* The reason and transaction reference, so reconciling
                          the charge in PayPal doesn't need a DB query. */}
                      {s.payment_note && s.payment_status !== 'verified' && (
                        <p className="mt-1 font-mono text-[11px] text-muted break-all">{s.payment_note}</p>
                      )}
                      {/* Time-boxed perks, from the same predicate the
                          community rail and the founder dashboard use. The
                          admin is the only person who can act on a window
                          about to lapse, and had no view of one. */}
                      {s.perk_window && (
                        <p className={`mt-1 text-[11px] font-medium ${
                          s.perk_window.days_remaining <= 5
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-muted'
                        }`}>
                          Complimentary rail unit · {s.perk_window.days_remaining} day{s.perk_window.days_remaining === 1 ? '' : 's'} left
                          {' '}(ends {new Date(s.perk_window.ends_at).toLocaleDateString()})
                        </p>
                      )}
                      {s.status === 'approved' && !s.perk_window && s.payment_status === 'verified' && (
                        <p className="mt-1 text-[11px] text-muted">
                          Complimentary rail window ended · badge and placement are permanent
                        </p>
                      )}
                      {s.queue_age_days != null && s.queue_age_days > 0 && (
                        <p className={`mt-1 text-[11px] ${
                          // Fast-Track promises a 24-hour review. Perk time no
                          // longer burns while a row waits, but the promise does.
                          s.is_priority && s.queue_age_days >= 1
                            ? 'font-medium text-orange-600 dark:text-orange-400'
                            : 'text-muted'
                        }`}>
                          Waiting {s.queue_age_days} day{s.queue_age_days === 1 ? '' : 's'} in review
                          {s.is_priority && s.queue_age_days >= 1 ? ' — past the 24-hour Fast-Track promise' : ''}
                        </p>
                      )}
                      {s.approved_at && (
                        <p className="mt-1 text-[11px] text-muted">
                          Approved {new Date(s.approved_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {s.status === 'pending' ? (
                        <>
                          <button onClick={() => reviewSubmission(s.id, 'approve')} className={`${BTN_PRIMARY} px-3 py-1.5 text-xs`}>Approve</button>
                          <button onClick={() => reviewSubmission(s.id, 'reject')} className={`${BTN_GHOST} px-3 py-1.5 text-xs`}>Reject</button>
                        </>
                      ) : (
                        <span className="rounded-full bg-line/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                          {s.status}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {submissionsErr && (
                <div className="rounded-xl border border-red-500/50 bg-red-500/5 p-4">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">Could not load the queue</p>
                  <p className="mt-1 text-xs text-red-700/90 dark:text-red-300/90">{submissionsErr}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    This is a load failure, not an empty queue — submissions may exist and be unreadable.
                  </p>
                </div>
              )}
              {!submissionsErr && submissions.length === 0 && <p className="text-sm text-muted">No {submissionStatus === 'all' ? '' : `${submissionStatus} `}submissions.</p>}
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
                    <h3 className="font-semibold text-ink flex items-center gap-1.5"><Link2 className="h-4 w-4 text-accent" /> Monetization gaps</h3>
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

        {activeTab === 'Tier Breakdown' && (
          <div className="space-y-4">
            {/* Payment-verification health. This is the row whose absence let a
                broken checkout look like a pricing problem for a month: the
                config was present and plausible the whole time, and only an
                actual OAuth round-trip could tell you it did not work. */}
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-ink">Payment verification</h2>
                  <p className="mt-1 text-sm text-muted">
                    Live check — requests a real OAuth token from PayPal, the same call
                    <code className="mx-1 rounded bg-bg-sunk px-1 py-0.5 text-[11px]">verify_paypal_order()</code>
                    depends on. If this is red, every paid submission silently becomes a free listing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadPaypalHealth}
                  disabled={paypalHealthLoading}
                  className={`${BTN_GHOST} shrink-0 px-3 py-1.5 text-xs disabled:opacity-50`}
                >
                  {paypalHealthLoading ? 'Checking…' : 'Re-check'}
                </button>
              </div>

              {paypalHealthErr ? (
                <p className="mt-4 text-sm text-danger">{paypalHealthErr}</p>
              ) : !paypalHealth ? (
                <p className="mt-4 text-sm text-muted">Checking PayPal credentials…</p>
              ) : (
                <div className="mt-4 space-y-4">
                  {[
                    ['Submissions (/submit)', paypalHealth],
                    ['Sponsorship checkout', paypalHealth.sponsorship],
                  ].filter(([, block]) => block).map(([label, block]) => {
                    const ok = !!block.oauth_token_acquired
                    return (
                      <div
                        key={label}
                        className={`rounded-2xl border p-4 ${ok ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-danger bg-danger-soft'}`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                              ok
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                : 'bg-danger/20 text-danger'
                            }`}
                          >
                            {ok ? '● Live' : '● Misconfigured'}
                          </span>
                          <span className="text-sm font-semibold text-ink">{label}</span>
                        </div>
                        <p className={`mt-2 text-sm ${ok ? 'text-ink-2' : 'text-danger'}`}>{block.verdict}</p>
                        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11px] text-muted sm:grid-cols-3">
                          <span>mode: {block.mode || '—'}</span>
                          <span>secret: {block.client_secret_set ? 'set' : 'MISSING'}</span>
                          <span className="break-all">
                            client id: {block.client_id_preview || '—'}
                            {block.client_id_length ? ` (${block.client_id_length} chars)` : ''}
                          </span>
                        </div>
                        {block.client_id_looks_like_hosted_button && (
                          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                            Heads up: this client ID looks like a hosted-button ID (~25 chars), which cannot
                            call the REST API. A REST app client ID is ~80 characters.
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {tierStatsErr ? (
              <Card><p className="text-sm text-danger">{tierStatsErr}</p></Card>
            ) : !tierStats ? (
              <Card><p className="text-sm text-muted">Loading tier breakdown…</p></Card>
            ) : (
              <>
                <Card>
                  <h2 className="text-xl font-semibold text-ink">Listings by pricing tier</h2>
                  <p className="mt-1 text-sm text-muted">
                    Our submission pricing ladder — not the tool&apos;s own Free/Freemium/Paid label.
                    <b> Live</b> = tools currently shown to visitors. <b>Pending</b> = submissions still
                    awaiting review (queue depth per tier). An unverified paid claim counts as Free.
                  </p>
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {[
                      ['Free', 'free'],
                      ['Listing + Analytics', 'analytics'],
                      ['Fast-Track', 'sponsored'],
                      ['Reviewed', 'reviewed'],
                      // Retired tier: no longer sold, but live rows still
                      // carry it, so it stays visible in reporting.
                      ['Quick Review (retired)', 'quick'],
                    ].map(([label, key]) => (
                      <div key={key} className="rounded-2xl border border-line bg-bg-elev p-5 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
                        <div className="mt-3 flex items-end gap-5">
                          <div>
                            <p className="text-3xl font-bold text-ink">{tierStats.live?.[key] ?? 0}</p>
                            <p className="text-[11px] uppercase tracking-wide text-muted-2">Live</p>
                          </div>
                          <div>
                            <p className="text-3xl font-bold text-ink-2">{tierStats.pending?.[key] ?? 0}</p>
                            <p className="text-[11px] uppercase tracking-wide text-muted-2">Pending</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink-2">
                      Editorial / seed listings <span className="text-muted">(no pricing tier — seeded from tools.json)</span>
                    </span>
                    <span className="text-xl font-bold text-ink">{tierStats.live?.editorial ?? 0}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3 text-sm">
                    <span className="text-muted">Live catalog total</span>
                    <span className="font-semibold text-ink">{tierStats.live_total ?? 0}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted">Pending submissions total</span>
                    <span className="font-semibold text-ink">{tierStats.pending_total ?? 0}</span>
                  </div>
                </Card>

                {/* The counts above fold every unverified paid claim into
                    "Free" — correct for entitlement, but it hides the only
                    signal that matters here: somebody tried to pay. */}
                <Card>
                  <h2 className="text-xl font-semibold text-ink">Paid attempts</h2>
                  <p className="mt-1 text-sm text-muted">
                    Every submission that <b>chose</b> a paid tier, whatever became of the payment.
                    The tier counts above deliberately show these as Free, because an unconfirmed
                    payment must never buy a perk — which is exactly why &ldquo;someone tried to pay
                    and it failed&rdquo; needs its own row.
                  </p>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {[
                      ['Attempts', tierStats.attempts?.total ?? 0, 'text-ink'],
                      ['Verified', tierStats.attempts?.verified ?? 0, 'text-emerald-600 dark:text-emerald-400'],
                      ['Needs review', tierStats.attempts?.needs_manual_review ?? 0, 'text-orange-600 dark:text-orange-400'],
                      ['Refused', tierStats.attempts?.refused ?? 0, 'text-ink-2'],
                      ['Never paid', tierStats.attempts?.no_reference ?? 0, 'text-muted'],
                    ].map(([label, value, tone]) => (
                      <div key={label} className="rounded-2xl border border-line bg-bg-elev p-4 shadow-sm">
                        <p className={`text-2xl font-bold ${tone}`}>{value}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-2">{label}</p>
                      </div>
                    ))}
                  </div>

                  {(tierStats.attempts?.needs_manual_review ?? 0) > 0 && (
                    <p className="mt-4 rounded-xl border border-orange-500/50 bg-orange-500/5 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
                      <b>{tierStats.attempts.needs_manual_review} payment{tierStats.attempts.needs_manual_review === 1 ? '' : 's'} could not be confirmed either way.</b>{' '}
                      These may be real charges. Each one is in the Submissions tab with its
                      reference — search PayPal Activity for it and mark it verified if it captured.
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-sm">
                    <span className="text-muted">Confirmed revenue from submissions</span>
                    <span className="font-semibold text-ink">
                      ${(tierStats.attempts?.revenue_usd ?? 0).toFixed(2)}
                    </span>
                  </div>
                  {(tierStats.test_rows_excluded ?? 0) > 0 && (
                    <p className="mt-2 text-[11px] text-muted-2">
                      Excludes {tierStats.test_rows_excluded} row{tierStats.test_rows_excluded === 1 ? '' : 's'} flagged
                      as owner test data. Shown so the exclusion is visible rather than silent — a reporting
                      screen that quietly drops rows is one you stop trusting.
                    </p>
                  )}
                </Card>

                {(tierStats.failure_reasons || []).length > 0 && (
                  <Card>
                    <h2 className="text-xl font-semibold text-ink">Why payments failed</h2>
                    <p className="mt-1 text-sm text-muted">
                      Reason codes from <code className="rounded bg-bg-sunk px-1 py-0.5 text-[11px]">verify_paypal_order()</code>,
                      most common first. A code repeating across every attempt is a configuration
                      problem, not a run of bad customers.
                    </p>
                    <div className="mt-4 space-y-2">
                      {tierStats.failure_reasons.map(({ reason, count }) => {
                        const top = tierStats.failure_reasons[0]?.count || 1
                        return (
                          <div key={reason} className="flex items-center gap-3">
                            <span className="w-64 shrink-0 truncate font-mono text-[11px] text-ink-2" title={reason}>
                              {reason}
                            </span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg-sunk">
                              <span
                                className="block h-full rounded-full bg-accent"
                                style={{ width: `${Math.max(4, (count / top) * 100)}%` }}
                              />
                            </span>
                            <span className="w-8 shrink-0 text-right font-mono text-xs text-ink">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )}
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
              <h2 className="text-xl font-semibold text-ink">Weekly Community Recap</h2>
              <p className="mt-1 text-sm text-muted">
                Goes only to members who posted, commented, or voted in the last 30 days — not the
                newsletter list. Each email is personalised with that member&apos;s own reputation and rank,
                and carries the sponsored Presenting Partner mention. Sends itself weekly; skips
                entirely in a week with no activity. Dry run shows the audience and content without
                sending.
              </p>
              <div className="mt-4 flex gap-2">
                <button disabled={!!recapBusy} onClick={() => runRecap(true)} className={BTN_GHOST}>{recapBusy === 'dry' ? 'Checking…' : 'Dry run'}</button>
                <button disabled={!!recapBusy} onClick={sendTestRecap} className={BTN_GHOST}>{recapBusy === 'test' ? 'Sending…' : 'Send test to me'}</button>
                <button disabled={!!recapBusy} onClick={() => { if (window.confirm('Send the recap to every active community member now? This is real — use “Send test to me” first.')) runRecap(false) }} className={BTN_PRIMARY}>{recapBusy === 'send' ? 'Sending…' : 'Send recap'}</button>
              </div>
            </Card>

            <Card>
              <h2 className="text-xl font-semibold text-ink">Monthly Listing Report</h2>
              <p className="mt-1 text-sm text-muted">
                Views, clicks, CTR and category rank, emailed to each founder whose listing is on a
                verified paid tier — the numbers they would otherwise have to visit a dashboard for.
                Sends itself monthly and skips a listing with nothing at all to report. Dry run
                shows who would get one and what it would say.
              </p>
              <div className="mt-4 flex gap-2">
                <button disabled={!!reportBusy} onClick={() => runFounderReports(true)} className={BTN_GHOST}>{reportBusy === 'dry' ? 'Checking…' : 'Dry run'}</button>
                <button disabled={!!reportBusy} onClick={() => { if (window.confirm("Email this month's report to every paid founder now? This is real.")) runFounderReports(false) }} className={BTN_PRIMARY}>{reportBusy === 'send' ? 'Sending…' : 'Send reports'}</button>
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

        {activeTab === 'Newsletter' && (
          <div className="space-y-4">
            <Card>
              <h2 className="text-xl font-semibold text-ink">LLM Email Studio</h2>
              <p className="mt-1 text-sm text-muted">
                Use Gemini to draft an intelligent newsletter combining the latest AI models and top trending tools from the catalog.
              </p>
              
              <div className="mt-4">
                <label className="mb-1 block text-sm font-semibold text-ink">Prompt / Instructions</label>
                <textarea
                  value={nlPrompt}
                  onChange={(e) => setNlPrompt(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-line bg-bg-sunk p-3 text-sm text-ink-2"
                />
              </div>

              <div className="mt-4 flex gap-2">
                <button disabled={!!nlBusy} onClick={draftNewsletter} className={BTN_PRIMARY}>
                  {nlBusy === 'drafting' ? 'Drafting with Gemini...' : 'Draft Newsletter'}
                </button>
              </div>
            </Card>

            {nlDraft && (
              <Card>
                <h3 className="mb-2 text-lg font-semibold text-ink">Review Draft JSON</h3>
                <textarea
                  value={JSON.stringify(nlDraft, null, 2)}
                  onChange={(e) => {
                    try {
                      setNlDraft(JSON.parse(e.target.value))
                    } catch(err) {
                      // ignore parse errors while typing
                    }
                  }}
                  rows={15}
                  className="w-full resize-y rounded-lg border border-line bg-bg-sunk p-3 font-mono text-xs text-ink-2"
                />
                <div className="mt-4 flex gap-2">
                  <button disabled={!!nlBusy} onClick={previewNewsletter} className={BTN_GHOST}>
                    {nlBusy === 'previewing' ? 'Rendering...' : 'Render Preview'}
                  </button>
                  <button disabled={!!nlBusy} onClick={sendNewsletter} className={BTN_PRIMARY}>
                    {nlBusy === 'sending' ? 'Sending...' : 'Send to All Users'}
                  </button>
                </div>
              </Card>
            )}

            {nlPreviewHtml && (
              <Card>
                <h3 className="mb-4 text-lg font-semibold text-ink">Live Preview</h3>
                <div className="w-full overflow-hidden rounded-xl border border-line bg-bg-sunk p-4 flex justify-center">
                  <iframe 
                    srcDoc={nlPreviewHtml} 
                    title="Email Preview"
                    className="h-[800px] w-full max-w-[600px] rounded-lg bg-bg-elev shadow-sm"
                  />
                </div>
              </Card>
            )}
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

        {activeTab === 'Listings' && (
          <Card>
            <h2 className="mb-1 text-xl font-semibold text-ink">Listing performance</h2>
            <p className="mb-5 text-sm text-muted">
              The founder dashboard, for every listing at once &mdash; free and paid. Whether a
              listing actually earns click-throughs is the only honest answer to &ldquo;is being
              on AI Compass worth $49&rdquo;, and it is what the next sale is argued from. Free
              rows are here on purpose: a free listing pulling real clicks is the best case for
              upgrading that founder, and one pulling none is a page to fix before charging
              anyone for its twin.
            </p>
            <ListingsPanel api={api} />
          </Card>
        )}

        {activeTab === 'Post-sale' && (
          <Card>
            <PostSalePanel api={api} />
          </Card>
        )}

        {activeTab === 'Claims' && (
          <Card>
            <h2 className="mb-1 text-xl font-semibold text-ink">Listing claims</h2>
            <p className="mb-5 text-sm text-muted">
              Makers asking for edit rights over their own listing. Approving one lets that account
              rewrite the listing&apos;s copy immediately — never its placement, rating, or any
              review we wrote.
            </p>
            <ToolClaimsPanel />
          </Card>
        )}

        {activeTab === 'Sponsors' && (
          <Card>
            <h2 className="mb-1 text-xl font-semibold text-ink">Sponsored placements</h2>
            <p className="mb-5 text-sm text-muted">
              Community slot inventory, delivery numbers, and manual placement.
            </p>
            <SponsorSlotsPanel />

            <div className="mt-8 border-t border-line pt-6">
              <h2 className="mb-1 text-xl font-semibold text-ink">Commissioned reviews</h2>
              <p className="mb-5 text-sm text-muted">
                Hands-on reviews someone has paid for. Each open row owes a founder a published
                page on <code className="rounded bg-bg-sunk px-1.5 py-0.5 text-xs">/tools/&lt;slug&gt;</code> —
                write it here, and publish when it is honest rather than when it is flattering.
              </p>
              <EditorialReviewsPanel />
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

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-line bg-bg-sunk/40 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Sync all updates from tools.json</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Reads tools.json (seed file containing verified pricing, tags, etc.) and overwrites/updates the corresponding rows in the database catalog.
                </p>
              </div>
              <button onClick={syncAllUpdates} disabled={syncAllBusy} className={`${BTN_PRIMARY} shrink-0`}>
                {syncAllBusy ? 'Syncing…' : 'Sync all updates'}
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

        {activeTab === 'Links' && (
          <Card>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">Broken Link Checker</h2>
                <p className="mt-1 text-sm text-muted">
                  Periodically audits external link health across the catalog. Pings URLs in the background and flags 400+ status codes or connection errors.
                </p>
              </div>
              <div className="flex gap-2">
                {linkAudit.is_running ? (
                  <button
                    onClick={async () => {
                      try {
                        await api('/api/v1/admin/audit-links/cancel', { method: 'POST' })
                        toast.info('Cancellation requested...')
                      } catch (e) {
                        toast.error(e.message)
                      }
                    }}
                    className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold px-4 py-2 text-sm shadow-sm transition"
                  >
                    Cancel Audit
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        await api('/api/v1/admin/audit-links', { method: 'POST' })
                        toast.success('Audit started in background')
                        setLinkAudit(prev => ({ ...prev, is_running: true }))
                      } catch (e) {
                        toast.error(e.message)
                      }
                    }}
                    className="rounded-xl bg-accent hover:opacity-90 text-bg font-bold px-4 py-2 text-sm shadow-sm transition"
                  >
                    Start Audit
                  </button>
                )}
              </div>
            </div>

            {/* Audit Status / Progress */}
            {linkAudit.is_running && (
              <div className="mb-6 p-4 rounded-xl border border-line bg-bg-sunk/30">
                <div className="flex justify-between text-xs font-bold text-muted-2 uppercase tracking-wide mb-1">
                  <span>Auditing Catalog Tools...</span>
                  <span>{linkAudit.current_index} / {linkAudit.total_count} ({Math.round((linkAudit.current_index / linkAudit.total_count) * 100)}%)</span>
                </div>
                <div className="h-2 w-full bg-bg-sunk rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${(linkAudit.current_index / linkAudit.total_count) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {!linkAudit.is_running && linkAudit.last_completed && (
              <p className="text-xs text-muted mb-4">
                Last audit completed: <strong>{new Date(linkAudit.last_completed).toLocaleString()}</strong>. Detected <strong>{linkAudit.broken_links.length}</strong> broken links.
              </p>
            )}

            {/* Broken Links Table */}
            <div className="overflow-x-auto">
              <h3 className="text-lg font-semibold text-ink mb-3">Broken Links Flagged ({linkAudit.broken_links.length})</h3>
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="px-3 py-2 font-semibold">Tool Name</th>
                    <th className="px-3 py-2 font-semibold">URL Checked</th>
                    <th className="px-3 py-2 font-semibold">HTTP Status / Error</th>
                    <th className="px-3 py-2 font-semibold w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {linkAudit.broken_links.map((item, idx) => (
                    <tr key={`${item.slug}-${idx}`} className="border-b border-line/60">
                      <td className="px-3 py-2">
                        <span className="font-semibold text-ink block">{item.name}</span>
                        <span className="text-[10px] text-muted-2 block">{item.slug}</span>
                      </td>
                      <td className="px-3 py-2">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-accent hover:underline break-all"
                        >
                          {item.url}
                        </a>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center rounded bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                          {item.error}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={async () => {
                            try {
                              const detail = await api(`/api/v1/admin/tools/${item.slug}`)
                              // Pre-existing bug fixed in passing: this used
                              // to pass the whole {success, tool, ...}
                              // response as `tool`, leaving every ToolForm
                              // field blank when opened from this row.
                              setEditing({ tool: { ...detail.tool, _sponsoredActive: detail.sponsored_active }, isNew: false })
                            } catch (e) {
                              toast.error('Failed to load tool details')
                            }
                          }}
                          className="rounded-md border border-line bg-bg-sunk hover:bg-line text-ink-2 px-2.5 py-1 text-xs font-bold transition cursor-pointer"
                        >
                          Edit URL
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {linkAudit.broken_links.length === 0 && !linkAudit.is_running && (
                <p className="mt-4 text-sm text-muted">
                  No broken links detected! Catalog health looks clean.
                </p>
              )}
            </div>
          </Card>
        )}

        {activeTab === 'Outreach' && (
          <div className="space-y-6">
            {/* Outreach Header Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setOutreachSubTab('campaign')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    outreachSubTab === 'campaign' ? 'bg-accent text-bg' : 'bg-bg-elev border border-line text-ink-2 hover:bg-bg-sunk'
                  }`}
                >
                  Campaign
                </button>
                <button
                  onClick={() => setOutreachSubTab('candidates')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    outreachSubTab === 'candidates' ? 'bg-accent text-bg' : 'bg-bg-elev border border-line text-ink-2 hover:bg-bg-sunk'
                  }`}
                >
                  Candidates
                </button>
                <button
                  onClick={() => setOutreachSubTab('logs')}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    outreachSubTab === 'logs' ? 'bg-accent text-bg' : 'bg-bg-elev border border-line text-ink-2 hover:bg-bg-sunk'
                  }`}
                >
                  Outreach Email Logs
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={outreachBusy === 'discovery'}
                  onClick={async () => {
                    setOutreachBusy('discovery')
                    try {
                      await api('/api/v1/admin/outreach/trigger-discovery', { method: 'POST' })
                      toast.success('Discovery started — this can take several minutes (each candidate is checked and enriched one at a time).')
                      const finalStatus = await waitForOutreachJob('discovery')
                      await loadOutreachData()
                      if (!finalStatus) {
                        toast.error('Discovery is taking longer than expected — check back shortly, it may still be running.')
                      } else if (finalStatus.error) {
                        toast.error(`Discovery failed: ${finalStatus.error}`)
                      } else {
                        const count = finalStatus.result?.new_candidates ?? 0
                        toast.success(count > 0
                          ? `Discovery complete — ${count} new candidate${count === 1 ? '' : 's'} found.`
                          : 'Discovery complete — no new candidates found this run.')
                      }
                    } catch (e) {
                      toast.error(e.message)
                    } finally {
                      setOutreachBusy(null)
                    }
                  }}
                  className={BTN_GHOST}
                >
                  {outreachBusy === 'discovery' ? 'Discovering launches…' : 'Run PH Discovery'}
                </button>
                <button
                  disabled={outreachBusy === 're_enrich'}
                  onClick={async () => {
                    setOutreachBusy('re_enrich')
                    try {
                      await api('/api/v1/admin/outreach/re-enrich', { method: 'POST' })
                      toast.loading('Finding missing emails…', { id: 'reenrich' })
                      await pollOutreachJob('re-enrich', {
                        toastId: 'reenrich',
                        describe: (r) => {
                          const e = r.emails_fixed ?? 0
                          const n = r.names_fixed ?? 0
                          const d = r.drafts_regenerated ?? 0
                          return (e || n || d)
                            ? `Found ${e} email${e === 1 ? '' : 's'}, fixed ${n} name${n === 1 ? '' : 's'}, redrafted ${d}.`
                            : 'Nothing left to enrich — every candidate already has an address.'
                        },
                      })
                    } catch (e) {
                      toast.error(e.message)
                    } finally {
                      setOutreachBusy(null)
                    }
                  }}
                  className={BTN_GHOST}
                >
                  {outreachBusy === 're_enrich' ? 'Enriching missing emails…' : 'Re-Enrich Missing Emails'}
                </button>
                <button
                  disabled={outreachBusy === 'catalog_campaign'}
                  title="Build traffic-report drafts for already-listed tools that are sending real referral clicks"
                  onClick={async () => {
                    setOutreachBusy('catalog_campaign')
                    try {
                      // Preview first — the click threshold decides how many
                      // listed tools qualify, and generating drafts for the
                      // wrong set wastes Gemini calls and admin review time.
                      const p = await api('/api/v1/admin/outreach/catalog-campaign/preview')
                      if (!p.would_create) {
                        toast.error(
                          `No new tools qualify. ${p.eligible} tool(s) have ${p.min_clicks}+ clicks in ${p.days} days, ` +
                          `${p.already_created} already have drafts.`
                        )
                        return
                      }
                      const top = (p.top || []).slice(0, 5).map(t => `  • ${t.slug} — ${t.clicks} clicks`).join('\n')
                      if (!window.confirm(
                        `Build traffic-report drafts for ${p.would_create} listed tool(s)?\n\n` +
                        `${p.eligible} tool(s) have ${p.min_clicks}+ clicks in the last ${p.days} days.\n` +
                        `${p.already_created} already have drafts. Capped at ${p.per_run_limit} per run.\n\n` +
                        `Top by clicks:\n${top}\n\n` +
                        `This only creates drafts for review — nothing is sent.`
                      )) return

                      await api('/api/v1/admin/outreach/catalog-campaign', { method: 'POST' })
                      toast.loading('Building traffic-report drafts…', { id: 'catcamp' })
                      await pollOutreachJob('catalog-campaign', {
                        toastId: 'catcamp',
                        describe: (r) => {
                          const n = r.created ?? r.candidates_created ?? 0
                          return n
                            ? `Built ${n} traffic-report draft${n === 1 ? '' : 's'} for review.`
                            : 'No new traffic-report drafts were created.'
                        },
                      })
                    } catch (e) {
                      toast.error(e.message)
                    } finally {
                      setOutreachBusy(null)
                    }
                  }}
                  className={BTN_GHOST}
                >
                  {outreachBusy === 'catalog_campaign' ? 'Building traffic reports…' : 'Traffic-Report Campaign'}
                </button>
                <button
                  disabled={outreachBusy === 'regenerate_all'}
                  onClick={async () => {
                    if (!window.confirm(
                      'Regenerate every draft that has not been sent? This overwrites any '
                      + 'manual edits to subject/body, and any candidate you have already '
                      + 'approved goes back to Needs review — the approval was given to the '
                      + 'old copy, so it does not carry over to the new copy.'
                    )) return
                    setOutreachBusy('regenerate_all')
                    try {
                      await api('/api/v1/admin/outreach/regenerate-all-drafts', { method: 'POST' })
                      toast.loading('Regenerating drafts…', { id: 'regen' })
                      await pollOutreachJob('regenerate-drafts', {
                        toastId: 'regen',
                        describe: (r) => {
                          const n = r.drafts_regenerated ?? 0
                          const v = r.template_version
                          return n === 0
                            ? 'Nothing to regenerate — every draft is already current.'
                            : `Regenerated ${n} draft${n === 1 ? '' : 's'}`
                              + (v ? ` onto template v${v}` : '') + '.'
                        },
                      })
                      await loadOutreachData()
                    } catch (e) {
                      toast.error(e.message, { id: 'regen' })
                    } finally {
                      setOutreachBusy(null)
                    }
                  }}
                  className={BTN_GHOST}
                >
                  {outreachBusy === 'regenerate_all' ? 'Regenerating drafts…' : 'Regenerate All Drafts'}
                </button>
                <button
                  onClick={() => setShowManualAdd(!showManualAdd)}
                  className={`flex items-center gap-1.5 ${BTN_PRIMARY}`}
                >
                  <Plus className="h-4 w-4" /> Add Candidate
                </button>
              </div>
            </div>

            {/* Manual Add Candidate Card */}
            {showManualAdd && (
              <Card>
                <h3 className="text-lg font-semibold text-ink">Add Outreach Candidate Manually</h3>
                <p className="text-xs text-muted mt-1">Saves the candidate and automatically drafts a Claude-personalized email.</p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Product Name *</span>
                    <input
                      type="text"
                      value={manualCandidate.product_name}
                      onChange={(e) => setManualCandidate({ ...manualCandidate, product_name: e.target.value })}
                      className={INPUT}
                      placeholder="e.g. Mark"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Website URL *</span>
                    <input
                      type="text"
                      value={manualCandidate.website_url}
                      onChange={(e) => setManualCandidate({ ...manualCandidate, website_url: e.target.value })}
                      className={INPUT}
                      placeholder="e.g. https://airtop.ai"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Founder / Maker Name</span>
                    <input
                      type="text"
                      value={manualCandidate.founder_name}
                      onChange={(e) => setManualCandidate({ ...manualCandidate, founder_name: e.target.value })}
                      className={INPUT}
                      placeholder="e.g. Jijo"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Email (optional)</span>
                    <input
                      type="text"
                      value={manualCandidate.email}
                      onChange={(e) => setManualCandidate({ ...manualCandidate, email: e.target.value })}
                      className={INPUT}
                      placeholder="e.g. founder@domain.com"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Tone</span>
                    <select
                      value={manualCandidate.tone}
                      onChange={(e) => setManualCandidate({ ...manualCandidate, tone: e.target.value })}
                      className={INPUT}
                    >
                      <option value="peer">Peer (Congratulatory / PH Launch)</option>
                      <option value="formal">Formal ($75/mo Placement Pitch)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-muted">Tagline / Description</span>
                    <input
                      type="text"
                      value={manualCandidate.tagline}
                      onChange={(e) => setManualCandidate({ ...manualCandidate, tagline: e.target.value })}
                      className={INPUT}
                      placeholder="Tagline or concept"
                    />
                  </label>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setShowManualAdd(false)} className={BTN_GHOST}>Cancel</button>
                  <button
                    disabled={outreachBusy === 'add'}
                    onClick={async () => {
                      if (!manualCandidate.product_name || !manualCandidate.website_url) {
                        return toast.error('Product Name and Website URL are required')
                      }
                      setOutreachBusy('add')
                      try {
                        await api('/api/v1/admin/outreach/candidates', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(manualCandidate)
                        })
                        toast.success('Outreach candidate and draft generated!')
                        setManualCandidate({ product_name: '', website_url: '', founder_name: '', email: '', tone: 'peer', tagline: '' })
                        setShowManualAdd(false)
                        loadOutreachData()
                      } catch (e) {
                        toast.error(e.message)
                      } finally {
                        setOutreachBusy(null)
                      }
                    }}
                    className={BTN_PRIMARY}
                  >
                    {outreachBusy === 'add' ? 'Generating draft…' : 'Generate & Save Draft'}
                  </button>
                </div>
              </Card>
            )}

            {/* Campaign Sub-Tab — the console for spending the 45. The flat
                candidate list below it still exists for the uncampaigned v1
                pool and for ad-hoc lookups. */}
            {outreachSubTab === 'campaign' && <OutreachCampaignPanel api={api} refreshKey={outreachRefreshKey} />}

            {/* Candidates Sub-Tab */}
            {outreachSubTab === 'candidates' && (
              <div className="space-y-4">
                {/* Filters Row */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-9">
                  {[
                    ['all', 'All', candidates.length],
                    ['approved', 'Approved', candidates.filter(c => c.status === 'approved').length],
                    ['draft_ready', 'Draft Ready', candidates.filter(c => c.status === 'draft_ready').length],
                    ['no_email_found', 'No Email', candidates.filter(c => c.status === 'no_email_found').length],
                    ['sent', 'Sent', candidates.filter(c => c.status === 'sent').length],
                    ['followed_up', 'Followed Up', candidates.filter(c => c.status === 'followed_up').length],
                    ['followed_up_2', 'Followed Up 2x', candidates.filter(c => c.status === 'followed_up_2').length],
                    ['bounced', 'Bounced', candidates.filter(c => c.status === 'bounced').length],
                    ['rejected', 'Rejected', candidates.filter(c => c.status === 'rejected').length],
                    ['unsubscribed', 'Unsubscribed', candidates.filter(c => c.status === 'unsubscribed').length]
                  ].map(([status, label, count]) => (
                    <button
                      key={status}
                      onClick={() => setOutreachFilter(status)}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 transition text-center ${
                        outreachFilter === status
                          ? 'border-accent bg-accent/5 text-accent-ink'
                          : 'border-line bg-bg-elev text-ink-2 hover:border-line-strong hover:bg-bg-sunk'
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wider text-muted">{label}</span>
                      <span className="mt-1 text-lg font-bold text-ink">{count}</span>
                    </button>
                  ))}
                </div>

                {/* Bulk Actions Header */}
                {selectedCandidateIds.length > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-accent/20 bg-accent/5 p-4 animate-fade-in">
                    <span className="text-sm font-semibold text-accent-ink">
                      {selectedCandidateIds.length} candidate(s) selected
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Bulk reject ${selectedCandidateIds.length} selected candidate(s)?`)) return
                          setOutreachBusy('bulk')
                          try {
                            await api('/api/v1/admin/outreach/candidates/bulk-reject', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ids: selectedCandidateIds })
                            })
                            toast.success('Bulk rejection successful')
                            setSelectedCandidateIds([])
                            loadOutreachData()
                          } catch (e) {
                            toast.error(e.message)
                          } finally {
                            setOutreachBusy(null)
                          }
                        }}
                        disabled={!!outreachBusy}
                        className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/20"
                      >
                        Skip Selected
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Bulk send emails to ${selectedCandidateIds.length} selected candidate(s)? This will send real emails immediately!`)) return
                          setOutreachBusy('bulk')
                          try {
                            const res = await api('/api/v1/admin/outreach/candidates/bulk-send', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ ids: selectedCandidateIds })
                            })
                            toast.success(`Bulk send complete: ${res.sent} sent, ${res.failed} failed${res.skipped_low_confidence ? `, ${res.skipped_low_confidence} skipped (low confidence)` : ''}.`)
                            setSelectedCandidateIds([])
                            loadOutreachData()
                          } catch (e) {
                            toast.error(e.message)
                          } finally {
                            setOutreachBusy(null)
                          }
                        }}
                        disabled={!!outreachBusy}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90"
                      >
                        Send Selected
                      </button>
                    </div>
                  </div>
                )}

                {/* Candidates List/Table */}
                <Card>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-line text-muted">
                          <th className="px-3 py-2 text-center w-10">
                            <input
                              type="checkbox"
                              checked={
                                candidates.length > 0 &&
                                candidates
                                  .filter(c => outreachFilter === 'all' || c.status === outreachFilter)
                                  .every(c => selectedCandidateIds.includes(c.id))
                              }
                              onChange={(e) => {
                                const visible = candidates.filter(
                                  c => outreachFilter === 'all' || c.status === outreachFilter
                                )
                                if (e.target.checked) {
                                  setSelectedCandidateIds(prev => [
                                    ...prev,
                                    ...visible.map(c => c.id).filter(id => !prev.includes(id))
                                  ])
                                } else {
                                  setSelectedCandidateIds(prev =>
                                    prev.filter(id => !visible.map(c => c.id).includes(id))
                                  )
                                }
                              }}
                              className="rounded border-line bg-bg focus:ring-accent"
                            />
                          </th>
                          <th className="px-3 py-2 font-semibold">Product</th>
                          <th className="px-3 py-2 font-semibold">Founder</th>
                          <th className="px-3 py-2 font-semibold">Email / Source</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Tone</th>
                          <th className="px-3 py-2 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortApprovedFirst(candidates)
                          .filter(c => outreachFilter === 'all' || c.status === outreachFilter)
                          .map((c) => (
                            <tr key={c.id} className="border-b border-line/60 transition hover:bg-bg-sunk/35">
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedCandidateIds.includes(c.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedCandidateIds(prev => [...prev, c.id])
                                    } else {
                                      setSelectedCandidateIds(prev => prev.filter(id => id !== c.id))
                                    }
                                  }}
                                  className="rounded border-line bg-bg focus:ring-accent"
                                />
                              </td>
                              <td className="px-3 py-2 font-medium text-ink">
                                <div className="font-semibold">{c.product_name}</div>
                                <div className="text-[11px] text-muted truncate max-w-xs">{c.tagline || '—'}</div>
                              </td>
                              <td className="px-3 py-2 text-ink-2 font-mono text-xs">{c.founder_name || '—'}</td>
                              <td className="px-3 py-2 text-xs">
                                <div>{c.email || <span className="text-danger italic">No Email Found</span>}</div>
                                {c.email ? (
                                  <div className="text-[10px] text-muted">
                                    via {c.email_source}{' '}
                                    {c.confidence_score ? `(${c.confidence_score}% score)` : ''}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 mt-1">
                                    <a
                                      href={`https://www.google.com/search?q=${encodeURIComponent('"' + c.product_name + '" founder email')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[9px] bg-bg-sunk hover:bg-line text-ink-2 px-1.5 py-0.5 rounded border border-line/45"
                                      title="Search Google for founder email"
                                    >
                                      Google
                                    </a>
                                    <a
                                      href={`https://x.com/search?q=${encodeURIComponent(c.product_name)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[9px] bg-bg-sunk hover:bg-line text-ink-2 px-1.5 py-0.5 rounded border border-line/45"
                                      title="Search X / Twitter"
                                    >
                                      X
                                    </a>
                                    <a
                                      href={`https://github.com/search?q=${encodeURIComponent(c.founder_name || c.product_name)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[9px] bg-bg-sunk hover:bg-line text-ink-2 px-1.5 py-0.5 rounded border border-line/45"
                                      title="Search GitHub"
                                    >
                                      GitHub
                                    </a>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
                                    c.status === 'draft_ready'
                                      ? 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400'
                                      : c.status === 'sent'
                                      ? 'bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400'
                                      : c.status === 'followed_up' || c.status === 'followed_up_2'
                                      ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                                      : c.status === 'replied'
                                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                      : c.status === 'no_email_found'
                                      ? 'bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400'
                                      : c.status === 'unsubscribed'
                                      ? 'bg-orange-500/10 border border-orange-500/20 text-orange-600 dark:text-orange-400'
                                      : 'bg-gray-500/10 border border-gray-500/20 text-gray-500'
                                  }`}
                                >
                                  {c.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted capitalize">{c.tone}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => setEditingCandidate(c)}
                                    title="Review & Edit Draft"
                                    className="rounded-md border border-line bg-bg-sunk hover:bg-line text-ink-2 px-2 py-1 text-xs font-bold transition"
                                  >
                                    Review
                                  </button>
                                  {!c.email && (
                                    <button
                                      onClick={() => {
                                        const inputEmail = window.prompt(`Enter email for ${c.product_name}:`, '')
                                        if (inputEmail && inputEmail.includes('@')) {
                                          api(`/api/v1/admin/outreach/candidates/${c.id}`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email: inputEmail.trim(), regenerate_draft: true })
                                          })
                                          .then(() => {
                                            toast.success('Email saved & draft generated!')
                                            loadOutreachData()
                                          })
                                          .catch(e => toast.error(e.message))
                                        }
                                      }}
                                      className="rounded-md border border-accent/40 bg-accent/10 text-accent-ink px-2 py-1 text-xs font-bold transition hover:bg-accent/20"
                                    >
                                      + Add Email
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        {candidates.filter(c => outreachFilter === 'all' || c.status === outreachFilter).length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center py-6 text-sm text-muted">
                              No candidates in this status filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* Email Logs Sub-Tab */}
            {outreachSubTab === 'logs' && (
              <Card>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="px-3 py-2 font-semibold">Sent to</th>
                        <th className="px-3 py-2 font-semibold">Product</th>
                        <th className="px-3 py-2 font-semibold">Subject</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Sent At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outreachLogs.map((log) => (
                        <tr key={log.id} className="border-b border-line/60 transition hover:bg-bg-sunk/35">
                          <td className="px-3 py-2 font-medium text-ink">{log.email}</td>
                          <td className="px-3 py-2 text-muted">{log.product_name}</td>
                          <td className="px-3 py-2 text-ink-2 font-mono text-xs">{log.subject}</td>
                          <td className="px-3 py-2 text-xs">
                            <span
                              className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${
                                log.status === 'success'
                                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {log.status}
                            </span>
                            {log.error_message && (
                              <div className="text-[10px] text-danger mt-0.5">{log.error_message}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted font-mono">
                            {new Date(log.sent_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {outreachLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-6 text-sm text-muted">
                            No logs found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Editing/Review Proposal Drawer Modal */}
            <AnimatePresence>
              {editingCandidate && (
                <MotionDiv
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                >
                  <MotionDiv
                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98, y: 10 }}
                    className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-line bg-bg-elev p-6 shadow-2xl flex flex-col"
                  >
                    <div className="flex items-center justify-between border-b border-line pb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-ink">
                          Review Proposal: {editingCandidate.product_name}
                        </h3>
                        <p className="text-xs text-muted mt-0.5">
                          Domain: <a href={editingCandidate.website_url} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline">{editingCandidate.website_url}</a>
                          {editingCandidate.founder_name && ` • Founder: ${editingCandidate.founder_name}`}
                        </p>
                      </div>
                      <button
                        onClick={() => setEditingCandidate(null)}
                        className="rounded-full bg-bg-sunk hover:bg-line text-ink-2 p-1.5 transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3 flex-1 overflow-y-auto py-2">
                      {/* Left Sidebar Info */}
                      <div className="space-y-4 lg:border-r lg:border-line lg:pr-4">
                        <label className="block">
                          <span className="text-xs font-medium text-muted">Founder / Contact Name</span>
                          <input
                            type="text"
                            value={editingCandidate.founder_name || ''}
                            onChange={(e) => setEditingCandidate({ ...editingCandidate, founder_name: e.target.value })}
                            className={INPUT}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-muted">
                            {editingCandidate.email_source === 'twitter_handle' ? 'Contact (X Handle)' : 'Contact Email'}
                          </span>
                          <input
                            type="text"
                            value={editingCandidate.email || ''}
                            onChange={(e) => setEditingCandidate({ ...editingCandidate, email: e.target.value })}
                            className={INPUT}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-muted">Tone</span>
                          <select
                            value={editingCandidate.tone}
                            onChange={(e) => setEditingCandidate({ ...editingCandidate, tone: e.target.value })}
                            className={INPUT}
                          >
                            <option value="peer">Peer</option>
                            <option value="formal">Formal</option>
                          </select>
                        </label>
                        <div className="rounded-xl border border-line bg-bg-sunk p-3 text-xs text-muted space-y-1">
                          <div><b>Email Source:</b> {editingCandidate.email_source}</div>
                          {editingCandidate.confidence_score && (
                            <div><b>Confidence Score:</b> {editingCandidate.confidence_score}%</div>
                          )}
                          <div><b>Status:</b> {editingCandidate.status}</div>
                        </div>

                        <div className="space-y-2 pt-2">
                          <button
                            disabled={outreachBusy === 'confirm-email'}
                            onClick={async () => {
                              setOutreachBusy('confirm-email')
                              try {
                                await api(`/api/v1/admin/outreach/candidates/${editingCandidate.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    email: editingCandidate.email,
                                    confidence_score: 100
                                  })
                                })
                                toast.success('Email marked as manually verified')
                                const fresh = await api('/api/v1/admin/outreach/candidates')
                                const updated = fresh.find(x => x.id === editingCandidate.id)
                                if (updated) setEditingCandidate(updated)
                              } catch (e) {
                                toast.error(e.message)
                              } finally {
                                setOutreachBusy(null)
                              }
                            }}
                            className={`${BTN_GHOST} w-full`}
                          >
                            {outreachBusy === 'confirm-email' ? 'Confirming…' : 'Mark Email Manually Verified'}
                          </button>
                          <button
                            disabled={outreachBusy === 'regenerate'}
                            onClick={async () => {
                              setOutreachBusy('regenerate')
                              try {
                                const d = await api(`/api/v1/admin/outreach/candidates/${editingCandidate.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    founder_name: editingCandidate.founder_name,
                                    email: editingCandidate.email,
                                    tone: editingCandidate.tone,
                                    regenerate_draft: true
                                  })
                                })
                                toast.success('Draft proposal regenerated via Claude!')
                                // Fetch latest draft values
                                const fresh = await api('/api/v1/admin/outreach/candidates')
                                const updated = fresh.find(x => x.id === editingCandidate.id)
                                if (updated) setEditingCandidate(updated)
                              } catch (e) {
                                toast.error(e.message)
                              } finally {
                                setOutreachBusy(null)
                              }
                            }}
                            className={`${BTN_GHOST} w-full`}
                          >
                            {outreachBusy === 'regenerate' ? 'Regenerating draft…' : 'Regenerate Draft'}
                          </button>
                        </div>
                      </div>

                      {/* Right Editor content */}
                      <div className="lg:col-span-2 space-y-4">
                        <label className="block">
                          <span className="text-xs font-medium text-muted">Subject</span>
                          <input
                            type="text"
                            value={editingCandidate.draft_subject || ''}
                            onChange={(e) => setEditingCandidate({ ...editingCandidate, draft_subject: e.target.value })}
                            className={INPUT}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-muted">Email Body (HTML)</span>
                          <textarea
                            value={editingCandidate.draft_body || ''}
                            onChange={(e) => setEditingCandidate({ ...editingCandidate, draft_body: e.target.value })}
                            rows={15}
                            className="w-full resize-y rounded-lg border border-line bg-bg-sunk p-3 font-mono text-xs text-ink-2"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-between border-t border-line pt-4">
                      <div>
                        {editingCandidate.status !== 'rejected' && (
                          <button
                            onClick={async () => {
                              if (!window.confirm('Reject this candidate? It will be skipped from outreach.')) return
                              try {
                                await api(`/api/v1/admin/outreach/candidates/${editingCandidate.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ status: 'rejected' })
                                })
                                toast.success('Candidate skipped')
                                setEditingCandidate(null)
                                loadOutreachData()
                              } catch (e) {
                                toast.error(e.message)
                              }
                            }}
                            className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/20"
                          >
                            Skip/Reject
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            try {
                              await api(`/api/v1/admin/outreach/candidates/${editingCandidate.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  founder_name: editingCandidate.founder_name,
                                  email: editingCandidate.email,
                                  tone: editingCandidate.tone,
                                  draft_subject: editingCandidate.draft_subject,
                                  draft_body: editingCandidate.draft_body
                                })
                              })
                              toast.success('Changes saved successfully!')
                              loadOutreachData()
                            } catch (e) {
                              toast.error(e.message)
                            }
                          }}
                          className={BTN_GHOST}
                        >
                          Save changes
                        </button>

                        {editingCandidate.email_source === 'twitter_handle' ? (
                          /* Twitter-only contact: Copy DM + Open on X */
                          <>
                            <button
                              onClick={() => {
                                // Extract plain-text DM from draft body HTML
                                const tmp = document.createElement('div')
                                tmp.innerHTML = editingCandidate.draft_body || ''
                                const plainText = tmp.innerText || tmp.textContent || ''
                                navigator.clipboard.writeText(plainText).then(() => {
                                  toast.success('DM message copied to clipboard!')
                                }).catch(() => {
                                  toast.error('Could not copy — please copy manually')
                                })
                              }}
                              className={BTN_GHOST}
                            >
                              Copy DM
                            </button>
                            <button
                              onClick={() => {
                                const handle = editingCandidate.email || ''
                                const productName = editingCandidate.product_name || 'your product'
                                const tweetText = `Hey ${handle}! Congrats on launching ${productName} 🚀\n\nWe curate top tools for 4,000+ students and I'd love to feature you. My DMs are open, or you can drop me a line!`
                                navigator.clipboard.writeText(tweetText).then(() => {
                                  toast.success('Public tweet copied to clipboard!')
                                }).catch(() => {
                                  toast.error('Could not copy — please copy manually')
                                })
                              }}
                              className={BTN_GHOST}
                            >
                              Copy Public Tweet
                            </button>
                            <a
                              href={`https://x.com/${(editingCandidate.email || '').replace('@', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={BTN_PRIMARY}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                            >
                              Open on X
                            </a>
                          </>
                        ) : (
                          /* Email contact: normal Send button */
                          <button
                            disabled={outreachBusy === 'send' || !editingCandidate.email}
                            onClick={async () => {
                              if (!window.confirm(`Send email to ${editingCandidate.email} now?`)) return
                              setOutreachBusy('send')
                              try {
                                // First save local changes
                                await api(`/api/v1/admin/outreach/candidates/${editingCandidate.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    founder_name: editingCandidate.founder_name,
                                    email: editingCandidate.email,
                                    tone: editingCandidate.tone,
                                    draft_subject: editingCandidate.draft_subject,
                                    draft_body: editingCandidate.draft_body
                                  })
                                })
                                // Then trigger send
                                const sendRes = await api(`/api/v1/admin/outreach/candidates/${editingCandidate.id}/send`, {
                                  method: 'POST'
                                })
                                if (sendRes.success) {
                                  toast.success('Email sent successfully!')
                                  setEditingCandidate(null)
                                  loadOutreachData()
                                } else {
                                  toast.error(sendRes.error || 'Failed to send email')
                                }
                              } catch (e) {
                                toast.error(e.message)
                              } finally {
                                setOutreachBusy(null)
                              }
                            }}
                            className={BTN_PRIMARY}
                          >
                            {outreachBusy === 'send' ? 'Sending email…' : 'Send email now'}
                          </button>
                        )}
                      </div>
                    </div>
                  </MotionDiv>
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>
        )}
      </MotionDiv>

      <AnimatePresence>
        {editing && <ToolForm initial={editing.tool} isNew={editing.isNew} onClose={() => setEditing(null)} onSaved={reloadTools} />}
      </AnimatePresence>
    </div>
  )
}

export default AdminPage
