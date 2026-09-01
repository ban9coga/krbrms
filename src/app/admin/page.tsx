'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import AdminEventSnapshot from './events/AdminEventSnapshot'
import { formatAppRoleLabel, normalizeAppRole } from '../../lib/roles'
import { supabase } from '@/src/lib/supabaseClient'

type DashboardMetrics = {
  approved_riders: number
  pending_registrations: number
  pending_payments: number
  live_motos: number
  last_updated: string | null
  primary_event: {
    id: string
    name: string
    status: string
    event_date: string
  } | null
}

type AttentionTone = 'danger' | 'accent' | 'success' | 'info' | 'neutral'

type AttentionItem = {
  title: string
  label: string
  description: string
  href: string
  tone: AttentionTone
}

const formatDateTime = (value: string | null) => {
  if (!value) return 'Belum ada update'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`)
  )

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
}: {
  label: string
  value: string | number
  helper: string
  tone?: AttentionTone
  loading: boolean
}) {
  const toneClass = tone === 'neutral' ? '' : `admin-card-tone-${tone}`
  return (
    <article className={`admin-card ${toneClass} min-h-[132px]`}>
      <div className="admin-kicker">{label}</div>
      {loading ? <div className="admin-skeleton mt-4 h-9 w-20" /> : <div className="admin-heading mt-3 text-3xl">{value}</div>}
      <div className="admin-muted mt-2 text-xs font-semibold leading-5">{helper}</div>
    </article>
  )
}

const buildAttentionItems = (metrics: DashboardMetrics | null): AttentionItem[] => {
  if (!metrics) return []
  const eventBase = metrics.primary_event ? `/admin/events/${metrics.primary_event.id}` : '/admin/events'
  const registrationsHref = metrics.primary_event ? `${eventBase}/registrations` : eventBase
  const motosHref = metrics.primary_event ? `${eventBase}/motos` : eventBase
  const items: AttentionItem[] = []

  if (metrics.pending_registrations > 0) {
    items.push({
      title: 'Review pendaftaran baru',
      label: `${metrics.pending_registrations} pending`,
      description: 'Validasi data rider, dokumen, dan kategori sebelum disetujui.',
      href: registrationsHref,
      tone: 'danger',
    })
  }
  if (metrics.pending_payments > 0) {
    items.push({
      title: 'Verifikasi pembayaran',
      label: `${metrics.pending_payments} payment`,
      description: 'Bukti transfer menunggu keputusan panitia.',
      href: registrationsHref,
      tone: 'accent',
    })
  }
  if (metrics.live_motos > 0) {
    items.push({
      title: 'Moto sedang berjalan',
      label: `${metrics.live_motos} live`,
      description: 'Pantau status moto dan hasil yang masuk dari race-day.',
      href: motosHref,
      tone: 'success',
    })
  }
  if (items.length === 0) {
    items.push({
      title: 'Tidak ada pekerjaan yang tertahan',
      label: 'Clear',
      description: 'Pendaftaran dan pembayaran yang tampil di dashboard sudah tertangani.',
      href: eventBase,
      tone: 'success',
    })
  }
  return items
}

function AttentionPanel({ items, loading, error }: { items: AttentionItem[]; loading: boolean; error: string | null }) {
  return (
    <section className="admin-surface px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="admin-kicker">Action Queue</div>
          <h2 className="admin-heading mt-1 text-xl">Perlu ditindaklanjuti</h2>
        </div>
        <Link href="/admin/events" className="admin-outline-button w-fit">Buka Event Workspace</Link>
      </div>
      {error ? (
        <div className="admin-alert-danger mt-5">Dashboard belum dapat membaca antrian: {error}</div>
      ) : loading ? (
        <div className="mt-5 grid gap-2">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="admin-skeleton h-16" />)}</div>
      ) : (
        <div className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {items.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="grid gap-3 px-4 py-4 transition-colors hover:bg-slate-50 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
            >
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
  const [email, setEmail] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setMetricsLoading(true)
      setMetricsError(null)
      try {
        const [{ data: userData }, { data: sessionData }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.auth.getSession(),
        ])
        const user = userData.user
        setEmail(user?.email ?? null)
        const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
        const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
        const resolvedRole =
          (typeof meta.role === 'string' ? meta.role : null) ||
          (typeof appMeta.role === 'string' ? appMeta.role : null)
        setRole(resolvedRole)
        if (normalizeAppRole(resolvedRole) === 'REGISTRATION_APPROVER') {
          router.replace('/admin/events')
          return
        }

        const token = sessionData.session?.access_token
        const response = await fetch('/api/admin/dashboard', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(json?.error || 'Request failed')
        setMetrics(json.data ?? null)
      } catch (error) {
        setMetricsError(error instanceof Error ? error.message : 'Request failed')
      } finally {
        setMetricsLoading(false)
      }
    }
    void load()
  }, [router])

  const attentionItems = useMemo(() => buildAttentionItems(metrics), [metrics])
  const primaryEvent = metrics?.primary_event ?? null
  const eventBase = primaryEvent ? `/admin/events/${primaryEvent.id}` : '/admin/events'
  const isCentralAdmin = normalizeAppRole(role) === 'SUPER_ADMIN'

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2">
          <div className="admin-kicker">Race Operations</div>
          <h1 className="admin-heading text-3xl sm:text-4xl">Admin Dashboard</h1>
          <p className="admin-muted max-w-2xl text-sm font-semibold leading-6">
            Pantau antrian operasional dan lanjutkan pekerjaan yang paling mendesak.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="admin-tone-badge admin-tone-neutral">{formatAppRoleLabel(role)}</span>
          {email && <span className="admin-muted text-xs font-semibold">{email}</span>}
          <Link href={primaryEvent ? `${eventBase}/registrations` : '/admin/events'} className="admin-primary-button">
            {primaryEvent ? 'Buka Event Aktif' : 'Pilih Event'}
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pending Review" value={metrics?.pending_registrations ?? 0} helper="Pendaftaran perlu diverifikasi." tone="danger" loading={metricsLoading} />
        <KpiCard label="Pending Payment" value={metrics?.pending_payments ?? 0} helper="Bukti pembayaran menunggu keputusan." tone="accent" loading={metricsLoading} />
        <KpiCard label="Approved Riders" value={metrics?.approved_riders ?? 0} helper="Rider siap dipakai dalam data race." tone="success" loading={metricsLoading} />
        <KpiCard label="Moto Live" value={metrics?.live_motos ?? 0} helper="Moto yang sedang aktif saat ini." tone="info" loading={metricsLoading} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <AttentionPanel items={attentionItems} loading={metricsLoading} error={metricsError} />
        <aside className="admin-surface px-6 py-6 lg:px-8">
          <div className="admin-kicker">Event Focus</div>
          {metricsLoading ? (
            <div className="mt-4 grid gap-3"><div className="admin-skeleton h-7 w-3/4" /><div className="admin-skeleton h-5 w-1/2" /><div className="admin-skeleton h-11" /></div>
          ) : primaryEvent ? (
            <div className="mt-3 grid gap-4">
              <div>
                <h2 className="admin-heading text-xl">{primaryEvent.name}</h2>
                <p className="admin-muted mt-2 text-sm font-semibold">{primaryEvent.status} · {formatDate(primaryEvent.event_date)}</p>
              </div>
              <div className="grid gap-2">
                <Link href={`${eventBase}/registrations`} className="admin-primary-button justify-center">Registrations</Link>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`${eventBase}/motos`} className="admin-outline-button justify-center">Motos</Link>
                  <Link href={`${eventBase}/results`} className="admin-outline-button justify-center">Results</Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-4"><p className="admin-muted text-sm font-semibold leading-6">Belum ada event yang dapat dijadikan fokus operasional.</p><Link href="/admin/events" className="admin-outline-button justify-center">Buka Event Workspace</Link></div>
          )}
        </aside>
      </section>

      <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="admin-kicker">Event Workspace</div>
            <h2 className="admin-heading mt-1 text-2xl">Event prioritas</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="admin-muted text-xs font-semibold">Update: {metricsLoading ? 'memuat...' : formatDateTime(metrics?.last_updated ?? null)}</span>
            {isCentralAdmin && <Link href="/admin/users" className="admin-outline-button">Kelola Users</Link>}
            <Link href="/admin/events" className="admin-outline-button">Semua Event</Link>
          </div>
        </div>
        <AdminEventSnapshot />
      </section>
    </div>
  )
}
