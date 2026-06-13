import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import CompassMark from './ui/CompassMark'

const PEERLIST_PROJECT_URL = 'https://peerlist.io/medhansh_builds/project/ai-compass'
const PEERLIST_EMBED_ID = 'PRJHP6L7BMB7E6OK6C69OE89MNAREK'

function useIsDarkTheme() {
  const read = () =>
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark'

  const [isDark, setIsDark] = useState(read)

  useEffect(() => {
    const sync = () => setIsDark(read())
    // Navbar toggles the theme by setting data-theme on <html>; ProfilePage
    // also fires a themeChanged event. Watch the attribute to cover both.
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    window.addEventListener('themeChanged', sync)
    window.addEventListener('storage', sync)
    return () => {
      observer.disconnect()
      window.removeEventListener('themeChanged', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return isDark
}

function PeerlistBadge() {
  const isDark = useIsDarkTheme()
  const theme = isDark ? 'dark' : 'light'

  return (
    <a
      href={PEERLIST_PROJECT_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="AI Compass on Peerlist Launchpad"
    >
      <img
        src={`https://peerlist.io/api/v1/projects/embed/${PEERLIST_EMBED_ID}?showUpvote=true&theme=${theme}`}
        alt="Live on Peerlist Launchpad"
        /* Width is set explicitly so the browser reserves the slot
         * before the image loads — without it Lighthouse flags this
         * as a CLS source (~0.05 layout shift on slow connections).
         * 200×48 matches what Peerlist's embed serves at @1x. */
        width="200"
        height="48"
        style={{ width: 'auto', height: '48px' }}
        loading="lazy"
        decoding="async"
      />
    </a>
  )
}

const PRODUCT_LINKS = [
  { label: 'AI Stack Architect', to: '/ai-tool-finder' },
  { label: 'Catalog', to: '/tools' },
  { label: 'Collections', to: '/collections' },
  { label: 'Model Comparison', to: '/model-comparison' },
  { label: 'Submit a tool', to: '/submit' },
  { label: 'Help Center', to: '/help' },
  { label: 'Syllabus Parser', to: '/syllabus-parser' },
  { label: 'Student Discounts', to: '/student-discounts' },
]

const GUIDES_LINKS = [
  { label: 'Best for students', to: '/best-ai-tools-for-students' },
  { label: 'Best free tools', to: '/best-free-ai-tools' },
  { label: 'Best coding tools', to: '/best-coding-tools-for-students' },
  { label: 'Jasper alternatives', to: '/best-jasper-alternatives' },
  { label: 'Murf alternatives', to: '/best-murf-alternatives' },
  { label: 'Synthesia alternatives', to: '/best-synthesia-alternatives' },
]

const ABOUT_LINKS = [
  { label: 'Team', to: '/team' },
  { label: 'Contact', to: '/contact' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
]

export default function Footer() {
  return (
    <footer className="border-t border-line bg-bg py-10 md:py-12">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <CompassMark size={24} />
              <span className="text-base font-semibold text-ink">AI Compass</span>
            </div>
            <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-muted">
              A hand-curated AI tool finder for students. Built and maintained by a small team out of Bengaluru. ai-compass.in
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              PRODUCT
            </h3>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-2 transition-colors hover:text-accent-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              GUIDES
            </h3>
            <ul className="space-y-2">
              {GUIDES_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-2 transition-colors hover:text-accent-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              ABOUT
            </h3>
            <ul className="space-y-2">
              {ABOUT_LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-2 transition-colors hover:text-accent-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-muted">
          Some links to tools are affiliate links — if you sign up through them
          we may earn a small commission, at no extra cost to you. This never
          affects which tools we list or how we rank them; curation is
          independent and based only on quality.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>© 2026 AI Compass · ai-compass.in</span>
          <PeerlistBadge />
          <span className="font-mono text-xs">Made with care, not scrapers.</span>
        </div>
      </div>
    </footer>
  )
}
