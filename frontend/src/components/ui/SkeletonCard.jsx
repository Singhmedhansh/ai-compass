function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent dark:via-white/10" />
      <div className="relative flex w-full flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />

          <div className="min-w-0 flex-1">
            <div className="h-5 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-2 h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
            <div className="mt-1 h-4 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="h-6 w-20 rounded-full bg-gray-200 dark:bg-gray-700" />

          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`skeleton-star-${index}`} className="h-4 w-4 rounded bg-gray-200 dark:bg-gray-700" />
            ))}
          </div>

          <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
      </div>
    </div>
  )
}

export default SkeletonCard
