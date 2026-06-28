import { useCatalogStats } from '../../hooks/useCatalogStats'

// Visible FAQ for the homepage. Exported FAQS is also consumed by HomePage
// to emit matching FAQPage JSON-LD — keep the two in sync (Google requires the
// schema to mirror visible on-page content). The same Q&A is server-rendered
// into the crawler shell in app/routes.py (_HOME_FAQ); update both together.
export const FAQS = [
  {
    q: 'Is AI Compass free to use?',
    a: 'Yes. Browsing and searching all 400+ AI tools is completely free — no login, no signup, and no credit card required.',
  },
  {
    q: 'How many AI tools are listed on AI Compass?',
    a: 'Over 400 hand-tested AI tools across writing, coding, research, design, image, video, audio, and study.',
  },
  {
    q: 'Do I need an account to use AI Compass?',
    a: 'No. You can search, filter, compare, and open any tool without an account. An optional free account lets you save favourites and build a stack.',
  },
  {
    q: 'How are the tools chosen?',
    a: 'Every tool is hand-picked and hand-tested by us — no pay-to-rank placement and no directory spam.',
  },
  {
    q: 'Does AI Compass show pricing?',
    a: "Yes. Tools show verified, up-to-date pricing tiers — free, freemium, or paid — sourced from each tool's official pricing page.",
  },
  {
    q: 'Who is AI Compass for?',
    a: "It's built for students first, but anyone trying to find the right AI tool quickly will find it useful.",
  },
]

export default function FAQ() {
  const { roundedToolsText } = useCatalogStats() // {/* Dynamic — do not hardcode */}

  const dynamicFaqs = FAQS.map(faq => ({
    ...faq,
    a: faq.a
      .replace('400+', roundedToolsText) // {/* Dynamic — do not hardcode */}
      .replace('400', roundedToolsText) // {/* Dynamic — do not hardcode */}
  }))

  return (
    <section id="faq" className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          FAQ
        </div>

        <h2 className="mb-8 max-w-[24ch] text-balance text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink md:text-[48px]">
          Frequently asked questions
        </h2>

        <dl className="border-t border-line">
          {dynamicFaqs.map(({ q, a }) => (
            <div key={q} className="border-b border-line py-5">
              <dt className="text-base font-semibold text-ink md:text-lg">{q}</dt>
              <dd className="mt-2 max-w-[68ch] text-[15px] leading-relaxed text-muted md:text-base">
                {a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
