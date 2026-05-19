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
  const [draggingMotoId, setDraggingMotoId] = useState<string | null>(null)
  const [dragOverMotoId, setDragOverMotoId] = useState<string | null>(null)

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

  const loadGateOrders = useCallback(
    async (categoryIds: string[]) => {
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
    },
    [eventId]
  )

  const loadData = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
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
    },
    [eventId, hasLoadedOnce, loadGateOrders]
  )

  const saveCategorySequence = useCallback(
    async (nextCategories: CategoryItem[]) => {
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
    },
    [apiFetch, eventId]
  )

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

  const globalMotoSequence = useMemo(() => {
    return [...motos].sort(compareMotoSequence)
  }, [motos])

  const gateMap = useMemo(() => {
    return new Map(
      Object.values(gateOrdersByCategory)
        .flat()
        .map((moto) => [moto.id, moto] as const)
    )
  }, [gateOrdersByCategory])

  const currentMoto = useMemo(() => {
    return globalMotoSequence.find((moto) => moto.status === 'LIVE') ?? globalMotoSequence.find((moto) => moto.status === 'PROVISIONAL') ?? null
  }, [globalMotoSequence])

  const nextMoto = useMemo(() => {
    if (globalMotoSequence.length === 0) return null
    const currentIndex = currentMoto ? globalMotoSequence.findIndex((moto) => moto.id === currentMoto.id) : -1
    if (currentIndex >= 0) {
      return (
        globalMotoSequence.slice(currentIndex + 1).find((moto) => moto.status === 'UPCOMING') ??
        globalMotoSequence.find((moto) => moto.status === 'UPCOMING') ??
        null
      )
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

  const moveMotoGlobal = async (motoId: string, direction: -1 | 1) => {
    const ordered = [...globalMotoSequence]
    const index = ordered.findIndex((moto) => moto.id === motoId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return

    const currentMoto = ordered[index]
    const targetMoto = ordered[nextIndex]
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

  const saveGlobalMotoOrder = useCallback(
    async (orderedMotos: MotoItem[]) => {
      const normalized = orderedMotos.map((moto, index) => ({
        ...moto,
        moto_order: index + 1,
      }))

      setMotos((prev) =>
        prev.map((moto) => normalized.find((candidate) => candidate.id === moto.id) ?? moto)
      )

      setSavingSequence(true)
      try {
        const changed = normalized.filter((moto) => {
          const current = motos.find((item) => item.id === moto.id)
          return current && current.moto_order !== moto.moto_order
        })

        for (const moto of changed) {
          await apiFetch(`/api/motos/${moto.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ moto_order: moto.moto_order }),
          })
        }

        await loadData('refresh')
      } catch (error) {
        console.error('Failed to save dragged moto order:', error)
        await loadData('refresh')
      } finally {
        setSavingSequence(false)
      }
    },
    [apiFetch, loadData, motos]
  )

  const handleMotoDrop = async (targetMotoId: string) => {
    if (!draggingMotoId || draggingMotoId === targetMotoId) {
      setDraggingMotoId(null)
      setDragOverMotoId(null)
      return
    }

    const ordered = [...globalMotoSequence]
    const sourceIndex = ordered.findIndex((moto) => moto.id === draggingMotoId)
    const targetIndex = ordered.findIndex((moto) => moto.id === targetMotoId)

    setDraggingMotoId(null)
    setDragOverMotoId(null)

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return

    const next = [...ordered]
    const [picked] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, picked)
    await saveGlobalMotoOrder(next)
  }

  if (loading && motos.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: '#666' }}>Loading global moto planner...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>Global Moto Planner</h1>
          <button
            onClick={() => void loadData('refresh')}
            disabled={loading || refreshing || savingSequence}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #ddd',
              background: '#fff',
              cursor: loading || refreshing || savingSequence ? 'not-allowed' : 'pointer',
              opacity: loading || refreshing || savingSequence ? 0.6 : 1,
              fontWeight: 600,
            }}
          >
            {savingSequence ? 'Saving Order...' : refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
          Atur semua moto lintas kategori dalam satu daftar global. Planner ini jadi acuan urutan moto yang akan LIVE.
        </p>
        <p style={{ marginTop: '8px', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>
          Tip: drag baris moto untuk menyusun ulang antrian global dengan lebih cepat.
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
              <div style={{ fontSize: '18px', fontWeight: 900 }}>{categoryLabel.get(currentMoto.category_id) || currentMoto.category_id}</div>
              <div style={{ fontSize: '15px', fontWeight: 800 }}>{currentMoto.moto_name}</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#7c2d12' }}>
                Status: {STATUS_LABELS[currentMoto.status] || currentMoto.status}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 700, color: '#9a3412' }}>Belum ada moto LIVE / PROVISIONAL.</div>
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
              <div style={{ fontSize: '18px', fontWeight: 900 }}>{categoryLabel.get(nextMoto.category_id) || nextMoto.category_id}</div>
              <div style={{ fontSize: '15px', fontWeight: 800 }}>{nextMoto.moto_name}</div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#3f6212' }}>
                Menunggu menjadi LIVE setelah moto aktif selesai.
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 700, color: '#3f6212' }}>Tidak ada moto UPCOMING berikutnya.</div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        {categoriesSorted.map((category, index) => (
          <div
            key={category.id}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: '12px',
              background: '#fff',
              padding: '12px',
              display: 'grid',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>
              Category Sequence #{index + 1}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900 }}>{category.label}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
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
                Kategori Naik
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
                    savingSequence || categoriesSorted[categoriesSorted.length - 1]?.id === category.id ? 'not-allowed' : 'pointer',
                  opacity:
                    savingSequence || categoriesSorted[categoriesSorted.length - 1]?.id === category.id ? 0.5 : 1,
                }}
              >
                Kategori Turun
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
        {globalMotoSequence.map((moto, index) => {
          const statusColor = STATUS_COLORS[moto.status] || '#999'
          const statusLabel = STATUS_LABELS[moto.status] || moto.status
          const riders = gateMap.get(moto.id)?.gates ?? []

          return (
            <div
              key={moto.id}
              draggable={!savingSequence}
              onDragStart={() => {
                if (savingSequence) return
                setDraggingMotoId(moto.id)
                setDragOverMotoId(moto.id)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (!savingSequence) {
                  setDragOverMotoId(moto.id)
                }
              }}
              onDragLeave={() => {
                if (dragOverMotoId === moto.id) {
                  setDragOverMotoId(null)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                void handleMotoDrop(moto.id)
              }}
              onDragEnd={() => {
                setDraggingMotoId(null)
                setDragOverMotoId(null)
              }}
              style={{
                border: `2px solid ${moto.id === nextMoto?.id ? '#16a34a' : moto.id === currentMoto?.id ? '#ea580c' : statusColor}`,
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
                boxShadow:
                  dragOverMotoId === moto.id && draggingMotoId && draggingMotoId !== moto.id
                    ? '0 0 0 3px rgba(59, 130, 246, 0.2)'
                    : draggingMotoId === moto.id
                    ? '0 10px 24px rgba(15, 23, 42, 0.14)'
                    : 'none',
                opacity: draggingMotoId === moto.id ? 0.78 : 1,
                display: 'grid',
                gridTemplateColumns: '180px minmax(220px, 280px) 1fr auto',
                gap: '16px',
                alignItems: 'start',
                cursor: savingSequence ? 'progress' : 'grab',
                transition: 'box-shadow 120ms ease, opacity 120ms ease, transform 120ms ease',
              }}
            >
              <div style={{ display: 'grid', gap: '6px' }}>
                <div
                  style={{
                    display: 'inline-block',
                    width: 'fit-content',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    border: '1px dashed #94a3b8',
                    background: '#fff',
                    color: '#475569',
                    fontSize: '10px',
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Drag
                </div>
                <div style={{ fontSize: '12px', color: '#999' }}>Global #{index + 1}</div>
                <div style={{ fontSize: '12px', color: '#999' }}>Order #{moto.moto_order}</div>
                {moto.id === currentMoto?.id && (
                  <div
                    style={{
                      display: 'inline-block',
                      width: 'fit-content',
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
                      width: 'fit-content',
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
                    width: 'fit-content',
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

              <div style={{ display: 'grid', gap: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6b7280' }}>
                  Category
                </div>
                <div style={{ fontSize: '16px', fontWeight: 900 }}>{categoryLabel.get(moto.category_id) || moto.category_id}</div>
                <div style={{ fontSize: '15px', fontWeight: 800 }}>{moto.moto_name}</div>
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
                  onClick={() => void moveMotoGlobal(moto.id, -1)}
                  disabled={savingSequence || globalMotoSequence[0]?.id === moto.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    border: '2px solid #111',
                    background: '#fff',
                    fontWeight: 900,
                    cursor: savingSequence || globalMotoSequence[0]?.id === moto.id ? 'not-allowed' : 'pointer',
                    opacity: savingSequence || globalMotoSequence[0]?.id === moto.id ? 0.5 : 1,
                  }}
                >
                  Global Naik
                </button>
                <button
                  type="button"
                  onClick={() => void moveMotoGlobal(moto.id, 1)}
                  disabled={savingSequence || globalMotoSequence[globalMotoSequence.length - 1]?.id === moto.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    border: '2px solid #111',
                    background: '#fff',
                    fontWeight: 900,
                    cursor:
                      savingSequence || globalMotoSequence[globalMotoSequence.length - 1]?.id === moto.id
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      savingSequence || globalMotoSequence[globalMotoSequence.length - 1]?.id === moto.id ? 0.5 : 1,
                  }}
                >
                  Global Turun
                </button>
              </div>
            </div>
          )
        })}
      </div>

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
