'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext } from 'react'
import { SITE_INSTAGRAM_URL } from '../lib/structuredData'

const LiveEventAvailabilityContext = createContext(false)

export function LiveEventAvailabilityProvider({
  hasLiveEvent,
  children,
}: {
  hasLiveEvent: boolean
  children: React.ReactNode
}) {
  return (
    <LiveEventAvailabilityContext.Provider value={hasLiveEvent}>
      {children}
    </LiveEventAvailabilityContext.Provider>
  )
}

const footerLinks = [
  { href: '/', label: 'Home' },
  { href: '/jadwal-race-pushbike', label: 'Event' },
  { href: '/insight', label: 'Insight' },
  { href: '/registration-status', label: 'Cek Status' },
  { href: '/live-results', label: 'Live Score' },
]

export default function PublicBottomBar({ variant = 'default' }: { variant?: 'default' | 'editorial' }) {
  const pathname = usePathname()
  const hasLiveEvent = useContext(LiveEventAvailabilityContext)
  const editorial = variant === 'editorial'
  const currentYear = new Date().getFullYear()
  const mutedTextClass = editorial ? 'text-[#c9b7a5]' : 'text-slate-400'
  const linkClass = `inline-flex items-center gap-1.5 transition-colors ${
    editorial ? 'hover:text-[#f3c63d]' : 'hover:text-white'
  }`
  const isLiveActive = pathname === '/live-results' || /^\/event\/[^/]+\/live-score(?:\/|$)/.test(pathname)
  const isEventActive =
    pathname === '/jadwal-race-pushbike' ||
    pathname.startsWith('/jadwal-race-pushbike/') ||
    (pathname.startsWith('/event/') && !isLiveActive)
  const isHomeActive = pathname === '/'
  const isStatusActive = pathname === '/registration-status' || pathname.startsWith('/registration-status/')
  const mobileItemClass = `public-mobile-bottom-item${editorial ? ' is-editorial' : ''}`

  return (
    <footer
      className={
        editorial
          ? 'public-bottom-bar public-editorial-bottom-bar homepage-editorial-bottom-bar fixed bottom-0 left-0 right-0 z-40 border-t border-[#5a4032] bg-[#1d0d07]/96 text-[#fff8e8] shadow-[0_-12px_32px_rgba(55,23,9,0.24)] backdrop-blur'
          : 'public-bottom-bar fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/80 bg-slate-950/95 text-slate-200 shadow-[0_-12px_32px_rgba(2,6,23,0.24)] backdrop-blur'
      }
    >
      <nav aria-label="Navigasi utama" className={`public-mobile-bottom-nav md:hidden${editorial ? ' is-editorial' : ''}`}>
        <Link
          href="/"
          aria-current={isHomeActive ? 'page' : undefined}
          aria-label="Home"
          className={`${mobileItemClass}${isHomeActive ? ' is-active' : ''}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="m3.5 10.5 8.5-7 8.5 7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 9.5v10h13v-10M9.5 19.5v-6h5v6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Home</span>
        </Link>
        <Link
          href="/jadwal-race-pushbike"
          aria-current={isEventActive ? 'page' : undefined}
          className={`${mobileItemClass}${isEventActive ? ' is-active' : ''}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3.5" y="4.5" width="17" height="16" rx="2.5" />
            <path d="M7.5 2.8v3.5M16.5 2.8v3.5M4 9h16M7.5 12.5h3M7.5 16h3M14 12.5h3" />
          </svg>
          <span>Event</span>
        </Link>
        <Link
          href="/live-results"
          aria-current={isLiveActive ? 'page' : undefined}
          aria-label="Buka Live Score"
          className={`${mobileItemClass}${isLiveActive ? ' is-active' : ''}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 18.5h16M6.5 15V9.5M12 15V5.5M17.5 15v-3" />
            <circle cx="6.5" cy="7" r="1.5" />
            <circle cx="12" cy="3" r="1.5" />
            <circle cx="17.5" cy="10" r="1.5" />
          </svg>
          {hasLiveEvent && <span className="public-mobile-live-dot" aria-hidden="true" />}
          <span>Live Score</span>
        </Link>
        <Link
          href="/registration-status"
          aria-current={isStatusActive ? 'page' : undefined}
          className={`${mobileItemClass}${isStatusActive ? ' is-active' : ''}`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="8.5" />
            <path d="m8.5 12.2 2.3 2.3 4.8-5" />
          </svg>
          <span>Cek Status</span>
        </Link>
      </nav>
      <div
        className="mx-auto hidden w-full max-w-[1500px] flex-col gap-2 px-4 py-3 text-[11px] font-medium sm:px-6 md:flex md:flex-row md:items-center md:justify-between md:gap-4 md:px-8 md:text-xs"
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
          <nav aria-label="Navigasi footer" className="flex h-5 flex-wrap items-center gap-x-3 gap-y-1 leading-none">
            {footerLinks.map((item) => (
              <Link key={item.href} href={item.href} className={`${linkClass} h-5 whitespace-nowrap leading-none`}>
                {item.label}
              </Link>
            ))}
          </nav>
          <span aria-hidden="true" className={`hidden h-5 items-center leading-none md:inline-flex ${mutedTextClass}`}>
            •
          </span>
          <a
            href={SITE_INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram RacePushbike"
            className={`inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap leading-none transition-colors ${
              editorial ? 'hover:text-[#f3c63d]' : 'hover:text-white'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="relative top-px block h-3.5 w-3.5 shrink-0"
            >
              <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.3" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
            </svg>
            <span className="block pt-px leading-none">@racepushbike</span>
          </a>
          <span className={`inline-flex h-5 shrink-0 items-center whitespace-nowrap leading-none ${mutedTextClass}`}>
            Sistem by{' '}
            <a
              href="https://ferntech.my.id"
              target="_blank"
              rel="noopener noreferrer"
              className={`${editorial ? 'text-[#f3c63d] hover:text-[#ffd95c]' : 'text-slate-200 hover:text-white'} font-semibold transition-colors`}
            >
              FernTech Studio
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
