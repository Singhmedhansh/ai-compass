import { Link } from "react-router-dom";

const guides = [
  {
    slug: "/best-ai-tools-for-students",
    emoji: "🎓",
    title: "Best AI Tools for Students",
    description: "Top 10 tools for essays, research, coding and staying organised.",
    badge: "Most popular",
    badgeColor: "#6366f1",
    color: "#6366f1",
  },
  {
    slug: "/best-free-ai-tools",
    emoji: "💸",
    title: "Best Free AI Tools",
    description: "10 powerful AI tools with genuinely useful free tiers. No credit card needed.",
    badge: "Free only",
    badgeColor: "#10a37f",
    color: "#10a37f",
  },
];

export function GuidesDropdown() {
  return (
    <div className="flex min-w-[260px] flex-col gap-1 p-2">
      <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-slate-500 font-sans m-0">
        Guides
      </p>
      {guides.map(g => (
        <Link key={g.slug} to={g.slug} className="group flex items-center gap-2.5 rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 no-underline">
          <span className="text-[1.1rem]">{g.emoji}</span>
          <div>
            <p className="m-0 font-sans text-[13px] font-semibold text-slate-900 dark:text-slate-200">{g.title}</p>
            <p className="m-0 font-sans text-[11px] text-slate-500 dark:text-slate-400">{g.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function GuidesSection() {
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="mb-1 font-serif text-[1.8rem] font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Student Guides
          </h2>
          <p className="m-0 font-sans text-sm text-slate-600 dark:text-slate-400">
            Curated picks for specific workflows
          </p>
        </div>
        <Link to="/tools" className="font-sans text-[13px] font-semibold text-indigo-500 no-underline hover:text-indigo-600 dark:hover:text-indigo-400">
          Browse all tools →
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {guides.map(g => (
          <Link key={g.slug} to={g.slug} className="block rounded-xl border border-slate-200 bg-white p-6 no-underline transition-all hover:-translate-y-0.5 hover:shadow-md hover:bg-slate-50 dark:border-slate-700/50 dark:bg-slate-800/50 dark:hover:bg-slate-800"
            style={{ borderLeft: `3px solid ${g.color}` }}
          >
            <div className="mb-3 flex items-start justify-between">
              <span className="text-[1.8rem]">{g.emoji}</span>
              <span className="rounded-full px-2.5 py-0.5 font-sans text-[11px] font-semibold"
                style={{
                  background: `${g.badgeColor}20`,
                  border: `1px solid ${g.badgeColor}40`,
                  color: g.badgeColor,
                }}>{g.badge}</span>
            </div>
            <h3 className="mb-2 font-serif text-[1.1rem] font-bold text-slate-900 dark:text-slate-100">{g.title}</h3>
            <p className="mb-4 font-sans text-[13px] leading-[1.6] text-slate-600 dark:text-slate-400">{g.description}</p>
            <span className="font-sans text-[13px] font-semibold" style={{ color: g.color }}>Read guide →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}