'use client'

import Link from 'next/link'

const footerLinks = [
  { href: '/', label: 'Home' },
  { href: '/jadwal-race-pushbike', label: 'Jadwal Race' },
  { href: '/registration-status', label: 'Cek Status' },
  { href: '/live-results', label: 'Live Results' },
]

export default function PublicBottomBar({ variant = 'default' }: { variant?: 'default' | 'editorial' }) {
  const editorial = variant === 'editorial'
  const currentYear = new Date().getFullYear()
  const mutedTextClass = editorial ? 'text-[#c9b7a5]' : 'text-slate-400'
  const linkClass = `inline-flex items-center gap-1.5 transition-colors ${
    editorial ? 'hover:text-[#f3c63d]' : 'hover:text-white'
  }`

  return (
    <footer
      className={
        editorial
          ? 'public-bottom-bar public-editorial-bottom-bar homepage-editorial-bottom-bar fixed bottom-0 left-0 right-0 z-40 border-t border-[#5a4032] bg-[#1d0d07]/96 text-[#fff8e8] shadow-[0_-12px_32px_rgba(55,23,9,0.24)] backdrop-blur'
          : 'public-bottom-bar fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/80 bg-slate-950/95 text-slate-200 shadow-[0_-12px_32px_rgba(2,6,23,0.24)] backdrop-blur'
      }
    >
      <div
        className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 px-4 py-3 text-[11px] font-medium sm:px-6 md:flex-row md:items-center md:justify-between md:gap-4 md:px-8 md:text-xs"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="min-w-0">
          <p className={mutedTextClass}>© {currentYear} RacePushbike.com</p>
          <p className={`mt-0.5 hidden sm:block ${mutedTextClass}`}>
            Platform race pushbike &amp; balance bike Indonesia
          </p>
        </div>

        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 md:justify-end ${
            editorial ? 'text-[#eadcca]' : 'text-slate-300'
          }`}
        >
          <nav aria-label="Navigasi footer" className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {footerLinks.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            ))}
          </nav>
          <span aria-hidden="true" className={`hidden md:inline ${mutedTextClass}`}>
            •
          </span>
          <a
            href="https://instagram.com/racepushbike"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram RacePushbike"
            className={linkClass}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
              <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.3" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
            </svg>
            <span>@racepushbike</span>
          </a>
          <span className={mutedTextClass}>
            Sistem by{' '}
            <span className={editorial ? 'font-semibold text-[#f3c63d]' : 'font-semibold text-slate-200'}>
              FernTech Studio
            </span>
          </span>
        </div>
      </div>
    </footer>
  )
}
