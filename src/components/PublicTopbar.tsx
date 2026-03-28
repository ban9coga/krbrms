'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { formatAppRoleLabel, normalizeAppRole } from '../lib/roles'
import { supabase } from '../lib/supabaseClient'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Events' },
  { href: '/dashboard#live-results', label: 'Live Results' },
]

type PublicTopbarTheme = 'light' | 'dark'

type PublicTopbarProps = {
  theme?: PublicTopbarTheme
}

type EventBranding = {
  eventId: string
  title: string
  brand: string
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

export default function PublicTopbar({ theme = 'light' }: PublicTopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [roleKey, setRoleKey] = useState<string | null>(null)
  const [eventBranding, setEventBranding] = useState<EventBranding | null>(null)
  const isDark = theme === 'dark'

  const panelHref = useMemo(() => roleHome(roleKey), [roleKey])
  const panelLabel = useMemo(() => formatAppRoleLabel(roleKey), [roleKey])
  const isLoggedIn = Boolean(userEmail || roleKey)

  useEffect(() => {
    const match = pathname.match(/^\/event\/([^/]+)/)
    const eventId = match?.[1] ?? null
    const loadEventBranding = async () => {
      if (!eventId) {
        setEventBranding(null)
        return
      }
      try {
        const res = await fetch(`/api/events/${eventId}`)
        const json = await res.json().catch(() => ({}))
        const data = json?.data ?? null
        const business = data?.business_settings ?? null
        setEventBranding({
          eventId,
          title: business?.public_event_title?.trim() || data?.name || 'Event',
          brand: business?.public_brand_name?.trim() || data?.name || 'Event',
        })
      } catch {
        setEventBranding(null)
      }
    }

    loadEventBranding()

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
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  return (
    <header
      className={`sticky top-0 z-50 backdrop-blur ${
        isDark ? 'border-b border-slate-800 bg-[#0b1633]/95' : 'border-b border-slate-200/80 bg-white/95'
      }`}
    >
      <div className="relative w-full px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center">
              {isDark && (
                <>
                  <span className="absolute inset-1 rounded-full bg-white/70 blur-md" />
                  <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white/35 via-amber-200/15 to-transparent" />
                </>
              )}
              <img
                src="/platform-logo.png"
                alt="Platform Logo"
                className={`relative h-10 w-10 object-contain ${isDark ? 'drop-shadow-[0_2px_10px_rgba(255,255,255,0.35)]' : ''}`}
              />
            </span>
            <span className="min-w-0">
              <span
                className={`block truncate text-sm font-black tracking-tight sm:text-base md:text-lg ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              >
                Pushbike Race Management Platform
              </span>
              {eventBranding ? (
                <span className={`block truncate text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  {eventBranding.brand} | {eventBranding.title}
                </span>
              ) : (
                <span className={`block truncate text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                  Public Event & Live Results
                </span>
              )}
            </span>
          </Link>

          <nav
            className={`absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 text-sm font-semibold md:flex ${
              isDark ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
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
                  className={`transition-colors ${
                    isDark ? 'hover:text-amber-300' : 'hover:text-amber-500'
                  } ${active ? (isDark ? 'text-amber-300' : 'text-amber-500') : ''}`}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <Link
                  href={panelHref}
                  className={`max-w-[160px] truncate rounded-full border px-3 py-2 text-xs font-extrabold uppercase tracking-[0.08em] transition-colors ${
                    isDark
                      ? 'border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  title={userEmail ?? undefined}
                >
                  {panelLabel}
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
                    isDark ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-amber-400 text-slate-900 hover:bg-amber-300'
                  }`}
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
                  isDark ? 'bg-amber-400 text-slate-900 hover:bg-amber-300' : 'bg-amber-400 text-slate-900 hover:bg-amber-300'
                }`}
              >
                Login
              </Link>
            )}
          </div>
        </div>

        <nav
          className={`mt-3 flex items-center justify-center gap-4 text-sm font-semibold md:hidden ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
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
                className={`transition-colors ${
                  isDark ? 'hover:text-amber-300' : 'hover:text-amber-500'
                } ${active ? (isDark ? 'text-amber-300' : 'text-amber-500') : ''}`}
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
