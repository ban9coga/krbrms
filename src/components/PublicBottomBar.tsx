'use client'

export default function PublicBottomBar({ variant = 'default' }: { variant?: 'default' | 'editorial' }) {
  const editorial = variant === 'editorial'

  return (
    <footer
      className={
        editorial
          ? 'homepage-editorial-bottom-bar fixed bottom-0 left-0 right-0 z-40 border-t border-[#5a4032] bg-[#1d0d07]/96 text-[#fff8e8] shadow-[0_-12px_32px_rgba(55,23,9,0.24)] backdrop-blur'
          : 'fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/80 bg-slate-950/95 text-slate-200 shadow-[0_-12px_32px_rgba(2,6,23,0.24)] backdrop-blur'
      }
    >
      <div
        className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 px-4 py-3 text-[11px] font-medium sm:px-6 md:flex-row md:items-center md:justify-between md:px-8 md:text-xs"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <p className={editorial ? 'text-[#c9b7a5]' : 'text-slate-400'}>
          Copyright (c) {new Date().getFullYear()} Pushbike Race Management Platform
        </p>

        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${editorial ? 'text-[#eadcca]' : 'text-slate-300'}`}>
          <a
            href="https://instagram.com/yogafernands"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 transition-colors ${
              editorial ? 'hover:text-[#f3c63d]' : 'hover:text-white'
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
              <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.3" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
            </svg>
            <span>@yogafernands</span>
          </a>
          <span className={editorial ? 'text-[#c9b7a5]' : 'text-slate-400'}>
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
