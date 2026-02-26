type LiveStatus = 'Finished' | 'DNS' | 'DNF'

type LiveRow = {
  position: number
  riderName: string
  category: string
  time: string
  status: LiveStatus
}

const mockLiveData: LiveRow[] = [
  { position: 1, riderName: 'Arka Pratama', category: 'Boys 2018', time: '00:42.18', status: 'Finished' },
  { position: 2, riderName: 'Rafa Syahputra', category: 'Boys 2018', time: '00:42.73', status: 'Finished' },
  { position: 3, riderName: 'Naufal Ramadhan', category: 'Boys 2018', time: '00:43.11', status: 'Finished' },
  { position: 4, riderName: 'Farrel Wibowo', category: 'Boys 2018', time: '--:--.--', status: 'DNS' },
  { position: 5, riderName: 'Mikha Santoso', category: 'Boys 2018', time: '--:--.--', status: 'DNF' },
]

const statusClass: Record<LiveStatus, string> = {
  Finished: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
  DNS: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
  DNF: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
}

export default function LivePreviewSection() {
  return (
    <section className="w-full bg-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          See Live Scoring in Action
        </h2>

        <div className="mt-12 rounded-2xl border border-slate-700 bg-slate-800 p-4 md:p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Position
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Rider Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Category
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {mockLiveData.map((row) => (
                  <tr
                    key={`${row.position}-${row.riderName}`}
                    className="border-b border-slate-700/60 transition-colors duration-200 hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-4 text-sm font-semibold text-white">{row.position}</td>
                    <td className="px-4 py-4 text-sm font-medium text-slate-100">{row.riderName}</td>
                    <td className="px-4 py-4 text-sm text-slate-300">{row.category}</td>
                    <td className="px-4 py-4 text-sm font-mono text-slate-200">{row.time}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClass[row.status]}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
