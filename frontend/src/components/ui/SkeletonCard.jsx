function SkeletonCard() {
  return (
    <div className="flex w-full animate-pulse-1.5 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700" />

        <div className="min-w-0 flex-1">
          <div className="h-5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="mt-2 h-4 w-full rounded bg-slate-200 dark:bg-slate-700" />
          <div className="mt-1 h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={`skeleton-star-${index}`} className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>

        <div className="h-6 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
    </div>
  )
}

export default SkeletonCard
