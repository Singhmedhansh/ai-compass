function ShimmerOverlay() {
  return (
    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent dark:via-white/10" />
  )
}

function SkeletonToolDetail() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex-1 space-y-6">
        <section className="relative overflow-hidden rounded-2xl border border-line bg-bg-elev p-6 shadow-lg">
          <ShimmerOverlay />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="h-16 w-16 shrink-0 rounded-2xl bg-bg-sunk" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-8 w-2/3 rounded bg-bg-sunk" />
              <div className="flex gap-2">
                <div className="h-6 w-20 rounded-full bg-bg-sunk" />
                <div className="h-6 w-16 rounded-full bg-bg-sunk" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-full rounded bg-bg-sunk" />
                <div className="h-4 w-5/6 rounded bg-bg-sunk" />
              </div>
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <div className="h-10 w-full rounded-xl bg-bg-sunk" />
                <div className="h-10 w-full rounded-xl bg-bg-sunk" />
              </div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-line bg-bg-elev p-6">
          <ShimmerOverlay />
          <div className="relative space-y-3">
            <div className="h-5 w-1/3 rounded bg-bg-sunk" />
            <div className="space-y-2 pt-2">
              <div className="h-4 w-full rounded bg-bg-sunk" />
              <div className="h-4 w-full rounded bg-bg-sunk" />
              <div className="h-4 w-full rounded bg-bg-sunk" />
              <div className="h-4 w-4/5 rounded bg-bg-sunk" />
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-6 lg:w-80">
        <section className="relative overflow-hidden rounded-2xl border border-line bg-bg-elev p-5">
          <ShimmerOverlay />
          <div className="relative">
            <div className="h-5 w-2/5 rounded bg-bg-sunk" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`skeleton-info-${i}`} className="flex items-center justify-between gap-4">
                  <div className="h-4 w-1/3 rounded bg-bg-sunk" />
                  <div className="h-4 w-1/4 rounded bg-bg-sunk" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-line bg-bg-elev p-5">
          <ShimmerOverlay />
          <div className="relative">
            <div className="h-5 w-1/2 rounded bg-bg-sunk" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`skeleton-related-${i}`} className="flex items-center gap-3 rounded-xl border border-line p-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg bg-bg-sunk" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-2/3 rounded bg-bg-sunk" />
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, s) => (
                        <div key={`skeleton-star-${i}-${s}`} className="h-3.5 w-3.5 rounded bg-bg-sunk" />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </aside>
    </div>
  )
}

export default SkeletonToolDetail
