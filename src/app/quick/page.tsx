'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'

const readAccessTokenCookie = () => {
  const entry = document.cookie.split('; ').find((item) => item.startsWith('sb-access-token='))
  return entry ? decodeURIComponent(entry.slice('sb-access-token='.length)) : null
}

export default function QuickPwaEntryPage() {
  const [message, setMessage] = useState('Menyiapkan panel crew...')

  useEffect(() => {
    let cancelled = false

    const openRoleHome = async () => {
      const { data } = await supabase.auth.getSession()
      let accessToken = data.session?.access_token ?? readAccessTokenCookie()

      if (!accessToken) {
        window.location.replace('/login?next=%2Fquick&crew=1')
        return
      }

      try {
        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 10_000)
        let response = await fetch('/api/auth/backoffice-access', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
          signal: controller.signal,
        })
        if (response.status === 401) {
          const { data: refreshed } = await supabase.auth.refreshSession()
          accessToken = refreshed.session?.access_token ?? null
          if (accessToken) {
            const secureCookie = window.location.protocol === 'https:' ? '; Secure' : ''
            const maxAge = refreshed.session?.expires_in ?? 3600
            document.cookie = `sb-access-token=${encodeURIComponent(accessToken)}; Path=/; Max-Age=${maxAge}${secureCookie}; SameSite=Lax`
            response = await fetch('/api/auth/backoffice-access', {
              headers: { Authorization: `Bearer ${accessToken}` },
              cache: 'no-store',
              signal: controller.signal,
            })
          }
        }
        window.clearTimeout(timeout)
        const json = await response.json().catch(() => ({}))
        const home = typeof json?.data?.home === 'string' ? json.data.home : null

        if (response.status === 401) {
          window.location.replace('/login?next=%2Fquick&crew=1')
          return
        }
        if (!response.ok || !home) {
          throw new Error(typeof json?.error === 'string' ? json.error : 'Akses panel tidak tersedia.')
        }
        window.location.replace(home)
      } catch (error) {
        if (cancelled) return
        setMessage(
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Koneksi ke panel crew terlalu lama. Coba buka ulang aplikasi.'
            : error instanceof Error
              ? error.message
              : 'Gagal menyiapkan panel crew.'
        )
      }
    }

    void openRoleHome()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="quick-pwa-entry">
      <section className="quick-pwa-entry-card" aria-live="polite">
        <p className="quick-pwa-entry-kicker">RacePushbike Crew</p>
        <div className="quick-pwa-entry-loader" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <h1>Membuka workspace</h1>
        <p>{message}</p>
      </section>
    </main>
  )
}
