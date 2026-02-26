import Link from 'next/link'

export default function OrganizerCTA() {
  return (
    <section className="relative w-full overflow-hidden bg-slate-950 py-24">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-800/20 via-transparent to-transparent" />

      <div className="relative mx-auto max-w-5xl px-6 text-center">
        <h2 className="text-4xl font-extrabold tracking-tight text-white md:text-6xl">
          Organizing a Pushbike Event?
        </h2>

        <p className="mx-auto mt-6 max-w-3xl text-lg text-slate-300 md:text-xl">
          Run your race with a professional, real-time scoring system.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="rounded-xl bg-red-600 px-8 py-4 text-base font-semibold text-white transition-colors duration-200 hover:bg-red-500"
          >
            Request Demo
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-slate-500 px-8 py-4 text-base font-semibold text-slate-100 transition-colors duration-200 hover:border-slate-300 hover:text-white"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </section>
  )
}
