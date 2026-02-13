'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import EmptyState from '../../../../../components/EmptyState'
import LoadingState from '../../../../../components/LoadingState'
import PublicTopbar from '../../../../../components/PublicTopbar'
import StatusBadge from '../../../../../components/StatusBadge'
import { getCategoriesByYear, getMotosByCategory, type RiderCategory, type MotoItem } from '../../../../../lib/eventService'

const normalize = (value: string) => value.toLowerCase()

export default function YearClient({ eventId, year }: { eventId: string; year: string }) {
  const [categories, setCategories] = useState<(RiderCategory & { status: 'UPCOMING' | 'LIVE' | 'FINISHED' })[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'FINISHED'>('ALL')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const base = await getCategoriesByYear(eventId, year)
      const withStatus = await Promise.all(
        base.map(async (category) => {
          const motos: MotoItem[] = await getMotosByCategory(category.id)
          const hasLive = motos.some((m) => m.status === 'LIVE')
          const hasFinished = motos.some((m) => m.status === 'FINISHED')
          const hasUpcoming = motos.some((m) => m.status === 'UPCOMING')
          const status: 'UPCOMING' | 'LIVE' | 'FINISHED' = hasLive
            ? 'LIVE'
            : hasFinished && hasUpcoming
            ? 'LIVE'
            : hasFinished
            ? 'FINISHED'
            : 'UPCOMING'
          return { ...category, status }
        })
      )
      setCategories(withStatus)
      setLoading(false)
    }
    if (eventId) load()
  }, [eventId, year])

  const filtered = categories.filter((item) => {
    const matchesQuery = normalize(item.label).includes(normalize(query))
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter
    return matchesQuery && matchesStatus
  })

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111' }}>
      <PublicTopbar />
      <div style={{ maxWidth: '840px', margin: '0 auto', padding: '24px 20px 48px' }}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>Race Categories {year}</div>

        {loading && <LoadingState />}
        {!loading && filtered.length === 0 && <EmptyState label="Belum ada race category." />}

        <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari race category..."
            style={{
              padding: '12px',
              borderRadius: '10px',
              border: '2px solid #111',
              background: '#fff',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {(['ALL', 'LIVE', 'FINISHED'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '999px',
                  border: '2px solid #111',
                  background: statusFilter === status ? '#2ecc71' : '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
          {filtered.map((category) => (
            <Link
              key={category.id}
              href={`/event/${eventId}/results/${year}/${encodeURIComponent(category.id)}`}
              style={{ textDecoration: 'none', color: '#111' }}
            >
              <div
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: '2px solid #111',
                  background: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: 800,
                }}
              >
                <div>{category.label}</div>
                <StatusBadge label={category.status} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

