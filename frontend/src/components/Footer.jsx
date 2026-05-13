import { Link } from 'react-router-dom'

const PRODUCT_LINKS = [
  { label: 'Wizard', to: '/ai-tool-finder' },
  { label: 'Catalog', to: '/tools' },
  { label: 'Collections', to: '/collections' },
  { label: 'Submit a tool', to: '/submit' },
]

const GUIDES_LINKS = [
  { label: 'Best for students', to: '/best-ai-tools-for-students' },
  { label: 'Best free tools', to: '/best-free-ai-tools' },
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
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-sm font-bold text-bg"
              >
                /
              </span>
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

        <div className="mt-8 flex flex-wrap justify-between gap-2 border-t border-line pt-5 text-sm text-muted">
          <span>© 2026 AI Compass · ai-compass.in</span>
          <span className="font-mono text-xs">Made with care, not scrapers.</span>
        </div>
      </div>
    </footer>
  )
}
