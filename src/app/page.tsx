import CoreFeatures from '../components/CoreFeatures'
import HeroRace from '../components/HeroRace'
import LivePreviewSection from '../components/LivePreviewSection'
import MarketingTopbar from '../components/MarketingTopbar'
import OrganizerCTA from '../components/OrganizerCTA'
import PerformanceStats from '../components/PerformanceStats'
import Link from 'next/link'

export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#f6fbf7', color: '#111' }}>
      <MarketingTopbar />

      <main>
        <HeroRace />
        <LivePreviewSection />
        <CoreFeatures />
        <PerformanceStats />
        <OrganizerCTA />
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 text-slate-200">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 md:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-lg font-extrabold tracking-tight text-white">Kancang Run Bike Racing Committee</div>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                Official race management platform for registration, live results, and event control.
              </p>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Copyright (c) {new Date().getFullYear()} KRB Race Management System
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
              <Link href="/dashboard" className="text-slate-300 transition-colors hover:text-white">
                Events
              </Link>
              <Link href="/dashboard#ongoing-events" className="text-slate-300 transition-colors hover:text-white">
                Live Results
              </Link>
              <Link href="/login" className="text-slate-300 transition-colors hover:text-white">
                Login
              </Link>
              <a href="mailto:race@krbrms.com" className="text-slate-300 transition-colors hover:text-white">
                Contact
              </a>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <a
              href="https://instagram.com/kancang.runbike"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.3" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <a
              href="https://instagram.com/kancang.runbike"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-slate-300 transition-colors hover:text-white"
            >
              @kancang.runbike
            </a>
          </div>

          <p className="mt-6 text-xs text-slate-500">
            Website by <span className="font-semibold text-slate-300">@yogafernands</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
