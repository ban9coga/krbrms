'use client'

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
  { label: 'Live Display', href: `/admin/events/${eventId}/display` },
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
  const [eventMenuOpen, setEventMenuOpen] = useState(true)

  const eventId = useMemo(() => extractEventId(pathname), [pathname])
  const eventNav = useMemo(() => (eventId ? EventNav(eventId) : []), [eventId])
  const globalNav = useMemo(() => {
    if (userRole === 'super_admin') {
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
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (data.user?.app_metadata ?? {}) as Record<string, unknown>
      const role =
        (typeof meta.role === 'string' ? meta.role : null) ||
        (typeof appMeta.role === 'string' ? appMeta.role : null)
      setUserRole(role)
    }
    loadRole()
  }, [])

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
    const load = async () => {
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
    load()
  }, [eventId])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  const sidebarWidth = collapsed ? 78 : 280

  const SidebarContent = (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 12px',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img
          src="/krb-logo.png"
          alt="KRB"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: '2px solid #111',
            background: '#fff',
            objectFit: 'contain',
          }}
        />
        {!collapsed && (
          <div style={{ display: 'grid', lineHeight: 1.1 }}>
            <div style={{ fontWeight: 900, letterSpacing: '0.02em' }}>{BRAND.short}</div>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85 }}>{BRAND.name}</div>
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
            border: '2px solid #111',
            background: collapsed ? '#fff' : '#2ecc71',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          {collapsed ? '>' : 'Collapse'}
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
                color: '#111',
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: active ? '#2ecc71' : '#fff',
                  fontWeight: 900,
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
              border: '2px solid #111',
              background: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {collapsed ? (eventMenuOpen ? 'EV-' : 'EV+') : eventMenuOpen ? 'Event Menu ▾' : 'Event Menu ▸'}
          </button>
          {eventMenuOpen && (
            <div style={{ display: 'grid', gap: 8 }}>
              {eventNav.map((item) => {
                const active = isActivePath(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{ textDecoration: 'none', color: '#111' }}
                  >
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: active ? '#2ecc71' : '#fff',
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

  const topbarHeight = 56

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#eaf7ee',
        color: '#111',
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
          background: '#fff',
          borderBottom: '2px solid #111',
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
            fontWeight: 900,
            padding: '6px 10px',
            borderRadius: 999,
            background: eventId ? '#bfead2' : '#eaf7ee',
            border: '2px solid #111',
          }}
        >
          {eventId ? `Event: ${eventName ?? '...'}` : 'Admin'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              borderRadius: 12,
              border: '2px solid #b40000',
              background: '#ffd7d7',
              color: '#b40000',
              fontWeight: 900,
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
            background: 'rgba(255,255,255,0.92)',
            borderBottom: '2px solid #111',
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
              border: '2px solid #111',
              background: '#2ecc71',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Menu
          </button>
          <div style={{ fontWeight: 900, textAlign: 'right' }}>
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
              borderRight: '2px solid #111',
              background: '#fff',
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
                background: 'rgba(0,0,0,0.35)',
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
                background: '#fff',
                borderRight: '2px solid #111',
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
                    border: '2px solid #111',
                    background: '#fff',
                    fontWeight: 900,
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
            padding: '20px',
            marginLeft: isMobile ? 0 : sidebarWidth,
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

