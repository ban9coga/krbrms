'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import AdminEventsView from './events/AdminEventsView'
import { formatAppRoleLabel } from '../../lib/roles'
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
  helper,
  tone = 'neutral',
  loading,
}: {
  label: string
  value: string | number
  helper: string
  tone?: 'neutral' | 'accent' | 'success'
  loading: boolean
}) {
  const toneClass =
    tone === 'accent'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'success'
      ? 'border-emerald-200 bg-emerald-50'
      : 'border-slate-200 bg-white'

  return (
    <article className={`rounded-[1.6rem] border p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 text-3xl font-black tracking-tight text-slate-950">{loading ? '...' : value}</div>
      <div className="mt-2 text-sm font-semibold text-slate-500">{helper}</div>
    </article>
  )
}

export default function AdminDashboardPage() {
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
        setRole(metaRole || appRole || null)

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
  }, [])

  const quickActions = useMemo(() => {
    const actions = [
      {
        label: 'Kelola Events',
        href: '/admin/events',
        helper: 'Buat event baru, ubah status publik, dan buka workspace event.',
      },
      {
        label: 'Lihat Public Landing',
        href: '/',
        helper: 'Cek bagaimana event tampil untuk pengunjung publik.',
      },
    ]

    if (String(role ?? '').trim().toUpperCase() === 'SUPER_ADMIN') {
      actions.unshift({
        label: 'Kelola Users',
        href: '/admin/users',
        helper: 'Atur akun admin dan akses operator pusat.',
      })
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
              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-[2.5rem]">
                Dashboard operasional yang lebih clean dan cepat discan.
              </h1>
              <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-500 sm:text-base">
                Halaman ini sekarang jadi titik masuk utama admin: KPI ringkas, quick actions yang jelas,
                dan snapshot event yang tetap fokus ke pekerjaan harian.
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

          <div className="rounded-[1.8rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_68%,#fef3c7_100%)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">System heartbeat</div>
            <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              {metricsLoading ? 'Memuat…' : metricsError ? 'Perlu cek koneksi' : 'Semua panel siap dipakai'}
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              {metricsError
                ? `KPI belum bisa dimuat: ${metricsError}`
                : `Update terakhir dashboard: ${formatDateTime(metrics?.last_updated ?? null)}.`}
            </p>
            <div className="mt-5 grid gap-3">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="rounded-[1.3rem] border border-slate-200 bg-white px-4 py-4 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="text-sm font-black tracking-tight text-slate-900">{action.label}</div>
                  <div className="mt-1 text-sm font-semibold leading-6 text-slate-500">{action.helper}</div>
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
          helper="Total rider aktif dari seluruh event yang terdata."
          loading={metricsLoading}
        />
        <KpiCard
          label="Total Registrasi"
          value={metrics?.total_registrations ?? 0}
          helper="Jumlah registrasi masuk yang sudah tercatat di sistem."
          tone="accent"
          loading={metricsLoading}
        />
        <KpiCard
          label="Moto Live"
          value={metrics?.live_motos ?? 0}
          helper="Moto yang sedang berjalan atau dibuka untuk operasional."
          tone="success"
          loading={metricsLoading}
        />
        <KpiCard
          label="Last Update"
          value={metricsLoading ? '...' : formatDateTime(metrics?.last_updated ?? null)}
          helper="Patokan kapan dashboard pusat terakhir tersinkron."
          loading={false}
        />
      </section>

      <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-1">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Event Snapshot</div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Ringkasan event terbaru</h2>
            <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Panel ini mempertahankan monitoring event di halaman dashboard, tapi sekarang tampil lebih ringan dan
              lebih cocok untuk admin yang butuh lihat status cepat sebelum masuk ke workspace detail.
            </p>
          </div>
          <Link href="/admin/events" className="admin-primary-button bg-slate-950 text-white hover:bg-slate-800">
            Buka Event Workspace
          </Link>
        </div>

        <AdminEventsView showCreate={false} />
      </section>
    </div>
  )
}
