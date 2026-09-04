import { useCallback, useEffect, useState } from 'react'
import { Ban, CalendarPlus, Loader2, Plus, Trash2 } from 'lucide-react'

const INPUT =
  'w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30'
const BTN_PRIMARY =
  'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-60'
const BTN_GHOST =
  'rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-bg-sunk disabled:opacity-60'

const PLACEMENTS = [
  { id: 'hero', label: 'Community Spotlight ($149/wk)' },
  { id: 'board', label: 'Presenting Partner ($89/wk)' },
  { id: 'rail', label: 'Featured Tool ($14.99/wk)' },
]

const EMPTY = {
  tool_slug: '', placement: 'rail', weeks: 1,
  amount_paid: '', contact_email: '', headline: '', blurb: '', cta_label: '',
}

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

function statusOf(slot) {
  const now = Date.now()
  const start = new Date(slot.starts_at).getTime()
  const end = new Date(slot.ends_at).getTime()
  if (!slot.is_active) return { label: 'Paused', tone: 'border-line bg-bg-sunk text-muted' }
  if (end <= now) return { label: 'Ended', tone: 'border-line bg-bg-sunk text-muted-2' }
  if (start > now) return { label: 'Scheduled', tone: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300' }
  return { label: 'Live', tone: 'border-accent/40 bg-accent-soft text-accent-ink' }
}

export default function SponsorSlotsPanel() {
  const [slots, setSlots] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/api/v1/community/admin/slots')
      setSlots(data.slots || [])
      setInventory(data.inventory || [])
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load slots')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    setSaving(true)
    try {
      await api('/api/v1/community/admin/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount_paid: Number(form.amount_paid) || 0 }),
      })
      setForm(EMPTY)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not create slot')
    } finally {
      setSaving(false)
    }
  }

  const patch = async (id, body) => {
    setBusyId(id)
    try {
      await api(`/api/v1/community/admin/slots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await load()
    } catch (err) {
      setError(err.message || 'Could not update slot')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this slot permanently? Its impressions stay in the reporting tables.')) return
    setBusyId(id)
    try {
      await api(`/api/v1/community/admin/slots/${id}`, { method: 'DELETE' })
      await load()
    } catch (err) {
      setError(err.message || 'Could not delete slot')
    } finally {
      setBusyId(null)
    }
  }

  const revenue = slots.reduce((sum, s) => sum + (s.amount_paid || 0), 0)

  return (
    <div className="space-y-5">
      {/* Inventory at a glance — what's sellable right now. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {inventory.map((row) => (
          <div key={row.placement} className="rounded-2xl border border-line bg-bg-elev p-4">
            <div className="text-xs font-semibold text-muted">{row.label}</div>
            <div className="mt-1 text-lg font-extrabold tabular-nums text-ink">
              {row.taken}/{row.capacity}
              <span className="ml-1.5 text-xs font-semibold text-muted">filled</span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-2">${row.price_weekly}/week</div>
          </div>
        ))}
        <div className="rounded-2xl border border-line bg-bg-elev p-4">
          <div className="text-xs font-semibold text-muted">Booked revenue</div>
          <div className="mt-1 text-lg font-extrabold tabular-nums text-ink">${revenue.toFixed(2)}</div>
          <div className="mt-0.5 text-[11px] text-muted-2">last 200 slots</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">Sponsor slots</h3>
        <button type="button" onClick={() => setShowForm((v) => !v)} className={BTN_PRIMARY}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {showForm ? 'Cancel' : 'Add slot manually'}
          </span>
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-ink-2">
          {error}
        </p>
      )}

      {showForm && (
        <div className="rounded-2xl border border-line bg-bg-elev p-5">
          <p className="text-xs text-muted">
            For comped placements, make-goods, and invoiced deals that never went through PayPal.
            Self-serve bookings appear here automatically.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input
              className={INPUT}
              placeholder="Tool slug (e.g. cursor)"
              value={form.tool_slug}
              onChange={(e) => setForm({ ...form, tool_slug: e.target.value.trim().toLowerCase() })}
            />
            <select
              className={INPUT}
              value={form.placement}
              onChange={(e) => setForm({ ...form, placement: e.target.value })}
            >
              {PLACEMENTS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input
              className={INPUT}
              type="number"
              min="1"
              max="12"
              placeholder="Weeks"
              value={form.weeks}
              onChange={(e) => setForm({ ...form, weeks: Number(e.target.value) })}
            />
            <input
              className={INPUT}
              type="number"
              step="0.01"
              placeholder="Amount paid (0 for comp)"
              value={form.amount_paid}
              onChange={(e) => setForm({ ...form, amount_paid: e.target.value })}
            />
            <input
              className={INPUT}
              placeholder="Contact email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value.trim() })}
            />
            <input
              className={INPUT}
              placeholder="CTA label (default: Visit site)"
              value={form.cta_label}
              onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
            />
            <input
              className={`${INPUT} sm:col-span-2`}
              placeholder="Headline (hero/board only)"
              maxLength={140}
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
            />
            <textarea
              className={`${INPUT} sm:col-span-2`}
              rows={2}
              placeholder="Blurb (hero only)"
              maxLength={280}
              value={form.blurb}
              onChange={(e) => setForm({ ...form, blurb: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={create}
            disabled={saving || !form.tool_slug}
            className={`${BTN_PRIMARY} mt-4`}
          >
            {saving ? 'Creating…' : 'Create slot'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading slots…
        </p>
      ) : slots.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk px-4 py-10 text-center text-sm text-muted">
          No sponsor slots yet. Self-serve bookings from /sponsor land here automatically.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-bg-sunk text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Tool</th>
                <th className="px-3 py-2.5 font-semibold">Placement</th>
                <th className="px-3 py-2.5 font-semibold">Runs</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Paid</th>
                <th className="px-3 py-2.5 text-right font-semibold">Impr.</th>
                <th className="px-3 py-2.5 text-right font-semibold">Clicks</th>
                <th className="px-3 py-2.5 text-right font-semibold">CTR</th>
                <th className="px-3 py-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {slots.map((slot) => {
                const status = statusOf(slot)
                return (
                  <tr key={slot.id} className="bg-bg-elev">
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-ink">{slot.tool_slug}</div>
                      {slot.contact_email && (
                        <div className="text-[11px] text-muted-2">{slot.contact_email}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-2">{slot.label}</td>
                    <td className="px-3 py-2.5 text-xs text-muted">
                      {new Date(slot.starts_at).toLocaleDateString()} →{' '}
                      {new Date(slot.ends_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.tone}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">
                      ${(slot.amount_paid || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{slot.impressions}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{slot.clicks}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-2">{slot.ctr}%</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyId === slot.id}
                          onClick={() => patch(slot.id, { extend_weeks: 1 })}
                          className={BTN_GHOST}
                          title="Extend by one week"
                        >
                          <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === slot.id}
                          onClick={() => patch(slot.id, { is_active: !slot.is_active })}
                          className={BTN_GHOST}
                          title={slot.is_active ? 'Pause' : 'Resume'}
                        >
                          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === slot.id}
                          onClick={() => remove(slot.id)}
                          className={`${BTN_GHOST} text-danger`}
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-2">
        Impressions/clicks/CTR are over the last 90 days for the tool, across all its placements.
        Pausing a slot removes it from the site immediately but keeps its delivery history.
      </p>
    </div>
  )
}
