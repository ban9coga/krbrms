'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { compareMotoSequence } from '../../../../../lib/motoSequence'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  label: string
  enabled: boolean
  sequence_order?: number | null
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
}

type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published?: boolean | null
}

type GateMotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: MotoItem['status']
  gates: Array<{
    gate_position: number
    rider_id: string
    name: string
    no_plate_display: string
    club?: string | null
  }>
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
  LIVE: 'LIVE',
  FINISHED: 'Finished',
  PROVISIONAL: 'Provisional',
  PROTEST_REVIEW: 'Protest Review',
  LOCKED: 'Locked',
}

const compareCategoryOrder = (a: CategoryItem, b: CategoryItem) => {
  const aSequence = typeof a.sequence_order === 'number' ? a.sequence_order : null
  const bSequence = typeof b.sequence_order === 'number' ? b.sequence_order : null
  if (aSequence !== null || bSequence !== null) {
    return (aSequence ?? Number.MAX_SAFE_INTEGER) - (bSequence ?? Number.MAX_SAFE_INTEGER)
  }

  const ayMax = typeof a.year_max === 'number' ? a.year_max : typeof a.year_min === 'number' ? a.year_min : 0
  const byMax = typeof b.year_max === 'number' ? b.year_max : typeof b.year_min === 'number' ? b.year_min : 0
  if (byMax !== ayMax) return byMax - ayMax
  const ayMin = typeof a.year_min === 'number' ? a.year_min : ayMax
  const byMin = typeof b.year_min === 'number' ? b.year_min : byMax
  if (byMin !== ayMin) return byMin - ayMin
  const order = { BOY: 0, GIRL: 1, MIX: 2 } as const
  return (order[a.gender] ?? 9) - (order[b.gender] ?? 9)
}

export default function MotoSequenceClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [gateOrdersByCategory, setGateOrdersByCategory] = useState<Record<string, GateMotoItem[]>>({})
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSequence, setSavingSequence] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }, [])

  const loadGateOrders = useCallback(async (categoryIds: string[]) => {
    if (categoryIds.length === 0) {
      setGateOrdersByCategory({})
      return
    }

    const entries = await Promise.all(
      categoryIds.map(async (categoryId) => {
        const res = await fetch(`/api/events/${eventId}/gate-order?categoryId=${categoryId}`, { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return [categoryId, []] as const
        return [categoryId, (json?.data ?? []) as GateMotoItem[]] as const
      })
    )

    const nextMap: Record<string, GateMotoItem[]> = {}
    for (const [categoryId, rows] of entries) {
      nextMap[categoryId] = [...rows].sort(compareMotoSequence)
    }
    setGateOrdersByCategory(nextMap)
  }, [eventId])

  const loadData = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!eventId) return
    if (mode === 'initial' && !hasLoadedOnce) setLoading(true)
    else setRefreshing(true)

    try {
      const nonce = Date.now()
      const [categoryRes, motoRes] = await Promise.all([
        fetch(`/api/events/${eventId}/categories?_=${nonce}`, { cache: 'no-store' }),
        fetch(`/api/motos?event_id=${eventId}&_=${nonce}`, { cache: 'no-store' }),
      ])

      const categoryJson = await categoryRes.json().catch(() => ({}))
      const motoJson = await motoRes.json().catch(() => ({}))

      const enabledCategories = ((categoryJson?.data ?? []) as CategoryItem[]).filter((category) => category.enabled)
      const motoRows = (motoJson?.data ?? []) as MotoItem[]

      setCategories(enabledCategories)
      setMotos(motoRows)

      const categoryIds = Array.from(new Set(motoRows.map((moto) => moto.category_id))).filter(Boolean)
      await loadGateOrders(categoryIds)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setHasLoadedOnce(true)
    }
  }, [eventId, hasLoadedOnce, loadGateOrders])

  const saveCategorySequence = useCallback(async (nextCategories: CategoryItem[]) => {
    setSavingSequence(true)
    try {
      await apiFetch(`/api/events/${eventId}/categories/sequence`, {
        method: 'POST',
        body: JSON.stringify({ category_ids: nextCategories.map((category) => category.id) }),
      })
      setCategories(
        nextCategories.map((category, index) => ({
          ...category,
          sequence_order: index + 1,
        }))
      )
    } finally {
      setSavingSequence(false)
    }
  }, [apiFetch, eventId])

  useEffect(() => {
    void loadData('initial')
  }, [loadData])

  useEffect(() => {
    if (!eventId) return
    const interval = window.setInterval(() => {
      void loadData('refresh')
    }, 5000)
    return () => window.clearInterval(interval)
  }, [eventId, loadData])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const category of categories) {
      map.set(category.id, category.label)
    }
    return map
  }, [categories])

  const categoriesSorted = useMemo(() => {
    return [...categories].sort(compareCategoryOrder)
  }, [categories])

  const motosByCategory = useMemo(() => {
    const grouped = new Map<string, MotoItem[]>()
    for (const moto of motos) {
      const list = grouped.get(moto.category_id) ?? []
      list.push(moto)
      grouped.set(moto.category_id, list)
    }
    for (const list of grouped.values()) {
      list.sort(compareMotoSequence)
    }
    return grouped
  }, [motos])

  const globalMotoSequence = useMemo(() => {
    const categoryOrderMap = new Map(categoriesSorted.map((category, index) => [category.id, index]))
    return [...motos].sort((a, b) => {
      const categoryOrderA = categoryOrderMap.get(a.category_id) ?? Number.MAX_SAFE_INTEGER
      const categoryOrderB = categoryOrderMap.get(b.category_id) ?? Number.MAX_SAFE_INTEGER
      if (categoryOrderA !== categoryOrderB) return categoryOrderA - categoryOrderB
      return compareMotoSequence(a, b)
    })
  }, [categoriesSorted, motos])

  const currentMoto = useMemo(() => {
    return (
      globalMotoSequence.find((moto) => moto.status === 'LIVE') ??
      globalMotoSequence.find((moto) => moto.status === 'PROVISIONAL') ??
      null
    )
  }, [globalMotoSequence])

  const nextMoto = useMemo(() => {
    if (globalMotoSequence.length === 0) return null
    const currentIndex = currentMoto ? globalMotoSequence.findIndex((moto) => moto.id === currentMoto.id) : -1
    if (currentIndex >= 0) {
      return globalMotoSequence.slice(currentIndex + 1).find((moto) => moto.status === 'UPCOMING') ?? null
    }
    return globalMotoSequence.find((moto) => moto.status === 'UPCOMING') ?? null
  }, [currentMoto, globalMotoSequence])

  const moveCategory = async (categoryId: string, direction: -1 | 1) => {
    const ordered = [...categoriesSorted]
    const index = ordered.findIndex((category) => category.id === categoryId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return
    const swapped = [...ordered]
    const [picked] = swapped.splice(index, 1)
    swapped.splice(nextIndex, 0, picked)
    setCategories(
      swapped.map((category, idx) => ({
        ...category,
        sequence_order: idx + 1,
      }))
    )
    try {
      await saveCategorySequence(swapped)
    } catch (error) {
      console.error('Failed to save category sequence:', error)
      await loadData('refresh')
    }
  }

  const moveMotoWithinCategory = async (categoryId: string, motoId: string, direction: -1 | 1) => {
    const ordered = [...(motosByCategory.get(categoryId) ?? [])]
    const index = ordered.findIndex((moto) => moto.id === motoId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return

    const swapped = [...ordered]
    const currentMoto = swapped[index]
    const targetMoto = swapped[nextIndex]
    const currentOrder = currentMoto.moto_order
    const targetOrder = targetMoto.moto_order

    setMotos((prev) =>
      prev.map((moto) => {
        if (moto.id === currentMoto.id) return { ...moto, moto_order: targetOrder }
        if (moto.id === targetMoto.id) return { ...moto, moto_order: currentOrder }
        return moto
      })
    )

    setSavingSequence(true)
    try {
      await apiFetch(`/api/motos/${currentMoto.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ moto_order: targetOrder }),
      })
      await apiFetch(`/api/motos/${targetMoto.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ moto_order: currentOrder }),
      })
      await loadData('refresh')
    } catch (error) {
      console.error('Failed to save moto order:', error)
      await loadData('refresh')
    } finally {
      setSavingSequence(false)
    }
  }

  if (loading && motos.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: '#666' }}>Loading moto sequence...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>Moto Sequence</h1>
          <button
            onClick={() => void loadData('refresh')}
            disabled={loading || refreshing || savingSequence}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #ddd',
              background: '#fff',
              cursor: loading || refreshing ? 'not-allowed' : 'pointer',
              opacity: loading || refreshing ? 0.6 : 1,
              fontWeight: 600,
            }}
          >
            {savingSequence ? 'Saving Order...' : refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
          Master moto sequence for {categories.length} categories · {motos.length} motos total
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            border: '2px solid #111',
            borderRadius: '14px',
            padding: '14px',
            background: '#fff7ed',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a3412' }}>
            Current Global Moto
          </div>
          {currentMoto ? (
            <div style={{ marginTop: '8px', display: 'grid', gap: '4px' }}>
              <div style={{ fontSize: '18px', fontWeight: 900 }}>
                {categoryLabel.get(currentMoto.category_id) || currentMoto.category_id}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800 }}>{currentMoto.moto_name}</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#7c2d12' }}>
                Status: {STATUS_LABELS[currentMoto.status] || currentMoto.status}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 700, color: '#9a3412' }}>
              Belum ada moto LIVE / PROVISIONAL.
            </div>
          )}
        </div>

        <div
          style={{
            border: '2px solid #111',
            borderRadius: '14px',
            padding: '14px',
            background: '#ecfccb',
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#365314' }}>
            Next Global Moto
          </div>
          {nextMoto ? (
            <div style={{ marginTop: '8px', display: 'grid', gap: '4px' }}>
              <div style={{ fontSize: '18px', fontWeight: 900 }}>
                {categoryLabel.get(nextMoto.category_id) || nextMoto.category_id}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800 }}>{nextMoto.moto_name}</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#3f6212' }}>
                Menunggu menjadi LIVE setelah moto aktif selesai.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 700, color: '#3f6212' }}>
              Tidak ada moto UPCOMING berikutnya.
            </div>
          )}
        </div>
      </div>

      {categoriesSorted.map((category) => {
        const categoryMotos = motosByCategory.get(category.id) ?? []
        if (categoryMotos.length === 0) return null

        const gateRows = gateOrdersByCategory[category.id] ?? []
        const gateMap = new Map(gateRows.map((moto) => [moto.id, moto]))

        return (
          <div key={category.id} style={{ marginBottom: '40px' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  {categoryLabel.get(category.id) || category.id}
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#999' }}>
                  Sequence #{categoriesSorted.findIndex((item) => item.id === category.id) + 1} · {categoryMotos.length} motos
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => void moveCategory(category.id, -1)}
                  disabled={savingSequence || categoriesSorted[0]?.id === category.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    border: '2px solid #111',
                    background: '#fff',
                    fontWeight: 900,
                    cursor: savingSequence || categoriesSorted[0]?.id === category.id ? 'not-allowed' : 'pointer',
                    opacity: savingSequence || categoriesSorted[0]?.id === category.id ? 0.5 : 1,
                  }}
                >
                  Naik
                </button>
                <button
                  type="button"
                  onClick={() => void moveCategory(category.id, 1)}
                  disabled={savingSequence || categoriesSorted[categoriesSorted.length - 1]?.id === category.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    border: '2px solid #111',
                    background: '#fff',
                    fontWeight: 900,
                    cursor:
                      savingSequence || categoriesSorted[categoriesSorted.length - 1]?.id === category.id
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      savingSequence || categoriesSorted[categoriesSorted.length - 1]?.id === category.id ? 0.5 : 1,
                  }}
                >
                  Turun
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              {categoryMotos.map((moto) => {
                const statusColor = STATUS_COLORS[moto.status] || '#999'
                const statusLabel = STATUS_LABELS[moto.status] || moto.status
                const riders = gateMap.get(moto.id)?.gates ?? []

                return (
                  <div
                    key={moto.id}
                    style={{
                      border: `2px solid ${
                        moto.id === nextMoto?.id ? '#16a34a' : moto.id === currentMoto?.id ? '#ea580c' : statusColor
                      }`,
                      borderRadius: '12px',
                      padding: '12px',
                      background:
                        moto.id === nextMoto?.id
                          ? '#f0fdf4'
                          : moto.id === currentMoto?.id
                          ? '#fff7ed'
                          : moto.status === 'LIVE'
                          ? '#fff5f5'
                          : '#f9fafb',
                      display: 'grid',
                      gridTemplateColumns: '150px 1fr auto',
                      gap: '16px',
                      alignItems: 'start',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>
                        Order #{moto.moto_order}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '4px' }}>
                        {moto.moto_name}
                      </div>
                      {moto.id === currentMoto?.id && (
                        <div
                          style={{
                            display: 'inline-block',
                            marginBottom: '6px',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: '#ea580c',
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                          }}
                        >
                          Current Global Moto
                        </div>
                      )}
                      {moto.id === nextMoto?.id && (
                        <div
                          style={{
                            display: 'inline-block',
                            marginBottom: '6px',
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: '#16a34a',
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: 900,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                          }}
                        >
                          Next Global Moto
                        </div>
                      )}
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

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignContent: 'flex-start' }}>
                      {riders.length === 0 ? (
                        <span style={{ color: '#999', fontSize: '13px' }}>No riders assigned</span>
                      ) : (
                        riders.map((rider) => (
                          <div
                            key={`${moto.id}-${rider.rider_id}`}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: '#e5e7eb',
                              fontSize: '12px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Gate {rider.gate_position}: {rider.no_plate_display} - {rider.name}
                          </div>
                        ))
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => void moveMotoWithinCategory(category.id, moto.id, -1)}
                        disabled={savingSequence || categoryMotos[0]?.id === moto.id}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '999px',
                          border: '2px solid #111',
                          background: '#fff',
                          fontWeight: 900,
                          cursor: savingSequence || categoryMotos[0]?.id === moto.id ? 'not-allowed' : 'pointer',
                          opacity: savingSequence || categoryMotos[0]?.id === moto.id ? 0.5 : 1,
                        }}
                      >
                        Moto Naik
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveMotoWithinCategory(category.id, moto.id, 1)}
                        disabled={savingSequence || categoryMotos[categoryMotos.length - 1]?.id === moto.id}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '999px',
                          border: '2px solid #111',
                          background: '#fff',
                          fontWeight: 900,
                          cursor:
                            savingSequence || categoryMotos[categoryMotos.length - 1]?.id === moto.id
                              ? 'not-allowed'
                              : 'pointer',
                          opacity:
                            savingSequence || categoryMotos[categoryMotos.length - 1]?.id === moto.id ? 0.5 : 1,
                        }}
                      >
                        Moto Turun
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {!loading && motos.length === 0 && (
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
