import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ExternalLink, RefreshCw, Undo2 } from 'lucide-react'

// The campaign console: an instrument for spending a fixed budget of 45
// emails, not a list for processing volume.
//
// The old Outreach tab was a flat candidate list with a status filter. That is
// the right tool when the job is "work through whatever discovery found" — and
// the wrong one entirely when the job is "choose 45 companies out of hundreds
// and email them once". Choosing needs three things the old list could not
// show:
//
//   1. What has been spent. A finite budget with no counter is a budget nobody
//      is tracking, and the daily-rate model had no notion of a total.
//   2. Why a candidate scored what it did. Approving a send off a bare number
//      is not a judgement, it is a click. Every scored signal is rendered as a
//      hit or a miss so the score is auditable at a glance.
//   3. What the bar rejected, and at which gate. Invisible before. Without it
//      there is no way to tell a bar that is correctly strict from one that is
//      broken — if everything dies at no_qualifying_price, the price extractor
//      is failing on real pricing pages rather than the market being poor.

const POOL_LABEL = {
  inbound: { label: 'Inbound', hint: 'Submitted a tool to us first' },
  traffic: { label: 'Traffic', hint: 'Already listed, we send them clicks' },
  cold: { label: 'Cold', hint: 'Discovered, no prior contact' },
}

const GATE_LABEL = {
  site_unreachable: 'Site unreachable',
  no_pricing_page: 'No pricing page',
  no_qualifying_price: 'No qualifying price',
  domain_too_new: 'Domain too new',
  domain_too_old: 'Domain too old',
  below_score: 'Below the score bar',
}

const QUEUES = [
  ['review', 'Needs review'],
  ['approved', 'Approved'],
  ['sent', 'Sent'],
  ['rejected', 'Rejected at gate'],
]

function Meter({ label, value, sub, pct, tone = 'accent' }) {
  const bar = tone === 'warn' ? 'bg-amber-500' : tone === 'bad' ? 'bg-red-500' : 'bg-accent'
  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-ink">{value}</span>
        {sub && <span className="text-xs font-medium text-ink-2">{sub}</span>}
      </div>
      {pct != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-sunk">
          <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
      )}
    </div>
  )
}

// A scored signal, shown as what it actually was: found, or not found.
function Evidence({ item }) {
  const cls = item.hit
    ? 'border-accent/40 bg-accent-soft/30 text-accent'
    : 'border-line bg-bg-sunk text-muted-2'
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${cls}`}>
      {item.detail}
      {item.hit && item.weight > 0 && (
        <span className="font-bold tabular-nums opacity-70">+{item.weight}</span>
      )}
    </span>
  )
}

function CandidateRow({ c, onApprove, busy }) {
  const [open, setOpen] = useState(false)
  const pool = POOL_LABEL[c.lead_pool] || { label: c.lead_pool || 'Unpooled', hint: '' }
  const evidence = c.qualification?.evidence || []
  const prices = c.qualification?.prices
  const isApproved = c.status === 'approved'

  return (
    <div className="border-t border-line py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{c.product_name}</span>
            <span
              title={pool.hint}
              className="rounded border border-line bg-bg-sunk px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-2"
            >
              {pool.label}
            </span>
            {isApproved && (
              <span className="rounded border border-accent bg-accent-soft/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                Approved
              </span>
            )}
            {c.failed_gate && (
              <span className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-500">
                {GATE_LABEL[c.failed_gate] || c.failed_gate}
              </span>
            )}
            {c.website_url && (
              <a
                href={c.website_url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-2 hover:text-accent"
                aria-label={`Open ${c.product_name}`}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <div className="mt-1 text-xs text-ink-2">
            {c.email || <span className="text-amber-600">No email found</span>}
            {prices?.min_monthly != null && (
              <span className="ml-2 text-muted-2">
                · ${prices.min_monthly}
                {prices.max_monthly !== prices.min_monthly && `–$${prices.max_monthly}`}/mo
              </span>
            )}
          </div>

          {evidence.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {evidence.map((e, i) => <Evidence key={i} item={e} />)}
            </div>
          )}

          {c.draft_body && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline"
            >
              <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
              {open ? 'Hide' : 'Read'} the draft
            </button>
          )}
          {open && (
            <div className="mt-2 rounded-lg border border-line bg-bg-sunk p-3">
              <div className="mb-1 text-[11px] font-bold text-ink-2">{c.draft_subject}</div>
              <div
                className="prose-sm max-w-none text-xs text-ink-2 [&_a]:text-accent"
                dangerouslySetInnerHTML={{ __html: c.draft_body }}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums text-ink">
              {c.fit_score ?? '—'}
            </div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2">score</div>
          </div>
          {(c.status === 'draft_ready' || isApproved) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove(c, !isApproved)}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                isApproved
                  ? 'border border-line bg-bg text-ink-2 hover:bg-bg-sunk'
                  : 'bg-accent text-bg hover:opacity-90'
              }`}
            >
              {isApproved ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              {isApproved ? 'Undo' : 'Approve'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OutreachCampaignPanel({ api }) {
  const [status, setStatus] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [gates, setGates] = useState(null)
  const [queue, setQueue] = useState('review')
  const [poolFilter, setPoolFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, c, g] = await Promise.all([
        api('/api/v1/admin/outreach/campaign/status'),
        api('/api/v1/admin/outreach/candidates'),
        api('/api/v1/admin/outreach/campaign/gates').catch(() => null),
      ])
      setStatus(s)
      setCandidates(Array.isArray(c) ? c : [])
      setGates(g)
    } catch {
      setError('Could not load the campaign. The outreach API did not respond.')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const approve = useCallback(async (c, approved) => {
    setBusyId(c.id)
    setError('')
    try {
      await api(`/api/v1/admin/outreach/candidates/${c.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ approved }),
      })
      await load()
    } catch (e) {
      // The server refuses approval for the same reasons the sender would —
      // a dead mailbox, a stale draft, an exhausted budget. Showing that
      // reason is the whole point; a silent failure would leave the operator
      // clicking a button that does nothing.
      setError(e?.message || 'Could not approve that candidate.')
    } finally {
      setBusyId(null)
    }
  }, [api, load])

  const visible = useMemo(() => {
    const inCampaign = candidates.filter((c) => c.campaign)
    const byQueue = inCampaign.filter((c) => {
      if (queue === 'review') return c.status === 'draft_ready'
      if (queue === 'approved') return c.status === 'approved'
      if (queue === 'sent') return ['sent', 'followed_up', 'followed_up_2', 'replied'].includes(c.status)
      if (queue === 'rejected') return c.status === 'rejected'
      return true
    })
    return poolFilter === 'all' ? byQueue : byQueue.filter((c) => c.lead_pool === poolFilter)
  }, [candidates, queue, poolFilter])

  const counts = useMemo(() => {
    const inCampaign = candidates.filter((c) => c.campaign)
    return {
      review: inCampaign.filter((c) => c.status === 'draft_ready').length,
      approved: inCampaign.filter((c) => c.status === 'approved').length,
      sent: inCampaign.filter((c) => ['sent', 'followed_up', 'followed_up_2', 'replied'].includes(c.status)).length,
      rejected: inCampaign.filter((c) => c.status === 'rejected').length,
    }
  }, [candidates])

  if (loading && !status) {
    return <div className="py-10 text-center text-sm text-ink-2">Loading campaign…</div>
  }

  const budgetPct = status ? (status.emails_sent / status.send_budget) * 100 : 0
  const revenuePct = status ? (status.revenue / status.revenue_target) * 100 : 0
  const gap = status?.closes_the_gap?.[0]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">Campaign</h3>
          <p className="text-xs text-ink-2">
            {status?.campaign} · budget is a lifetime total, not a daily rate
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg-elev px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-bg-sunk"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Meter
              label="Send budget"
              value={status.emails_sent}
              sub={`/ ${status.send_budget}`}
              pct={budgetPct}
            />
            <Meter
              label="Replies"
              value={status.replied}
              sub={status.emails_sent ? `/ ${status.emails_sent} sent` : 'none sent yet'}
              pct={status.emails_sent ? (status.replied / status.emails_sent) * 100 : 0}
            />
            <Meter
              label="Revenue"
              value={`$${status.revenue}`}
              sub={`/ $${status.revenue_target}`}
              pct={revenuePct}
              tone={revenuePct >= 100 ? 'accent' : 'warn'}
            />
            <Meter
              label="Sent today"
              value={status.sent_today ?? 0}
              sub={`/ ${status.daily_send_max} max`}
              pct={status.daily_send_max ? ((status.sent_today ?? 0) / status.daily_send_max) * 100 : 0}
            />
            <Meter
              label="Days to deadline"
              value={status.days_to_deadline}
              sub={status.deadline}
              tone={status.days_to_deadline <= 5 ? 'bad' : 'warn'}
            />
          </div>

          {/* The arithmetic that is easy to get wrong: two Fast-Track sales
              are $98 against a $100 target. Said out loud here rather than
              rediscovered after two closes. */}
          {gap && (
            <div className="rounded-lg border border-line bg-bg-sunk px-3 py-2 text-xs text-ink-2">
              <span className="font-semibold text-ink">${status.revenue_remaining} to go.</span>{' '}
              Fewest sales that clear it:{' '}
              {gap.reviewed > 0 && `${gap.reviewed} × Reviewed $79`}
              {gap.reviewed > 0 && gap.fast_track > 0 && ' + '}
              {gap.fast_track > 0 && `${gap.fast_track} × Fast-Track $49`}
              {' '}= ${gap.total}.
              {status.revenue_remaining > 98 && (
                <span className="ml-1 text-amber-600">
                  Two Fast-Track sales are $98 — they do not reach it.
                </span>
              )}
            </div>
          )}
        </>
      )}

      {status && status.daily_remaining === 0 && counts.approved > 0 && (
        <div className="rounded-lg border border-line bg-bg-sunk px-3 py-2 text-xs text-ink-2">
          <span className="font-semibold text-ink">
            Today&apos;s {status.daily_send_max} are sent.
          </span>{' '}
          {counts.approved} approved {counts.approved === 1 ? 'email goes' : 'emails go'} out
          tomorrow. Outreach sends from an address with no sending history, so the batch is
          spread deliberately rather than burst.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {QUEUES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setQueue(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              queue === key
                ? 'bg-accent text-bg'
                : 'border border-line bg-bg-elev text-ink-2 hover:bg-bg-sunk'
            }`}
          >
            {label} <span className="tabular-nums opacity-70">({counts[key] ?? 0})</span>
          </button>
        ))}

        <select
          value={poolFilter}
          onChange={(e) => setPoolFilter(e.target.value)}
          className="ml-auto rounded-lg border border-line bg-bg-elev px-2 py-1.5 text-xs font-semibold text-ink-2"
          aria-label="Filter by lead pool"
        >
          <option value="all">All pools</option>
          <option value="inbound">Inbound</option>
          <option value="traffic">Traffic</option>
          <option value="cold">Cold</option>
        </select>
      </div>

      {queue === 'rejected' && gates?.by_gate && Object.keys(gates.by_gate).length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-line bg-bg-sunk p-3">
          {Object.entries(gates.by_gate).map(([gate, n]) => (
            <span key={gate} className="text-[11px] text-ink-2">
              <span className="font-bold tabular-nums text-ink">{n}</span>{' '}
              {GATE_LABEL[gate] || gate}
            </span>
          ))}
          <span className="ml-auto text-[11px] text-muted-2">
            If nearly everything dies at one gate, that gate is the thing to check.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-line bg-bg-elev px-4 pb-2">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-2">
            {candidates.some((c) => c.campaign)
              ? 'Nothing in this queue.'
              : 'No campaign candidates yet — run the inbound import or an archive discovery.'}
          </p>
        ) : (
          visible.map((c) => (
            <CandidateRow key={c.id} c={c} onApprove={approve} busy={busyId === c.id} />
          ))
        )}
      </div>
    </div>
  )
}
