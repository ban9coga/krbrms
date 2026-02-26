'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type PublicTopbarProps = {
  onRegisterClick?: () => void
  showRegister?: boolean
}

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Events' },
  { href: '/dashboard#ongoing-events', label: 'Ongoing Events' },
]

export default function PublicTopbar({ onRegisterClick, showRegister = true }: PublicTopbarProps) {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="relative w-full px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <img src="/krb-logo.png" alt="KRB Logo" className="h-10 w-10 rounded-lg object-contain" />
            <span className="truncate text-sm font-black tracking-tight text-slate-900 sm:text-base md:text-lg">
              Kancang Run Bike Racing Committee
            </span>
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
            {navItems.map((item) => {
              const baseHref = item.href.split('#')[0]
              const active =
                baseHref === '/'
                  ? pathname === '/'
                  : pathname === baseHref || pathname.startsWith(`${baseHref}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-colors hover:text-rose-500 ${active ? 'text-rose-500' : ''}`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            {showRegister &&
              (onRegisterClick ? (
                <button
                  type="button"
                  onClick={onRegisterClick}
                  className="rounded-full border border-emerald-300/70 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700 transition-colors hover:bg-emerald-100 sm:text-sm"
                >
                  Daftar Rider
                </button>
              ) : (
                <Link
                  href="/dashboard"
                  className="rounded-full border border-emerald-300/70 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700 transition-colors hover:bg-emerald-100 sm:text-sm"
                >
                  Daftar Rider
                </Link>
              ))}
            <Link
              href="/login"
              className="rounded-full bg-rose-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-400"
            >
              Login
            </Link>
          </div>
        </div>

        <nav className="mt-3 flex items-center justify-center gap-4 text-sm font-semibold text-slate-600 md:hidden">
          {navItems.map((item) => {
            const baseHref = item.href.split('#')[0]
            const active =
              baseHref === '/'
                ? pathname === '/'
                : pathname === baseHref || pathname.startsWith(`${baseHref}/`)
            return (
              <Link
                key={`${item.href}-mobile`}
                href={item.href}
                className={`transition-colors hover:text-rose-500 ${active ? 'text-rose-500' : ''}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
