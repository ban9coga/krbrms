'use client'

import { useEffect, useState } from 'react'
import AdminEventsView from './events/AdminEventsView'
import { supabase } from '../../lib/supabaseClient'

type DashboardMetrics = {
  total_riders: number
  total_registrations: number
  live_motos: number
  last_updated: string | null
}

export default function AdminDashboardPage() {
  const [email, setEmail] = useState<string | null>(null)
  const [role, setRole] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      setEmail(user?.email ?? null)
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
      const metaRole = typeof meta.role === 'string' ? meta.role : null
      const appRole = typeof appMeta.role === 'string' ? appMeta.role : null
      setRole(metaRole || appRole || null)

      setMetricsLoading(true)
      setMetricsError(null)
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        const res = await fetch('/api/admin/dashboard', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error || 'Request failed')
        setMetrics(json.data ?? null)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Request failed'
        setMetricsError(message)
      } finally {
        setMetricsLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div style={{ maxWidth: 1080 }}>
      <section className="public-hero">
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#fda4af',
          }}
        >
          Admin Console
        </p>
        <h1 style={{ margin: '8px 0 0 0', fontSize: 38, fontWeight: 950, color: '#f8fafc' }}>Admin Dashboard</h1>
        <div style={{ marginTop: 8, color: '#cbd5e1', fontWeight: 700 }}>
          {email ? `Signed in as ${email}` : 'Signed in'} {role ? `| role: ${role}` : ''}
        </div>
      </section>

      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        <div style={{ fontWeight: 950, fontSize: 18, color: '#e2e8f0' }}>Dashboard KPI</div>
        {metricsError ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: '2px solid #b40000',
              background: '#ffd7d7',
              color: '#b40000',
              fontWeight: 900,
            }}
          >
            Gagal memuat KPI: {metricsError}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {[
              { label: 'Total Riders', value: metrics?.total_riders ?? 0 },
              { label: 'Total Registrasi', value: metrics?.total_registrations ?? 0 },
              { label: 'Moto LIVE', value: metrics?.live_motos ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: '2px solid #111',
                  background: '#fff',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {item.label}
                </div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 950 }}>
                  {metricsLoading ? '...' : item.value}
                </div>
              </div>
            ))}
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                border: '2px solid #111',
                background: '#fff',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Last Update
              </div>
              <div style={{ marginTop: 6, fontSize: 14, fontWeight: 900 }}>
                {metricsLoading
                  ? '...'
                  : metrics?.last_updated
                  ? new Date(metrics.last_updated).toLocaleString('id-ID')
                  : '-'}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <AdminEventsView showCreate={false} />
      </div>
    </div>
  )
}
