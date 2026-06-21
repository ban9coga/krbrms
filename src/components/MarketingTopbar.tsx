'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { formatAppRoleLabel, normalizeAppRole } from '../lib/roles'
import { supabase } from '../lib/supabaseClient'
import { ThemeToggleSwitch, useTheme } from './ThemeProvider'
import PublicBottomBar from './PublicBottomBar'
import LiveEntryButton from './LiveEntryButton'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Events' },
]

type MarketingTopbarProps = {
  showNav?: boolean
  showLoginButton?: boolean
  variant?: 'default' | 'editorial'
}

const roleHome = (value: string | null) => {
  const role = normalizeAppRole(value)
  if (role === 'RACE_DIRECTOR') return '/race-director/approval'
  if (role === 'FINISHER') return '/jury/finish'
  if (role === 'CHECKER') return '/jc'
  if (role === 'RACE_CONTROL') return '/race-control'
  if (role === 'MC') return '/mc'
  if (role === 'REGISTRATION_APPROVER') return '/admin/events'
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return '/admin'
  return '/dashboard'
}

export default function MarketingTopbar({
  showNav = true,
  showLoginButton = true,
  variant = 'default',
}: MarketingTopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { theme } = useTheme()
  const isLoginPage = pathname === '/login'
  const isDark = theme === 'dark'
  const editorial = variant === 'editorial'

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
        className={
          editorial
            ? 'homepage-editorial-topbar sticky top-0 z-50 border-b border-[#d9ceb4] bg-[#f5ecd7]/95 backdrop-blur'
            : `sticky top-0 z-50 backdrop-blur ${
                isDark ? 'border-b border-slate-800 bg-slate-950/92' : 'border-b border-slate-200/80 bg-white/95'
              }`
        }
      >
        <div className={`relative w-full px-4 md:px-6 ${editorial ? 'py-2.5' : 'py-3'}`}>
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <Image
                src="/platform-logo.png"
                alt="Platform Logo"
                width={45}
                height={32}
                sizes="45px"
                className={editorial ? 'h-9 w-9 object-contain' : 'h-10 w-10 object-contain'}
              />
              <span className="min-w-0">
                <span
                  className={`block truncate font-black tracking-tight ${
                    editorial
                      ? 'text-sm text-[#1d0d07] sm:text-base'
                      : `text-sm sm:text-base md:text-lg ${isDark ? 'text-slate-100' : 'text-slate-900'}`
                  }`}
                >
                  {editorial ? 'RacePushbike.com' : 'Pushbike Race Management Platform'}
                </span>
                {!editorial && (
                  <span className={`block truncate text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Public Event, Live Results, and Race Control
                  </span>
                )}
              </span>
            </Link>

            {showNav && (
              <nav
                className={
                  editorial
                    ? 'homepage-editorial-desktop-nav absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-[#d9ceb4] bg-[#fffaf0] p-1 text-sm font-bold text-[#2a160d] shadow-sm md:flex'
                    : `absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 text-sm font-semibold md:flex ${
                        isDark ? 'text-slate-300' : 'text-slate-600'
                      }`
                }
              >
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      editorial
                        ? `rounded-full px-4 py-2 transition-colors ${
                            isActive(item.href) ? 'bg-[#1d0d07] text-white' : 'hover:bg-[#efe3c8]'
                          }`
                        : `transition-colors ${isDark ? 'hover:text-amber-300' : 'hover:text-amber-500'} ${
                            isActive(item.href) ? (isDark ? 'text-amber-300' : 'text-amber-500') : ''
                          }`
                    }
                  >
                    {item.label}
                  </Link>
                ))}
                <LiveEntryButton
                  label="Live Results"
                  mode="results"
                  fallbackHref="/dashboard#live-results"
                  className={
                    editorial
                      ? 'rounded-full px-4 py-2 transition-colors hover:bg-[#efe3c8]'
                      : `transition-colors ${isDark ? 'hover:text-amber-300' : 'hover:text-amber-500'}`
                  }
                  activeClassName={
                    editorial ? 'bg-[#1d0d07] text-white' : isDark ? 'text-amber-300' : 'text-amber-500'
                  }
                />
              </nav>
            )}

            <div className={`flex shrink-0 items-center gap-2 ${editorial ? 'homepage-editorial-auth' : ''}`}>
              <ThemeToggleSwitch />
              {showLoginButton && !isLoginPage ? (
                <>
                {isLoggedIn ? (
                  <>
                    <Link
                      href={panelHref}
                      className={`max-w-[160px] truncate rounded-full border px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] transition-colors ${
                        editorial
                          ? 'border-[#d9ceb4] bg-[#fffaf0] text-[#2a160d] hover:bg-[#efe3c8]'
                          : isDark
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
                      className={
                        editorial
                          ? 'rounded-full bg-[#1d0d07] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ee4b16]'
                          : 'rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-amber-300'
                      }
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <Link
                    href="/login"
                    className={
                      editorial
                        ? 'rounded-full bg-[#1d0d07] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ee4b16]'
                        : 'rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-slate-900 transition-colors hover:bg-amber-300'
                    }
                  >
                    Login
                  </Link>
                )}
                </>
              ) : null}
            </div>
          </div>

          {showNav && (
            <nav
              className={`mt-3 flex items-center justify-center gap-4 text-sm font-semibold md:hidden ${
                editorial ? 'text-[#2a160d]' : isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              {navItems.map((item) => (
                <Link
                  key={`${item.href}-mobile`}
                  href={item.href}
                  className={`transition-colors ${
                    editorial
                      ? isActive(item.href)
                        ? 'font-black text-[#ee4b16]'
                        : 'hover:text-[#ee4b16]'
                      : `${isDark ? 'hover:text-amber-300' : 'hover:text-amber-500'} ${
                          isActive(item.href) ? (isDark ? 'text-amber-300' : 'text-amber-500') : ''
                        }`
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <LiveEntryButton
                label="Live Results"
                mode="results"
                fallbackHref="/dashboard#live-results"
                className={`transition-colors ${
                  editorial ? 'hover:text-[#ee4b16]' : isDark ? 'hover:text-amber-300' : 'hover:text-amber-500'
                }`}
                activeClassName={editorial ? 'font-black text-[#ee4b16]' : isDark ? 'text-amber-300' : 'text-amber-500'}
              />
            </nav>
          )}
        </div>
      </header>
      <PublicBottomBar variant={editorial ? 'editorial' : 'default'} />
    </>
  )
}
