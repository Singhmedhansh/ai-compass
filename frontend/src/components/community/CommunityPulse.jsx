import CountUp from '../ui/CountUp'

/**
 * The numbers above the fold. They serve two audiences at once: a member
 * reads them as "is anyone here?", a prospective sponsor reads them as
 * rate-card justification. Both readings collapse the moment a number is
 * inflated, so these render exactly what the API returns — zeros included.
 */
export default function CommunityPulse({ stats, loading = false }) {
  const items = [
    { label: 'Members', value: stats?.members ?? 0 },
    { label: 'Posts', value: stats?.posts ?? 0 },
    { label: 'This week', value: stats?.posts_this_week ?? 0 },
    { label: 'Comments', value: stats?.comments ?? 0 },
    { label: 'Votes cast', value: stats?.votes ?? 0 },
    { label: 'Tools discussed', value: stats?.tools_discussed ?? 0 },
  ]

  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="bg-bg-elev px-3 py-3.5 text-center">
          <dd className="text-lg font-extrabold tabular-nums text-ink sm:text-xl">
            {loading ? <span className="text-muted-2">—</span> : <CountUp end={item.value} duration={0.9} />}
          </dd>
          <dt className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {item.label}
          </dt>
        </div>
      ))}
    </dl>
  )
}
