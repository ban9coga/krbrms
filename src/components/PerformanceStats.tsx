import type { ReactNode } from 'react'

type StatItem = {
  value: string
  label: string
  icon: ReactNode
}

const statIconClass = 'h-5 w-5 text-rose-300'

const RidersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={statIconClass}>
    <circle cx="9" cy="8" r="2.5" />
    <circle cx="16.5" cy="9.5" r="2" />
    <path d="M4.5 18a4.5 4.5 0 0 1 9 0M13.5 18a3.5 3.5 0 0 1 7 0" strokeLinecap="round" />
  </svg>
)

const SyncIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={statIconClass}>
    <path d="M5 12a7 7 0 0 1 12-4.8" strokeLinecap="round" />
    <path d="M17 3.8v4h-4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 12a7 7 0 0 1-12 4.8" strokeLinecap="round" />
    <path d="M7 20.2v-4h4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const BatchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={statIconClass}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
)

const SafeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={statIconClass}>
    <path d="M12 3l7 3v6c0 4.4-2.8 8.3-7 9.6-4.2-1.3-7-5.2-7-9.6V6l7-3z" strokeLinecap="round" />
    <path d="M9.5 12.2l1.8 1.8 3.2-3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const stats: StatItem[] = [
  { value: '200+', label: 'Riders Supported', icon: <RidersIcon /> },
  { value: '<1s', label: 'Real-Time Sync', icon: <SyncIcon /> },
  { value: 'Multi-Batch', label: 'System', icon: <BatchIcon /> },
  { value: 'Zero', label: 'Data Loss Architecture', icon: <SafeIcon /> },
]

export default function PerformanceStats() {
  return (
    <section className="w-full bg-gradient-to-b from-slate-900 via-[#070e1f] to-black py-16 sm:py-20">
      <div className="mx-auto w-full max-w-[1500px] px-2 text-center sm:px-4 md:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
          Race-Ready Performance
        </h2>

        <div className="mx-auto mt-10 grid max-w-[1120px] grid-cols-2 gap-4 sm:mt-12 sm:gap-6 md:grid-cols-4 md:gap-8">
          {stats.map((stat) => (
            <div
              key={stat.value}
              className="rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-6 backdrop-blur-sm md:px-6 md:py-8"
            >
              <div className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-rose-400/15 ring-1 ring-rose-300/25">
                {stat.icon}
              </div>
              <div className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">{stat.value}</div>
              <p className="mt-2 text-xs font-medium text-slate-300 sm:text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
