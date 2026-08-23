import { useCallback, useEffect, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Flame,
  Inbox,
  Loader2,
  MessagesSquare,
  PenLine,
  Trophy,
  Users,
  X,
} from 'lucide-react'

import BuilderBoard, { YourStanding } from '../components/community/BuilderBoard'
import CommunityComposer from '../components/community/CommunityComposer'
import CommunityFeedItem from '../components/community/CommunityFeedItem'
import CommunityPulse from '../components/community/CommunityPulse'
import SponsorInventoryPanel from '../components/community/SponsorInventoryPanel'
import ToolLeaderboard from '../components/community/ToolLeaderboard'
import { SponsorBoardRow, SponsorHero, SponsorRailCard } from '../components/community/SponsorUnits'
import ErrorState from '../components/ErrorState'
import { inferErrorVariant } from '../utils/errorState'

const VIEWS = [
  { id: 'feed', label: 'Feed', icon: MessagesSquare },
  { id: 'board', label: 'Tool Board', icon: Trophy },
  { id: 'builders', label: 'Builders', icon: Users },
]

const SORTS = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
]

const PERIODS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
]

const EMPTY_SPONSORS = { hero: [], board: [], rail: [], inventory: [] }

function TabNav({ view, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Community views"
      className="inline-flex w-full gap-1 rounded-2xl border border-line bg-bg-elev p-1 sm:w-auto"
    >
      {VIEWS.map((item) => {
        const Icon = item.icon
        const active = view === item.id
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition sm:flex-none sm:px-4 ${
              active
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:bg-bg-sunk hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function PillGroup({ options, value, onChange, ariaLabel }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            value === option.value
              ? 'border-accent bg-accent text-white'
              : 'border-line bg-bg-elev text-muted hover:border-line-strong hover:text-ink'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ScoringNote({ weights }) {
  if (!weights) return null
  return (
    <section aria-labelledby="scoring-heading" className="rounded-2xl border border-line bg-bg-elev p-4">
      <h2 id="scoring-heading" className="text-sm font-bold text-ink">
        How the board is scored
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        Published in full so a rank is always explainable — and so nobody has to wonder whether it
        was bought.
      </p>
      <ul className="mt-2.5 space-y-1 text-xs text-ink-2">
        <li className="flex justify-between gap-2">
          <span>A post about the tool</span>
          <span className="font-bold tabular-nums text-ink">+{weights.post}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>Upvote on that post</span>
          <span className="font-bold tabular-nums text-ink">+{weights.post_upvote}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>Comment in the thread</span>
          <span className="font-bold tabular-nums text-ink">+{weights.comment}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>Trending upvote</span>
          <span className="font-bold tabular-nums text-ink">+{weights.trending_upvote}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>Click-throughs</span>
          <span className="font-bold tabular-nums text-ink">tapering</span>
        </li>
      </ul>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-2">
        Click-throughs count, but each one counts for a little less than the last — so a tool with
        lots of passing traffic can&apos;t out-rank one people are genuinely discussing. Taking part
        always moves the board more than being popular does.
      </p>
      <p className="mt-2.5 border-t border-line pt-2.5 text-[11px] leading-relaxed text-muted-2">
        Sponsorship buys a labelled unit beside the board. It cannot move a row inside it.
      </p>
    </section>
  )
}

function CommunityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const toolSlug = searchParams.get('tool_slug') || ''
  const viewParam = searchParams.get('view')
  const view = VIEWS.some((v) => v.id === viewParam) ? viewParam : 'feed'

  const [posts, setPosts] = useState([])
  const [sort, setSort] = useState('hot')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)
  const [showComposer, setShowComposer] = useState(false)

  const [period, setPeriod] = useState('week')
  const [boardData, setBoardData] = useState(null)
  const [boardLoading, setBoardLoading] = useState(true)
  const [buildersData, setBuildersData] = useState(null)
  const [buildersLoading, setBuildersLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [sponsors, setSponsors] = useState(EMPTY_SPONSORS)
  const [sponsorsLoading, setSponsorsLoading] = useState(true)

  const [isLoggedIn] = useState(() => {
    try {
      return Boolean(JSON.parse(localStorage.getItem('user') || 'null'))
    } catch {
      return false
    }
  })

  const setView = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams)
      if (next === 'feed') params.delete('view')
      else params.set('view', next)
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  // --- Feed -------------------------------------------------------------
  useEffect(() => {
    setPage(1)
  }, [sort, toolSlug])

  useEffect(() => {
    const controller = new AbortController()

    async function loadPosts() {
      try {
        if (page === 1) setLoading(true)
        else setLoadingMore(true)
        const toolFilter = toolSlug ? `&tool_slug=${encodeURIComponent(toolSlug)}` : ''
        const response = await fetch(`/api/v1/community/posts?sort=${sort}&page=${page}${toolFilter}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) {
          const httpErr = new Error(`HTTP ${response.status}: ${response.statusText}`)
          httpErr.status = response.status
          throw httpErr
        }
        const data = await response.json()
        const nextPosts = Array.isArray(data.posts) ? data.posts : []
        setPosts((prev) => (page === 1 ? nextPosts : [...prev, ...nextPosts]))
        setHasMore(Boolean(data.has_more))
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(inferErrorVariant(err))
          if (page === 1) setPosts([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    }

    loadPosts()
    return () => controller.abort()
  }, [sort, toolSlug, page, retryNonce])

  // --- Boards, pulse, sponsored inventory -------------------------------
  // Fetched independently of the feed so a slow leaderboard never delays the
  // posts, and a failing board degrades to an empty section instead of an
  // error page.
  useEffect(() => {
    const controller = new AbortController()

    async function loadBoards() {
      setBoardLoading(true)
      setBuildersLoading(true)
      try {
        const [boardRes, builderRes] = await Promise.all([
          fetch(`/api/v1/community/leaderboard?period=${period}&limit=15`, {
            credentials: 'include',
            signal: controller.signal,
          }),
          fetch(`/api/v1/community/builders?period=${period}&limit=15`, {
            credentials: 'include',
            signal: controller.signal,
          }),
        ])
        setBoardData(boardRes.ok ? await boardRes.json() : null)
        setBuildersData(builderRes.ok ? await builderRes.json() : null)
      } catch (err) {
        if (err.name !== 'AbortError') {
          setBoardData(null)
          setBuildersData(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setBoardLoading(false)
          setBuildersLoading(false)
        }
      }
    }

    loadBoards()
    return () => controller.abort()
  }, [period, retryNonce])

  useEffect(() => {
    const controller = new AbortController()

    async function loadContext() {
      try {
        const [statsRes, sponsorRes] = await Promise.all([
          fetch('/api/v1/community/stats', { credentials: 'include', signal: controller.signal }),
          fetch('/api/v1/community/sponsors', { credentials: 'include', signal: controller.signal }),
        ])
        if (statsRes.ok) setStats(await statsRes.json())
        if (sponsorRes.ok) {
          const data = await sponsorRes.json()
          setSponsors({
            hero: data.hero || [],
            board: data.board || [],
            rail: data.rail || [],
            inventory: data.inventory || [],
          })
        }
      } catch {
        // Context panels are additive; silence is the correct failure mode.
      } finally {
        if (!controller.signal.aborted) {
          setStatsLoading(false)
          setSponsorsLoading(false)
        }
      }
    }

    loadContext()
    return () => controller.abort()
  }, [])

  const handleVote = async (postId, voteType) => {
    if (!isLoggedIn) {
      toast.error('Please log in to vote on posts')
      return
    }
    try {
      const response = await fetch(`/api/v1/community/posts/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote_type: voteType }),
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p
            const nextVote = p.user_vote === voteType ? 0 : voteType
            return { ...p, score: data.score, user_vote: nextVote === 0 ? null : voteType }
          })
        )
      } else {
        toast.error(data.error || 'Could not save your vote. Please try again.')
      }
    } catch {
      toast.error('Could not save your vote. Please try again.')
    }
  }

  const handleCreated = () => {
    setShowComposer(false)
    setSort('new')
    setPage(1)
    setRetryNonce((n) => n + 1)
    toast.success('Post published!')
  }

  const handleDelete = async (postId) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    try {
      const response = await fetch(`/api/v1/community/posts/${postId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await response.json()
      if (data.success) {
        setPosts((prev) => prev.filter((p) => p.id !== postId))
        toast.success('Post deleted')
      } else {
        toast.error('Could not delete post')
      }
    } catch {
      toast.error('Could not delete post')
    }
  }

  const heroSponsor = sponsors.hero[0] || null
  const periodLabel = useMemo(
    () => PERIODS.find((p) => p.value === period)?.label || 'This week',
    [period]
  )
  const topBuilders = (buildersData?.rows || []).slice(0, 5)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>Community — Leaderboards, Discussion & Featured AI Tools | AI Compass</title>
        <meta
          name="description"
          content="The AI Compass community: a weekly tool leaderboard scored from real votes and discussion, a builder reputation board, and labelled sponsored placements."
        />
        <link rel="canonical" href="https://ai-compass.in/community" />
      </Helmet>

      {/* ---------------------------------------------------------------- */}
      {/* Masthead                                                         */}
      {/* ---------------------------------------------------------------- */}
      <header className="relative overflow-hidden rounded-3xl border border-line bg-bg-elev px-5 py-7 sm:px-8 sm:py-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 0%, black, transparent)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl"
        />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-accent-ink">
            <Flame className="h-3 w-3" aria-hidden="true" /> {periodLabel}
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            The AI Compass Community
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-2 sm:text-base">
            A tool board scored from what people actually do — vote, discuss, click through. A builder
            board that rewards the members who make it worth reading. And sponsored placements that
            are always labelled and never able to buy a rank.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setView('feed')
                setShowComposer(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
            >
              <PenLine className="h-4 w-4" aria-hidden="true" /> Start a post
            </button>
            <button
              type="button"
              onClick={() => setView('board')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              <Trophy className="h-4 w-4" aria-hidden="true" /> See the board
            </button>
            <Link
              to="/sponsor"
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              Sponsor a placement
            </Link>
          </div>

          <div className="mt-6">
            <CommunityPulse stats={stats} loading={statsLoading} />
          </div>
        </div>
      </header>

      {heroSponsor && (
        <div className="mt-4">
          <SponsorHero unit={heroSponsor} />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Views                                                            */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabNav view={view} onChange={setView} />
            {view === 'feed' ? (
              <PillGroup options={SORTS} value={sort} onChange={setSort} ariaLabel="Sort posts" />
            ) : (
              <PillGroup options={PERIODS} value={period} onChange={setPeriod} ariaLabel="Time period" />
            )}
          </div>

          {toolSlug && (
            <div className="mt-3">
              <Link
                to={view === 'feed' ? '/community' : `/community?view=${view}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-ink"
              >
                Filtered to {toolSlug}
                <X className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          )}

          {view === 'feed' && (
            <>
              <section className="mt-4 rounded-2xl border border-line bg-bg-elev p-4 sm:p-5">
                {showComposer ? (
                  <CommunityComposer
                    isLoggedIn={isLoggedIn}
                    onCreated={handleCreated}
                    onCancel={() => setShowComposer(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowComposer(true)}
                    className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-left text-sm text-muted transition hover:border-line-strong hover:text-ink"
                  >
                    Share news, ask a question, or start a discussion…
                  </button>
                )}
              </section>

              <div className="mt-4">
                {error ? (
                  <ErrorState variant={error} onRetry={() => setRetryNonce((n) => n + 1)} />
                ) : loading ? (
                  <div className="space-y-3" aria-busy="true" aria-label="Loading posts">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={`community-skeleton-${i}`}
                        className="h-28 animate-pulse rounded-2xl border border-line bg-bg-sunk"
                      />
                    ))}
                  </div>
                ) : posts.length === 0 ? (
                  <section
                    role="status"
                    aria-live="polite"
                    className="rounded-2xl border border-dashed border-line-strong bg-bg-sunk px-6 py-14 text-center"
                  >
                    <div
                      className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-line bg-bg-elev text-muted-2 shadow-sm"
                      aria-hidden="true"
                    >
                      <Inbox className="h-8 w-8" />
                    </div>
                    <h2 className="mt-5 text-xl font-semibold text-ink">No posts yet</h2>
                    <p className="mt-2 text-sm text-muted">Be the first to start a discussion.</p>
                  </section>
                ) : (
                  <>
                    <div aria-live="polite" className="space-y-3">
                      {posts.map((post) => (
                        <CommunityFeedItem
                          key={post.id}
                          post={post}
                          onVote={handleVote}
                          onDelete={handleDelete}
                        />
                      ))}
                    </div>
                    {hasMore && (
                      <div className="mt-5 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setPage((p) => p + 1)}
                          disabled={loadingMore}
                          className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg-elev px-4 py-2.5 text-sm font-semibold text-ink-2 transition hover:border-line-strong hover:text-ink disabled:opacity-60"
                        >
                          {loadingMore ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                            </>
                          ) : (
                            'Load more'
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {view === 'board' && (
            <div className="mt-4">
              <ToolLeaderboard
                rows={boardData?.rows || []}
                sponsoredRows={sponsors.board}
                loading={boardLoading}
                SponsorRow={SponsorBoardRow}
              />
            </div>
          )}

          {view === 'builders' && (
            <div className="mt-4 space-y-4">
              <YourStanding you={buildersData?.you} weights={buildersData?.weights} />
              <BuilderBoard rows={buildersData?.rows || []} loading={buildersLoading} />
            </div>
          )}
        </main>

        {/* -------------------------------------------------------------- */}
        {/* Sidebar                                                        */}
        {/* -------------------------------------------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {sponsors.rail.length > 0 && (
            <section aria-labelledby="featured-heading" className="rounded-2xl border border-line bg-bg-elev p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="featured-heading" className="text-sm font-bold text-ink">
                  Featured tools
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-2">
                  Sponsored
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {sponsors.rail.map((unit) => (
                  <SponsorRailCard key={`rail-${unit.slot_id ?? unit.slug}`} unit={unit} />
                ))}
              </div>
            </section>
          )}

          {view !== 'builders' && topBuilders.length > 0 && (
            <section aria-labelledby="top-builders-heading" className="rounded-2xl border border-line bg-bg-elev p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="top-builders-heading" className="text-sm font-bold text-ink">
                  Top builders
                </h2>
                <button
                  type="button"
                  onClick={() => setView('builders')}
                  className="text-[11px] font-semibold text-accent transition hover:underline"
                >
                  Full board
                </button>
              </div>
              <div className="mt-3">
                <BuilderBoard rows={topBuilders} compact />
              </div>
            </section>
          )}

          {view !== 'board' && (boardData?.rows || []).length > 0 && (
            <section aria-labelledby="mini-board-heading" className="rounded-2xl border border-line bg-bg-elev p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="mini-board-heading" className="text-sm font-bold text-ink">
                  Tool board · {periodLabel.toLowerCase()}
                </h2>
                <button
                  type="button"
                  onClick={() => setView('board')}
                  className="text-[11px] font-semibold text-accent transition hover:underline"
                >
                  Full board
                </button>
              </div>
              <ol className="mt-3 space-y-1.5">
                {boardData.rows.slice(0, 5).map((row) => (
                  <li key={`mini-${row.slug}`} className="flex items-center gap-2.5">
                    <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-muted-2">
                      {row.rank}
                    </span>
                    <Link
                      to={`/tools/${row.slug}`}
                      className="min-w-0 flex-1 truncate text-xs font-semibold text-ink transition hover:text-accent"
                    >
                      {row.name}
                    </Link>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-muted">{row.score}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <SponsorInventoryPanel inventory={sponsors.inventory} loading={sponsorsLoading} />

          <ScoringNote weights={boardData?.weights} />
        </aside>
      </div>

      <p className="mt-10 text-center text-xs text-muted">
        Something to report or need help in the community?{' '}
        <a href="mailto:help@ai-compass.in" className="font-semibold text-accent hover:underline">
          help@ai-compass.in
        </a>
        {' '}· Sponsorship enquiries:{' '}
        <a href="mailto:admin@ai-compass.in" className="font-semibold text-accent hover:underline">
          admin@ai-compass.in
        </a>
      </p>
    </div>
  )
}

export default CommunityPage
