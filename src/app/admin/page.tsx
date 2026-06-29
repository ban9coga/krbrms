'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import AdminEventSnapshot from './events/AdminEventSnapshot'
import { formatAppRoleLabel, normalizeAppRole } from '../../lib/roles'
import { supabase } from '../../lib/supabaseClient'

type DashboardMetrics = {
  total_riders: number
  total_registrations: number
  approved_riders: number
  pending_registrations: number
  approved_registrations: number
  pending_payments: number
  checked_in_riders: number
  goodie_bag_pending: number
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

type QuickAction = {
  label: string
  href: string
  description: string
}

const formatDateTime = (value: string | null) => {
  if (!value) return 'Belum ada update'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))

function KpiCard({
  label,
  value,
  helper,
  tone = 'neutral',
  loading,
}: {
  label: string
  value: string | number
  helper?: string
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'info'
  loading: boolean
}) {
  const toneClass = tone === 'neutral' ? '' : `admin-card-tone-${tone}`

  return (
    <article className={`admin-card ${toneClass}`}>
      <div className="admin-kicker">{label}</div>
      {loading ? (
        <div className="admin-skeleton mt-4 h-9 w-28" />
      ) : (
        <div className="admin-heading mt-3 text-3xl">{value}</div>
      )}
      {helper && <div className="admin-muted mt-2 text-xs font-bold leading-5">{helper}</div>}
    </article>
  )
}

const attentionToneClass: Record<AttentionTone, string> = {
  danger: 'admin-tone-danger',
  accent: 'admin-tone-accent',
  success: 'admin-tone-success',
  info: 'admin-tone-info',
  neutral: 'admin-tone-neutral',
}

const buildAttentionItems = (metrics: DashboardMetrics | null): AttentionItem[] => {
  if (!metrics) return []

  const items: AttentionItem[] = []
  const eventBase = metrics.primary_event ? `/admin/events/${metrics.primary_event.id}` : '/admin/events'
  const registrationsHref = metrics.primary_event ? `${eventBase}/registrations` : eventBase
  const checkInHref = metrics.primary_event ? `${eventBase}/check-in` : eventBase
  const motosHref = metrics.primary_event ? `${eventBase}/motos` : eventBase

  if (metrics.pending_registrations > 0) {
    items.push({
      title: 'Review pendaftaran baru',
      label: `${metrics.pending_registrations} pending`,
      description: 'Cek data rider, dokumen, dan status pembayaran sebelum approve.',
      href: registrationsHref,
      tone: 'danger',
    })
  }

  if (metrics.pending_payments > 0) {
    items.push({
      title: 'Verifikasi pembayaran',
      label: `${metrics.pending_payments} payment`,
      description: 'Bukti transfer masih menunggu keputusan panitia.',
      href: registrationsHref,
      tone: 'accent',
    })
  }

  if (metrics.goodie_bag_pending > 0) {
    items.push({
      title: 'Goodie bag belum diserahkan',
      label: `${metrics.goodie_bag_pending} rider`,
      description: 'Ada rider sudah check-in tetapi goodie bag belum ditandai diambil.',
      href: checkInHref,
      tone: 'info',
    })
  }

  if (metrics.live_motos > 0) {
    items.push({
      title: 'Pantau moto live',
      label: `${metrics.live_motos} live`,
      description: 'Moto sedang aktif. Pastikan race-control dan hasil publik terpantau.',
      href: motosHref,
      tone: 'success',
    })
  }

  if (items.length === 0) {
    items.push({
      title: 'Antrian utama bersih',
      label: 'Clear',
      description: 'Tidak ada pending review, pending payment, atau goodie bag tertahan saat ini.',
      href: eventBase,
      tone: 'success',
    })
  }

  return items
}

const buildQuickActions = (role: string | null, metrics: DashboardMetrics | null): QuickAction[] => {
  const normalizedRole = normalizeAppRole(role)
  const primaryEvent = metrics?.primary_event ?? null
  const eventBase = primaryEvent ? `/admin/events/${primaryEvent.id}` : '/admin/events'
  const eventName = primaryEvent?.name ?? 'event aktif'

  if (normalizedRole === 'SUPER_ADMIN') {
    return [
      {
        label: primaryEvent ? 'Buka Event Prioritas' : 'Event Workspace',
        href: primaryEvent ? `${eventBase}/registrations` : '/admin/events',
        description: primaryEvent
          ? `${eventName} · ${primaryEvent.status} · ${formatDate(primaryEvent.event_date)}.`
          : 'Buka daftar event dan pilih event yang ingin dikelola.',
      },
      {
        label: 'Tambah Event',
        href: '/admin/events',
        description: 'Buat event baru dari Event Workspace.',
      },
      {
        label: 'Kelola Users',
        href: '/admin/users',
        description: 'Atur akun admin, role panitia, dan akses operator.',
      },
      {
        label: 'Public Landing',
        href: '/',
        description: 'Cek tampilan public yang dilihat wali rider dan komunitas.',
      },
    ]
  }

  if (normalizedRole === 'REGISTRATION_APPROVER') {
    return [
      {
        label: 'Review Registrasi',
        href: primaryEvent ? `${eventBase}/registrations` : '/admin/events',
        description: primaryEvent
          ? `Validasi pembayaran dan data rider untuk ${eventName}.`
          : 'Pilih event lalu validasi pembayaran serta data rider.',
      },
      {
        label: 'Public Landing',
        href: '/',
        description: 'Cek tampilan public yang dilihat wali rider dan komunitas.',
      },
    ]
  }

  return [
    {
      label: 'Review Registrasi',
      href: primaryEvent ? `${eventBase}/registrations` : '/admin/events',
      description: primaryEvent
        ? `Validasi data rider, dokumen, dan payment untuk ${eventName}.`
        : 'Pilih event untuk membuka antrian registrasi.',
    },
    {
      label: 'Check-in Venue',
      href: primaryEvent ? `${eventBase}/check-in` : '/admin/events',
      description: primaryEvent
        ? `Scan QR, tandai hadir/tidak hadir, dan goodie bag untuk ${eventName}.`
        : 'Pilih event untuk membuka panel check-in venue.',
    },
    {
      label: 'Moto Sequence',
      href: primaryEvent ? `${eventBase}/moto-sequence` : '/admin/events',
      description: primaryEvent
        ? `Atur urutan moto dan kategori untuk ${eventName}.`
        : 'Pilih event untuk mengatur urutan moto race-day.',
    },
    {
      label: 'Rekap Hasil',
      href: primaryEvent ? `${eventBase}/results` : '/admin/events',
      description: primaryEvent
        ? `Pantau dan export hasil race untuk ${eventName}.`
        : 'Pilih event untuk membuka rekap hasil.',
    },
  ]
}

function AttentionPanel({
  items,
  loading,
  error,
}: {
  items: AttentionItem[]
  loading: boolean
  error: string | null
}) {
  if (loading) {
    return (
      <section className="admin-surface px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-1">
          <div className="admin-kicker">Next Step</div>
          <h2 className="admin-heading text-xl">Menentukan prioritas…</h2>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="admin-card-muted">
              <div className="admin-skeleton h-6 w-24" />
              <div className="admin-skeleton mt-4 h-7 w-3/4" />
              <div className="admin-skeleton mt-3 h-4 w-full" />
              <div className="admin-skeleton mt-2 h-4 w-2/3" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="admin-surface px-6 py-6 lg:px-8">
        <div className="admin-kicker">Next Step</div>
        <div className="admin-alert-danger mt-3">
          Prioritas belum bisa dihitung karena KPI gagal dimuat.
        </div>
      </section>
    )
  }

  return (
    <section className="admin-surface px-6 py-6 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="admin-kicker">Next Step</div>
          <h2 className="admin-heading text-xl">Rekomendasi tindakan berikutnya</h2>
        </div>
        <Link href="/admin/events" className="admin-outline-button w-fit">
          Buka Event Workspace
        </Link>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {items.slice(0, 3).map((item) => (
          <Link key={item.title} href={item.href} className="admin-card-muted transition-transform hover:-translate-y-0.5">
            <span className={`admin-tone-badge ${attentionToneClass[item.tone]}`}>
              {item.label}
            </span>
            <div className="admin-heading mt-4 text-lg">{item.title}</div>
            <div className="admin-muted mt-2 text-sm font-semibold leading-6">{item.description}</div>
          </Link>
        ))}
      </div>
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
        const metaRole = typeof meta.role === 'string' ? meta.role : null
        const appRole = typeof appMeta.role === 'string' ? appMeta.role : null
        const resolvedRole = metaRole || appRole || null
        setRole(resolvedRole)
        if (normalizeAppRole(resolvedRole) === 'REGISTRATION_APPROVER') {
          router.replace('/admin/events')
          return
        }

        const token = sessionData.session?.access_token
        const res = await fetch('/api/admin/dashboard', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(json?.error || 'Request failed')
        }

        setMetrics(json.data ?? null)
      } catch (err: unknown) {
        setMetricsError(err instanceof Error ? err.message : 'Request failed')
      } finally {
        setMetricsLoading(false)
      }
    }

    void load()
  }, [router])

  const quickActions = useMemo(() => buildQuickActions(role, metrics), [metrics, role])

  const attentionItems = useMemo(() => buildAttentionItems(metrics), [metrics])

  return (
    <div className="grid gap-6">
      <section className="admin-surface overflow-hidden">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] lg:px-8 lg:py-8">
          <div className="grid gap-4">
            <div className="admin-tone-badge admin-tone-accent w-fit tracking-[0.18em]">
              Admin Console
            </div>
            <div className="grid gap-3">
              <h1 className="admin-heading text-3xl sm:text-[2.5rem]">
                Admin Dashboard
              </h1>
              <p className="admin-muted max-w-3xl text-sm font-semibold leading-6">
                Ringkasan operasional untuk memantau event, registrasi, rider, dan status race-day dari satu tempat.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-600">
                {email ? `Signed in: ${email}` : 'Signed in'}
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-600">
                {formatAppRoleLabel(role)}
              </div>
            </div>
          </div>

          <div className="admin-card admin-dashboard-heartbeat">
            <div className="admin-kicker">System heartbeat</div>
            <div className="admin-heading mt-3 text-2xl">
              {metricsLoading ? 'Memuat…' : metricsError ? 'Perlu cek koneksi' : 'Semua panel siap dipakai'}
            </div>
            <div className="admin-muted mt-2 text-sm font-semibold leading-6">
              {metricsError
                ? `KPI belum bisa dimuat: ${metricsError}`
                : `Update terakhir dashboard: ${formatDateTime(metrics?.last_updated ?? null)}.`}
            </div>
            {metrics?.primary_event && (
              <div className="admin-card-muted mt-4 px-4 py-3">
                <div className="admin-kicker">Event focus</div>
                <div className="admin-heading mt-1 text-sm">{metrics.primary_event.name}</div>
                <div className="admin-muted mt-1 text-xs font-bold">
                  {metrics.primary_event.status} · {formatDate(metrics.primary_event.event_date)}
                </div>
              </div>
            )}
            <div className="mt-5 grid gap-3">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="admin-card-muted transition-transform hover:-translate-y-0.5"
                >
                  <div className="admin-heading text-sm">{action.label}</div>
                  <div className="admin-muted mt-1 text-xs font-semibold leading-5">{action.description}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="admin-kicker">Operational Queue</div>
            <h2 className="admin-heading text-xl">Butuh perhatian admin</h2>
          </div>
          <div className="admin-muted text-xs font-bold">
            Update: {metricsLoading ? 'memuat...' : formatDateTime(metrics?.last_updated ?? null)}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Pending Review"
            value={metrics?.pending_registrations ?? 0}
            helper="Pendaftaran menunggu verifikasi panitia."
            tone={(metrics?.pending_registrations ?? 0) > 0 ? 'danger' : 'neutral'}
            loading={metricsLoading}
          />
          <KpiCard
            label="Pending Payment"
            value={metrics?.pending_payments ?? 0}
            helper="Bukti transfer belum disetujui/ditolak."
            tone={(metrics?.pending_payments ?? 0) > 0 ? 'accent' : 'neutral'}
            loading={metricsLoading}
          />
          <KpiCard
            label="Approved Riders"
            value={metrics?.approved_riders ?? 0}
            helper="Rider approved dari data registrasi."
            tone="success"
            loading={metricsLoading}
          />
          <KpiCard
            label="Goodie Pending"
            value={metrics?.goodie_bag_pending ?? 0}
            helper="Rider sudah check-in tapi goodie belum diambil."
            tone={(metrics?.goodie_bag_pending ?? 0) > 0 ? 'info' : 'neutral'}
            loading={metricsLoading}
          />
        </div>
      </section>

      <AttentionPanel items={attentionItems} loading={metricsLoading} error={metricsError} />

      <section className="grid gap-4">
        <div>
          <div className="admin-kicker">Race-day Pulse</div>
          <h2 className="admin-heading text-xl">Ringkasan operasional event</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Total Riders"
            value={metrics?.total_riders ?? 0}
            helper="Rider yang sudah masuk database race."
            loading={metricsLoading}
          />
          <KpiCard
            label="Total Registrasi"
            value={metrics?.total_registrations ?? 0}
            helper={`${metrics?.approved_registrations ?? 0} registrasi sudah approved.`}
            tone="accent"
            loading={metricsLoading}
          />
          <KpiCard
            label="Checked-in Rider"
            value={metrics?.checked_in_riders ?? 0}
            helper="Rider yang sudah diproses di venue."
            tone="info"
            loading={metricsLoading}
          />
          <KpiCard
            label="Moto Live"
            value={metrics?.live_motos ?? 0}
            helper="Moto yang sedang aktif di race-control."
            tone="success"
            loading={metricsLoading}
          />
        </div>
      </section>

      <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-1">
            <div className="admin-kicker">Event Snapshot</div>
            <h2 className="admin-heading text-2xl">Ringkasan event terbaru</h2>
          </div>
          <Link href="/admin/events" className="admin-primary-button">
            Buka Event Workspace
          </Link>
        </div>

        <AdminEventSnapshot />
      </section>
    </div>
  )
}

