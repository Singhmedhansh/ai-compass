import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Megaphone,
  MessageSquare,
  Newspaper,
  Sparkles,
  Trash2,
} from 'lucide-react'

const TYPE_META = {
  news: {
    label: 'News',
    icon: Newspaper,
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  question: {
    label: 'Question',
    icon: HelpCircle,
    chip: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  showcase: {
    label: 'Showcase',
    icon: Sparkles,
    chip: 'border-accent/35 bg-accent-soft text-accent-ink',
  },
  discussion: {
    label: 'Discussion',
    icon: MessageSquare,
    chip: 'border-line-strong bg-bg-sunk text-muted',
  },
}

function relativeTime(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function VoteStack({ item, onVote, size = 'md' }) {
  const up = item.user_vote === 1
  const down = item.user_vote === -1
  const dims = size === 'sm'
    ? { icon: 'h-3.5 w-3.5', btn: 'p-0.5', score: 'text-[11px] min-w-[1.25rem]', gap: 'gap-0.5' }
    : { icon: 'h-4 w-4', btn: 'p-1', score: 'text-xs min-w-[1.5rem]', gap: 'gap-0.5' }

  return (
    <div
      className={`flex shrink-0 flex-col items-center ${dims.gap} rounded-xl border border-line bg-bg px-1 py-1.5 select-none`}
    >
      <button
        type="button"
        onClick={() => onVote?.(item.id, up ? 0 : 1)}
        aria-label="Upvote"
        aria-pressed={up}
        className={`rounded-lg ${dims.btn} transition-all duration-150 active:scale-90 ${
          up
            ? 'bg-accent-soft text-accent'
            : 'text-muted-2 hover:bg-bg-sunk hover:text-ink'
        }`}
      >
        <ChevronUp className={dims.icon} strokeWidth={up ? 3 : 2.25} />
      </button>
      <span
        className={`font-extrabold tabular-nums text-center transition-colors ${dims.score} ${
          up ? 'text-accent' : down ? 'text-rose-500' : 'text-ink'
        }`}
      >
        {item.score || 0}
      </span>
      <button
        type="button"
        onClick={() => onVote?.(item.id, down ? 0 : -1)}
        aria-label="Downvote"
        aria-pressed={down}
        className={`rounded-lg ${dims.btn} transition-all duration-150 active:scale-90 ${
          down
            ? 'bg-rose-500/10 text-rose-500'
            : 'text-muted-2 hover:bg-bg-sunk hover:text-ink'
        }`}
      >
        <ChevronDown className={dims.icon} strokeWidth={down ? 3 : 2.25} />
      </button>
    </div>
  )
}

export default function CommunityFeedItem({ post, onVote, onDelete, linkToDetail = true }) {
  const meta = TYPE_META[post.post_type] || TYPE_META.discussion
  const TypeIcon = meta.icon

  return (
    <article
      className={`flex items-start gap-3 rounded-2xl border p-3.5 transition sm:p-4 ${
        post.is_featured
          ? 'border-amber-500/30 bg-amber-500/[0.035] hover:border-amber-500/50 dark:bg-amber-500/[0.05]'
          : 'border-line bg-bg-elev hover:border-line-strong'
      }`}
    >
      <VoteStack item={post} onVote={onVote} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.chip}`}
          >
            <TypeIcon className="h-3 w-3" aria-hidden="true" /> {meta.label}
          </span>
          {post.is_featured && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              <Megaphone className="h-3 w-3" aria-hidden="true" /> Sponsored tool
            </span>
          )}
          {post.tool_slug && (
            <Link
              to={`/tools/${post.tool_slug}`}
              className="rounded-full border border-line bg-bg px-2 py-0.5 text-[10px] font-semibold text-ink-2 transition hover:border-accent hover:text-accent"
            >
              {post.tool_slug}
            </Link>
          )}
        </div>

        {linkToDetail ? (
          <h2 className="mt-2">
            <Link
              to={`/community/${post.id}`}
              className="text-[15px] font-bold leading-snug text-ink transition hover:text-accent sm:text-base"
            >
              {post.title}
            </Link>
          </h2>
        ) : (
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">{post.title}</h1>
        )}

        {linkToDetail && (
          <p className="mt-1.5 line-clamp-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
            {post.body}
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted">
          <span className="font-semibold text-ink-2">{post.author || 'Anonymous'}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.created_at}>{relativeTime(post.created_at)}</time>
          {linkToDetail && (
            <>
              <span aria-hidden="true">·</span>
              <Link
                to={`/community/${post.id}`}
                className="inline-flex items-center gap-1 tabular-nums transition hover:text-accent"
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                {post.comment_count || 0}
              </Link>
            </>
          )}
          {post.can_delete && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className="ml-auto inline-flex items-center gap-1 transition hover:text-danger"
              aria-label="Delete post"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
