'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import AdminEventsView from './events/AdminEventsView'
import { formatAppRoleLabel, normalizeAppRole } from '../../lib/roles'
import { supabase } from '../../lib/supabaseClient'

type DashboardMetrics = {
  total_riders: number
  total_registrations: number
  live_motos: number
  last_updated: string | null
}

const formatDateTime = (value: string | null) => {
  if (!value) return 'Belum ada update'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function KpiCard({
  label,
  value,
  tone = 'neutral',
  loading,
}: {
  label: string
  value: string | number
  tone?: 'neutral' | 'accent' | 'success'
  loading: boolean
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-amber-200 bg-amber-50/90'
      : tone === 'success'
      ? 'border-emerald-200 bg-emerald-50/90'
      : ''

  return (
    <article className={`admin-card ${toneClass}`}>
      <div className="admin-kicker">{label}</div>
      {loading ? (
        <div className="admin-skeleton mt-4 h-9 w-28" />
      ) : (
        <div className="admin-heading mt-3 text-3xl">{value}</div>
      )}
    </article>
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

  const quickActions = useMemo(() => {
    const actions = [
      {
        label: 'Kelola Events',
        href: '/admin/events',
        description: 'Buka daftar event, buat event baru, dan masuk ke event workspace.',
      },
      {
        label: 'Lihat Public Landing',
        href: '/',
        description: 'Cek tampilan public yang dilihat wali rider dan komunitas.',
      },
    ]

    const normalizedRole = normalizeAppRole(role)

    if (normalizedRole === 'SUPER_ADMIN') {
      actions.unshift({
        label: 'Kelola Users',
        href: '/admin/users',
        description: 'Atur akun admin, role panitia, dan akses field operator.',
      })
    }

    if (normalizedRole === 'REGISTRATION_APPROVER') {
      return [
        {
          label: 'Review Registrasi',
          href: '/admin/events',
          description: 'Masuk ke event dan validasi pembayaran serta data rider.',
        },
        actions[1],
      ]
    }

    return actions
  }, [role])

  return (
    <div className="grid gap-6">
      <section className="admin-surface overflow-hidden">
        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] lg:px-8 lg:py-8">
          <div className="grid gap-4">
            <div className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
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

          <div className="admin-card bg-[linear-gradient(135deg,rgba(255,255,255,0.92)_0%,rgba(248,250,252,0.88)_68%,rgba(254,243,199,0.92)_100%)]">
            <div className="admin-kicker">System heartbeat</div>
            <div className="admin-heading mt-3 text-2xl">
              {metricsLoading ? 'Memuat…' : metricsError ? 'Perlu cek koneksi' : 'Semua panel siap dipakai'}
            </div>
            <div className="admin-muted mt-2 text-sm font-semibold leading-6">
              {metricsError
                ? `KPI belum bisa dimuat: ${metricsError}`
                : `Update terakhir dashboard: ${formatDateTime(metrics?.last_updated ?? null)}.`}
            </div>
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Riders"
          value={metrics?.total_riders ?? 0}
          loading={metricsLoading}
        />
        <KpiCard
          label="Total Registrasi"
          value={metrics?.total_registrations ?? 0}
          tone="accent"
          loading={metricsLoading}
        />
        <KpiCard
          label="Moto Live"
          value={metrics?.live_motos ?? 0}
          tone="success"
          loading={metricsLoading}
        />
        <KpiCard
          label="Last Update"
          value={metricsLoading ? '...' : formatDateTime(metrics?.last_updated ?? null)}
          loading={false}
        />
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

        <AdminEventsView showCreate={false} />
      </section>
    </div>
  )
}

