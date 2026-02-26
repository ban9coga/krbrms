type StatItem = {
  value: string
  label: string
}

const stats: StatItem[] = [
  { value: '200+', label: 'Riders Supported' },
  { value: '<1s', label: 'Real-Time Sync' },
  { value: 'Multi-Batch', label: 'System' },
  { value: 'Zero', label: 'Data Loss Architecture' },
]

export default function PerformanceStats() {
  return (
    <section className="w-full bg-gradient-to-b from-slate-900 to-black py-20">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          Race-Ready Performance
        </h2>

        <div className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.value} className="flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-white">{stat.value}</div>
              <p className="mt-2 text-sm font-medium text-slate-300">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
