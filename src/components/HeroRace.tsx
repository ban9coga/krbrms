import Link from 'next/link'

export default function HeroRace() {
  return (
    <section className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(125deg,#090f1d_0%,#1e293b_42%,#4a0f23_100%)] px-5 py-14 shadow-[0_40px_120px_rgba(15,23,42,0.32)] sm:px-8 sm:py-16 md:rounded-[2.5rem] md:px-14 md:py-24 lg:py-28">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="pointer-events-none absolute right-16 top-1/2 hidden h-56 w-56 -translate-y-1/2 rounded-full border border-rose-200/20 md:block" />

          <div className="relative z-10 mx-auto max-w-5xl text-center">
            <h1 className="mt-1 text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-5xl md:mt-2 md:text-6xl lg:text-7xl">
              Real-Time Race
              <span className="mt-2 block text-rose-400">Management System</span>
            </h1>

            <p className="mx-auto mt-6 max-w-3xl text-base text-slate-200 sm:text-lg md:mt-8 md:text-xl">
              Sistem kontrol balap presisi tinggi untuk event pushbike profesional - cepat, akurat, dan transparan.
            </p>

            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:mt-12 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <Link
                href="/dashboard"
                className="inline-flex w-full justify-center rounded-2xl bg-rose-500 px-8 py-3 text-base font-bold tracking-[0.12em] text-white transition-colors duration-200 hover:bg-rose-400 sm:w-auto sm:px-10 sm:py-4 sm:tracking-[0.15em]"
              >
                LIHAT EVENT
              </Link>
              <Link
                href="/dashboard#ongoing-events"
                className="inline-flex w-full justify-center rounded-2xl border border-slate-200/30 bg-slate-900/20 px-8 py-3 text-base font-bold tracking-[0.12em] text-white transition-colors duration-200 hover:border-slate-100/50 hover:bg-slate-900/40 sm:w-auto sm:px-10 sm:py-4 sm:tracking-[0.15em]"
              >
                LIVE RESULTS
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
