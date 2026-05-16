import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import useCompare, { MAX_COMPARE } from '../../hooks/useCompare'
import { drawerSlideUp } from '../../lib/motion'
import ToolLogo from './ToolLogo'

const MotionDiv = motion.div

const trayDesktopVariants = {
  initial: { opacity: 0, scale: 0.95, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.95, y: 8, transition: { duration: 0.15, ease: 'easeIn' } },
}

function ChipRow({ slugs, onRemove }) {
  const [toolMeta, setToolMeta] = useState({})

  useEffect(() => {
    let active = true
    const missing = slugs.filter((slug) => !toolMeta[slug])
    if (missing.length === 0) return

    Promise.allSettled(
      missing.map((slug) =>
        fetch(`/api/v1/tools/${slug}`, { credentials: 'include' })
          .then((response) => (response.ok ? response.json() : null))
          .then((data) => ({
            slug,
            name: data?.name || slug,
            url: data?.affiliate_url || data?.url || data?.website || data?.link || null,
            logo_emoji: data?.logo_emoji || data?.emoji || null,
          })),
      ),
    ).then((results) => {
      if (!active) return
      const updates = {}
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          updates[result.value.slug] = {
            name: result.value.name,
            url: result.value.url,
            logo_emoji: result.value.logo_emoji,
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        setToolMeta((prev) => ({ ...prev, ...updates }))
      }
    })

    return () => {
      active = false
    }
  }, [slugs, toolMeta])

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {slugs.map((slug) => {
        const meta = toolMeta[slug] || {}
        const displayName = meta.name || slug
        return (
          <span
            key={slug}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-bg-sunk py-1 pl-1 pr-2 text-xs text-ink"
          >
            <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden">
              <ToolLogo tool={{ name: displayName, url: meta.url, logo_emoji: meta.logo_emoji }} size={20} />
            </span>
            <span className="max-w-[8rem] truncate">{displayName}</span>
            <button
              type="button"
              onClick={() => onRemove(slug)}
              aria-label={`Remove ${displayName}`}
              className="rounded-full p-0.5 text-muted outline-none transition hover:bg-bg-elev hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        )
      })}
    </div>
  )
}

function TrayContents({ count, selected, onClear, onCompare, onRemove }) {
  const canCompare = count >= 2
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center">
          <h2 className="text-sm font-semibold text-ink">Compare</h2>
          <span className="ml-2 rounded-full bg-bg-sunk px-2 py-0.5 text-xs font-medium text-muted">
            {count}/{MAX_COMPARE}
          </span>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded text-xs text-muted outline-none transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        >
          Clear
        </button>
      </div>
      <ChipRow slugs={selected} onRemove={onRemove} />
      <button
        type="button"
        onClick={canCompare ? onCompare : undefined}
        disabled={!canCompare}
        className={
          canCompare
            ? 'mt-3 w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent md:w-auto'
            : 'mt-3 w-full cursor-not-allowed rounded-lg bg-bg-sunk px-4 py-2 text-sm font-semibold text-muted md:w-auto'
        }
      >
        {canCompare ? `Compare (${count})` : 'Select another tool to compare'}
      </button>
    </>
  )
}

export default function CompareTray() {
  const { selected, count, clear, toggle } = useCompare()
  const navigate = useNavigate()
  const location = useLocation()

  const handleCompare = () => {
    if (selected.length < 2) return
    navigate(`/compare?tools=${selected.join(',')}`)
  }

  // Redundant on /compare — the page already shows the selection
  const visible = count > 0 && location.pathname !== '/compare'

  return (
    <AnimatePresence>
      {visible
        ? [
            <MotionDiv
              key="compare-tray-desktop"
              variants={trayDesktopVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed bottom-6 right-6 z-40 hidden w-[22rem] max-w-sm flex-col rounded-2xl border border-line bg-bg-elev p-4 shadow-lg md:flex"
            >
              <TrayContents
                count={count}
                selected={selected}
                onClear={clear}
                onCompare={handleCompare}
                onRemove={toggle}
              />
            </MotionDiv>,
            <MotionDiv
              key="compare-tray-mobile"
              variants={drawerSlideUp}
              initial="initial"
              animate="animate"
              exit="exit"
              className="fixed bottom-0 left-0 right-0 z-40 flex flex-col border-t border-line bg-bg-elev px-4 pt-3 shadow-lg md:hidden"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <TrayContents
                count={count}
                selected={selected}
                onClear={clear}
                onCompare={handleCompare}
                onRemove={toggle}
              />
            </MotionDiv>,
          ]
        : null}
    </AnimatePresence>
  )
}
