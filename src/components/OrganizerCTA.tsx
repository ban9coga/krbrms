import Link from 'next/link'

export default function OrganizerCTA() {
  return (
    <section className="relative w-full overflow-hidden bg-[linear-gradient(180deg,#020817_0%,#040b18_100%)] py-16 sm:py-20 md:py-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-400/10 via-transparent to-transparent" />

      <div className="relative mx-auto w-full max-w-[1500px] px-2 text-center sm:px-4 md:px-6">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-slate-800/80 bg-slate-900/40 px-5 py-12 sm:px-8 md:px-12 md:py-16">
          <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">For Organizers</p>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-6xl">
            Butuh halaman depan yang lebih meyakinkan untuk event Anda?
          </h2>

          <p className="mx-auto mt-5 max-w-3xl text-base text-slate-300 sm:text-lg md:mt-6 md:text-xl">
            Gunakan platform yang menyatukan registrasi, live results, dan workflow race agar event terlihat lebih siap di mata rider, orang tua, sponsor, dan tim internal.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Link
              href="/dashboard"
              className="inline-flex w-full justify-center rounded-xl bg-amber-400 px-8 py-3 text-base font-semibold text-white transition-colors duration-200 hover:bg-amber-300 sm:w-auto sm:px-9 sm:py-4"
            >
              Lihat Event
            </Link>
            <Link
              href="/login"
              className="inline-flex w-full justify-center rounded-xl border border-slate-500 bg-slate-900/40 px-8 py-3 text-base font-semibold text-slate-100 transition-colors duration-200 hover:border-slate-300 hover:text-white sm:w-auto sm:px-9 sm:py-4"
            >
              Staff Login
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
