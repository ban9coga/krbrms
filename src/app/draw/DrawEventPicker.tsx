'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import LogoutButton from '../../components/LogoutButton'

type DrawEvent = {
  id: string
  name: string
  location: string | null
  event_date: string | null
  status: string | null
}

const formatDate = (value: string | null) => {
  if (!value) return 'Tanggal belum ditentukan'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

export default function DrawEventPicker() {
  const [events, setEvents] = useState<DrawEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error('Sesi login tidak ditemukan. Silakan login ulang.')

        const res = await fetch('/api/draw/events', { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Gagal memuat event Drawing.')
        setEvents((json?.data ?? []) as DrawEvent[])
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Gagal memuat event Drawing.')
      } finally {
        setLoading(false)
      }
    }
    void loadEvents()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    window.location.assign('/login')
  }

  return (
    <main className="draw-workspace-page">
      <header className="draw-workspace-topbar">
        <Link href="/" className="draw-workspace-brand">
          <Image src="/platform-logo.png" alt="RacePushbike" width={40} height={40} priority />
          <span>
            <strong>RacePushbike</strong>
            <small>Drawing Workspace</small>
          </span>
        </Link>
        <LogoutButton onClick={logout} />
      </header>

      <section className="draw-workspace-intro">
        <p>DRAWING WORKSPACE</p>
        <h1>Pilih event untuk mulai drawing.</h1>
        <span>Anda hanya dapat mengatur kategori dan urutan gate pada event yang ditugaskan.</span>
      </section>

      {loading && <div className="draw-workspace-state">Memuat event Drawing...</div>}
      {error && <div className="draw-workspace-state draw-workspace-state-error">{error}</div>}
      {!loading && !error && events.length === 0 && (
        <div className="draw-workspace-state">Belum ada event yang ditugaskan kepada akun ini.</div>
      )}
      {!loading && !error && events.length > 0 && (
        <section className="draw-event-grid" aria-label="Event Drawing">
          {events.map((event) => (
            <Link key={event.id} href={`/draw/${event.id}`} className="draw-event-card">
              <span className="draw-event-status">{event.status || 'UPCOMING'}</span>
              <h2>{event.name}</h2>
              <p>{event.location || 'Lokasi belum ditentukan'}</p>
              <div>
                <span>{formatDate(event.event_date)}</span>
                <strong>Mulai Drawing</strong>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  )
}
