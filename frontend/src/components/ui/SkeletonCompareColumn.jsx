export default function SkeletonCompareColumn() {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-bg-elev p-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-bg-sunk" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-2/3 rounded bg-bg-sunk" />
          <div className="h-4 w-1/2 rounded bg-bg-sunk" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-4 w-1/3 rounded bg-bg-sunk" />
        <div className="h-3 w-full rounded bg-bg-sunk" />
        <div className="h-3 w-full rounded bg-bg-sunk" />
        <div className="h-3 w-4/5 rounded bg-bg-sunk" />
      </div>
      <div className="mt-6 h-4 w-1/4 rounded bg-bg-sunk" />
      <div className="mt-2 space-y-2">
        <div className="h-3 w-full rounded bg-bg-sunk" />
        <div className="h-3 w-full rounded bg-bg-sunk" />
        <div className="h-3 w-2/3 rounded bg-bg-sunk" />
      </div>
    </div>
  )
}
