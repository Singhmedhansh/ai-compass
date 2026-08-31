import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  MessageSquare, ArrowRight, ArrowUpRight,
  Newspaper, HelpCircle, Sparkles, MessagesSquare,
} from 'lucide-react'

import SectionHeader from './SectionHeader'

const TYPE_META = {
  news: { label: 'News', icon: Newspaper },
  question: { label: 'Question', icon: HelpCircle },
  showcase: { label: 'Showcase', icon: Sparkles },
  discussion: { label: 'Discussion', icon: MessageSquare },
}

// Homepage teaser for the Community feature — pulls the top 3 hot posts
// from the live feed (GET /api/v1/community/posts) so the section always
// reflects what's actually happening, never staged/fake content.
export default function CommunityShowcase() {
  const [posts, setPosts] = useState(null) // null = loading, [] = loaded empty

  useEffect(() => {
    let cancelled = false
    fetch('/api/v1/community/posts?sort=hot&page=1')
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((data) => {
        if (!cancelled) setPosts(Array.isArray(data.posts) ? data.posts.slice(0, 3) : [])
      })
      .catch(() => {
        if (!cancelled) setPosts([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="border-t border-line bg-bg py-16 md:py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent pointer-events-none" />

      <div className="mx-auto w-full max-w-6xl px-5 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left: Pitch */}
          <div className="lg:col-span-5">
            <SectionHeader
              index="03"
              label="Community"
              title="Talk shop with students actually using these tools."
              lede="Share what you found, ask what actually works, and see what other students are building. No noise, no ranking games — just a live feed of real tool news, questions, and discussion."
            />

            <div className="mt-6 flex flex-wrap gap-3">
              {/* Matches the pill CTA language used by Hero / FinalCTA /
                  SubmitInvite. This section previously used a third style
                  (rounded-xl + accent fill), which read as a different site. */}
              <Link
                to="/community"
                className="group inline-flex items-center gap-2 rounded-full bg-ink px-[18px] py-3 text-sm font-medium text-bg transition-all hover:-translate-y-px hover:shadow-md"
              >
                Join the Community <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/community"
                className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-bg-elev px-[18px] py-3 text-sm font-medium text-ink transition-all hover:border-ink hover:bg-bg-sunk"
              >
                <MessagesSquare className="h-4 w-4" /> Start a discussion
              </Link>
            </div>
          </div>

          {/* Right: Live feed preview */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-line/60 bg-bg-elev/60 backdrop-blur-md shadow-lg overflow-hidden">
              <div className="flex items-center justify-between border-b border-line/50 px-5 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  Live from the feed
                </div>
                <Link to="/community" className="text-xs font-semibold text-accent hover:underline inline-flex items-center gap-1">
                  See all <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              <div className="divide-y divide-line/50">
                {posts === null ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={`community-home-skeleton-${i}`} className="p-5 animate-pulse">
                      <div className="h-3 w-24 rounded bg-line mb-3" />
                      <div className="h-4 w-3/4 rounded bg-line mb-2" />
                      <div className="h-3 w-1/2 rounded bg-line" />
                    </div>
                  ))
                ) : posts.length === 0 ? (
                  <div className="p-8 text-center">
                    <MessageSquare className="h-8 w-8 text-muted mx-auto mb-3" />
                    <p className="text-sm font-semibold text-ink">Be the first to post</p>
                    <p className="mt-1 text-xs text-muted">Share news, ask a question, or start a discussion.</p>
                  </div>
                ) : (
                  posts.map((post, idx) => {
                    const meta = TYPE_META[post.post_type] || TYPE_META.discussion
                    const TypeIcon = meta.icon
                    return (
                      <motion.div
                        key={post.id}
                        initial={{ opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.3, delay: idx * 0.08 }}
                      >
                        <Link
                          to={`/community/${post.id}`}
                          className="group flex items-start gap-3 p-5 transition hover:bg-bg-sunk/40"
                        >
                          <div className="flex flex-col items-center justify-center shrink-0 w-9 h-9 rounded-lg border border-line/40 bg-bg-sunk/50">
                            <span className="text-xs font-bold tabular-nums text-ink">{post.score || 0}</span>
                            <span className="text-[8px] font-semibold uppercase text-muted-2">votes</span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="inline-flex items-center gap-1 rounded bg-bg-sunk px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted border border-line/40">
                                <TypeIcon className="h-2.5 w-2.5" /> {meta.label}
                              </span>
                              {post.is_featured && (
                                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                  Featured
                                </span>
                              )}
                            </div>
                            <h3 className="text-sm font-semibold text-ink group-hover:text-accent transition-colors line-clamp-1">
                              {post.title}
                            </h3>
                            <p className="mt-1 text-xs text-muted line-clamp-1">
                              {post.author} · {post.comment_count || 0} {post.comment_count === 1 ? 'comment' : 'comments'}
                            </p>
                          </div>

                          <ArrowUpRight className="h-4 w-4 text-muted group-hover:text-accent group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0 mt-1" />
                        </Link>
                      </motion.div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
