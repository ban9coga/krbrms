'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type EventItem = {
  id: string
  name: string
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  event_date?: string | null
}

const LAST_MOTOS_EVENT_KEY = 'racepushbike:last-motos-event-id'

export default function QuickMotosPage() {
  const [message, setMessage] = useState('Mencari event aktif...')
  const [fallbackHref, setFallbackHref] = useState('/admin/events')

  useEffect(() => {
    let cancelled = false

    const go = async () => {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        const next = encodeURIComponent('/quick/motos')
        window.location.replace(`/login?next=${next}`)
        return
      }

      const headers = { Authorization: `Bearer ${token}` }
      const fetchEvents = async (status: 'LIVE' | 'UPCOMING') => {
        const res = await fetch(`/api/events?status=${status}`, { headers, cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Gagal memuat event.')
        return (json?.data ?? []) as EventItem[]
      }

      try {
        const [liveEvents, upcomingEvents] = await Promise.all([fetchEvents('LIVE'), fetchEvents('UPCOMING')])
        if (cancelled) return

        const lastEventId = window.localStorage.getItem(LAST_MOTOS_EVENT_KEY)
        const allCandidates = [...liveEvents, ...upcomingEvents]
        const picked =
          (lastEventId ? allCandidates.find((event) => event.id === lastEventId) : null) ??
          liveEvents[0] ??
          upcomingEvents[0] ??
          null

        if (!picked) {
          setMessage('Belum ada event LIVE atau UPCOMING yang bisa dibuka.')
          setFallbackHref('/admin/events')
          return
        }

        window.localStorage.setItem(LAST_MOTOS_EVENT_KEY, picked.id)
        window.location.replace(`/admin/events/${picked.id}/motos`)
      } catch (err) {
        if (cancelled) return
        setMessage(err instanceof Error ? err.message : 'Gagal membuka menu motos.')
        setFallbackHref('/admin/events')
      }
    }

    void go()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: '#f8fafc',
        color: '#0f172a',
      }}
    >
      <section
        style={{
          width: 'min(420px, 100%)',
          border: '1px solid #dbe3ef',
          borderRadius: '18px',
          background: '#fff',
          padding: '22px',
          boxShadow: '0 18px 50px rgba(15, 23, 42, 0.10)',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.14em', color: '#ca8a04' }}>
          RACEPUSHBIKE
        </div>
        <h1 style={{ margin: '8px 0 6px', fontSize: '26px', lineHeight: 1, fontWeight: 900 }}>Quick Motos</h1>
        <p style={{ margin: 0, color: '#475569', fontSize: '14px', fontWeight: 700 }}>{message}</p>
        <a
          href={fallbackHref}
          style={{
            marginTop: '18px',
            display: 'inline-flex',
            minHeight: '44px',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '999px',
            border: '2px solid #111827',
            padding: '0 16px',
            color: '#111827',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 900,
          }}
        >
          Buka daftar event
        </a>
      </section>
    </main>
  )
}
