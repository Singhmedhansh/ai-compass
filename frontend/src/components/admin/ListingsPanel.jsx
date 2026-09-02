import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw, Rocket, Send } from 'lucide-react'

// The founder dashboard, for every listing at once.
//
// /submissions/dashboard answers "how is MY listing doing" and is reachable
// only with that founder's signed magic link. There was no way to ask it
// across the catalogue, which made the one question worth answering before
// selling another placement — do these listings actually earn click-throughs?
// — unanswerable without opening twenty tokens by hand.
//
// Free listings are in the table on purpose. They are most of the catalogue
// and the whole upgrade funnel: a free listing pulling real clicks is the
// most persuasive thing to put in front of that founder when pitching $19,
// and one pulling none is a page to fix before charging anyone for its twin.

const TIER_LABEL = {
  free: 'Free',
  analytics: 'Analytics $19',
  quick: 'Quick (retired)',
  sponsored: 'Fast-Track $49',
  reviewed: 'Reviewed $79',
}

// "approved" is four different situations wearing one word, and they need
// opposite responses. Spelling them out is the difference between a table you
// read and a table you act on.
const BLOCKER = {
  rejected: { label: 'Rejected', tone: 'muted' },
  awaiting_review: { label: 'In review queue', tone: 'muted' },
  waiting_for_release: { label: 'Waiting to go live', tone: 'muted' },
  hidden: { label: 'Hidden - unhide it', tone: 'warn' },
  // The bad one. The founder was told yes and nothing was ever published;
  // no other screen shows this, and it is what silently ends a paid
  // relationship.
  approved_but_no_catalog_row: { label: 'Approved but never published', tone: 'bad' },
  unknown: { label: 'Not live (reason unclear)', tone: 'warn' },
}

const FILTERS = [
  ['real', 'Real listings'],
  ['all', 'All'],
  ['live', 'Live'],
  ['paid', 'Paid'],
  ['stuck', 'Stuck'],
  ['untold', 'Live, not told'],
]

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-4">
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-xs font-semibold text-ink-2">{label}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-2">{hint}</div>}
    </div>
  )
}

export default function ListingsPanel({ api }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('real')
  const [sort, setSort] = useState('clicks')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState('')
  const [releasing, setReleasing] = useState(false)
  const [releaseResult, setReleaseResult] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api('/api/v1/admin/listings')
      .then(setData)
      .catch((err) => setError(err.message || 'Could not load listings.'))
      .finally(() => setLoading(false))
  }, [api])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const all = data?.listings || []
    const filtered = all.filter((row) => {
      // Default view. Seven of the nineteen rows in this table are owner test
      // submissions and rejected junk, and leaving them in made the
      // catalogue look both bigger and worse than it is - the eye reads
      // nineteen rows of zeros instead of eleven real ones.
      if (filter === 'real') return !row.is_test && row.status !== 'rejected'
      if (filter === 'live') return row.is_live
      if (filter === 'paid') return row.tier !== 'free' && row.payment_status === 'verified'
      // Not "everything not yet live" - only the ones a person can unblock.
      // A row inside its release delay needs patience, not attention.
      if (filter === 'stuck') {
        return ['hidden', 'approved_but_no_catalog_row', 'unknown'].includes(row.live_blocker)
      }
      // The backlog that has no other symptom: the listing is public and its
      // founder has still never been told it went live.
      if (filter === 'untold') return row.is_live && !row.live_email_sent_at
      return true
    })
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sort === 'clicks') return (b.clicks || 0) - (a.clicks || 0)
      if (sort === 'views') return (b.views || 0) - (a.views || 0)
      if (sort === 'ctr') return (b.ctr ?? -1) - (a.ctr ?? -1)
      return String(b.submitted_at || '').localeCompare(String(a.submitted_at || ''))
    })
    return sorted
  }, [data, filter, sort])

  async function releaseWaiting() {
    // No confirm dialog on purpose: this is reversible (an admin can re-hide
    // or re-set a release date), it only ever touches rows that are already
    // approved, and a confirm on a one-click unblock is friction on the thing
    // we want done.
    setReleasing(true)
    setReleaseResult('')
    try {
      const res = await api('/api/v1/admin/listings/release', { method: 'POST' })
      setReleaseResult(
        res.count === 0
          ? 'Nothing was waiting.'
          : `Published ${res.count}: ${res.released.join(', ')}`,
      )
      load()
    } catch (err) {
      setReleaseResult(err.message || 'Release failed.')
    } finally {
      setReleasing(false)
    }
  }

  async function sendLiveEmails(dryRun) {
    setSending(true)
    setSendResult('')
    try {
      const res = await api(
        `/api/v1/admin/send-live-emails${dryRun ? '?dry_run=1' : ''}`,
        { method: 'POST' },
      )
      setSendResult(
        dryRun
          ? `Would notify ${res.candidates} founder(s): ${(res.listings || []).join(', ') || 'none'}`
          : `Sent ${res.sent}, failed ${res.failed}, deferred ${res.deferred} of ${res.candidates}.`,
      )
      if (!dryRun) load()
    } catch (err) {
      setSendResult(err.message || 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading listings…</p>
  if (error) return <p className="text-sm text-danger">{error}</p>

  const totals = data?.totals || {}
  const untold = (data?.listings || []).filter((r) => r.is_live && !r.live_email_sent_at).length
  const blockers = totals.blockers || {}
  const stuck =
    (blockers.hidden || 0) +
    (blockers.approved_but_no_catalog_row || 0) +
    (blockers.unknown || 0)
  const waiting = blockers.waiting_for_release || 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Listings" value={totals.listings ?? 0} />
        <Stat label="Live" value={totals.live ?? 0} />
        <Stat label="Paid" value={totals.paid ?? 0} hint="Verified payments only" />
        <Stat label="Revenue" value={`$${(totals.revenue ?? 0).toFixed(2)}`} hint="Excludes test rows" />
        <Stat
          label="Clicks / views"
          value={`${totals.clicks ?? 0} / ${totals.views ?? 0}`}
          hint={totals.views ? `${(((totals.clicks || 0) / totals.views) * 100).toFixed(1)}% CTR` : 'No view data'}
        />
      </div>

      {waiting > 0 && (
        <div className="rounded-xl border border-accent/40 bg-accent-soft/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-ink">
                {waiting} listing{waiting === 1 ? '' : 's'} waiting out the release delay
              </p>
              <p className="mt-0.5 text-xs text-ink-2">
                Approved, but held back until their release date. Publishing them now starts the
                clock on indexing &mdash; a page nobody can see is a page Google has not crawled,
                and that is the one delay you cannot buy back later. They stay permanent either way.
              </p>
            </div>
            <button
              onClick={releaseWaiting}
              disabled={releasing}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-60"
            >
              <Rocket className="h-3.5 w-3.5" /> {releasing ? 'Publishing…' : 'Publish all now'}
            </button>
          </div>
          {releaseResult && <p className="mt-3 text-xs text-ink-2">{releaseResult}</p>}
        </div>
      )}

      <div className="rounded-xl border border-line bg-bg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">Listing-live notices</p>
            <p className="mt-0.5 text-xs text-muted-2">
              {untold === 0
                ? 'Every live listing has been announced to its founder.'
                : `${untold} live listing(s) whose founder has never been told.`}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => sendLiveEmails(true)} disabled={sending}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-2 transition hover:bg-bg-sunk disabled:opacity-60">
              Preview
            </button>
            <button onClick={() => sendLiveEmails(false)} disabled={sending || untold === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-60">
              <Send className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Send now'}
            </button>
          </div>
        </div>
        {sendResult && <p className="mt-3 text-xs text-ink-2">{sendResult}</p>}
      </div>

      {stuck > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold text-ink">
            {stuck} listing{stuck === 1 ? '' : 's'} approved but not published
          </p>
          <p className="mt-0.5 text-xs text-ink-2">
            These are not waiting out a release delay &mdash; they are hidden, or an approval never
            created a catalog row. A listing that is not live cannot earn a view, be announced, or
            be upgraded, so this is the first thing to clear. Use the <b>Stuck</b> filter below.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === key ? 'bg-accent text-bg' : 'border border-line text-ink-2 hover:bg-bg-sunk'
              }`}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="rounded-lg border border-line bg-bg px-2 py-1 text-xs text-ink">
            <option value="clicks">Sort: clicks</option>
            <option value="views">Sort: views</option>
            <option value="ctr">Sort: CTR</option>
            <option value="recent">Sort: newest</option>
          </select>
          <button onClick={load} className="rounded-md border border-line-strong p-1.5 text-ink-2 transition hover:bg-bg-sunk" title="Refresh">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-3 font-semibold">Tool</th>
              <th className="py-2 pr-3 font-semibold">Tier</th>
              <th className="py-2 pr-3 font-semibold">State</th>
              <th className="py-2 pr-3 text-right font-semibold">Views</th>
              <th className="py-2 pr-3 text-right font-semibold">Clicks</th>
              <th className="py-2 pr-3 text-right font-semibold">CTR</th>
              <th className="py-2 pr-3 text-right font-semibold">30d</th>
              <th className="py-2 pr-3 font-semibold">Founder</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.submission_id} className="border-b border-line/60 align-top">
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-1.5 font-semibold text-ink">
                    {row.name}
                    {row.slug && (
                      <a href={`/tools/${row.slug}`} target="_blank" rel="noreferrer"
                        className="text-muted-2 hover:text-accent" title="Open listing">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-2">{row.category}{row.is_test ? ' · test row' : ''}</div>
                </td>
                <td className="py-2.5 pr-3 text-xs text-ink-2">{TIER_LABEL[row.tier] || row.tier}</td>
                <td className="py-2.5 pr-3 text-xs">
                  {row.is_live ? (
                    <span className="font-semibold text-accent-ink">Live</span>
                  ) : (
                    <span
                      className={
                        BLOCKER[row.live_blocker]?.tone === 'bad'
                          ? 'font-semibold text-red-600 dark:text-red-400'
                          : BLOCKER[row.live_blocker]?.tone === 'warn'
                          ? 'font-semibold text-amber-600 dark:text-amber-400'
                          : 'text-muted-2'
                      }
                    >
                      {BLOCKER[row.live_blocker]?.label || row.status}
                    </span>
                  )}
                  {row.live_blocker === 'waiting_for_release' && row.days_until_live !== null && (
                    <div className="text-[11px] text-muted-2">
                      {row.days_until_live === 0 ? 'live within a day' : `${row.days_until_live}d to go`}
                    </div>
                  )}
                  {row.is_live && !row.live_email_sent_at && (
                    <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">not announced</div>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink-2">{row.views}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-ink">{row.clicks}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink-2">
                  {row.ctr === null || row.ctr === undefined ? '—' : `${row.ctr}%`}
                </td>
                <td className="py-2.5 pr-3 text-right text-xs tabular-nums text-muted-2">
                  {row.views_30d}/{row.clicks_30d}
                </td>
                <td className="py-2.5 pr-3 text-xs text-muted-2">
                  {row.email ? (
                    <a href={`mailto:${row.email}`} className="hover:text-accent">{row.email}</a>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-sm text-muted">No listings match that filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
