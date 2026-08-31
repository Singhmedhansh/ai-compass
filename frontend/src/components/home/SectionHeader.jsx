// One header treatment for every homepage section.
//
// The page previously ran two competing systems: a left-aligned editorial one
// (mono eyebrow + rule + "02 / label", 40px h2) and a centred SaaS one (green
// pill eyebrow with an icon, 36px h2). They alternated down the page, so the
// reader re-learned where a section starts on every scroll, and the numbered
// eyebrows ran 02 -> 03 -> 04 with two unnumbered sections physically wedged
// between them. This component is the single system; `index` renumbers in DOM
// order.
export default function SectionHeader({ index, label, title, lede, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          {index ? `${index} / ${label}` : label}
        </div>
      )}

      <h2 className="max-w-[28ch] text-balance text-[28px] font-semibold leading-[1.15] tracking-tight text-ink md:max-w-[20ch] md:text-[40px]">
        {title}
      </h2>

      {lede && (
        <p className="mt-4 max-w-[52ch] text-pretty text-base leading-[1.6] text-muted md:text-[17px]">
          {lede}
        </p>
      )}
    </div>
  )
}
