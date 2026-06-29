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
  { label: 'LLM Cost Calculator', to: '/model-comparison' },
  { label: 'Submit a tool', to: '/submit' },
  { label: 'FAQ & Support', to: '/help' },
  { label: 'Syllabus Parser', to: '/syllabus-parser' },
  { label: 'Student Discounts', to: '/student-discounts' },
]

const GUIDES_LINKS = [
  { label: 'Best for students', to: '/best-ai-tools-for-students' },
  { label: 'Best free tools', to: '/best-free-ai-tools' },
  { label: 'Best coding tools', to: '/best-coding-tools-for-students' },
]

const ABOUT_LINKS = [
  { label: 'About Us', to: '/about' },
  { label: 'Team', to: '/team' },
  { label: 'Contact', to: '/contact' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
]

const HOW_TO_LINKS = [
  { label: 'Claim GitHub Student Pack', to: '/guides/github-student-pack' },
  { label: 'Claim Notion Premium', to: '/guides/notion-student-premium' },
  { label: 'Claim JetBrains License', to: '/guides/jetbrains-student-license' },
]

function LinkedinIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  )
}

export default function Footer() {
  return (
    <footer className="border-t border-line dark:border-line-strong bg-bg py-10 md:py-12 relative">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <CompassMark size={24} />
              <span className="text-base font-semibold text-ink">AI Compass</span>
            </div>
            <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-muted font-sans">
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
              HOW TO
            </h3>
            <ul className="space-y-2">
              {HOW_TO_LINKS.map((link) => (
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
          <div className="flex items-center gap-3">
            <span>© 2026 AI Compass · ai-compass.in</span>
            <span className="text-line">|</span>
            <a
              href="https://www.linkedin.com/company/117624209/"
              target="_blank"
              rel="noreferrer"
              className="text-muted hover:text-accent transition-colors flex items-center"
              aria-label="LinkedIn"
            >
              <LinkedinIcon className="h-4 w-4" />
            </a>
          </div>
          <PeerlistBadge />
          <span className="font-mono text-xs">Made with care, not scrapers.</span>
          <button 
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-1.5 text-xs font-medium text-ink hover:text-accent transition"
          >
            Back to Top
          </button>
        </div>
      </div>
    </footer>
  )
}
