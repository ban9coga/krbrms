'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Events' },
  { href: '/dashboard#ongoing-events', label: 'Ongoing Events' },
]

type MarketingTopbarProps = {
  showNav?: boolean
  showLoginButton?: boolean
}

const normalizeRole = (value: string | null) => {
  if (!value) return ''
  const upper = value.toUpperCase()
  if (upper === 'JURY_START') return 'CHECKER'
  if (upper === 'JURY_FINISH') return 'FINISHER'
  return upper
}

const roleLabel = (value: string | null) => {
  const role = normalizeRole(value)
  if (role === 'ADMIN') return 'Admin'
  if (role === 'SUPER_ADMIN') return 'Super Admin'
  if (role === 'RACE_CONTROL') return 'Race Control'
  if (role === 'RACE_DIRECTOR') return 'Race Director'
  if (role === 'CHECKER') return 'Checker'
  if (role === 'FINISHER') return 'Finisher'
  if (role === 'MC') return 'MC'
  return 'User'
}

const roleHome = (value: string | null) => {
  const role = normalizeRole(value)
  if (role === 'RACE_DIRECTOR') return '/race-director/approval'
  if (role === 'FINISHER') return '/jury/finish'
  if (role === 'CHECKER') return '/jc'
  if (role === 'RACE_CONTROL') return '/race-control'
  if (role === 'MC') return '/mc'
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return '/admin'
  return '/dashboard'
}

export default function MarketingTopbar({ showNav = true, showLoginButton = true }: MarketingTopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isLoginPage = pathname === '/login'

  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [roleKey, setRoleKey] = useState<string | null>(null)

  const panelHref = useMemo(() => roleHome(roleKey), [roleKey])
  const panelLabel = useMemo(() => roleLabel(roleKey), [roleKey])
  const isLoggedIn = Boolean(userEmail || roleKey)

  useEffect(() => {
    const syncUser = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
      const role =
        (typeof meta.role === 'string' ? meta.role : null) ||
        (typeof appMeta.role === 'string' ? appMeta.role : null)
      setUserEmail(user?.email ?? null)
      setRoleKey(role)
    }

    syncUser()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      syncUser()
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  const isActive = (href: string) => {
    if (href.includes('#')) return false
    const baseHref = href.split('#')[0]
    if (baseHref === '/') return pathname === '/'
    return pathname === baseHref || pathname.startsWith(`${baseHref}/`)
  }

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

          {showNav && (
            <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-colors hover:text-rose-500 ${isActive(item.href) ? 'text-rose-500' : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}

          {showLoginButton && !isLoginPage ? (
            <div className="flex items-center gap-2">
              {isLoggedIn ? (
                <>
                  <Link
                    href={panelHref}
                    className="max-w-[160px] truncate rounded-full border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-700 transition-colors hover:bg-slate-200"
                    title={userEmail ?? undefined}
                  >
                    {panelLabel}
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-full bg-rose-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-400"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="rounded-full bg-rose-500 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-400"
                >
                  Login
                </Link>
              )}
            </div>
          ) : (
            <div />
          )}
        </div>

        {showNav && (
          <nav className="mt-3 flex items-center justify-center gap-4 text-sm font-semibold text-slate-600 md:hidden">
            {navItems.map((item) => (
              <Link
                key={`${item.href}-mobile`}
                href={item.href}
                className={`transition-colors hover:text-rose-500 ${isActive(item.href) ? 'text-rose-500' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}

