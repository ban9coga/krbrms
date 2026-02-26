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
    <section className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(125deg,#090f1d_0%,#1e293b_42%,#4a0f23_100%)] px-5 py-14 shadow-[0_40px_120px_rgba(15,23,42,0.32)] sm:px-8 sm:py-16 md:rounded-[2.5rem] md:px-14 md:py-20">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />

          <div className="relative z-10 mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
              See Live Results in Action
            </h2>

            <div className="mx-auto mt-10 w-full rounded-3xl border border-slate-700/70 bg-slate-900/55 p-3 backdrop-blur-sm sm:mt-12 sm:p-5 md:p-7">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Position
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Rider Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Category
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Time
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
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
                        <td className="px-3 py-3 text-sm font-semibold text-white sm:px-4 sm:py-4">{row.position}</td>
                        <td className="px-3 py-3 text-sm font-medium text-slate-100 sm:px-4 sm:py-4">{row.riderName}</td>
                        <td className="px-3 py-3 text-sm text-slate-300 sm:px-4 sm:py-4">{row.category}</td>
                        <td className="px-3 py-3 text-sm font-mono text-slate-200 sm:px-4 sm:py-4">{row.time}</td>
                        <td className="px-3 py-3 sm:px-4 sm:py-4">
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
        </div>
      </div>
    </section>
  )
}
