/**
 * MockupChrome — fake browser-window frame for product preview
 * mockups. Three traffic-light dots, URL bar, and a content slot.
 *
 * Used by WizardDemo and the interactive wizard preview demo
 * (Phase L). Reusable for future product tour panels.
 *
 * @param {string} url - Text shown in the URL bar.
 * @param {React.ReactNode} [stepLabel] - Optional step indicator
 *   rendered top-right (e.g., "step 3 / 5"). Accepts ReactNode so
 *   consumers can pass JSX for richer styling on the dynamic digit.
 * @param {string} [ariaLabel] - Accessibility label for the region.
 *   Defaults to 'Product mockup'.
 * @param {React.ReactNode} children - Mockup content rendered below
 *   the chrome bar.
 */
export default function MockupChrome({
  url,
  stepLabel,
  ariaLabel = 'Product mockup',
  children,
}) {
  return (
    /* TODO Saturday: wire box-shadow to a `--shadow-lg` token once added to :root */
    <div
      role="region"
      aria-label={ariaLabel}
      className="overflow-hidden rounded-token-lg border border-line bg-bg-elev"
    >
      {/* Head: fake browser chrome */}
      <div className="flex items-center justify-between border-b border-line bg-bg-sunk px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-[9px] w-[9px] rounded-full bg-line-strong" />
          <span
            className="h-[9px] w-[9px] rounded-full"
            style={{ background: 'color-mix(in oklab, var(--line-strong) 70%, var(--accent))' }}
          />
          <span className="h-[9px] w-[9px] rounded-full bg-line-strong" />
          <span className="ml-1 text-xs text-muted">{url}</span>
        </div>
        {stepLabel ? (
          <div className="text-xs text-muted">{stepLabel}</div>
        ) : null}
      </div>

      {children}
    </div>
  )
}
