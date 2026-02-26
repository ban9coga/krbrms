import Link from 'next/link'

export default function HeroRace() {
  return (
    <section className="relative min-h-[90vh] w-full overflow-hidden bg-gradient-to-b from-slate-950 to-slate-900 py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(148,163,184,0.18),rgba(15,23,42,0)_60%)]" />

      <div className="relative mx-auto flex min-h-[calc(90vh-12rem)] max-w-6xl items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-6xl">
            Professional Pushbike Race Management System
          </h1>

          <p className="mt-6 text-lg text-slate-300 md:text-xl">
            Real-time live scoring, rider registration, and race control built for competitive events.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/live"
              className="rounded-xl bg-red-600 px-8 py-4 text-base font-semibold text-white transition-colors duration-200 hover:bg-red-500"
            >
              View Live Event
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl bg-green-600 px-8 py-4 text-base font-semibold text-white transition-colors duration-200 hover:bg-green-500"
            >
              Register Rider
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
