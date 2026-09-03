import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Clock, Mail, RefreshCw } from 'lucide-react'

// What every paying customer is still owed.
//
// The delivery of a sale was spread across launch_day, editorial, sponsorship
// and founder_report, each on its own schedule, with no screen that answered
// the only question that matters after someone pays: is this customer owed
// anything right now? Every other admin tab is organised around OUR objects -
// listings, claims, slots. This one is organised around the promise.
//
// Sorted worst-first by the API. That ordering is the feature: this is a view
// you open when there is little time left, and a chronological ledger would
// bury the one late thing under nine delivered ones.

const STATE = {
  overdue: {
    label: 'Overdue',
    icon: AlertTriangle,
    cls: 'text-red-700 bg-red-50 border-red-200',
  },
  due: {
    label: 'Due',
    icon: Clock,
    cls: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  done: {
    label: 'Delivered',
    icon: Check,
    cls: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  },
  // Distinct from "due" on purpose: a review cannot be late before the
  // listing it reviews is live. Showing these as pending work would send you
  // chasing something that is not yet owed, which is how a real overdue item
  // gets lost in the noise.
  waiting: {
    label: 'Not yet started',
    icon: Clock,
    cls: 'text-slate-500 bg-slate-50 border-slate-200',
  },
}

const TIER_LABEL = {
  analytics: 'Analytics $19',
  quick: 'Quick (retired)',
  sponsored: 'Fast-Track $49',
  reviewed: 'Reviewed $79',
}

function fmt(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    })
  } catch {
    return null
  }
}

function Meter({ label, value, tone }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-extrabold leading-tight">{value}</div>
    </div>
  )
}

function Obligation({ item }) {
  const meta = STATE[item.state] || STATE.waiting
  const Icon = meta.icon
  const due = fmt(item.due_at)
  const done = fmt(item.done_at)
  return (
    <div className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${meta.cls}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">{item.label}</div>
        {/* The promise sits next to its status so you never have to remember
            what a tier includes to know whether it has been kept. */}
        <div className="text-[11px] opacity-80">{item.promise}</div>
        <div className="text-[11px] opacity-70">
          {item.state === 'done' && done ? `Delivered ${done}` : null}
          {item.state === 'overdue' && due ? `Was due ${due}` : null}
          {item.state === 'due' && due ? `Due ${due}` : null}
          {item.state === 'waiting' ? 'Clock has not started' : null}
          {item.detail ? ` — ${item.detail}` : null}
        </div>
      </div>
    </div>
  )
}

export default function PostSalePanel({ api }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState('')
  const [onlyOutstanding, setOnlyOutstanding] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api('/api/v1/admin/post-sale/runbook')
      .then(setData)
      .catch((err) => setError(err.message || 'Could not load the runbook.'))
      .finally(() => setLoading(false))
  }, [api])

  useEffect(() => { load() }, [load])

  const run = useCallback(async (path, label, dryRun) => {
    setBusy(label)
    setResult('')
    try {
      const res = await api(
        `/api/v1/admin/post-sale/${path}${dryRun ? '?dry_run=1' : ''}`,
        { method: 'POST' },
      )
      const bits = [
        `${res.candidates} candidate${res.candidates === 1 ? '' : 's'}`,
        dryRun ? '(dry run, nothing sent)' : `${res.sent} sent`,
      ]
      if (res.failed) bits.push(`${res.failed} failed`)
      // Deferred is not a failure and must not read as one: the transport was
      // unavailable or the shared daily cap was spent, and nothing was
      // stamped, so the whole backlog goes out on the next run.
      if (res.deferred) bits.push(`${res.deferred} deferred to the next run`)
      setResult(`${label}: ${bits.join(', ')}`)
      if (!dryRun) load()
    } catch (err) {
      setResult(`${label} failed: ${err.message || 'unknown error'}`)
    } finally {
      setBusy('')
    }
  }, [api, load])

  const customers = useMemo(() => {
    const all = data?.customers || []
    return onlyOutstanding ? all.filter((c) => c.outstanding > 0) : all
  }, [data, onlyOutstanding])

  if (loading) return <div className="p-4 text-sm text-slate-500">Loading the runbook…</div>
  if (error) return <div className="p-4 text-sm text-red-600">{error}</div>

  const counts = data?.counts || {}

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-slate-900">Post-sale runbook</h2>
        <p className="mt-1 text-sm text-slate-600">
          Everything a paying customer was promised, and whether it has been
          delivered. Marked done by reading what actually happened — a
          published review, a live listing, an open placement window — so this
          cannot claim a promise was kept when it was not.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Meter
          label="Paying customers"
          value={data?.paying_customers ?? 0}
          tone="border-slate-200 bg-white text-slate-900"
        />
        <Meter
          label="Overdue items"
          value={counts.overdue ?? 0}
          tone={counts.overdue
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-slate-200 bg-white text-slate-900'}
        />
        <Meter
          label="Due soon"
          value={counts.due ?? 0}
          tone="border-amber-200 bg-amber-50 text-amber-700"
        />
        <Meter
          label="Delivered"
          value={counts.done ?? 0}
          tone="border-emerald-200 bg-emerald-50 text-emerald-700"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('confirmations', 'Confirmations', true)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Preview confirmations
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('confirmations', 'Confirmations', false)}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          <Mail size={14} /> Send confirmations
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => run('numbers', 'Day-7 numbers', false)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Send day-7 numbers
        </button>
        <label className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyOutstanding}
            onChange={(e) => setOnlyOutstanding(e.target.checked)}
          />
          Only customers with something outstanding
        </label>
      </div>

      {result ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {result}
        </div>
      ) : null}

      {customers.length === 0 ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-4 text-sm text-emerald-800">
          {data?.paying_customers
            ? 'Nothing outstanding. Every paying customer has had what they bought.'
            : 'No paying customers yet.'}
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => (
            <div key={c.submission_id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-extrabold text-slate-900">{c.name}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  {TIER_LABEL[c.tier] || c.tier}
                </span>
                {c.email ? (
                  <span className="text-[11px] text-slate-500">{c.email}</span>
                ) : null}
                {c.overdue ? (
                  <span className="ml-auto rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                    {c.overdue} overdue
                  </span>
                ) : null}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {c.obligations.map((item) => (
                  <Obligation key={item.key} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
