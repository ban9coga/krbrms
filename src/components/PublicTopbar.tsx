'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { formatAppRoleLabel, normalizeAppRole } from '../lib/roles'
import { supabase } from '../lib/supabaseClient'
import PublicBottomBar from './PublicBottomBar'
import LiveEntryButton from './LiveEntryButton'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Events' },
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

const normalizeBrandingText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const formatEventBrandingLabel = (branding: EventBranding) => {
  const brand = branding.brand.trim()
  const title = branding.title.trim()
  if (!brand) return title
  if (!title) return brand
  if (normalizeBrandingText(brand) === normalizeBrandingText(title)) return title
  return `${brand} | ${title}`
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

export default function PublicTopbar({}: PublicTopbarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [roleKey, setRoleKey] = useState<string | null>(null)
  const [eventBranding, setEventBranding] = useState<EventBranding | null>(null)

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
    <>
      <header
        className="public-editorial-topbar sticky top-0 z-50 border-b border-[#d9ceb4] bg-[#f5ecd7]/95 text-[#1d0d07] backdrop-blur"
      >
        <div className="relative w-full px-4 py-2.5 md:px-6">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex min-w-0 items-center gap-3">
              <span className="relative flex h-10 w-10 items-center justify-center">
                <img
                  src="/platform-logo.png"
                  alt="Platform Logo"
                  className="relative h-10 w-10 object-contain"
                />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black sm:text-base md:text-lg">
                  RacePushbike
                </span>
                {eventBranding ? (
                  <span className="block truncate text-[11px] font-bold text-[#796657]">
                    {formatEventBrandingLabel(eventBranding)}
                  </span>
                ) : (
                  <span className="block truncate text-[11px] font-bold text-[#796657]">
                    Public Event & Live Results
                  </span>
                )}
              </span>
            </Link>

            <nav
              className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-[#d9ceb4] bg-[#fff8e8] p-1 text-sm font-bold text-[#2a160d] shadow-sm md:flex"
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
                    className={`rounded-full px-4 py-2 transition-colors ${
                      active ? 'bg-[#1d0d07] text-[#fff8e8]' : 'hover:bg-[#efe3c8]'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
              <LiveEntryButton
                label="Live Results"
                mode="results"
                fallbackHref="/dashboard#live-results"
                className="rounded-full px-4 py-2 transition-colors hover:bg-[#efe3c8]"
                activeClassName="bg-[#1d0d07] text-[#fff8e8]"
              />
            </nav>

            <div className="flex items-center gap-2">
              {isLoggedIn ? (
                <>
                  <Link
                    href={panelHref}
                    className="max-w-[160px] truncate rounded-full border border-[#d9ceb4] bg-[#fff8e8] px-3 py-2 text-xs font-extrabold uppercase text-[#2a160d] transition-colors hover:bg-[#efe3c8]"
                    title={userEmail ?? undefined}
                  >
                    {panelLabel}
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-full bg-[#1d0d07] px-5 py-2 text-sm font-bold text-[#fff8e8] transition-colors hover:bg-[#e84b16]"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  className="rounded-full bg-[#1d0d07] px-5 py-2 text-sm font-bold text-[#fff8e8] transition-colors hover:bg-[#e84b16]"
                >
                  Login
                </Link>
              )}
            </div>
          </div>

          <nav
            className="mt-3 flex items-center justify-center gap-4 text-sm font-semibold text-[#2a160d] md:hidden"
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
                    active ? 'font-black text-[#e84b16]' : 'hover:text-[#e84b16]'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
            <LiveEntryButton
              label="Live Results"
              mode="results"
              fallbackHref="/dashboard#live-results"
              className="transition-colors hover:text-[#e84b16]"
              activeClassName="font-black text-[#e84b16]"
            />
          </nav>
        </div>
      </header>
      <PublicBottomBar variant="editorial" />
    </>
  )
}
