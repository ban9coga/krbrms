'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminEventSnapshot, { type DashboardEventItem } from './events/AdminEventSnapshot'
import { normalizeAppRole } from '../../lib/roles'
import { supabase } from '@/src/lib/supabaseClient'

type DashboardData = {
  metrics: {
    approved_registration_items: number
    pending_registrations: number
    pending_payment_tasks: number
    live_motos: number
  }
  events: DashboardEventItem[]
  attention_by_event: Array<{
    event_id: string
    pending_registrations: number
    pending_payment_tasks: number
    live_motos: number
  }>
  selected_event_id: string | null
  scope: 'ALL' | 'EVENT'
  refreshed_at: string
}

type AttentionTone = 'danger' | 'accent' | 'success' | 'info' | 'neutral'
type AttentionItem = { title: string; label: string; description: string; href: string; tone: AttentionTone }

const formatDateTime = (value: string | null) => {
  if (!value) return 'Belum dimuat'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const attentionToneClass: Record<AttentionTone, string> = {
  danger: 'admin-tone-danger',
  accent: 'admin-tone-accent',
  success: 'admin-tone-success',
  info: 'admin-tone-info',
  neutral: 'admin-tone-neutral',
}

function KpiCard({
  label,
  value,
  helper,
  tone = 'neutral',
  loading,
  unavailable,
}: {
  label: string
  value: string | number
  helper: string
  tone?: AttentionTone
  loading: boolean
  unavailable: boolean
}) {
  const toneClass = tone === 'neutral' ? '' : `admin-card-tone-${tone}`
  return (
    <article className={`admin-card ${toneClass} min-h-[132px]`}>
      <div className="admin-kicker">{label}</div>
      {loading ? <div className="admin-skeleton mt-4 h-9 w-20" /> : <div className="admin-heading mt-3 text-3xl">{unavailable ? 'Tidak tersedia' : value}</div>}
      <div className="admin-muted mt-2 text-xs font-semibold leading-5">{helper}</div>
    </article>
  )
}

const buildAttentionItems = (data: DashboardData | null): AttentionItem[] => {
  if (!data) return []
  const event = data.events.find((item) => item.id === data.selected_event_id) ?? null
  const eventBase = event ? `/admin/events/${event.id}` : '/admin/events'
  const allEvents = data.scope === 'ALL'
  if (allEvents) {
    const queueByEvent = new Map(data.attention_by_event.map((item) => [item.event_id, item]))
    const eventItems: AttentionItem[] = data.events.flatMap((queueEvent) => {
      const queue = queueByEvent.get(queueEvent.id)
      if (!queue || (queue.pending_registrations === 0 && queue.pending_payment_tasks === 0 && queue.live_motos === 0)) return []
      const label = [
        queue.pending_registrations > 0 ? `${queue.pending_registrations} pendaftaran` : null,
        queue.pending_payment_tasks > 0 ? `${queue.pending_payment_tasks} pembayaran` : null,
        queue.live_motos > 0 ? `${queue.live_motos} moto live` : null,
      ].filter(Boolean).join(' | ')
      const needsRegistrationReview = queue.pending_registrations > 0 || queue.pending_payment_tasks > 0
      return [{
        title: queueEvent.name,
        label,
        description: needsRegistrationReview ? 'Ada pendaftaran atau pembayaran yang perlu diperiksa.' : 'Pantau moto dan hasil yang sedang berjalan.',
        href: `/admin/events/${queueEvent.id}/${needsRegistrationReview ? 'registrations' : 'motos'}`,
        tone: queue.pending_registrations > 0 ? 'danger' as const : needsRegistrationReview ? 'accent' as const : 'success' as const,
      }]
    })
    if (eventItems.length === 0) {
      return [{ title: 'Tidak ada tindakan tertunda', label: 'Aman', description: 'Tidak ada pendaftaran, pembayaran, atau moto live di event yang dapat diakses.', href: '/admin/events', tone: 'success' }]
    }
    const visibleItems = eventItems.slice(0, 8)
    if (eventItems.length > visibleItems.length) {
      visibleItems.push({
        title: 'Event lainnya memerlukan perhatian',
        label: `+${eventItems.length - visibleItems.length} event`,
        description: 'Buka daftar event untuk melihat antrean selengkapnya.',
        href: '/admin/events',
        tone: 'neutral',
      })
    }
    return visibleItems
  }

  const registrationsHref = allEvents ? '/admin/events' : `${eventBase}/registrations`
  const motosHref = allEvents ? '/admin/events' : `${eventBase}/motos`
  const context = allEvents ? 'Akumulasi semua event. Buka daftar event untuk memilih event yang perlu ditangani.' : `Event: ${event?.name ?? 'terpilih'}.`
  const items: AttentionItem[] = []

  if (data.metrics.pending_registrations > 0) {
    items.push({
      title: 'Verifikasi pendaftaran',
      label: `${data.metrics.pending_registrations} pendaftaran`,
      description: `${context} Periksa data rider, dokumen, dan kategori.`,
      href: registrationsHref,
      tone: 'danger',
    })
  }
  if (data.metrics.pending_payment_tasks > 0) {
    items.push({
      title: 'Periksa pembayaran',
      label: `${data.metrics.pending_payment_tasks} pembayaran`,
      description: `${context} Paket lintas event dihitung satu kali dalam cakupan ini.`,
      href: registrationsHref,
      tone: 'accent',
    })
  }
  if (data.metrics.live_motos > 0) {
    items.push({
      title: 'Moto sedang berjalan',
      label: `${data.metrics.live_motos} moto`,
      description: allEvents ? context : `${context} Pantau hasil dan status moto.`,
      href: motosHref,
      tone: 'success',
    })
  }
  if (items.length === 0) {
    items.push({
      title: 'Tidak ada tindakan tertunda',
      label: 'Aman',
      description: allEvents ? 'Tidak ada pendaftaran atau pembayaran tertunda di event yang dapat diakses.' : `${context} Tidak ada antrean yang perlu ditangani.`,
      href: eventBase,
      tone: 'success',
    })
  }
  return items
}

function AttentionPanel({ items, loading, error }: { items: AttentionItem[]; loading: boolean; error: string | null }) {
  return (
    <section className="admin-surface px-5 py-5 lg:px-7" aria-labelledby="dashboard-action-queue">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="admin-kicker">Operasional</div>
          <h2 id="dashboard-action-queue" className="admin-heading mt-1 text-xl">Perlu ditindaklanjuti</h2>
        </div>
        <Link href="/admin/events" className="admin-outline-button w-fit">Buka semua event</Link>
      </div>
      {error ? (
        <div role="alert" className="admin-alert-danger mt-5">Dashboard gagal memuat data: {error}</div>
      ) : loading ? (
        <div className="mt-5 grid gap-2">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="admin-skeleton h-16" />)}</div>
      ) : (
        <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {items.map((item) => (
            <Link key={item.title} href={item.href} className="grid gap-3 px-4 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <span className={`admin-tone-badge ${attentionToneClass[item.tone]} w-fit`}>{item.label}</span>
              <span className="min-w-0">
                <span className="admin-heading block text-sm">{item.title}</span>
                <span className="admin-muted mt-1 block text-xs font-semibold leading-5">{item.description}</span>
              </span>
              <span aria-hidden="true" className="text-lg font-black text-slate-400">-&gt;</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [selectedScope, setSelectedScope] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async (requestedScope?: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      const userMeta = (user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
      const resolvedRole = (typeof userMeta.role === 'string' ? userMeta.role : null) || (typeof appMeta.role === 'string' ? appMeta.role : null)
      setRole(resolvedRole)
      if (normalizeAppRole(resolvedRole) === 'REGISTRATION_APPROVER') {
        router.replace('/admin/events')
        return
      }

      const params = new URLSearchParams()
      if (requestedScope === 'ALL') params.set('scope', 'all')
      else if (requestedScope) params.set('event_id', requestedScope)
      const token = sessionData.session?.access_token
      const response = await fetch(`/api/admin/dashboard${params.size ? `?${params.toString()}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || 'Gagal memuat dashboard')
      const dashboardData = json.data as DashboardData
      setData(dashboardData)
      setSelectedScope(dashboardData.scope === 'ALL' ? 'ALL' : dashboardData.selected_event_id ?? '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Gagal memuat dashboard')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const attentionItems = useMemo(() => buildAttentionItems(data), [data])
  const selectedEvent = data?.events.find((event) => event.id === data.selected_event_id) ?? null
  const scopeLabel = data?.scope === 'ALL' ? 'Semua event yang dapat diakses' : selectedEvent?.name ?? 'Pilih event'
  const metricsUnavailable = Boolean(error) || !data
  const isSuperAdmin = normalizeAppRole(role) === 'SUPER_ADMIN'

  return (
    <div className="grid min-w-0 gap-4 sm:gap-5">
      <header className="flex min-w-0 flex-col gap-4 border-b border-slate-200 pb-4 sm:pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2">
          <div className="admin-kicker">Race Operations</div>
          <h1 className="admin-heading text-2xl sm:text-4xl">Dashboard Operasional</h1>
          <p className="admin-muted max-w-2xl text-sm font-semibold leading-6">Ringkasan pendaftaran, pembayaran, dan race untuk cakupan event yang dipilih.</p>
        </div>
        <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-end">
          <label className="grid w-full min-w-0 gap-1 sm:min-w-[220px]">
            <span className="admin-kicker">Cakupan data</span>
            <select
              value={selectedScope}
              onChange={(event) => void loadDashboard(event.target.value)}
              disabled={loading || !data?.events.length}
              className="admin-field-input mt-0 min-h-11 cursor-pointer"
              aria-label="Pilih cakupan event dashboard"
            >
              {isSuperAdmin && <option value="ALL">Semua event</option>}
              {(data?.events ?? []).map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void loadDashboard(selectedScope || undefined)} disabled={loading} className="admin-primary-button min-h-11 w-full sm:w-auto">
            {loading ? 'Memuat...' : 'Muat ulang'}
          </button>
        </div>
      </header>

      <p className="admin-muted text-sm font-semibold leading-6">
        Cakupan: <span className="admin-heading">{scopeLabel}</span>
        {data?.scope === 'ALL' && ' | Setiap paket lintas event dihitung satu kali.'}
      </p>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan metrik dashboard">
        <KpiCard label="Pendaftaran menunggu" value={data?.metrics.pending_registrations ?? 0} helper="Jumlah pendaftaran berstatus pending." tone="danger" loading={loading && !data} unavailable={metricsUnavailable} />
        <KpiCard label="Pembayaran menunggu" value={data?.metrics.pending_payment_tasks ?? 0} helper="Paket lintas event dihitung satu kali." tone="accent" loading={loading && !data} unavailable={metricsUnavailable} />
        <KpiCard label="Item kategori disetujui" value={data?.metrics.approved_registration_items ?? 0} helper="Jumlah item registrasi disetujui; rider di beberapa kategori dihitung per item." tone="success" loading={loading && !data} unavailable={metricsUnavailable} />
        <KpiCard label="Moto live" value={data?.metrics.live_motos ?? 0} helper="Jumlah moto yang sedang berstatus LIVE." tone="info" loading={loading && !data} unavailable={metricsUnavailable} />
      </section>

      <AttentionPanel items={attentionItems} loading={loading && !data} error={error} />

      <div className="admin-muted flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
        <span>Data dashboard dimuat: {formatDateTime(data?.refreshed_at ?? null)}</span>
        {isSuperAdmin && <Link href="/admin/users" className="admin-outline-button">Kelola pengguna</Link>}
      </div>

      <AdminEventSnapshot
        events={data?.events ?? []}
        role={role}
        scope={data?.scope ?? 'EVENT'}
        selectedEventId={data?.selected_event_id ?? null}
      />
    </div>
  )
}
