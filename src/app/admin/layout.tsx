'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { formatAppRoleLabel, isEventAdminRole, normalizeAppRole } from '../../lib/roles'
import { supabase } from '../../lib/supabaseClient'

type NavItem = {
  label: string
  href: string
  icon: 'dashboard' | 'events' | 'users' | 'registrations' | 'riders' | 'categories' | 'draw' | 'motos' | 'schedule' | 'results' | 'penalties' | 'settings'
}

const BRAND = {
  name: 'Pushbike Race Management Platform',
  short: 'PRM',
}

const GLOBAL_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: 'dashboard' },
  { label: 'Events', href: '/admin/events', icon: 'events' },
]

const EVENT_NAV = (eventId: string): NavItem[] => [
  { label: 'Registrations', href: `/admin/events/${eventId}/registrations`, icon: 'registrations' },
  { label: 'Riders', href: `/admin/events/${eventId}/riders`, icon: 'riders' },
  { label: 'Categories', href: `/admin/events/${eventId}/categories`, icon: 'categories' },
  { label: 'Draw Setup', href: `/admin/events/${eventId}/live-draw`, icon: 'draw' },
  { label: 'Motos', href: `/admin/events/${eventId}/motos`, icon: 'motos' },
  { label: 'Race Schedule', href: `/admin/events/${eventId}/schedule`, icon: 'schedule' },
  { label: 'Results Summary', href: `/admin/events/${eventId}/results`, icon: 'results' },
  { label: 'Penalties', href: `/admin/events/${eventId}/penalties`, icon: 'penalties' },
  { label: 'Event Settings', href: `/admin/events/${eventId}/settings`, icon: 'settings' },
]

const isActivePath = (pathname: string, href: string) => {
  if (href === '/admin') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

const extractEventId = (pathname: string) => {
  const match = pathname.match(/^\/admin\/events\/([^/]+)(?:\/|$)/)
  return match?.[1] ?? null
}

const isAdminRole = (role: string | null) => isEventAdminRole(role)

const roleHome = (role: string | null) => {
  const normalized = normalizeAppRole(role)
  if (normalized === 'RACE_DIRECTOR') return '/race-director/approval'
  if (normalized === 'FINISHER') return '/jury/finish'
  if (normalized === 'CHECKER') return '/jc'
  if (normalized === 'RACE_CONTROL') return '/race-control'
  if (normalized === 'MC') return '/mc'
  if (normalized === 'ADMIN' || normalized === 'SUPER_ADMIN') return '/admin'
  return '/login'
}

const getRoleTone = (role: string | null) => {
  const normalized = normalizeAppRole(role)
  if (normalized === 'SUPER_ADMIN') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (normalized === 'ADMIN') return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-slate-200 bg-slate-100 text-slate-600'
}

function Icon({ type, active }: { type: NavItem['icon']; active: boolean }) {
  const color = active ? 'text-slate-950' : 'text-slate-500'
  const common = `h-[18px] w-[18px] ${color}`

  if (type === 'dashboard') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M4 5h7v6H4zM13 5h7v10h-7zM4 13h7v6H4zM13 17h7v2h-7z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'events') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M7 3v4M17 3v4M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'users') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20 19a4 4 0 0 0-3-3.87M17 11a3 3 0 0 0 0-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'registrations') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M7 4h10l3 3v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 9h6M9 13h6M9 17h4" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'riders') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <circle cx="8" cy="17" r="2.5" />
        <circle cx="18" cy="17" r="2.5" />
        <path d="M10.5 17h5l-2.5-6H10l-1.5 6ZM10.5 17 9 8h4l2.5 9M8 8h2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'categories') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'draw') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M12 4v16M6 8h12M7 12h10M9 16h6" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'motos') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M5 16a3 3 0 1 0 0 .1M16 16a3 3 0 1 0 0 .1M8 16h5l2-5h3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13 11 11 8H8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'schedule') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M8 3v3M16 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9 12h6M9 16h3" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'results') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M6 19V9M12 19V5M18 19v-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (type === 'penalties') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
        <path d="M12 3v12M7 8h10M8 21h8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}>
      <path d="M12 3h7v7M4 8V5a1 1 0 0 1 1-1h3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 15a3 3 0 1 1 6 0M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function NavLink({
  item,
  pathname,
  collapsed,
  onClick,
}: {
  item: NavItem
  pathname: string
  collapsed: boolean
  onClick?: () => void
}) {
  const active = isActivePath(pathname, item.href)

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`admin-nav-link ${active ? 'admin-nav-link-active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
          active ? 'border-slate-950 bg-white text-slate-950 shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}
      >
        <Icon type={item.icon} active={active} />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold text-slate-800">{item.label}</span>
        </span>
      )}
    </Link>
  )
}

function NavGroup({
  title,
  items,
  pathname,
  collapsed,
  onClick,
}: {
  title: string
  items: NavItem[]
  pathname: string
  collapsed: boolean
  onClick?: () => void
}) {
  return (
    <section className="grid gap-2">
      {!collapsed && (
        <div className="px-2 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{title}</div>
      )}
      <div className="grid gap-2">
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} onClick={onClick} />
        ))}
      </div>
    </section>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('krb_admin_sidebar_collapsed') === '1'
  })
  const [eventMenuOpen, setEventMenuOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem('krb_admin_event_menu_open') !== '0'
  })
  const [eventName, setEventName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  const eventId = useMemo(() => extractEventId(pathname), [pathname])
  const eventNav = useMemo(() => (eventId ? EVENT_NAV(eventId) : []), [eventId])
  const globalNav = useMemo(() => {
    if ((userRole ?? '').toLowerCase() === 'super_admin') {
      return [...GLOBAL_NAV, { label: 'Users', href: '/admin/users', icon: 'users' as const }]
    }
    return GLOBAL_NAV
  }, [userRole])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)')
    const syncViewport = (event?: MediaQueryListEvent) => {
      const matches = event?.matches ?? mediaQuery.matches
      setIsMobile(matches)
      if (!matches) setSidebarOpen(false)
    }

    syncViewport()
    mediaQuery.addEventListener('change', syncViewport)
    return () => mediaQuery.removeEventListener('change', syncViewport)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('krb_admin_sidebar_collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    window.localStorage.setItem('krb_admin_event_menu_open', eventMenuOpen ? '1' : '0')
  }, [eventMenuOpen])

  useEffect(() => {
    const loadRole = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user

      if (!user) {
        setAuthorized(false)
        setAuthChecked(true)
        router.replace('/login')
        return
      }

      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
      const role =
        (typeof meta.role === 'string' ? meta.role : null) ||
        (typeof appMeta.role === 'string' ? appMeta.role : null)

      setUserRole(role)
      setUserEmail(user.email ?? null)

      if (!isAdminRole(role)) {
        setAuthorized(false)
        setAuthChecked(true)
        router.replace(roleHome(role))
        return
      }

      setAuthorized(true)
      setAuthChecked(true)
    }

    void loadRole()
  }, [router])

  useEffect(() => {
    if (!authorized) return

    const loadEvent = async () => {
      if (!eventId) {
        setEventName(null)
        return
      }

      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        const res = await fetch(`/api/events/${eventId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })

        if (!res.ok) {
          setEventName(null)
          router.replace('/admin')
          return
        }

        const json = await res.json()
        setEventName(json?.data?.name ?? null)
      } catch {
        setEventName(null)
      }
    }

    void loadEvent()
  }, [authorized, eventId, router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  const sidebarWidthClass = collapsed ? 'lg:w-[88px]' : 'lg:w-[248px]'
  const eventMenuLabel = eventName ?? (eventId ? 'Loading event…' : 'No event selected')

  const sidebarBody = (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#fef3c7_100%)] shadow-sm">
          <Image src="/platform-logo.png" alt="Platform" width={28} height={28} className="object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-black tracking-[0.14em] text-slate-900">{BRAND.short}</div>
            <div className="text-xs font-semibold leading-4 text-slate-500">{BRAND.name}</div>
          </div>
        )}
      </div>

      {!isMobile && (
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className={`admin-secondary-button justify-center text-xs ${collapsed ? 'px-0' : ''}`}
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px]">
            {collapsed ? '+' : '–'}
          </span>
          {!collapsed && <span>Collapse</span>}
        </button>
      )}

      <div className="grid gap-4">
        <NavGroup title="Workspace" items={globalNav} pathname={pathname} collapsed={collapsed} onClick={() => setSidebarOpen(false)} />

        {eventId && (
          <section className="grid gap-2.5">
            <button
              type="button"
              onClick={() => setEventMenuOpen((value) => !value)}
              className={`admin-secondary-button ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? (eventMenuOpen ? 'Hide event menu' : 'Show event menu') : undefined}
            >
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                  <path d="M7 3v3M17 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-extrabold text-slate-800">{eventMenuLabel}</span>
                </span>
              )}
            </button>

            {eventMenuOpen && (
              <NavGroup title="Event Control" items={eventNav} pathname={pathname} collapsed={collapsed} onClick={() => setSidebarOpen(false)} />
            )}
          </section>
        )}
      </div>

      <div className="mt-auto rounded-[1.4rem] border border-slate-200 bg-slate-50 px-3 py-3">
        <div className={`grid gap-1 ${collapsed ? 'justify-items-center text-center' : ''}`}>
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Current role</div>
          <div
            className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getRoleTone(userRole)}`}
          >
            {formatAppRoleLabel(userRole)}
          </div>
          {!collapsed && userEmail && <div className="truncate text-xs font-semibold text-slate-500">{userEmail}</div>}
        </div>
      </div>
    </div>
  )

  if (!authChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fef3c7_0%,#f8fafc_36%,#eef2ff_100%)] px-6">
        <div className="admin-surface flex w-full max-w-md items-center gap-4 p-6">
          <span className="h-3 w-3 animate-pulse rounded-full bg-amber-400" />
          <div>
            <div className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Admin access</div>
            <div className="mt-1 text-base font-semibold text-slate-900">Checking your session…</div>
          </div>
        </div>
      </div>
    )
  }

  if (!authorized) return null

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7_0%,#f8fafc_34%,#eef2ff_100%)] text-slate-900">
      <div className="fixed inset-x-0 top-0 z-40 border-b border-white/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-[1800px] items-center gap-4 px-4 sm:px-6 lg:px-8">
          {isMobile && (
            <button type="button" onClick={() => setSidebarOpen(true)} className="admin-secondary-button shrink-0 px-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]">
                <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
              </svg>
              <span>Menu</span>
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Admin workspace</div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-lg font-black tracking-tight text-slate-950">
                {eventId ? eventMenuLabel : 'Control Dashboard'}
              </span>
              {eventId && (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-700">
                  Event Context
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {!isMobile && (
              <div className="hidden max-w-[320px] rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-right sm:block">
                <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{formatAppRoleLabel(userRole)}</div>
                <div className="truncate text-sm font-semibold text-slate-600" title={userEmail ?? undefined}>
                  {userEmail ?? 'No email'}
                </div>
              </div>
            )}
            <button type="button" onClick={handleLogout} className="admin-primary-button bg-slate-950 text-white hover:bg-slate-800">
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto flex min-h-screen max-w-[1800px] px-0 pt-[72px] lg:px-8">
        <div className={`${sidebarWidthClass} hidden shrink-0 lg:block`}>
          <aside className="sticky top-[88px] h-[calc(100vh-104px)] pr-4">
            <div className="admin-surface h-full overflow-hidden">
              <div className="h-full overflow-y-auto">{sidebarBody}</div>
            </div>
          </aside>
        </div>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-0 lg:py-8">
          <div className="mx-auto min-w-0 max-w-[1440px]">{children}</div>
        </main>
      </div>

      {isMobile && (
        <>
          <div
            onClick={() => setSidebarOpen(false)}
            className={`fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm transition ${sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-[320px] max-w-[88vw] transform p-3 transition duration-200 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-[105%]'}`}
          >
            <div className="admin-surface h-full overflow-hidden">
              <div className="flex justify-end px-3 pt-3">
                <button type="button" onClick={() => setSidebarOpen(false)} className="admin-secondary-button px-3">
                  Close
                </button>
              </div>
              <div className="h-[calc(100%-3.5rem)] overflow-y-auto">{sidebarBody}</div>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
