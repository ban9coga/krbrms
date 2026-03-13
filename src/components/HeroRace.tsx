import Link from 'next/link'

type LiveEventItem = {
  id: string
  name: string
  location?: string | null
}

export default function HeroRace({ liveEvent }: { liveEvent: LiveEventItem | null }) {
  return (
    <section className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(125deg,#090f1d_0%,#1e293b_42%,#4a0f23_100%)] px-5 py-14 shadow-[0_40px_120px_rgba(15,23,42,0.32)] sm:px-8 sm:py-16 md:rounded-[2.5rem] md:px-14 md:py-24 lg:py-28">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="pointer-events-none absolute right-16 top-1/2 hidden h-56 w-56 -translate-y-1/2 rounded-full border border-rose-200/20 md:block" />

          <div className="relative z-10 mx-auto max-w-5xl text-center">
            <div className="mb-6 flex justify-center">
              {liveEvent ? (
                <Link
                  href={`/event/${liveEvent.id}`}
                  className="inline-flex max-w-full items-center gap-3 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-4 py-2 text-left text-emerald-100 transition-colors hover:border-emerald-200/60 hover:bg-emerald-500/20"
                >
                  <span className="relative inline-flex h-3 w-3 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.95)]" />
                  </span>
                  <span className="truncate text-xs font-black tracking-[0.14em] sm:text-sm">
                    LIVE NOW: {liveEvent.name}
                  </span>
                </Link>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/30 bg-slate-900/20 px-4 py-2 text-xs font-bold tracking-[0.14em] text-slate-200 sm:text-sm">
                  <span className="inline-flex h-2 w-2 rounded-full bg-slate-300/80" />
                  NO LIVE EVENT
                </div>
              )}
            </div>

            <h1 className="mt-1 text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-5xl md:mt-2 md:text-6xl lg:text-7xl">
              <span className="block">
                <span className="font-black text-rose-400 drop-shadow-[0_16px_50px_rgba(244,63,94,0.35)]">KANCANG</span>{' '}
                <span className="font-extrabold text-white/95">Run Bike</span>
              </span>
            </h1>

            <p className="mx-auto mt-4 max-w-3xl text-base font-semibold tracking-tight text-slate-100 sm:text-lg md:mt-5 md:text-xl">
              Real-Time Race Management System
            </p>

            <p className="mx-auto mt-3 max-w-3xl text-sm font-medium leading-relaxed text-slate-200 sm:text-base md:mt-4">
              Presisi di Setiap Detik, Transparansi di Setiap Garis Finish.
            </p>

            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:mt-12 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Link
                href="/dashboard"
                className="inline-flex w-full justify-center rounded-2xl bg-rose-500 px-8 py-3 text-base font-bold tracking-[0.12em] text-white transition-colors duration-200 hover:bg-rose-400 sm:w-auto sm:px-10 sm:py-4 sm:tracking-[0.15em]"
              >
                Eksplor Event
              </Link>
              <Link
                href="/dashboard#live-results"
                className="inline-flex w-full justify-center rounded-2xl border border-slate-200/30 bg-slate-900/20 px-8 py-3 text-base font-bold tracking-[0.12em] text-white transition-colors duration-200 hover:border-slate-100/50 hover:bg-slate-900/40 sm:w-auto sm:px-10 sm:py-4 sm:tracking-[0.15em]"
              >
                Pantau Live
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
