'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { formatAppRoleLabel, normalizeAppRole } from '../lib/roles'
import { supabase } from '@/src/lib/supabaseClient'
import PublicBottomBar from './PublicBottomBar'
import { ThemeToggleSwitch } from './ThemeProvider'
import LogoutButton from './LogoutButton'
import PublicMobileMenu from './PublicMobileMenu'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/jadwal-race-pushbike', label: 'Event' },
  { href: '/insight', label: 'Insight' },
  { href: '/live-results', label: 'Live Score' },
  { href: '/registration-status', label: 'Cek Status' },
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
  if (role === 'DRAW_MANAGER') return '/draw'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
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
              <span className="platform-logo-backing">
                <Image
                  src="/platform-logo.png"
                  alt="Platform Logo"
                  width={50}
                  height={35}
                  sizes="50px"
                  className="h-9 w-9 object-contain"
                />
              </span>
              <span className="public-topbar-brand min-w-0">
                <span className="public-brand-wordmark block truncate text-sm font-black sm:text-base md:text-lg">
                  RacePushbike.com
                </span>
                {eventBranding ? (
                  <span className="public-topbar-subtitle block truncate text-[11px] font-bold text-[#796657]">
                    {formatEventBrandingLabel(eventBranding)}
                  </span>
                ) : (
                  <span className="public-topbar-subtitle block truncate text-[11px] font-bold text-[#796657]">
                    Public Event & Live Results
                  </span>
                )}
              </span>
            </Link>

            <nav
              className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-[#d9ceb4] bg-[#fff8e8] p-1 text-sm font-bold text-[#2a160d] shadow-sm lg:flex"
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
                    className={`inline-flex min-h-11 items-center rounded-full px-4 py-2 transition-colors ${
                      active ? 'bg-[#1d0d07] text-[#fff8e8]' : 'hover:bg-[#efe3c8]'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            <div className="public-topbar-auth flex items-center gap-2">
              <ThemeToggleSwitch className="public-topbar-theme" />
              {isLoggedIn ? (
                <>
                  <Link
                    href={panelHref}
                    className="max-w-[160px] truncate rounded-full border border-[#d9ceb4] bg-[#fff8e8] px-3 py-2 text-xs font-extrabold uppercase text-[#2a160d] transition-colors hover:bg-[#efe3c8]"
                    title={userEmail ?? undefined}
                  >
                    {panelLabel}
                  </Link>
                  <LogoutButton onClick={handleLogout} />
                </>
              ) : (
                <Link
                  href="/login"
                  className="public-topbar-login-link"
                >
                  Masuk
                </Link>
              )}
            </div>
            <PublicMobileMenu
              isOpen={mobileMenuOpen}
              onToggle={() => setMobileMenuOpen((open) => !open)}
              onClose={() => setMobileMenuOpen(false)}
              isLoggedIn={isLoggedIn}
              panelHref={panelHref}
              panelLabel={panelLabel}
              onLogout={handleLogout}
              triggerBreakpoint="lg"
            />
          </div>
        </div>
      </header>
      <PublicBottomBar variant="editorial" />
    </>
  )
}
