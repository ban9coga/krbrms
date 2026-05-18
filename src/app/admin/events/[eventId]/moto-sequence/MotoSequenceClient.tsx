'use client'

import { useEffect, useMemo, useState } from 'react'
import { compareMotoSequence } from '../../../../../lib/motoSequence'
import { supabase } from '../../../../../lib/supabaseClient'

type MotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  category_id: string
  is_published?: boolean | null
}

type CategoryItem = {
  id: string
  label: string
}

type MotoRiderRow = {
  moto_id: string
  rider_id: string
  gate_position?: number | null
}

type RiderRow = {
  id: string
  no_plate_display: string
  name: string
}

const STATUS_COLORS: Record<string, string> = {
  UPCOMING: '#6366f1',
  LIVE: '#ef4444',
  FINISHED: '#10b981',
  PROVISIONAL: '#f59e0b',
  PROTEST_REVIEW: '#a855f7',
  LOCKED: '#64748b',
}

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming',
  LIVE: '🔴 LIVE',
  FINISHED: 'Finished',
  PROVISIONAL: 'Provisional',
  PROTEST_REVIEW: 'Protest Review',
  LOCKED: 'Locked',
}

export default function MotoSequenceClient({ eventId }: { eventId: string }) {
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [categories, setCategories] = useState<Map<string, string>>(new Map())
  const [riderMap, setRiderMap] = useState<Map<string, RiderRow>>(new Map())
  const [motoRiders, setMotoRiders] = useState<MotoRiderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Group motos by category
  const motosByCategory = useMemo(() => {
    const grouped = new Map<string, MotoItem[]>()
    for (const moto of motos) {
      const categoryId = moto.category_id || 'UNKNOWN'
      if (!grouped.has(categoryId)) {
        grouped.set(categoryId, [])
      }
      grouped.get(categoryId)!.push(moto)
    }

    // Sort motos within each category
    for (const [, motoList] of grouped) {
      motoList.sort(compareMotoSequence)
    }

    return grouped
  }, [motos])

  const loadData = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    else setRefreshing(true)

    try {
      // Fetch categories
      const { data: catData } = await supabase
        .from('rider_categories')
        .select('id, label')
        .eq('event_id', eventId)

      const categoryMap = new Map<string, string>()
      if (catData) {
        for (const cat of catData) {
          categoryMap.set(cat.id, cat.label)
        }
      }
      setCategories(categoryMap)

      // Fetch motos
      const { data: motoData } = await supabase
        .from('motos')
        .select('id, moto_name, moto_order, status, category_id, is_published')
        .eq('event_id', eventId)
        .order('category_id', { ascending: true })
        .order('moto_order', { ascending: true })

      if (motoData) {
        setMotos(motoData as MotoItem[])
      }

      // Fetch moto riders (for gate positions)
      const { data: riderData } = await supabase
        .from('moto_riders')
        .select('moto_id, rider_id, gate_position')

      if (riderData) {
        setMotoRiders(riderData as MotoRiderRow[])
      }

      // Fetch all riders for display
      const { data: allRiders } = await supabase
        .from('riders')
        .select('id, no_plate_display, name')
        .eq('event_id', eventId)

      if (allRiders) {
        const rMap = new Map<string, RiderRow>()
        for (const rider of allRiders) {
          rMap.set(rider.id, rider)
        }
        setRiderMap(rMap)
      }
    } catch (err) {
      console.error('Failed to load moto sequence data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData('initial')
  }, [eventId])

  // Set up real-time subscription for motos
  useEffect(() => {
    const subscription = supabase
      .channel(`motos:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motos',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          void loadData('refresh')
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(subscription)
    }
  }, [eventId])

  const getRidersForMoto = (motoId: string) => {
    return motoRiders
      .filter((m) => m.moto_id === motoId)
      .sort((a, b) => (a.gate_position ?? 0) - (b.gate_position ?? 0))
      .map((m) => riderMap.get(m.rider_id))
      .filter(Boolean) as RiderRow[]
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: '#666' }}>Loading moto sequence...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>Moto Sequence</h1>
          <button
            onClick={() => void loadData('refresh')}
            disabled={refreshing}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #ddd',
              background: '#fff',
              cursor: refreshing ? 'not-allowed' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
              fontWeight: 600,
            }}
          >
            {refreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
          Master moto sequence for {categories.size} categories • {motos.length} motos total
        </p>
      </div>

      {/* Categories */}
      {Array.from(motosByCategory.entries()).map(([categoryId, categoryMotos]) => (
        <div key={categoryId} style={{ marginBottom: '40px' }}>
          {/* Category Header */}
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
              {categories.get(categoryId) || categoryId}
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#999' }}>
              {categoryMotos.length} motos
            </p>
          </div>

          {/* Moto Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            {categoryMotos.map((moto) => {
              const riders = getRidersForMoto(moto.id)
              const statusColor = STATUS_COLORS[moto.status] || '#999'
              const statusLabel = STATUS_LABELS[moto.status] || moto.status

              return (
                <div
                  key={moto.id}
                  style={{
                    border: `2px solid ${statusColor}`,
                    borderRadius: '12px',
                    padding: '12px',
                    background: moto.status === 'LIVE' ? '#fff5f5' : '#f9fafb',
                    display: 'grid',
                    gridTemplateColumns: '150px 1fr auto',
                    gap: '16px',
                    alignItems: 'start',
                  }}
                >
                  {/* Left: Moto Info */}
                  <div>
                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>
                      Order #{moto.moto_order}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '4px' }}>
                      {moto.moto_name}
                    </div>
                    <div
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: statusColor,
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 700,
                      }}
                    >
                      {statusLabel}
                    </div>
                  </div>

                  {/* Center: Riders */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignContent: 'flex-start' }}>
                    {riders.length === 0 ? (
                      <span style={{ color: '#999', fontSize: '13px' }}>No riders assigned</span>
                    ) : (
                      riders.map((rider, idx) => (
                        <div
                          key={rider.id}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: '#e5e7eb',
                            fontSize: '12px',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Gate {idx + 1}: {rider.no_plate_display} - {rider.name}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <a
                      href={`/admin/events/${eventId}/motos`}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        background: '#3b82f6',
                        color: '#fff',
                        textDecoration: 'none',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {motos.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            borderRadius: '12px',
            background: '#f3f4f6',
            color: '#666',
          }}
        >
          <p style={{ fontSize: '16px', margin: 0 }}>No motos found for this event</p>
        </div>
      )}
    </div>
  )
}
