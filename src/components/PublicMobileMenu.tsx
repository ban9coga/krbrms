'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import LogoutButton from './LogoutButton'

const menuItems = [
  { href: '/jadwal-race-pushbike', label: 'Event' },
  { href: '/live-results', label: 'Live Score' },
  { href: '/registration-status', label: 'Cek Status' },
  { href: '/insight', label: 'Insight' },
  { href: '/untuk-panitia', label: 'Untuk Panitia' },
]

type PublicMobileMenuProps = {
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  isLoggedIn: boolean
  panelHref: string
  panelLabel: string
  onLogout: () => void | Promise<void>
  triggerBreakpoint?: 'md' | 'lg'
}

export default function PublicMobileMenu({
  isOpen,
  onToggle,
  onClose,
  isLoggedIn,
  panelHref,
  panelLabel,
  onLogout,
  triggerBreakpoint = 'md',
}: PublicMobileMenuProps) {
  const pathname = usePathname()
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const isItemActive = (href: string) => {
    if (href === '/live-results') {
      return pathname === href || /^\/event\/[^/]+\/live-score(?:\/|$)/.test(pathname)
    }
    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <>
      <button
        type="button"
        className={`public-mobile-menu-trigger ${triggerBreakpoint === 'lg' ? 'public-mobile-menu-trigger-lg' : ''}`}
        aria-label={isOpen ? 'Tutup menu' : 'Buka menu'}
        aria-controls="public-mobile-navigation"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span aria-hidden="true" className={`public-mobile-menu-icon ${isOpen ? 'is-open' : ''}`}>
          <span />
          <span />
          <span />
        </span>
      </button>

      <div
        id="public-mobile-navigation"
        className={`public-mobile-menu ${isOpen ? 'is-open' : ''}`}
        hidden={!isOpen}
      >
        <nav aria-label="Menu utama" className="public-mobile-menu-links">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={isItemActive(item.href) ? 'page' : undefined}
              className={`public-mobile-menu-link ${isItemActive(item.href) ? 'is-active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="public-mobile-menu-tools">
          <div className="public-mobile-menu-account">
            {isLoggedIn ? (
              <>
                <Link href={panelHref} onClick={onClose} className="public-mobile-menu-account-link">
                  {panelLabel}
                </Link>
                <LogoutButton onClick={onLogout} />
              </>
            ) : (
              <Link href="/login" onClick={onClose} className="public-mobile-menu-login">
                Masuk
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
