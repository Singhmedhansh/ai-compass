import { useEffect, useState } from 'react'
import { BadgeCheck, Loader2, PencilLine } from 'lucide-react'
import { Link } from 'react-router-dom'

// Claiming a listing (see app/claims.py). Two pieces live here because they
// are two states of one thing:
//
//   ClaimBadge  — what a reader sees on a claimed listing. It says the copy
//                 has an owner answerable for it, NOT that the tool is any
//                 good. A claimed listing is not a better tool, and the
//                 wording has to keep those apart.
//   ClaimPanel  — what a maker sees: claim it, or edit the copy they own.

export function ClaimBadge({ claim }) {
  if (!claim?.claimed) return null
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-bg-sunk px-2.5 py-0.5 text-[11px] font-semibold text-ink-2"
      title={
        claim.verified_domain_match
          ? 'The maker claimed this listing from an email address on the tool’s own domain.'
          : 'The maker claimed this listing and we checked it by hand.'
      }
    >
      <BadgeCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
      {claim.label || 'Claimed by the maker'}
    </span>
  )
}

export default function ClaimPanel({ tool, isLoggedIn }) {
  const slug = tool?.slug
  const [mine, setMine] = useState(null) // this account's claim on this tool
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isLoggedIn || !slug) return undefined
    const controller = new AbortController()
    fetch('/api/v1/claims/mine/list', { credentials: 'include', signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const match = (d?.claims || []).find((c) => c.tool_slug === slug)
        if (match) setMine(match)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [isLoggedIn, slug])

  const claimed = Boolean(tool?.claim?.claimed)
  const iOwnIt = mine?.status === 'approved'
  const iAmWaiting = mine?.status === 'pending'

  // Somebody else owns it, or nobody does and this reader is not signed in —
  // either way there is nothing here for them to act on.
  if (claimed && !iOwnIt) return null

  async function fileClaim() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/claims/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        setMine(data.claim)
        setMessage(data.message)
      } else {
        setError(data.error || 'Could not file that claim.')
      }
    } catch {
      setError('Could not reach the server. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-bg-sunk/40 p-4">
      {!isLoggedIn && !claimed && (
        <p className="text-xs leading-relaxed text-muted">
          Made {tool?.name}?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>{' '}
          to claim this listing and keep its copy current.
        </p>
      )}

      {isLoggedIn && !mine && !claimed && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-relaxed text-muted">
            <strong className="font-semibold text-ink-2">Made {tool?.name}?</strong> Claim the
            listing to edit its copy yourself. Instant if you sign in with an email on the
            tool&apos;s own domain; otherwise we check it by hand.
          </p>
          <button
            type="button"
            onClick={fileClaim}
            disabled={busy}
            className="shrink-0 rounded-xl border border-line-strong bg-bg px-3 py-2 text-xs font-semibold text-ink-2 transition hover:border-accent hover:text-ink disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Claim this listing'}
          </button>
        </div>
      )}

      {iAmWaiting && (
        <p className="text-xs leading-relaxed text-muted">
          Your claim is with us — we check these by hand when the email domain doesn&apos;t match
          the tool&apos;s site. You&apos;ll hear back by email.
        </p>
      )}

      {iOwnIt && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <BadgeCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            You own this listing
          </p>
          {/* The editor is a page of its own now (ListingEditorPage). It used
              to be a form inlined right here, in a 380px sidebar column — no
              logo field, no name, and a 2000-character description in a
              five-row textarea. That was a usable "fix a typo" affordance and
              the wrong thing to hand someone in an email telling them the
              listing is theirs. */}
          <Link
            to={`/dashboard/listing/${slug}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-line-strong bg-bg px-3 py-2 text-xs font-semibold text-ink-2 transition hover:border-accent hover:text-ink"
          >
            <PencilLine className="h-3.5 w-3.5" aria-hidden="true" /> Edit your listing
          </Link>
        </div>
      )}

      {/* The server's reply to a click, NOT a standing state — so it is
          suppressed once `mine` is set and the block above is already saying
          the same thing. Rendering both put two paragraphs of identical copy
          on the page, one grey and one green, the moment a claim was filed. */}
      {message && !iAmWaiting && !iOwnIt && (
        <p className="mt-2 text-[11px] leading-relaxed text-accent-ink">{message}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[11px] leading-relaxed text-danger">
          {error}
        </p>
      )}
    </section>
  )
}
