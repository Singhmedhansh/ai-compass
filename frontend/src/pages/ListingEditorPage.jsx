import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, ImageUp, Loader2, Lock, Trash2 } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { processLogoFile } from '../utils/logoUpload'

// The page a maker edits their own listing on (see app/claims.py).
//
// This replaces a panel that lived inside the tool page itself: a 380px
// column containing a scrolling textarea for a 2000-character description,
// with the logo, the name and half the fields missing entirely. It was fine
// as a "fix a typo" affordance and useless as the thing we hand someone in an
// email that says the listing is now theirs.
//
// The two-column split is the argument the page is making. On the left is
// everything the maker controls outright, and it saves with no queue and no
// approval. On the right is the short list of things that still need us, and
// they are shown as REAL inputs rather than hidden — a founder who cannot
// even see where the URL lives assumes we are hiding it, whereas one who can
// type the change and send it as a request understands the boundary. What
// they type there is forwarded to an admin; the rest of their edit still goes
// live immediately either way.

const MAX_TEXT = 2000

function Field({ label, hint, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-sm text-ink outline-none ' +
  'transition placeholder:text-muted-2 focus:border-accent focus:ring-2 focus:ring-accent/20'

export default function ListingEditorPage() {
  const { slug } = useParams()

  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requested, setRequested] = useState(null)

  const [form, setForm] = useState({
    name: '',
    tagline: '',
    shortDescription: '',
    description: '',
    pricingDetail: '',
    features: '',
    use_cases: '',
    tags: '',
  })
  // The gated three are held apart from `form` so an untouched one is never
  // sent at all. Posting an unchanged URL back would file a change request
  // for a change nobody asked for, and an admin who gets those stops reading
  // them.
  const [gated, setGated] = useState({ link: '', category: '', pricing: '' })
  const [gatedOriginal, setGatedOriginal] = useState({ link: '', category: '', pricing: '' })

  const [logo, setLogo] = useState('')          // existing URL, or a new data: URL
  const [logoDirty, setLogoDirty] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoNote, setLogoNote] = useState('')
  const [logoError, setLogoError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/claims/${encodeURIComponent(slug)}/listing`, {
        credentials: 'include',
      })
      if (res.status === 403 || res.status === 401) {
        setDenied(true)
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not load that listing.')
        return
      }
      const t = data.tool || {}
      setForm({
        name: t.name || '',
        tagline: t.tagline || '',
        shortDescription: t.shortDescription || '',
        description: t.description || '',
        pricingDetail: t.pricingDetail || '',
        features: (t.features || []).join('\n'),
        use_cases: (t.use_cases || []).join('\n'),
        tags: (t.tags || []).join(', '),
      })
      const g = { link: t.link || '', category: t.category || '', pricing: t.pricing || '' }
      setGated(g)
      setGatedOriginal(g)
      setLogo(t.logo_url || '')
    } catch {
      setError('Could not reach the server. Try again in a moment.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  async function handleFile(file) {
    if (!file) return
    setLogoBusy(true)
    setLogoError('')
    setLogoNote('')
    try {
      const { dataUrl, note } = await processLogoFile(file)
      setLogo(dataUrl)
      setLogoDirty(true)
      setLogoNote(note)
    } catch (err) {
      setLogoError(err.message || 'That logo could not be used.')
    } finally {
      setLogoBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function save() {
    setSaving(true)
    setError('')
    setNotice('')
    setRequested(null)

    const payload = {
      name: form.name.trim(),
      tagline: form.tagline.trim(),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      pricingDetail: form.pricingDetail.trim(),
      features: form.features.split('\n').map((s) => s.trim()).filter(Boolean),
      use_cases: form.use_cases.split('\n').map((s) => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
    }
    // Only a logo the maker actually replaced this session. Sending back the
    // URL we loaded would fail the decoder, and sending an empty string would
    // read as "remove it".
    if (logoDirty && logo.startsWith('data:')) payload.logo = logo
    for (const key of ['link', 'category', 'pricing']) {
      if (gated[key].trim() && gated[key].trim() !== gatedOriginal[key]) {
        payload[key] = gated[key].trim()
      }
    }

    try {
      const res = await fetch(`/api/v1/claims/${encodeURIComponent(slug)}/listing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save those changes.')
        return
      }
      setLogoDirty(false)
      setNotice('Saved. Your listing is updated and live now.')
      if (data.requested && Object.keys(data.requested).length) {
        setRequested(data.requested)
        setGatedOriginal((g) => ({ ...g, ...data.requested }))
      }
      if (data.tool?.logo_url) setLogo(data.tool.logo_url)
    } catch {
      setError('Could not reach the server. Try again in a moment.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-24 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your listing…
      </div>
    )
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-xl font-bold text-ink">This isn&apos;t your listing to edit</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You need an approved claim on <strong>{slug}</strong> before you can edit it. If you
          made this tool, open its page and claim it — it&apos;s instant when you sign in with an
          email on the tool&apos;s own domain.
        </p>
        <Link
          to={`/tools/${slug}`}
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Go to the listing
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <Helmet>
        <title>{`Edit ${form.name || slug} — AI Compass`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Link
        to={`/tools/${slug}`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to your listing
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
            Edit your listing
          </h1>
          <p className="mt-1 text-sm text-muted">
            You own <strong className="text-ink-2">{form.name || slug}</strong>. Changes below go
            live immediately — there&apos;s no queue.
          </p>
        </div>
        <a
          href={`/tools/${slug}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong bg-bg px-3 py-2 text-xs font-semibold text-ink-2 transition hover:border-accent hover:text-ink"
        >
          View as a reader <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
        {/* ---- what the maker owns outright ---- */}
        <div className="space-y-6 rounded-2xl border border-line bg-bg-sunk/40 p-5 sm:p-6">
          <Field
            label="Logo"
            hint={`A square PNG or JPG. We'll centre and resize whatever you pick to ${512}x${512}px — you don't have to prepare it.`}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-bg">
                {logo ? (
                  <img src={logo} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] font-semibold text-muted-2">No logo</span>
                )}
              </div>

              <div
                role="button"
                tabIndex={logoBusy ? -1 : 0}
                aria-label="Upload a logo"
                onClick={() => !logoBusy && fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (!logoBusy) fileRef.current?.click()
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!logoBusy) setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  handleFile(e.dataTransfer?.files?.[0])
                }}
                className={`flex min-h-[5rem] flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-3 text-center transition ${
                  logoBusy ? 'cursor-wait opacity-60' : 'hover:border-accent'
                } ${dragging ? 'border-accent bg-accent-soft/20' : 'border-line bg-bg'}`}
              >
                {logoBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
                ) : (
                  <ImageUp className="h-4 w-4 text-accent" aria-hidden="true" />
                )}
                <span className="text-xs font-bold text-accent">
                  {logo ? 'Replace logo' : 'Upload a logo'}
                </span>
                <span className="text-[11px] text-muted-2">or drag one here</span>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
            {logoNote && <p className="mt-2 text-xs font-semibold text-accent">{logoNote}</p>}
            {logoError && (
              <p role="alert" className="mt-2 text-xs leading-relaxed text-danger">
                {logoError}
              </p>
            )}
          </Field>

          <Field
            label="Name"
            htmlFor="ed-name"
            hint="Your page's web address doesn't change when you rename — every existing link keeps working."
          >
            <input
              id="ed-name"
              value={form.name}
              maxLength={120}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="One-line pitch" htmlFor="ed-tagline" hint="Shown under your name on the listing card.">
            <input
              id="ed-tagline"
              value={form.tagline}
              maxLength={MAX_TEXT}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field
            label="Short description"
            htmlFor="ed-short"
            hint="One or two sentences, used in listings and search results."
          >
            <textarea
              id="ed-short"
              rows={2}
              value={form.shortDescription}
              maxLength={MAX_TEXT}
              onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="About the tool" htmlFor="ed-desc" hint="The full description on your page.">
            <textarea
              id="ed-desc"
              rows={9}
              value={form.description}
              maxLength={MAX_TEXT}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={inputClass}
            />
            <p className="mt-1 text-right text-[11px] tabular-nums text-muted-2">
              {form.description.length} / {MAX_TEXT}
            </p>
          </Field>

          <Field label="Features — one per line" htmlFor="ed-features">
            <textarea
              id="ed-features"
              rows={5}
              value={form.features}
              onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field
            label="Use cases — one per line"
            htmlFor="ed-usecases"
            hint="Who it's for and what they do with it."
          >
            <textarea
              id="ed-usecases"
              rows={4}
              value={form.use_cases}
              onChange={(e) => setForm((f) => ({ ...f, use_cases: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field label="Tags — comma separated" htmlFor="ed-tags">
            <input
              id="ed-tags"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              className={inputClass}
            />
          </Field>

          <Field
            label="Pricing detail"
            htmlFor="ed-pricing-detail"
            hint="Your own words about what things cost — e.g. “Free tier, $12/mo for teams”."
          >
            <input
              id="ed-pricing-detail"
              value={form.pricingDetail}
              maxLength={MAX_TEXT}
              onChange={(e) => setForm((f) => ({ ...f, pricingDetail: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>

        {/* ---- what still needs a human ---- */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-line bg-bg-sunk/40 p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <Lock className="h-3.5 w-3.5 text-muted" aria-hidden="true" /> Ask us to change
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Changing where your listing points moves every reader and every tracked click, so a
              person checks these. Type what you want and save — we&apos;ll get it, and the rest of
              your edit still goes live straight away.
            </p>

            <div className="mt-4 space-y-3">
              {[
                ['link', 'Website URL'],
                ['category', 'Category'],
                ['pricing', 'Pricing label'],
              ].map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-xs font-semibold text-ink-2">{label}</span>
                  <input
                    value={gated[key]}
                    onChange={(e) => setGated((g) => ({ ...g, [key]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs text-ink outline-none transition focus:border-accent"
                  />
                </label>
              ))}
            </div>

            {requested && (
              <p className="mt-3 rounded-lg border border-accent/40 bg-accent-soft/10 p-2.5 text-[11px] leading-relaxed text-ink-2">
                Sent to us: {Object.keys(requested).join(', ')}. We&apos;ll email you when it&apos;s
                done.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-bg-sunk/40 p-5">
            <h2 className="text-sm font-bold text-ink">What stays ours</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Ratings, placement, and any review we wrote. Owning your listing means owning your
              own words on it — not the verdict. That&apos;s what keeps the maker badge worth
              carrying.
            </p>
          </div>
        </aside>
      </div>

      {/* ---- save ---- */}
      <div className="sticky bottom-0 mt-8 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-xs leading-relaxed">
            {error && (
              <span role="alert" className="font-semibold text-danger">
                {error}
              </span>
            )}
            {!error && notice && <span className="font-semibold text-accent">{notice}</span>}
            {!error && !notice && (
              <span className="text-muted">Saved changes appear on your page immediately.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {logoDirty && (
              <button
                type="button"
                onClick={() => {
                  setLogo('')
                  setLogoDirty(false)
                  setLogoNote('')
                  load()
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong px-3 py-2 text-xs font-semibold text-muted transition hover:text-ink"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Discard logo
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
