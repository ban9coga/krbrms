import Link from 'next/link'

export default function OrganizerCTA() {
  return (
    <section className="relative w-full overflow-hidden bg-[linear-gradient(180deg,#020817_0%,#040b18_100%)] py-16 sm:py-20 md:py-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-rose-500/10 via-transparent to-transparent" />

      <div className="relative mx-auto w-full max-w-[1500px] px-2 text-center sm:px-4 md:px-6">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-slate-800/80 bg-slate-900/40 px-5 py-12 sm:px-8 md:px-12 md:py-16">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-6xl">
            Organizing a Pushbike Event?
          </h2>

          <p className="mx-auto mt-5 max-w-3xl text-base text-slate-300 sm:text-lg md:mt-6 md:text-xl">
            Kelola event dengan sistem pendaftaran, live results, dan kontrol race yang siap untuk standar kompetisi.
          </p>

          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Link
              href="/dashboard"
              className="inline-flex w-full justify-center rounded-xl bg-rose-500 px-8 py-3 text-base font-semibold text-white transition-colors duration-200 hover:bg-rose-400 sm:w-auto sm:px-9 sm:py-4"
            >
              Request Demo
            </Link>
            <Link
              href="/login"
              className="inline-flex w-full justify-center rounded-xl border border-slate-500 bg-slate-900/40 px-8 py-3 text-base font-semibold text-slate-100 transition-colors duration-200 hover:border-slate-300 hover:text-white sm:w-auto sm:px-9 sm:py-4"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
