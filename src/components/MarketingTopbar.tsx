'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { formatAppRoleLabel, normalizeAppRole } from '../lib/roles'
import { supabase } from '../lib/supabaseClient'
import { useTheme } from './ThemeProvider'
import PublicBottomBar from './PublicBottomBar'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Events' },
  { href: '/dashboard#live-results', label: 'Live Results' },
]

type MarketingTopbarProps = {
  showNav?: boolean
  showLoginButton?: boolean
}

const roleHome = (value: string | null) => {
  const role = normalizeAppRole(value)
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
  const { theme } = useTheme()
  const isLoginPage = pathname === '/login'
  const isDark = theme === 'dark'

  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [roleKey, setRoleKey] = useState<string | null>(null)

  const panelHref = useMemo(() => roleHome(roleKey), [roleKey])
  const panelLabel = useMemo(() => formatAppRoleLabel(roleKey), [roleKey])
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
    <>
      <header
        className={`sticky top-0 z-50 backdrop-blur ${
          isDark ? 'border-b border-slate-800 bg-slate-950/92' : 'border-b border-slate-200/80 bg-white/95'
        }`}
      >
        <div className="relative w-full px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <img
                src="/platform-logo.png"
                alt="Platform Logo"
                className="h-10 w-10 object-contain"
              />
              <span className="min-w-0">
                <span className={`block truncate text-sm font-black tracking-tight sm:text-base md:text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  Pushbike Race Management Platform
                </span>
                <span className={`block truncate text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Public Event, Live Results, and Race Control
                </span>
              </span>
            </Link>

            {showNav && (
              <nav className={`absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 text-sm font-semibold md:flex ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`transition-colors ${isDark ? 'hover:text-amber-300' : 'hover:text-amber-500'} ${isActive(item.href) ? (isDark ? 'text-amber-300' : 'text-amber-500') : ''}`}
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
                      className={`max-w-[160px] truncate rounded-full border px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] transition-colors ${
                        isDark
                          ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                          : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      title={userEmail ?? undefined}
                    >
                      {panelLabel}
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-amber-300"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-amber-300"
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
            <nav className={`mt-3 flex items-center justify-center gap-4 text-sm font-semibold md:hidden ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {navItems.map((item) => (
                <Link
                  key={`${item.href}-mobile`}
                  href={item.href}
                  className={`transition-colors ${isDark ? 'hover:text-amber-300' : 'hover:text-amber-500'} ${isActive(item.href) ? (isDark ? 'text-amber-300' : 'text-amber-500') : ''}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </header>
      <PublicBottomBar />
    </>
  )
}
