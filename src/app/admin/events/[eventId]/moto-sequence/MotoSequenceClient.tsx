'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { compareMotoDisplayOrder, formatMotoDisplayName } from '../../../../../lib/motoDisplayOrder'
import { supabase } from '@/src/lib/supabaseClient'

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
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published?: boolean | null
}

type EventStatus = 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'

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
  READY: '#22c55e',
  LIVE: '#ef4444',
  FINISHED: '#10b981',
  PROVISIONAL: '#f59e0b',
  PROTEST_REVIEW: '#a855f7',
  LOCKED: '#64748b',
}

const STATUS_LABELS: Record<string, string> = {
  UPCOMING: 'Upcoming',
  READY: 'Ready',
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

const compareLockedLast = (a: MotoItem, b: MotoItem) => {
  const aLocked = a.status === 'LOCKED'
  const bLocked = b.status === 'LOCKED'
  if (aLocked !== bLocked) return aLocked ? 1 : -1
  return a.moto_order - b.moto_order
}

const shouldPollMotoSequence = (eventStatus: EventStatus | null, autoRefreshEnabled: boolean) => {
  return autoRefreshEnabled && eventStatus === 'LIVE'
}

const buildContiguousMotoGroups = (sequence: MotoItem[]) => {
  const groups: Array<{
    categoryId: string
    motos: MotoItem[]
    startIndex: number
  }> = []

  sequence.forEach((moto, index) => {
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.categoryId === moto.category_id) {
      lastGroup.motos.push(moto)
      return
    }
    groups.push({
      categoryId: moto.category_id,
      motos: [moto],
      startIndex: index,
    })
  })

  return groups
}

function DirectionIcon({ direction }: { direction: 'up' | 'down' }) {
  const rotation = direction === 'up' ? 'rotate(0deg)' : 'rotate(180deg)'
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      style={{ transform: rotation, display: 'block' }}
    >
      <path
        d="M8 3 13 9H9.5V13H6.5V9H3L8 3Z"
        fill="currentColor"
      />
    </svg>
  )
}

export default function MotoSequenceClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [gateOrdersByCategory, setGateOrdersByCategory] = useState<Record<string, GateMotoItem[]>>({})
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSequence, setSavingSequence] = useState(false)
  const [eventStatus, setEventStatus] = useState<EventStatus | null>(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [motoOrderDirty, setMotoOrderDirty] = useState(false)
  const [savedMotoOrderById, setSavedMotoOrderById] = useState<Record<string, number>>({})
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [draggingMotoId, setDraggingMotoId] = useState<string | null>(null)
  const [dragOverMotoId, setDragOverMotoId] = useState<string | null>(null)
  const [draggingBlockCategoryId, setDraggingBlockCategoryId] = useState<string | null>(null)
  const [dragOverBlockCategoryId, setDragOverBlockCategoryId] = useState<string | null>(null)
  const motoOrderDirtyRef = useRef(false)

  const setMotoOrderDirtyValue = useCallback((dirty: boolean) => {
    motoOrderDirtyRef.current = dirty
    setMotoOrderDirty(dirty)
  }, [])

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

      const res = await fetch(`/api/events/${eventId}/gate-order`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      const rowsByCategory = (res.ok ? json?.data ?? {} : {}) as Record<string, GateMotoItem[]>
      const nextMap: Record<string, GateMotoItem[]> = {}
      for (const categoryId of categoryIds) {
        nextMap[categoryId] = [...(rowsByCategory[categoryId] ?? [])].sort(compareMotoDisplayOrder)
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
        const [categoryRes, motoRes, eventJson] = await Promise.all([
          fetch(`/api/events/${eventId}/categories?_=${nonce}`, { cache: 'no-store' }),
          fetch(`/api/motos?event_id=${eventId}&_=${nonce}`, { cache: 'no-store' }),
          apiFetch(`/api/events/${eventId}`),
        ])

        const categoryJson = await categoryRes.json().catch(() => ({}))
        const motoJson = await motoRes.json().catch(() => ({}))

        const enabledCategories = ((categoryJson?.data ?? []) as CategoryItem[]).filter((category) => category.enabled)
        const motoRows = (motoJson?.data ?? []) as MotoItem[]
        setEventStatus((eventJson?.data?.status ?? null) as EventStatus | null)

        setCategories(enabledCategories)
        if (!(mode === 'refresh' && motoOrderDirtyRef.current)) {
          setMotos(motoRows)
          setSavedMotoOrderById(
            motoRows.reduce<Record<string, number>>((acc, moto) => {
              acc[moto.id] = moto.moto_order
              return acc
            }, {})
          )
          setMotoOrderDirtyValue(false)
        }

        const categoryIds = Array.from(new Set(motoRows.map((moto) => moto.category_id))).filter(Boolean)
        await loadGateOrders(categoryIds)
      } finally {
        setLoading(false)
        setRefreshing(false)
        setHasLoadedOnce(true)
      }
    },
    [apiFetch, eventId, hasLoadedOnce, loadGateOrders, setMotoOrderDirtyValue]
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
    if (!shouldPollMotoSequence(eventStatus, autoRefreshEnabled)) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void loadData('refresh')
    }, 5000)
    return () => window.clearInterval(interval)
  }, [autoRefreshEnabled, eventId, eventStatus, loadData])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const category of categories) {
      map.set(category.id, category.label)
    }
    return map
  }, [categories])

  const categoriesSorted = useMemo(() => [...categories].sort(compareCategoryOrder), [categories])
  const globalMotoSequence = useMemo(() => [...motos].sort(compareLockedLast), [motos])
  const activeMotoSequence = useMemo(() => globalMotoSequence.filter((moto) => moto.status !== 'LOCKED'), [globalMotoSequence])
  const lockedMotoSequence = useMemo(() => globalMotoSequence.filter((moto) => moto.status === 'LOCKED'), [globalMotoSequence])
  const activeMotoGroups = useMemo(() => buildContiguousMotoGroups(activeMotoSequence), [activeMotoSequence])
  const lockedMotoGroups = useMemo(() => buildContiguousMotoGroups(lockedMotoSequence), [lockedMotoSequence])

  const gateMap = useMemo(() => {
    return new Map(
      Object.values(gateOrdersByCategory)
        .flat()
        .map((moto) => [moto.id, moto] as const)
    )
  }, [gateOrdersByCategory])

  const currentMoto = useMemo(() => {
    return activeMotoSequence.find((moto) => moto.status === 'LIVE') ?? activeMotoSequence.find((moto) => moto.status === 'PROVISIONAL') ?? null
  }, [activeMotoSequence])

  const nextMoto = useMemo(() => {
    const isNextCandidate = (moto: MotoItem) => moto.status === 'READY' || moto.status === 'UPCOMING'
    if (activeMotoSequence.length === 0) return null
    const currentIndex = currentMoto ? activeMotoSequence.findIndex((moto) => moto.id === currentMoto.id) : -1
    if (currentIndex >= 0) {
      return (
        activeMotoSequence.slice(currentIndex + 1).find(isNextCandidate) ??
        activeMotoSequence.find(isNextCandidate) ??
        null
      )
    }
    return activeMotoSequence.find(isNextCandidate) ?? null
  }, [activeMotoSequence, currentMoto])

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

  const applyDraftMotoOrder = useCallback(
    (orderedMotos: MotoItem[]) => {
      const normalized = orderedMotos.map((moto, index) => ({
        ...moto,
        moto_order: index + 1,
      }))

      setMotos((prev) => prev.map((moto) => normalized.find((candidate) => candidate.id === moto.id) ?? moto))
      setMotoOrderDirtyValue(true)
    },
    [setMotoOrderDirtyValue]
  )

  const moveMotoGlobal = (motoId: string, direction: -1 | 1) => {
    const ordered = [...globalMotoSequence]
    const index = ordered.findIndex((moto) => moto.id === motoId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return

    const next = [...ordered]
    const [picked] = next.splice(index, 1)
    next.splice(nextIndex, 0, picked)
    applyDraftMotoOrder(next)
  }

  const saveGlobalMotoOrder = useCallback(
    async (orderedMotos: MotoItem[]) => {
      const normalized = orderedMotos.map((moto, index) => ({
        ...moto,
        moto_order: index + 1,
      }))

      setMotos((prev) => prev.map((moto) => normalized.find((candidate) => candidate.id === moto.id) ?? moto))

      setSavingSequence(true)
      try {
        const changed = normalized.filter((moto) => savedMotoOrderById[moto.id] !== moto.moto_order)

        for (const moto of changed) {
          await apiFetch(`/api/motos/${moto.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ moto_order: moto.moto_order }),
          })
        }

        setSavedMotoOrderById(
          normalized.reduce<Record<string, number>>((acc, moto) => {
            acc[moto.id] = moto.moto_order
            return acc
          }, {})
        )
        setMotoOrderDirtyValue(false)
      } catch (error) {
        console.error('Failed to save dragged moto order:', error)
        setMotoOrderDirtyValue(false)
        await loadData('refresh')
      } finally {
        setSavingSequence(false)
      }
    },
    [apiFetch, loadData, savedMotoOrderById, setMotoOrderDirtyValue]
  )

  const handleMotoDrop = (targetMotoId: string) => {
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
    applyDraftMotoOrder(next)
  }

  const handleBlockDrop = (targetCategoryId: string) => {
    if (!draggingBlockCategoryId || draggingBlockCategoryId === targetCategoryId) {
      setDraggingBlockCategoryId(null)
      setDragOverBlockCategoryId(null)
      return
    }

    const orderedGroups = buildContiguousMotoGroups(activeMotoSequence)
    const sourceIndex = orderedGroups.findIndex((group) => group.categoryId === draggingBlockCategoryId)
    const targetIndex = orderedGroups.findIndex((group) => group.categoryId === targetCategoryId)

    setDraggingBlockCategoryId(null)
    setDragOverBlockCategoryId(null)

    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return

    const nextGroups = [...orderedGroups]
    const [picked] = nextGroups.splice(sourceIndex, 1)
    nextGroups.splice(targetIndex, 0, picked)
    const nextActiveSequence = nextGroups.flatMap((group) => group.motos)
    applyDraftMotoOrder([...nextActiveSequence, ...lockedMotoSequence])
  }

  const moveBlock = (categoryId: string, direction: -1 | 1 | 'top' | 'bottom') => {
    const orderedGroups = buildContiguousMotoGroups(activeMotoSequence)
    const sourceIndex = orderedGroups.findIndex((group) => group.categoryId === categoryId)
    if (sourceIndex < 0) return

    const targetIndex =
      direction === 'top'
        ? 0
        : direction === 'bottom'
          ? orderedGroups.length - 1
          : sourceIndex + direction

    if (targetIndex < 0 || targetIndex >= orderedGroups.length || targetIndex === sourceIndex) return

    const nextGroups = [...orderedGroups]
    const [picked] = nextGroups.splice(sourceIndex, 1)
    nextGroups.splice(targetIndex, 0, picked)
    const nextActiveSequence = nextGroups.flatMap((group) => group.motos)
    applyDraftMotoOrder([...nextActiveSequence, ...lockedMotoSequence])
  }

  const handleNormalizeMotoOrder = () => {
    if (globalMotoSequence.length === 0) return
    applyDraftMotoOrder(globalMotoSequence)
  }

  const handleSaveMotoOrder = async () => {
    if (!motoOrderDirty || savingSequence) return
    await saveGlobalMotoOrder(globalMotoSequence)
  }

  const handleCancelMotoOrderDraft = async () => {
    if (!motoOrderDirty || savingSequence) return
    const ok = window.confirm('Batalkan perubahan urutan moto yang belum disimpan?')
    if (!ok) return
    setMotoOrderDirtyValue(false)
    await loadData('refresh')
  }

  const renderMotoRow = (moto: MotoItem, index: number, totalCount: number, opts?: { lockedSection?: boolean; labelPrefix?: string }) => {
    const lockedSection = opts?.lockedSection ?? false
    const labelPrefix = opts?.labelPrefix ?? 'Global'
    const statusColor = STATUS_COLORS[moto.status] || '#999'
    const statusLabel = STATUS_LABELS[moto.status] || moto.status
    const riders = gateMap.get(moto.id)?.gates ?? []
    const showDropIndicator = dragOverMotoId === moto.id && draggingMotoId && draggingMotoId !== moto.id

    return (
      <div key={moto.id} style={{ display: 'grid', gap: '6px' }}>
        {showDropIndicator && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '0 6px',
            }}
          >
            <div style={{ flex: 1, height: '4px', borderRadius: '999px', background: '#2563eb' }} />
            <div
              style={{
                padding: '4px 10px',
                borderRadius: '999px',
                background: '#dbeafe',
                color: '#1d4ed8',
                fontSize: '11px',
                fontWeight: 900,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              Drop Here
            </div>
            <div style={{ flex: 1, height: '4px', borderRadius: '999px', background: '#2563eb' }} />
          </div>
        )}
        <div
          draggable={!savingSequence}
          onDragStart={() => {
            if (savingSequence) return
            setDraggingMotoId(moto.id)
            setDragOverMotoId(moto.id)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (!savingSequence) setDragOverMotoId(moto.id)
          }}
          onDragLeave={() => {
            if (dragOverMotoId === moto.id) setDragOverMotoId(null)
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
            borderRadius: '14px',
            padding: '10px',
            background:
              moto.id === nextMoto?.id
                ? '#f0fdf4'
                : moto.id === currentMoto?.id
                ? '#fff7ed'
                : moto.status === 'LIVE'
                ? '#fff5f5'
                : lockedSection
                ? '#f8fafc'
                : '#f9fafb',
            boxShadow:
              showDropIndicator
                ? '0 0 0 4px rgba(37, 99, 235, 0.16)'
                : draggingMotoId === moto.id
                ? '0 10px 24px rgba(15, 23, 42, 0.14)'
                : 'none',
            opacity: draggingMotoId === moto.id ? 0.78 : lockedSection ? 0.66 : 1,
            display: 'grid',
            gridTemplateColumns: '52px minmax(0, 1fr)',
            gap: '8px 10px',
            alignItems: 'center',
            cursor: savingSequence ? 'progress' : 'grab',
            transition: 'box-shadow 120ms ease, opacity 120ms ease, transform 120ms ease',
          }}
        >
          <div style={{ display: 'grid', gap: '2px', justifyItems: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 950, color: '#0f172a', lineHeight: 1 }}>
              #{index + 1}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 900, textTransform: 'uppercase' }}>
              {labelPrefix}
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800 }}>O{moto.moto_order}</div>
          </div>

          <div style={{ display: 'grid', gap: '5px', minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '15px', fontWeight: 950, color: '#0f172a' }}>
                {formatMotoDisplayName(moto.moto_name)}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#475569' }}>
                {categoryLabel.get(moto.category_id) || moto.category_id}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              {moto.id === currentMoto?.id && (
                <span
                  style={{
                    padding: '3px 7px',
                    borderRadius: '999px',
                    background: '#ea580c',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Current
                </span>
              )}
              {moto.id === nextMoto?.id && (
                <span
                  style={{
                    padding: '3px 7px',
                    borderRadius: '999px',
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Next
                </span>
              )}
              <span
                style={{
                  padding: '3px 7px',
                  borderRadius: '999px',
                  background: statusColor,
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 900,
                }}
              >
                {statusLabel}
              </span>
              <span
                style={{
                  padding: '3px 7px',
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
              </span>
            </div>
          </div>

          <div
            style={{
              gridColumn: '1 / -1',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px dashed rgba(148, 163, 184, 0.45)',
              paddingTop: '7px',
            }}
          >
            {riders.length === 0 ? (
              <span style={{ color: '#999', fontSize: '13px' }}>No riders assigned</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                <span
                  style={{
                    padding: '6px 10px',
                    borderRadius: '999px',
                    background: '#e5e7eb',
                    color: '#111827',
                    fontSize: '12px',
                    fontWeight: 900,
                  }}
                >
                  {riders.length} rider
                </span>
                <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 900 }}>
                  Gate {Math.min(...riders.map((rider) => rider.gate_position))}-
                  {Math.max(...riders.map((rider) => rider.gate_position))}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => void moveMotoGlobal(moto.id, -1)}
              disabled={savingSequence || index === 0}
              title="Naikkan moto di urutan global"
              aria-label="Naikkan moto di urutan global"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '999px',
                border: '2px solid #111',
                background: '#fff',
                color: '#0f172a',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: savingSequence || index === 0 ? 'not-allowed' : 'pointer',
                opacity: savingSequence || index === 0 ? 0.5 : 1,
              }}
            >
              <DirectionIcon direction="up" />
            </button>
            <button
              type="button"
              onClick={() => void moveMotoGlobal(moto.id, 1)}
              disabled={savingSequence || index === totalCount - 1}
              title="Turunkan moto di urutan global"
              aria-label="Turunkan moto di urutan global"
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '999px',
                border: '2px solid #111',
                background: '#fff',
                color: '#0f172a',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: savingSequence || index === totalCount - 1 ? 'not-allowed' : 'pointer',
                opacity: savingSequence || index === totalCount - 1 ? 0.5 : 1,
              }}
            >
              <DirectionIcon direction="down" />
            </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading && motos.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: '#666' }}>Loading global moto planner...</p>
      </div>
    )
  }

  const isAutoRefreshActive = shouldPollMotoSequence(eventStatus, autoRefreshEnabled)

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 900 }}>Global Moto Planner</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setAutoRefreshEnabled((value) => !value)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `1px solid ${isAutoRefreshActive ? '#14532d' : '#cbd5e1'}`,
                background: isAutoRefreshActive ? '#16a34a' : '#fff',
                color: isAutoRefreshActive ? '#fff' : '#334155',
                cursor: 'pointer',
                fontWeight: 900,
              }}
              title={
                eventStatus === 'LIVE'
                  ? 'Aktif/nonaktifkan polling otomatis halaman moto sequence.'
                  : 'Auto refresh hanya berjalan saat event LIVE.'
              }
            >
              {isAutoRefreshActive ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
            </button>
            <button
              onClick={handleNormalizeMotoOrder}
              disabled={loading || refreshing || savingSequence || globalMotoSequence.length === 0}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #16a34a',
                background: '#dcfce7',
                color: '#14532d',
                cursor: loading || refreshing || savingSequence || globalMotoSequence.length === 0 ? 'not-allowed' : 'pointer',
                opacity: loading || refreshing || savingSequence || globalMotoSequence.length === 0 ? 0.6 : 1,
                fontWeight: 900,
              }}
            >
              Normalize Draft
            </button>
            <button
              onClick={() => void handleCancelMotoOrderDraft()}
              disabled={!motoOrderDirty || loading || refreshing || savingSequence}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                cursor: !motoOrderDirty || loading || refreshing || savingSequence ? 'not-allowed' : 'pointer',
                opacity: !motoOrderDirty || loading || refreshing || savingSequence ? 0.55 : 1,
                fontWeight: 900,
              }}
            >
              Cancel Draft
            </button>
            <button
              onClick={() => void handleSaveMotoOrder()}
              disabled={!motoOrderDirty || loading || refreshing || savingSequence}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #f59e0b',
                background: motoOrderDirty ? '#facc15' : '#fde68a',
                color: '#1f2937',
                cursor: !motoOrderDirty || loading || refreshing || savingSequence ? 'not-allowed' : 'pointer',
                opacity: !motoOrderDirty || loading || refreshing || savingSequence ? 0.55 : 1,
                fontWeight: 950,
              }}
            >
              {savingSequence ? 'Saving...' : 'Save Moto Order'}
            </button>
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
        </div>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
          Atur semua moto lintas kategori dalam satu daftar global. Planner ini jadi acuan urutan moto yang akan LIVE.
        </p>
        <p style={{ marginTop: '8px', color: '#64748b', fontSize: '13px', fontWeight: 700 }}>
          Tip: drag baris moto atau pakai tombol panah untuk menyusun draft. Klik <strong>Save Moto Order</strong> setelah urutan sudah pas.
        </p>
        {motoOrderDirty && (
          <div
            style={{
              marginTop: '10px',
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid #f59e0b',
              background: '#fffbeb',
              color: '#92400e',
              fontSize: '13px',
              fontWeight: 900,
            }}
          >
            Ada perubahan urutan moto yang belum disimpan. Auto-refresh tidak akan menimpa draft ini sampai kamu Save atau Cancel.
          </div>
        )}
        <div
          style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: '14px',
            border: '1px solid #bfdbfe',
            background: '#f8fbff',
            color: '#1e3a8a',
            fontSize: '13px',
            fontWeight: 800,
          }}
        >
          <div style={{ fontWeight: 900 }}>Panduan cepat</div>
          <div style={{ marginTop: '4px' }}>
            <strong>Global Moto Planner</strong> menentukan antrean race yang benar-benar berjalan.{' '}
            <strong>Urutan Kategori</strong> di bawah hanya untuk membantu susunan kategori di tampilan admin.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '999px',
              background: '#eef2ff',
              color: '#3730a3',
              fontSize: '12px',
              fontWeight: 900,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <span>Active</span>
            <span
              style={{
                minWidth: '24px',
                height: '24px',
                borderRadius: '999px',
                background: '#4338ca',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
              }}
            >
              {activeMotoSequence.length}
            </span>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderRadius: '999px',
              background: '#f1f5f9',
              color: '#475569',
              fontSize: '12px',
              fontWeight: 900,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <span>Locked</span>
            <span
              style={{
                minWidth: '24px',
                height: '24px',
                borderRadius: '999px',
                background: '#64748b',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
              }}
            >
              {lockedMotoSequence.length}
            </span>
          </div>
        </div>
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
              <div style={{ fontSize: '15px', fontWeight: 800 }}>{formatMotoDisplayName(currentMoto.moto_name)}</div>
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
              <div style={{ fontSize: '15px', fontWeight: 800 }}>{formatMotoDisplayName(nextMoto.moto_name)}</div>
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
        <div
          style={{
            gridColumn: '1 / -1',
            padding: '10px 0 2px',
            color: '#475569',
            fontSize: '13px',
            fontWeight: 800,
          }}
        >
          Urutan Kategori ini tidak mengubah queue moto yang sedang LIVE. Fungsinya untuk susunan kategori di area admin.
        </div>
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
              Urutan Kategori #{index + 1}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900 }}>{category.label}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => void moveCategory(category.id, -1)}
                disabled={savingSequence || categoriesSorted[0]?.id === category.id}
                title="Naikkan urutan kategori"
                aria-label="Naikkan urutan kategori"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '999px',
                  border: '2px solid #111',
                  background: '#fff',
                  color: '#0f172a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: savingSequence || categoriesSorted[0]?.id === category.id ? 'not-allowed' : 'pointer',
                  opacity: savingSequence || categoriesSorted[0]?.id === category.id ? 0.5 : 1,
                }}
              >
                <DirectionIcon direction="up" />
              </button>
              <button
                type="button"
                onClick={() => void moveCategory(category.id, 1)}
                disabled={savingSequence || categoriesSorted[categoriesSorted.length - 1]?.id === category.id}
                title="Turunkan urutan kategori"
                aria-label="Turunkan urutan kategori"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '999px',
                  border: '2px solid #111',
                  background: '#fff',
                  color: '#0f172a',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor:
                    savingSequence || categoriesSorted[categoriesSorted.length - 1]?.id === category.id ? 'not-allowed' : 'pointer',
                  opacity:
                    savingSequence || categoriesSorted[categoriesSorted.length - 1]?.id === category.id ? 0.5 : 1,
                }}
              >
                <DirectionIcon direction="down" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        {activeMotoGroups.map((group, groupIndex) => (
          <div
            key={`active-group-${group.categoryId}-${group.startIndex}`}
            draggable={!savingSequence}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', group.categoryId)
              setDraggingBlockCategoryId(group.categoryId)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              if (dragOverBlockCategoryId !== group.categoryId) setDragOverBlockCategoryId(group.categoryId)
            }}
            onDragLeave={() => {
              if (dragOverBlockCategoryId === group.categoryId) setDragOverBlockCategoryId(null)
            }}
            onDrop={(event) => {
              event.preventDefault()
              handleBlockDrop(group.categoryId)
            }}
            onDragEnd={() => {
              setDraggingBlockCategoryId(null)
              setDragOverBlockCategoryId(null)
            }}
            style={{
              display: 'grid',
              gap: '6px',
              cursor: savingSequence ? 'wait' : 'grab',
              opacity: draggingBlockCategoryId === group.categoryId ? 0.72 : 1,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '12px',
                border:
                  dragOverBlockCategoryId === group.categoryId && draggingBlockCategoryId !== group.categoryId
                    ? '2px solid #2563eb'
                    : '1px solid #dbeafe',
                background:
                  dragOverBlockCategoryId === group.categoryId && draggingBlockCategoryId !== group.categoryId
                    ? '#dbeafe'
                    : '#f8fbff',
                boxShadow:
                  dragOverBlockCategoryId === group.categoryId && draggingBlockCategoryId !== group.categoryId
                    ? '0 12px 28px rgba(37, 99, 235, 0.18)'
                    : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#2563eb' }}>
                  Drag Block
                </span>
                <span style={{ fontSize: '16px', fontWeight: 950, color: '#0f172a' }}>
                  {categoryLabel.get(group.categoryId) || group.categoryId}
                </span>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                  padding: '5px 9px',
                  borderRadius: '999px',
                  background: '#dbeafe',
                  color: '#1d4ed8',
                  fontSize: '11px',
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                <span>{group.motos.length} motos</span>
                <span>
                  Global #{group.startIndex + 1}
                  {group.motos.length > 1 ? `-${group.startIndex + group.motos.length}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => moveBlock(group.categoryId, -1)}
                  disabled={savingSequence || groupIndex === 0}
                  title="Naikkan block kategori"
                  style={{
                    border: '1px solid #93c5fd',
                    borderRadius: '999px',
                    background: '#fff',
                    color: '#1d4ed8',
                    cursor: savingSequence || groupIndex === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 10,
                    fontWeight: 950,
                    opacity: savingSequence || groupIndex === 0 ? 0.45 : 1,
                    padding: '3px 7px',
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(group.categoryId, 1)}
                  disabled={savingSequence || groupIndex === activeMotoGroups.length - 1}
                  title="Turunkan block kategori"
                  style={{
                    border: '1px solid #93c5fd',
                    borderRadius: '999px',
                    background: '#fff',
                    color: '#1d4ed8',
                    cursor: savingSequence || groupIndex === activeMotoGroups.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: 10,
                    fontWeight: 950,
                    opacity: savingSequence || groupIndex === activeMotoGroups.length - 1 ? 0.45 : 1,
                    padding: '3px 7px',
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(group.categoryId, 'top')}
                  disabled={savingSequence || groupIndex === 0}
                  title="Pindahkan block ke paling atas"
                  style={{
                    border: '1px solid #93c5fd',
                    borderRadius: '999px',
                    background: '#fff',
                    color: '#1d4ed8',
                    cursor: savingSequence || groupIndex === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 10,
                    fontWeight: 950,
                    opacity: savingSequence || groupIndex === 0 ? 0.45 : 1,
                    padding: '3px 7px',
                  }}
                >
                  Top
                </button>
                <button
                  type="button"
                  onClick={() => moveBlock(group.categoryId, 'bottom')}
                  disabled={savingSequence || groupIndex === activeMotoGroups.length - 1}
                  title="Pindahkan block ke paling bawah"
                  style={{
                    border: '1px solid #93c5fd',
                    borderRadius: '999px',
                    background: '#fff',
                    color: '#1d4ed8',
                    cursor: savingSequence || groupIndex === activeMotoGroups.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: 10,
                    fontWeight: 950,
                    opacity: savingSequence || groupIndex === activeMotoGroups.length - 1 ? 0.45 : 1,
                    padding: '3px 7px',
                  }}
                >
                  Bottom
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '6px' }}>
              {group.motos.map((moto, index) =>
                renderMotoRow(moto, group.startIndex + index, activeMotoSequence.length)
              )}
            </div>
          </div>
        ))}
      </div>

      {lockedMotoGroups.length > 0 && (
        <div style={{ marginTop: '28px', display: 'grid', gap: '12px' }}>
          <div
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: '14px',
              background: '#f8fafc',
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#475569' }}>
              Locked Motos
            </div>
            <div style={{ marginTop: '6px', fontSize: '14px', fontWeight: 700, color: '#64748b' }}>
              Moto yang sudah selesai dan terkunci dipindahkan ke bawah supaya antrian aktif tetap bersih.
            </div>
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {lockedMotoGroups.map((group) => (
              <div key={`locked-group-${group.categoryId}-${group.startIndex}`} style={{ display: 'grid', gap: '6px' }}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    padding: '6px 10px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 950, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>
                      Locked
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 950, color: '#0f172a' }}>
                      {categoryLabel.get(group.categoryId) || group.categoryId}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 9px',
                      borderRadius: '999px',
                      background: '#e2e8f0',
                      color: '#475569',
                      fontSize: '11px',
                      fontWeight: 900,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span>{group.motos.length} motos</span>
                    <span>
                      Locked #{group.startIndex + 1}
                      {group.motos.length > 1 ? `-${group.startIndex + group.motos.length}` : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '6px' }}>
                  {group.motos.map((moto, index) =>
                    renderMotoRow(moto, group.startIndex + index, lockedMotoSequence.length, {
                      lockedSection: true,
                      labelPrefix: 'Locked',
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
