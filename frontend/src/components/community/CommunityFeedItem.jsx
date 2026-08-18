import { Link } from 'react-router-dom'
import { MessageSquare, Megaphone, Newspaper, HelpCircle, Sparkles, Trash2 } from 'lucide-react'

const TYPE_META = {
  news: { label: 'News', icon: Newspaper },
  question: { label: 'Question', icon: HelpCircle },
  showcase: { label: 'Showcase', icon: Sparkles },
  discussion: { label: 'Discussion', icon: MessageSquare },
}

export default function CommunityFeedItem({ post, onVote, onDelete, linkToDetail = true }) {
  const meta = TYPE_META[post.post_type] || TYPE_META.discussion
  const TypeIcon = meta.icon

  const Title = linkToDetail ? (
    <Link to={`/community/${post.id}`} className="text-base font-semibold text-ink hover:text-accent transition-colors">
      {post.title}
    </Link>
  ) : (
    <h1 className="text-2xl font-bold text-ink">{post.title}</h1>
  )

  return (
    <article className="flex gap-3 rounded-xl border border-line bg-bg-sunk p-4 items-start">
      <div className="flex flex-col items-center justify-center shrink-0 gap-0.5 select-none bg-bg-elev/50 rounded-lg p-1 border border-line/20">
        <button
          type="button"
          onClick={() => onVote?.(post.id, post.user_vote === 1 ? 0 : 1)}
          className={`p-1 rounded hover:bg-bg-elev transition text-xs leading-none ${
            post.user_vote === 1 ? 'text-emerald-500 font-bold' : 'text-muted'
          }`}
          aria-label="Upvote post"
        >
          ▲
        </button>
        <span className="text-xs font-bold tabular-nums text-ink">{post.score || 0}</span>
        <button
          type="button"
          onClick={() => onVote?.(post.id, post.user_vote === -1 ? 0 : -1)}
          className={`p-1 rounded hover:bg-bg-elev transition text-xs leading-none ${
            post.user_vote === -1 ? 'text-rose-500 font-bold' : 'text-muted'
          }`}
          aria-label="Downvote post"
        >
          ▼
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-bg-elev px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted border border-line/40">
            <TypeIcon className="h-3 w-3" /> {meta.label}
          </span>
          {post.is_featured && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Megaphone className="h-3 w-3" /> Featured
            </span>
          )}
          {post.tool_slug && (
            <Link
              to={`/tools/${post.tool_slug}`}
              className="text-[10px] font-semibold text-accent hover:underline"
            >
              re: {post.tool_slug}
            </Link>
          )}
        </div>

        {linkToDetail ? (
          <div className="mt-1.5">{Title}</div>
        ) : (
          <div className="mt-2">{Title}</div>
        )}

        {linkToDetail && (
          <p className="mt-1 text-sm text-ink-2 line-clamp-2 whitespace-pre-wrap">{post.body}</p>
        )}

        <div className="mt-2 flex items-center gap-3 text-xs text-muted">
          <span>{post.author || 'Anonymous'}</span>
          <span>{post.created_at ? new Date(post.created_at).toLocaleDateString() : ''}</span>
          {linkToDetail && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> {post.comment_count || 0}
            </span>
          )}
          {post.can_delete && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(post.id)}
              className="ml-auto inline-flex items-center gap-1 text-muted hover:text-danger transition-colors"
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
