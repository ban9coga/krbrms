'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type NavItem = {
  label: string
  href: string
}

const BRAND = {
  name: 'KRB Race Management',
  short: 'KRB',
}

const formatRoleLabel = (role: string | null) => {
  if (!role) return 'Unknown'
  const normalized = role.toUpperCase()
  if (normalized === 'SUPER_ADMIN') return 'Super Admin'
  if (normalized === 'ADMIN') return 'Admin'
  if (normalized === 'RACE_CONTROL') return 'Race Control'
  if (normalized === 'RACE_DIRECTOR') return 'Race Director'
  if (normalized === 'CHECKER' || normalized === 'JURY_START') return 'Jury Start'
  if (normalized === 'FINISHER' || normalized === 'JURY_FINISH') return 'Jury Finish'
  if (normalized === 'MC') return 'MC'
  return role.replace(/_/g, ' ')
}

const normalizeRole = (role: string | null) => {
  if (!role) return ''
  const upper = role.toUpperCase()
  if (upper === 'JURY_START') return 'CHECKER'
  if (upper === 'JURY_FINISH') return 'FINISHER'
  return upper
}

const isAdminRole = (role: string | null) => {
  const normalized = normalizeRole(role)
  return normalized === 'ADMIN' || normalized === 'SUPER_ADMIN'
}

const roleHome = (role: string | null) => {
  const normalized = normalizeRole(role)
  if (normalized === 'RACE_DIRECTOR') return '/race-director/approval'
  if (normalized === 'FINISHER') return '/jury/finish'
  if (normalized === 'CHECKER') return '/jc'
  if (normalized === 'RACE_CONTROL') return '/race-control'
  if (normalized === 'MC') return '/mc'
  if (normalized === 'ADMIN' || normalized === 'SUPER_ADMIN') return '/admin'
  return '/login'
}

const GlobalNav: NavItem[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Events', href: '/admin/events' },
]

const EventNav = (eventId: string): NavItem[] => [
  { label: 'Registrations', href: `/admin/events/${eventId}/registrations` },
  { label: 'Riders', href: `/admin/events/${eventId}/riders` },
  { label: 'Categories', href: `/admin/events/${eventId}/categories` },
  { label: 'Live Draw', href: `/admin/events/${eventId}/live-draw` },
  { label: 'Motos', href: `/admin/events/${eventId}/motos` },
  { label: 'Race Schedule', href: `/admin/events/${eventId}/schedule` },
  { label: 'Results Summary', href: `/admin/events/${eventId}/results` },
  { label: 'Penalties', href: `/admin/events/${eventId}/penalties` },
  { label: 'Event Settings', href: `/admin/events/${eventId}/settings` },
]

const isActivePath = (pathname: string, href: string) => {
  if (href === '/admin') return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

const extractEventId = (pathname: string) => {
  const match = pathname.match(/^\/admin\/events\/([^/]+)(?:\/|$)/)
  return match?.[1] ?? null
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [eventName, setEventName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [eventMenuOpen, setEventMenuOpen] = useState(true)

  const eventId = useMemo(() => extractEventId(pathname), [pathname])
  const eventNav = useMemo(() => (eventId ? EventNav(eventId) : []), [eventId])
  const globalNav = useMemo(() => {
    if ((userRole ?? '').toLowerCase() === 'super_admin') {
      return [...GlobalNav, { label: 'Users', href: '/admin/users' }]
    }
    return GlobalNav
  }, [userRole])

  useEffect(() => {
    const stored = window.localStorage.getItem('krb_admin_sidebar_collapsed')
    setCollapsed(stored === '1')
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem('krb_admin_event_menu_open')
    setEventMenuOpen(stored !== '0')
  }, [])

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
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
      const role =
        (typeof meta.role === 'string' ? meta.role : null) ||
        (typeof appMeta.role === 'string' ? appMeta.role : null)
      if (!isAdminRole(role)) {
        setUserRole(role)
        setUserEmail(user.email ?? null)
        setAuthorized(false)
        setAuthChecked(true)
        router.replace(roleHome(role))
        return
      }
      setUserRole(role)
      setUserEmail(user?.email ?? null)
      setAuthorized(true)
      setAuthChecked(true)
    }
    loadRole()
  }, [router])

  useEffect(() => {
    window.localStorage.setItem('krb_admin_sidebar_collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    window.localStorage.setItem('krb_admin_event_menu_open', eventMenuOpen ? '1' : '0')
  }, [eventMenuOpen])

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 920
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(false)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
        const json = await res.json()
        setEventName(json?.data?.name ?? null)
      } catch {
        setEventName(null)
      }
    }
    loadEvent()
  }, [eventId, authorized])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  const sidebarWidth = collapsed ? 86 : 292
  const topbarHeight = 56

  const SidebarContent = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 12px',
        gap: 12,
        color: '#e2e8f0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src="/krb-logo.png"
          alt="KRB"
          width={40}
          height={40}
          style={{
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.36)',
            background: '#fff',
            objectFit: 'contain',
          }}
        />
        {!collapsed && (
          <div style={{ display: 'grid', lineHeight: 1.12 }}>
            <div style={{ fontWeight: 900, letterSpacing: '0.02em' }}>{BRAND.short}</div>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.84 }}>{BRAND.name}</div>
          </div>
        )}
      </div>

      {!isMobile && (
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.36)',
            background: collapsed ? 'rgba(15,23,42,0.72)' : '#f43f5e',
            color: '#f8fafc',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {globalNav.map((item) => {
          const active = isActivePath(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textDecoration: 'none',
                color: '#e2e8f0',
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.32)',
                  background: active ? '#f43f5e' : 'rgba(15,23,42,0.75)',
                  color: '#f8fafc',
                  fontWeight: 800,
                  textAlign: collapsed ? 'center' : 'left',
                }}
                title={collapsed ? item.label : undefined}
              >
                {collapsed ? item.label.slice(0, 1) : item.label}
              </div>
            </Link>
          )
        })}
      </div>

      {eventId && (
        <div style={{ display: 'grid', gap: 10 }}>
          <button
            type="button"
            onClick={() => setEventMenuOpen((v) => !v)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.32)',
              background: 'rgba(15,23,42,0.75)',
              color: '#f8fafc',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {collapsed ? (eventMenuOpen ? 'EV-' : 'EV+') : eventMenuOpen ? 'Event Menu Open' : 'Event Menu Closed'}
          </button>
          {eventMenuOpen && (
            <div style={{ display: 'grid', gap: 8 }}>
              {eventNav.map((item) => {
                const active = isActivePath(pathname, item.href)
                return (
                  <Link key={item.href} href={item.href} style={{ textDecoration: 'none', color: '#e2e8f0' }}>
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '1px solid rgba(148,163,184,0.32)',
                        background: active ? '#f43f5e' : 'rgba(15,23,42,0.75)',
                        color: '#f8fafc',
                        fontWeight: 800,
                        textAlign: collapsed ? 'center' : 'left',
                      }}
                      title={collapsed ? item.label : undefined}
                    >
                      {collapsed ? item.label.slice(0, 1) : item.label}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1 }} />
    </div>
  )

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(180deg, #020817 0%, #041030 45%, #030712 100%)',
          color: '#e2e8f0',
          fontWeight: 800,
        }}
      >
        Checking access...
      </div>
    )
  }

  if (!authorized) return null

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #020817 0%, #041030 45%, #030712 100%)',
        color: '#e2e8f0',
        paddingTop: topbarHeight,
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 25,
          background: 'rgba(2,6,23,0.88)',
          borderBottom: '1px solid rgba(148,163,184,0.28)',
          backdropFilter: 'blur(8px)',
          height: topbarHeight,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            padding: '7px 12px',
            borderRadius: 999,
            color: '#f8fafc',
            background: eventId ? 'rgba(244,63,94,0.24)' : 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(148,163,184,0.34)',
          }}
        >
          {eventId ? `Event: ${eventName ?? '...'}` : 'Admin'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div
            style={{
              padding: '7px 12px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.34)',
              background: 'rgba(15,23,42,0.75)',
              color: '#cbd5e1',
              fontWeight: 800,
              fontSize: 12,
              maxWidth: isMobile ? 150 : 360,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={userEmail ?? undefined}
          >
            {formatRoleLabel(userRole)} {userEmail ? `| ${userEmail}` : ''}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '8px 13px',
              borderRadius: 12,
              border: '1px solid rgba(251,113,133,0.55)',
              background: '#f43f5e',
              color: '#fff1f2',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {isMobile && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'rgba(2,6,23,0.92)',
            borderBottom: '1px solid rgba(148,163,184,0.28)',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.32)',
              background: '#f43f5e',
              color: '#fff1f2',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Menu
          </button>
          <div style={{ fontWeight: 800, color: '#f8fafc', textAlign: 'right' }}>
            {eventId ? eventName ?? 'Event' : 'Admin'}
          </div>
        </div>
      )}

      <div style={{ display: 'flex' }}>
        {!isMobile && (
          <aside
            style={{
              width: sidebarWidth,
              minWidth: sidebarWidth,
              height: `calc(100vh - ${topbarHeight}px)`,
              overflowY: 'auto',
              position: 'fixed',
              top: topbarHeight,
              left: 0,
              borderRight: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(15,23,42,0.82)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {SidebarContent}
          </aside>
        )}

        {isMobile && (
          <>
            <div
              onClick={() => setSidebarOpen(false)}
              style={{
                display: sidebarOpen ? 'block' : 'none',
                position: 'fixed',
                inset: 0,
                zIndex: 30,
                background: 'rgba(0,0,0,0.45)',
              }}
            />
            <aside
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                width: 310,
                maxWidth: '90vw',
                zIndex: 40,
                background: 'rgba(15,23,42,0.95)',
                borderRight: '1px solid rgba(148,163,184,0.28)',
                transform: sidebarOpen ? 'translateX(0)' : 'translateX(-110%)',
                transition: 'transform 180ms ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 10 }}>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(148,163,184,0.32)',
                    background: 'rgba(15,23,42,0.8)',
                    color: '#f8fafc',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>
              {SidebarContent}
            </aside>
          </>
        )}

        <main
          style={{
            flex: 1,
            padding: '24px 20px',
            marginLeft: isMobile ? 0 : sidebarWidth,
            color: '#0f172a',
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
