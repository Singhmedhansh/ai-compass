import { PenLine, Quote, Star, ThumbsDown, ThumbsUp } from 'lucide-react'

// A commissioned hands-on review (see app/editorial.py). The tool's team
// paid for the work, not the conclusion — which is why the disclosure sits
// at the top of the card in plain text rather than in a footnote. A reader
// who can see how the piece was paid for is a reader who can decide how much
// to trust it; that is the whole reason the artifact is worth citing.

function formatDate(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
}

function ScoreStars({ score }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={
            score >= i - 0.5
              ? 'h-4 w-4 fill-amber-400 text-amber-400'
              : 'h-4 w-4 text-line-strong'
          }
        />
      ))}
    </span>
  )
}

function Verdict({ text }) {
  return (
    <div className="mt-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-ink">
        <Quote className="h-3.5 w-3.5" aria-hidden="true" /> Verdict
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{text}</p>
    </div>
  )
}

function ProsCons({ pros, cons }) {
  if (!pros.length && !cons.length) return null
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      {[
        { items: pros, label: 'What works', tone: 'text-emerald-600 dark:text-emerald-400' },
        { items: cons, label: 'What does not', tone: 'text-rose-600 dark:text-rose-400' },
      ]
        .filter((col) => col.items.length > 0)
        .map(({ items, label, tone }) => (
          <div key={label} className="rounded-2xl border border-line bg-bg p-4">
            <h3 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${tone}`}>
              {label === 'What works' ? (
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {label}
            </h3>
            <ul className="mt-2.5 space-y-2">
              {items.map((item) => (
                <li key={item} className="text-sm leading-relaxed text-ink-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  )
}

export default function EditorialReviewSection({ review, toolName }) {
  if (!review) return null

  const pros = Array.isArray(review.pros) ? review.pros.filter((p) => typeof p === 'string') : []
  const cons = Array.isArray(review.cons) ? review.cons.filter((c) => typeof c === 'string') : []
  const shots = Array.isArray(review.screenshots)
    ? review.screenshots.filter((s) => s && typeof s === 'object' && s.url)
    : []
  // Paragraphs, not HTML: the body is author-written plain text and is
  // rendered as text so a stray angle bracket can never become markup.
  const paragraphs = String(review.body || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const published = formatDate(review.published_at)
  const updated = formatDate(review.updated_at)

  return (
    <section
      aria-labelledby="editorial-review-heading"
      className="rounded-2xl border border-line bg-bg-elev p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent-ink">
          <PenLine className="h-3 w-3" aria-hidden="true" /> Hands-on review
        </span>
        {typeof review.score === 'number' && (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-ink">
            <ScoreStars score={review.score} />
            <span className="tabular-nums">{review.score.toFixed(1)}</span>
            <span className="font-medium text-muted">/ 5</span>
          </span>
        )}
      </div>

      <h2 id="editorial-review-heading" className="mt-3 text-xl font-bold tracking-tight text-ink">
        {review.headline || `${toolName} review`}
      </h2>
      <p className="mt-1.5 text-xs text-muted">
        By {review.author_name}
        {published && ` · ${published}`}
        {updated && updated !== published && ` · updated ${updated}`}
      </p>

      <div className="mt-4 space-y-4">
        {paragraphs.map((para, i) => (
          <p key={i} className="leading-relaxed text-ink-2">
            {para}
          </p>
        ))}
      </div>

      {shots.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {shots.map((shot) => (
            <figure key={shot.url} className="overflow-hidden rounded-2xl border border-line bg-bg">
              <img
                src={shot.url}
                alt={shot.caption || `${toolName} screenshot`}
                loading="lazy"
                className="w-full"
              />
              {shot.caption && (
                <figcaption className="px-3 py-2 text-[11px] leading-relaxed text-muted">
                  {shot.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      <ProsCons pros={pros} cons={cons} />
      {review.verdict && <Verdict text={review.verdict} />}

      {review.disclosure && (
        <p className="mt-5 border-t border-line pt-4 text-[11px] leading-relaxed text-muted-2">
          {review.disclosure}
        </p>
      )}
    </section>
  )
}
