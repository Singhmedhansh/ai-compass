import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Loader2, ShieldQuestion } from 'lucide-react'

// The claim queue (see app/claims.py). Only claims we could NOT verify land
// here: a matching email domain auto-approves, because that checks a fact.
// What reaches this screen is precisely the set where a human has to decide,
// and the cost of getting it wrong is edit rights over someone else's page —
// so the panel leads with the evidence rather than with the buttons.

const BTN_PRIMARY =
  'rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-60'
const BTN_GHOST =
  'rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-bg-sunk disabled:opacity-60'

const STATUS_TONE = {
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  approved: 'border-accent/40 bg-accent-soft text-accent-ink',
  rejected: 'border-line bg-bg-sunk text-muted',
  revoked: 'border-line bg-bg-sunk text-muted',
}

const ERRORS = {
  already_claimed_by_another_user:
    'Someone else already owns that listing. Revoke their claim first if this one is the real maker.',
}

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(ERRORS[data.error] || data.error || `Request failed (${res.status})`)
  return data
}

export default function ToolClaimsPanel() {
  const [claims, setClaims] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [edits, setEdits] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api(`/api/v1/claims/admin/queue?status=${encodeURIComponent(status)}`)
      setClaims(data.claims || [])
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load claims')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  const decide = async (id, next) => {
    setBusyId(id)
    setError('')
    try {
      await api(`/api/v1/claims/admin/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      await load()
    } catch (err) {
      setError(err.message || 'Could not update that claim')
    } finally {
      setBusyId(null)
    }
  }

  const loadEdits = async (slug) => {
    try {
      const data = await api(`/api/v1/claims/admin/${encodeURIComponent(slug)}/edits`)
      setEdits((prev) => ({ ...prev, [slug]: data.edits || [] }))
    } catch (err) {
      setError(err.message || 'Could not load the edit log')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          A claim from an email on the tool&apos;s own domain is approved automatically. These are
          the ones where the domain didn&apos;t match, so somebody has to check. Approving hands
          this account edit rights over that listing&apos;s copy.
        </p>
        <div className="flex gap-1.5">
          {['pending', 'approved', 'all'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={status === s ? BTN_PRIMARY : BTN_GHOST}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-ink-2">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading…</p>
      ) : claims.length === 0 ? (
        <p className="text-sm text-muted">Nothing in this queue.</p>
      ) : (
        <div className="space-y-3">
          {claims.map((c) => (
            <div key={c.id} className="rounded-2xl border border-line bg-bg-elev p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/tools/${c.tool_slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-ink hover:text-accent"
                    >
                      {c.tool_slug}
                    </a>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_TONE[c.status]}`}>
                      {c.status}
                    </span>
                    {c.verified_domain_match ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-ink">
                        <BadgeCheck className="h-3.5 w-3.5" /> domain verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
                        <ShieldQuestion className="h-3.5 w-3.5" /> domain does not match
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {c.user_email}
                    {c.created_at && ` · filed ${new Date(c.created_at).toLocaleDateString()}`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {c.status !== 'approved' && (
                    <button className={BTN_PRIMARY} disabled={busyId === c.id}
                            onClick={() => decide(c.id, 'approved')}>
                      Approve
                    </button>
                  )}
                  {c.status === 'pending' && (
                    <button className={BTN_GHOST} disabled={busyId === c.id}
                            onClick={() => decide(c.id, 'rejected')}>
                      Reject
                    </button>
                  )}
                  {c.status === 'approved' && (
                    <button className={BTN_GHOST} disabled={busyId === c.id}
                            onClick={() => decide(c.id, 'revoked')}>
                      Revoke
                    </button>
                  )}
                  <button className={BTN_GHOST} onClick={() => loadEdits(c.tool_slug)}>
                    Edit log
                  </button>
                </div>
              </div>

              {c.evidence && (
                <p className="mt-3 rounded-xl border border-line bg-bg-sunk px-3 py-2 text-xs leading-relaxed text-ink-2">
                  <strong className="font-semibold">Their evidence:</strong> {c.evidence}
                </p>
              )}

              {edits[c.tool_slug] && (
                <div className="mt-3 border-t border-line pt-3">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                    Edits by the owner ({edits[c.tool_slug].length})
                  </h4>
                  {edits[c.tool_slug].length === 0 ? (
                    <p className="mt-1 text-xs text-muted">None yet.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {edits[c.tool_slug].map((e) => (
                        <li key={e.id} className="text-xs leading-relaxed text-ink-2">
                          <span className="font-semibold">{e.field}</span>
                          {e.created_at && (
                            <span className="text-muted-2"> · {new Date(e.created_at).toLocaleString()}</span>
                          )}
                          <div className="mt-0.5 text-muted line-through">{e.old_value || '—'}</div>
                          <div className="text-ink-2">{e.new_value || '—'}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
