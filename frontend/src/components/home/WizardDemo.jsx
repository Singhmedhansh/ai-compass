export default function WizardDemo() {
  return (
    <section id="wizard" className="py-12 md:py-20">
      <div className="mx-auto max-w-6xl px-5">
        <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs tracking-wide text-muted">
          <span aria-hidden="true" className="h-px w-4 bg-line-strong" />
          02 / The wizard, demonstrated
        </div>

        <h2 className="mb-4 max-w-[28ch] text-balance text-[28px] font-semibold leading-[1.15] tracking-tight text-ink md:max-w-[20ch] md:text-[40px]">
          Four questions. Five tools. One reason for each.
        </h2>

        <p className="mb-8 max-w-[52ch] text-pretty text-base text-muted md:text-[17px]">
          This is what the wizard actually does. Not a video — a working demo.
          Tap any question to change it; the right side updates in real time.
        </p>

        {/* TODO Saturday: wire box-shadow to a `--shadow-lg` token once added to :root */}
        <div
          role="region"
          aria-label="Wizard demonstration"
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
              <span className="ml-1 text-xs text-muted">wizard.ai-compass.in</span>
            </div>
            {/* TODO Saturday: progress driven by wizard step state */}
            <div className="text-xs text-muted">
              step <b className="text-accent">3</b> / 4
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr]">
            {/* Questions column */}
            <div className="border-b border-line p-5 md:border-b-0 md:border-r md:p-8">
              {/* Q1 — done */}
              <div className="border-b border-dashed border-line py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">01</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Use case</span>
                    <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink">
                      <span aria-hidden="true" className="grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded-full bg-accent">
                        <svg viewBox="0 0 14 14" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3.5 7.2 6 9.5l4.5-5" />
                        </svg>
                      </span>
                      Learning to code
                    </span>
                  </div>
                </div>
              </div>

              {/* Q2 — done */}
              <div className="border-b border-dashed border-line py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">02</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Level</span>
                    <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ink">
                      <span aria-hidden="true" className="grid h-3.5 w-3.5 flex-shrink-0 place-items-center rounded-full bg-accent">
                        <svg viewBox="0 0 14 14" className="h-2.5 w-2.5" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3.5 7.2 6 9.5l4.5-5" />
                        </svg>
                      </span>
                      CS undergraduate, year 2
                    </span>
                  </div>
                </div>
              </div>

              {/* Q3 — active (frozen) */}
              <div className="border-b border-dashed border-line py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">03</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Budget per month</span>
                    <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-accent-ink">
                      <span
                        aria-hidden="true"
                        className="h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-accent"
                        style={{ boxShadow: '0 0 0 3px color-mix(in oklab, var(--accent) 20%, transparent)' }}
                      />
                      Free tier only
                    </span>
                  </div>
                </div>
                {/* TODO Saturday: option chips become real buttons; current step renders sel state on first chip */}
                <div className="mt-3 ml-[22px] flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-accent bg-accent px-2.5 py-1.5 text-xs text-white">Free only</span>
                  <span className="rounded-full border border-line bg-bg px-2.5 py-1.5 text-xs text-muted">Up to ₹500</span>
                  <span className="rounded-full border border-line bg-bg px-2.5 py-1.5 text-xs text-muted">Up to ₹1,500</span>
                  <span className="rounded-full border border-line bg-bg px-2.5 py-1.5 text-xs text-muted">No limit</span>
                </div>
              </div>

              {/* Q4 — pending */}
              <div className="py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="w-[22px] flex-shrink-0 text-xs font-medium text-muted-2">04</span>
                  <div className="flex flex-1 flex-col">
                    <span className="mb-1 text-[13px] text-muted">Platform</span>
                    <span className="text-[15px] font-medium text-muted-2">— pending —</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Output column */}
            <div className="bg-bg-sunk p-5 md:p-8">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                  Live preview · 3 of 5 shown
                </span>
              </div>

              <p className="mb-[18px] rounded-lg border border-dashed border-line-strong bg-bg-elev px-3 py-2.5 text-[13px] text-ink-2">
                For <b className="font-medium text-ink">a CS undergraduate, year 2</b> who wants to{' '}
                <b className="font-medium text-ink">learn to code</b>, on{' '}
                <b className="font-medium text-ink">a free tier</b>:
              </p>

              {/* Tool 1 — ChatGPT */}
              <div className="mb-2.5 grid grid-cols-[36px_1fr_auto] items-start gap-3 rounded-xl border border-line bg-bg-elev p-3.5">
                {/* Vendor brand color — not a design token; TODO Saturday: hoist to a brand-colors module */}
                <div
                  className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white"
                  style={{ background: '#10A37F' }}
                >
                  G
                </div>
                <div>
                  <div className="flex items-baseline gap-2 text-sm font-semibold text-ink">
                    ChatGPT <span className="text-xs font-normal text-muted">free · GPT-4o mini</span>
                  </div>
                  <div className="mt-1 text-[13px] leading-[1.45] text-muted">
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-ink">why</span>
                    Best free tier for explaining unfamiliar code line-by-line. Strong at "why is this broken?" debugging questions.
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-2">#1</span>
              </div>

              {/* Tool 2 — Claude */}
              <div className="mb-2.5 grid grid-cols-[36px_1fr_auto] items-start gap-3 rounded-xl border border-line bg-bg-elev p-3.5">
                <div
                  className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white"
                  style={{ background: '#C96442' }}
                >
                  C
                </div>
                <div>
                  <div className="flex items-baseline gap-2 text-sm font-semibold text-ink">
                    Claude <span className="text-xs font-normal text-muted">free · Sonnet 4.5</span>
                  </div>
                  <div className="mt-1 text-[13px] leading-[1.45] text-muted">
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-ink">why</span>
                    Reads longer code files than ChatGPT free. Better at refactoring assignments without rewriting your style.
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-2">#2</span>
              </div>

              {/* Tool 3 — Copilot */}
              <div className="mb-2.5 grid grid-cols-[36px_1fr_auto] items-start gap-3 rounded-xl border border-line bg-bg-elev p-3.5">
                <div
                  className="grid h-9 w-9 place-items-center rounded-lg text-sm font-bold text-white"
                  style={{ background: '#1F2328' }}
                >
                  ⌘
                </div>
                <div>
                  <div className="flex items-baseline gap-2 text-sm font-semibold text-ink">
                    GitHub Copilot <span className="text-xs font-normal text-muted">free · students</span>
                  </div>
                  <div className="mt-1 text-[13px] leading-[1.45] text-muted">
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-ink">why</span>
                    Free for verified students via GitHub Education. Inline suggestions inside VS Code — exactly the workflow your professors expect.
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-2">#3</span>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-3 text-[13px] text-muted">
                <span>+ 2 more in the full result</span>
                {/* TODO Saturday: wire to /wizard once final answer is selected */}
                <a href="#" className="text-accent-ink no-underline hover:underline">
                  Run with my own answers →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
