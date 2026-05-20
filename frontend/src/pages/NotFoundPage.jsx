import { Link, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'

// Rendered for any URL the React router cannot match (wildcard route in
// App.jsx). The server returns a 404 status when it serves the SPA shell
// for these paths — see _not_found_html in app/routes.py — so crawlers
// see the correct status while users see this friendly page.
export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <>
      <Helmet>
        <title>Page not found — AI Compass</title>
        <meta
          name="description"
          content="That page does not exist on AI Compass. Browse 399 hand-tested AI tools for students instead."
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="text-6xl font-bold text-accent">404</div>
        <h1 className="mt-4 text-2xl font-semibold text-ink">
          We could not find that page
        </h1>
        <p className="mt-3 text-muted">
          <code className="rounded bg-surface px-1.5 py-0.5 text-sm">
            {pathname}
          </code>{' '}
          doesn’t exist on AI Compass — it may have moved, or the link may be
          mistyped.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Go home
          </Link>
          <Link
            to="/tools"
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Browse all tools
          </Link>
          <Link
            to="/ai-tool-finder"
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface"
          >
            Tool finder
          </Link>
        </div>
      </div>
    </>
  )
}
