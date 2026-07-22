'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { compareMotoDisplayOrder, formatMotoDisplayName } from '../../../../../lib/motoDisplayOrder'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
  sequence_order?: number | null
}

type AdvancedConfigItem = {
  category_id: string
  enabled: boolean
}

type AdvancedSummaryItem = {
  stageCounts: Record<string, number>
  motoCounts: { quarter: number; repechage: number; semi: number; final: number }
  readiness: {
    totalRiders: number
    requiresQualification: boolean
    qualificationTotalBatches: number
    qualificationCompleteBatches: number
    qualificationReady: boolean
    qualificationRun: boolean
    quarterReady: boolean
    repechageReady: boolean
    semiReady: boolean
    canRunQualification: boolean
    canComputeAdvances: boolean
    allQualificationLocked: boolean
    allCategoryMotosLocked: boolean
  }
}

type StatusChip = {
  label: string
  tone: 'green' | 'blue' | 'amber' | 'slate'
}

function MotoListSkeleton() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <section key={index} className="admin-card grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-2">
              <div className="admin-skeleton h-7 w-48" />
              <div className="admin-skeleton h-4 w-32" />
            </div>
            <div className="admin-skeleton h-9 w-36 rounded-full" />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="admin-skeleton h-24" />
            <div className="admin-skeleton h-24" />
            <div className="admin-skeleton h-24" />
            <div className="admin-skeleton h-24" />
          </div>
        </section>
      ))}
    </div>
  )
}

type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published?: boolean | null
  published_at?: string | null
  provisional_at?: string | null
  checker_prep_ready_at?: string | null
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

const shouldPollMotos = (eventStatus: string | null, autoRefreshEnabled: boolean) => {
  return autoRefreshEnabled && eventStatus === 'LIVE'
}

const safeFilename = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'event'

const timestampForFilename = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')

const getAllowedMotoStatuses = (current: MotoItem['status']) => {
  switch (current) {
    case 'UPCOMING':
      return ['UPCOMING', 'READY', 'LIVE'] as MotoItem['status'][]
    case 'READY':
      return ['UPCOMING', 'READY', 'LIVE'] as MotoItem['status'][]
    case 'LIVE':
      return ['UPCOMING', 'LIVE', 'PROVISIONAL'] as MotoItem['status'][]
    case 'PROVISIONAL':
      return ['UPCOMING', 'PROVISIONAL'] as MotoItem['status'][]
    case 'PROTEST_REVIEW':
      return ['PROTEST_REVIEW'] as MotoItem['status'][]
    case 'LOCKED':
      return ['LOCKED'] as MotoItem['status'][]
    case 'FINISHED':
      return ['FINISHED'] as MotoItem['status'][]
    default:
      return [current]
  }
}

const parseMotoBatch = (motoName: string) => {
  const match = motoName.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return { motoNo: 0, batchNo: 0 }
  return {
    motoNo: Number(match[1] ?? 0),
    batchNo: Number(match[2] ?? 0),
  }
}

const getCheckerPrepBadge = (moto: MotoItem) => {
  if (moto.status !== 'UPCOMING' && moto.status !== 'READY') return null
  if (moto.status === 'READY' || moto.checker_prep_ready_at) {
    return {
      label: 'READY',
      background: '#dcfce7',
      color: '#14532d',
      borderColor: '#16a34a',
    }
  }
  return {
    label: 'BELUM DICEK',
    background: '#fef3c7',
    color: '#92400e',
    borderColor: '#f59e0b',
  }
}

export default function MotosClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [gateOrdersByCategory, setGateOrdersByCategory] = useState<Record<string, GateMotoItem[]>>({})
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([])
  const [showMotoRiderList, setShowMotoRiderList] = useState(false)
  const [loadingGateOrders, setLoadingGateOrders] = useState(false)
  const [loadedGateOrderCategoryIds, setLoadedGateOrderCategoryIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [exportingMotoExcel, setExportingMotoExcel] = useState(false)
  const [exportingMotoWord, setExportingMotoWord] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [eventStatus, setEventStatus] = useState<'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED' | null>(null)
  const [eventName, setEventName] = useState('Event')
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
  const [advancedEnabledByCategory, setAdvancedEnabledByCategory] = useState<Record<string, boolean>>({})
  const [advancedSummaryByCategory, setAdvancedSummaryByCategory] = useState<Record<string, AdvancedSummaryItem>>({})
  const [computingCategoryId, setComputingCategoryId] = useState<string | null>(null)

  const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Request failed')

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { cache: 'no-store', ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const loadGateOrders = async (categoryIds: string[], options: { force?: boolean } = {}) => {
    const uniqueCategoryIds = Array.from(new Set(categoryIds.filter(Boolean)))
    if (uniqueCategoryIds.length === 0) {
      return gateOrdersByCategory
    }
    const loadedSet = new Set(loadedGateOrderCategoryIds)
    const idsToLoad = options.force ? uniqueCategoryIds : uniqueCategoryIds.filter((categoryId) => !loadedSet.has(categoryId))
    if (idsToLoad.length === 0) return gateOrdersByCategory

    setLoadingGateOrders(true)
    try {
      const entries = await Promise.all(
        idsToLoad.map(async (categoryId) => {
          const res = await fetch(`/api/events/${eventId}/gate-order?categoryId=${categoryId}`, { cache: 'no-store' })
          const json = await res.json().catch(() => ({}))
          const rows = (res.ok ? json?.data ?? [] : []) as GateMotoItem[]
          return [categoryId, [...rows].sort(compareMotoDisplayOrder)] as const
        })
      )
      const nextMap = { ...gateOrdersByCategory }
      for (const [categoryId, rows] of entries) nextMap[categoryId] = rows
      setGateOrdersByCategory((prev) => {
        const next = { ...prev }
        for (const [categoryId, rows] of entries) next[categoryId] = rows
        return next
      })
      setLoadedGateOrderCategoryIds((prev) => Array.from(new Set([...prev, ...idsToLoad])))
      return nextMap
    } finally {
      setLoadingGateOrders(false)
    }
  }

  const load = async (
    mode: 'initial' | 'refresh' = 'initial',
    options: { includeAdvancedSummary?: boolean } = {}
  ) => {
    if (!eventId) return
    const includeAdvancedSummary = options.includeAdvancedSummary ?? true
    if (mode === 'initial' && !hasLoadedOnce) setLoading(true)
    else setRefreshing(true)
    try {
      const nonce = Date.now()
      const [catRes, eventJson, advancedJson, motoRes, advancedSummaryJson] = await Promise.all([
        fetch(`/api/events/${eventId}/categories?_=${nonce}`, { cache: 'no-store' }),
        apiFetch(`/api/events/${eventId}`),
        apiFetch(`/api/events/${eventId}/advanced-race`),
        fetch(`/api/motos?event_id=${eventId}&_=${nonce}`, { cache: 'no-store' }),
        includeAdvancedSummary ? apiFetch(`/api/events/${eventId}/advanced-race/summary`) : Promise.resolve(null),
      ])

      const catJson = await catRes.json()
      const enabledCategories = (catJson.data ?? []).filter((c: CategoryItem) => c.enabled)
      setCategories(enabledCategories)

      setEventStatus(eventJson?.data?.status ?? null)
      setEventName(eventJson?.data?.name ?? 'Event')

      const enabledMap: Record<string, boolean> = {}
      for (const row of (advancedJson?.data?.configs ?? []) as AdvancedConfigItem[]) {
        enabledMap[row.category_id] = Boolean(row.enabled)
      }
      setAdvancedEnabledByCategory(enabledMap)
      if (advancedSummaryJson) {
        setAdvancedSummaryByCategory((advancedSummaryJson?.data ?? {}) as Record<string, AdvancedSummaryItem>)
      }

      const motoJson = await motoRes.json()
      const motoRows = (motoJson.data ?? []) as MotoItem[]
      setMotos(motoRows)
      setHiddenCategoryIds([])
      if (showMotoRiderList) {
        const categoryIds = Array.from(new Set(motoRows.map((m) => m.category_id))).filter(Boolean)
        await loadGateOrders(categoryIds, { force: mode === 'refresh' })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
      setHasLoadedOnce(true)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    if (!shouldPollMotos(eventStatus, autoRefreshEnabled)) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void load('refresh', { includeAdvancedSummary: false })
    }, 15000)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, eventStatus, autoRefreshEnabled])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.label)
    }
    return map
  }, [categories])

  const categoriesSorted = useMemo(() => {
    return [...categories].sort((a, b) => {
      const firstMotoOrder = (categoryId: string) => {
        const orders = motos
          .filter((moto) => moto.category_id === categoryId)
          .map((moto) => moto.moto_order)
          .filter((order) => Number.isFinite(order))
        return orders.length > 0 ? Math.min(...orders) : Number.MAX_SAFE_INTEGER
      }
      const aFirstMoto = firstMotoOrder(a.id)
      const bFirstMoto = firstMotoOrder(b.id)
      if (aFirstMoto !== bFirstMoto) return aFirstMoto - bFirstMoto

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
      const ag = order[a.gender] ?? 9
      const bg = order[b.gender] ?? 9
      return ag - bg
    })
  }, [categories, motos])

  const motosByCategory = useMemo(() => {
    const grouped = new Map<string, MotoItem[]>()
    for (const moto of motos) {
      const list = grouped.get(moto.category_id) ?? []
      list.push(moto)
      grouped.set(moto.category_id, list)
    }
    for (const list of grouped.values()) {
      list.sort(compareMotoDisplayOrder)
    }
    return grouped
  }, [motos])

  const motoCategoryIds = useMemo(
    () => Array.from(new Set(motos.map((moto) => moto.category_id).filter(Boolean))),
    [motos]
  )

  const isCategoryComplete = useCallback(
    (categoryId: string) => {
      const list = motosByCategory.get(categoryId) ?? []
      return list.length > 0 && list.every((moto) => moto.status === 'LOCKED')
    },
    [motosByCategory]
  )

  const displayCategoriesSorted = useMemo(() => {
    return [...categoriesSorted].sort((a, b) => {
      const aComplete = isCategoryComplete(a.id)
      const bComplete = isCategoryComplete(b.id)
      if (aComplete !== bComplete) return aComplete ? 1 : -1
      return 0
    })
  }, [categoriesSorted, isCategoryComplete])

  useEffect(() => {
    const completedCategoryIds = categories
      .filter((category) => isCategoryComplete(category.id))
      .map((category) => category.id)
    if (completedCategoryIds.length === 0) return
    setHiddenCategoryIds((prev) => Array.from(new Set([...prev, ...completedCategoryIds])))
  }, [categories, isCategoryComplete])

  const buildPrintGroups = useCallback((gateMap: Record<string, GateMotoItem[]>) => {
    return categoriesSorted
      .map((category) => {
        const rows = gateMap[category.id] ?? []
        if (rows.length === 0) return null

        const batchMap = new Map<number, GateMotoItem[]>()
        for (const row of rows) {
          const { batchNo } = parseMotoBatch(row.moto_name)
          const key = batchNo > 0 ? batchNo : 1
          const list = batchMap.get(key) ?? []
          list.push(row)
          batchMap.set(key, list)
        }

        const batches = Array.from(batchMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([batchNo, batchRows]) => ({
            batchNo,
            motos: batchRows.sort((a, b) => {
              const pa = parseMotoBatch(a.moto_name)
              const pb = parseMotoBatch(b.moto_name)
              if (pa.motoNo !== pb.motoNo) return pa.motoNo - pb.motoNo
              return compareMotoDisplayOrder(a, b)
            }),
          }))
          .map((batch) => {
            const motoColumns = batch.motos.map((moto, idx) => {
              const parsed = parseMotoBatch(moto.moto_name)
              const motoNo = parsed.motoNo > 0 ? parsed.motoNo : idx + 1
              return {
                key: motoNo,
                label: `M${motoNo}`,
                moto_name: moto.moto_name,
                status: moto.status,
              }
            })

            const rowMap = new Map<
              string,
              {
                rider_id: string
                name: string
                no_plate_display: string
                club: string | null
                gates: Record<number, number>
              }
            >()

            for (let i = 0; i < batch.motos.length; i += 1) {
              const moto = batch.motos[i]
              const col = motoColumns[i]
              for (const gate of moto.gates) {
                const existing = rowMap.get(gate.rider_id)
                if (existing) {
                  existing.gates[col.key] = gate.gate_position
                } else {
                  rowMap.set(gate.rider_id, {
                    rider_id: gate.rider_id,
                    name: gate.name,
                    no_plate_display: gate.no_plate_display,
                    club: gate.club ?? null,
                    gates: { [col.key]: gate.gate_position },
                  })
                }
              }
            }

            const firstCol = motoColumns[0]?.key
            const riderRows = Array.from(rowMap.values()).sort((a, b) => {
              const ga = firstCol ? (a.gates[firstCol] ?? 999) : 999
              const gb = firstCol ? (b.gates[firstCol] ?? 999) : 999
              if (ga !== gb) return ga - gb
              return a.name.localeCompare(b.name)
            })

            return {
              batchNo: batch.batchNo,
              motoColumns,
              riderRows,
            }
          })

        return {
          categoryId: category.id,
          categoryLabel: category.label,
          batches,
        }
      })
      .filter(Boolean) as Array<{
      categoryId: string
      categoryLabel: string
      batches: Array<{
        batchNo: number
        motoColumns: Array<{ key: number; label: string; moto_name: string; status: MotoItem['status'] }>
        riderRows: Array<{ rider_id: string; name: string; no_plate_display: string; club: string | null; gates: Record<number, number> }>
      }>
    }>
  }, [categoriesSorted])

  const printGroups = useMemo(() => buildPrintGroups(gateOrdersByCategory), [buildPrintGroups, gateOrdersByCategory])

  const allGateOrdersLoaded = motoCategoryIds.length > 0 && motoCategoryIds.every((categoryId) =>
    loadedGateOrderCategoryIds.includes(categoryId)
  )

  const handleToggleMotoRiderList = async () => {
    const nextShow = !showMotoRiderList
    setShowMotoRiderList(nextShow)
    if (nextShow) {
      await loadGateOrders(motoCategoryIds)
    }
  }

  const ensureGateOrdersLoaded = async () => {
    if (!allGateOrdersLoaded) {
      return loadGateOrders(motoCategoryIds)
    }
    return gateOrdersByCategory
  }

  const handleUpdateMotoStatus = async (motoId: string, status: MotoItem['status']) => {
    try {
      const moto = motos.find((item) => item.id === motoId)
      if (!moto || moto.status === status) return

      if (status === 'LOCKED') {
        await handleLockMoto(motoId)
        return
      } else {
        await apiFetch(`/api/motos/${motoId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        })
      }
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleOpenReview = async (motoId: string) => {
    try {
      await apiFetch(`/api/jury/motos/${motoId}/open-review`, { method: 'POST' })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleLockMoto = async (motoId: string) => {
    const moto = motos.find((m) => m.id === motoId)
    if (!moto) return

    const ok = confirm(
      `Lock moto: ${formatMotoDisplayName(moto.moto_name)}?\n\nSetelah LOCKED, hasil dianggap final. Auto-live moto berikutnya sekarang dipicu saat hasil submit PROVISIONAL atau saat checker menekan Moto Ready.`
    )
    if (!ok) return

    try {
      await apiFetch(`/api/motos/${motoId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'LOCKED' }),
      })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleUnlockMoto = async (motoId: string) => {
    const moto = motos.find((m) => m.id === motoId)
    if (!moto) return

    const ok = confirm(`Unlock moto: ${formatMotoDisplayName(moto.moto_name)}? Moto akan kembali ke status PROVISIONAL.`)
    if (!ok) return

    try {
      await apiFetch(`/api/motos/${motoId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'PROVISIONAL' }),
      })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleResetResults = async (motoId: string) => {
    const moto = motos.find((m) => m.id === motoId)
    if (!moto) return

    const currentStatus = String(moto.status ?? '').toUpperCase()
    if (currentStatus === 'LOCKED') {
      alert('Moto masih LOCKED. Unlock dulu sebelum reset results.')
      return
    }
    if (currentStatus === 'PROTEST_REVIEW') {
      alert('Moto sedang PROTEST_REVIEW. Selesaikan review dulu sebelum reset.')
      return
    }

    const ok = confirm(`Reset results untuk moto: ${formatMotoDisplayName(moto.moto_name)}?`)
    if (!ok) return

    const reason = window.prompt('Alasan reset results moto ini', 'Perbaikan hasil input')
    if (reason === null) return

    try {
      await apiFetch(`/api/race-director/motos/${motoId}/reset-results`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() || 'Reset moto results' }),
      })
      alert('Results berhasil direset!')
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const toggleCategoryCard = (categoryId: string) => {
    setHiddenCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    )
  }

  const getComputeAction = (categoryId: string) => {
    const summary = advancedSummaryByCategory[categoryId]
    const readiness = summary?.readiness
    const advancedEnabled = advancedEnabledByCategory[categoryId] ?? false

    if (!advancedEnabled) {
      return {
        visible: false,
        label: '',
        description: 'Advanced Stage belum aktif untuk kategori ini.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (!readiness) {
      return {
        visible: true,
        label: 'Memuat Status Compute...',
        description: 'Mengambil readiness kategori ini.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (!readiness.requiresQualification) {
      return {
        visible: true,
        label: '1 Batch - Tanpa Compute',
        description: `Kategori ini ${readiness.totalRiders} rider / 1 batch, jadi stage compute tidak diperlukan.`,
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (!readiness.qualificationRun) {
      return {
        visible: true,
        label: 'Run Qualification',
        description: readiness.qualificationReady
          ? 'Hitung hasil qualification dan bentuk stage awal kategori ini.'
          : `Lengkapi Moto 1 dan Moto 2 semua batch dulu (${readiness.qualificationCompleteBatches}/${readiness.qualificationTotalBatches} batch complete).`,
        endpoint: 'compute' as const,
        disabled: !readiness.canRunQualification,
      }
    }

    if (summary?.motoCounts?.repechage > 0 && !readiness.repechageReady) {
      return {
        visible: true,
        label: 'Tunggu Repechage Selesai',
        description: 'Selesaikan semua heat repechage dulu, lalu compute lagi untuk lanjut ke stage berikutnya.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (summary?.motoCounts?.quarter > 0 && !readiness.quarterReady) {
      return {
        visible: true,
        label: 'Tunggu Quarter Final Selesai',
        description: 'Semua heat Quarter Final harus selesai dulu sebelum final bisa dibentuk.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (summary?.motoCounts?.semi > 0 && !readiness.semiReady) {
      return {
        visible: true,
        label: 'Tunggu Semi Final Selesai',
        description: 'Selesaikan Semi Final dulu sebelum compute final.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (readiness.canComputeAdvances) {
      if ((summary?.motoCounts?.repechage ?? 0) > 0 && readiness.repechageReady && !readiness.quarterReady) {
        return {
          visible: true,
          label: 'Compute Repechage -> Quarter Final',
          description: 'Masukkan winner repechage ke Quarter Final dan sinkronkan stage berikutnya.',
          endpoint: 'advance' as const,
          disabled: false,
        }
      }
      if ((summary?.motoCounts?.quarter ?? 0) > 0 && readiness.quarterReady) {
        return {
          visible: true,
          label: 'Compute Quarter Final -> Final',
          description: 'Bentuk final classes dari hasil Quarter Final kategori ini.',
          endpoint: 'advance' as const,
          disabled: false,
        }
      }
      if ((summary?.motoCounts?.semi ?? 0) > 0 && readiness.semiReady) {
        return {
          visible: true,
          label: 'Compute Semi Final -> Final',
          description: 'Bentuk final dari hasil Semi Final kategori ini.',
          endpoint: 'advance' as const,
          disabled: false,
        }
      }
      return {
        visible: true,
        label: 'Compute Stage Berikutnya',
        description: 'Sinkronkan progression stage kategori ini berdasarkan hasil terbaru.',
        endpoint: 'advance' as const,
        disabled: false,
      }
    }

    return {
      visible: true,
      label: 'Belum Siap Compute',
      description: 'Belum ada source stage yang lengkap untuk dihitung lanjut.',
      endpoint: null as null | 'compute' | 'advance',
      disabled: true,
    }
  }

  const handleComputeCategory = async (categoryId: string, endpoint: 'compute' | 'advance') => {
    try {
      setComputingCategoryId(categoryId)
      const res = await apiFetch(`/api/events/${eventId}/advanced-race/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (res?.warning) {
        alert(res.warning)
      } else {
        alert(endpoint === 'compute' ? 'Qualification berhasil dihitung.' : 'Stage berikutnya berhasil dihitung.')
      }
      await load('refresh', { includeAdvancedSummary: true })
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    } finally {
      setComputingCategoryId(null)
    }
  }

  const getCategoryStatusChips = (categoryId: string) => {
    const summary = advancedSummaryByCategory[categoryId]
    const readiness = summary?.readiness
    const advancedEnabled = advancedEnabledByCategory[categoryId] ?? false
    const chips: StatusChip[] = []

    if (!advancedEnabled) {
      chips.push({ label: 'Advanced OFF', tone: 'slate' })
      return chips
    }

    if (!readiness) {
      chips.push({ label: 'Loading Stage Status', tone: 'slate' })
      return chips
    }

    if (!readiness.requiresQualification) {
      chips.push({ label: '1 Batch', tone: 'blue' })
      return chips
    }

    if (!readiness.qualificationRun) {
      chips.push({
        label: readiness.qualificationReady
          ? 'Qualification Ready'
          : `Qualification ${readiness.qualificationCompleteBatches}/${readiness.qualificationTotalBatches}`,
        tone: readiness.qualificationReady ? 'green' : 'amber',
      })
      return chips
    }

    chips.push({ label: 'Qualification Done', tone: 'green' })

    if ((summary?.motoCounts?.repechage ?? 0) > 0) {
      chips.push({
        label: readiness.repechageReady ? 'Repechage Done' : 'Repechage Pending',
        tone: readiness.repechageReady ? 'green' : 'amber',
      })
    }

    if ((summary?.motoCounts?.quarter ?? 0) > 0) {
      chips.push({
        label: readiness.quarterReady ? 'Quarter Final Done' : 'Quarter Final Pending',
        tone: readiness.quarterReady ? 'green' : 'blue',
      })
    }

    if ((summary?.motoCounts?.semi ?? 0) > 0) {
      chips.push({
        label: readiness.semiReady ? 'Semi Final Done' : 'Semi Final Pending',
        tone: readiness.semiReady ? 'green' : 'blue',
      })
    }

    if ((summary?.motoCounts?.final ?? 0) > 0) {
      chips.push({ label: `Final ${summary.motoCounts.final}`, tone: 'slate' })
    }

    return chips
  }

  const handleExportMotoRidersExcel = async () => {
    const gateMap = await ensureGateOrdersLoaded()
    const exportGroups = buildPrintGroups(gateMap)
    if (exportGroups.length === 0) {
      alert('Belum ada data rider per moto yang bisa diexport.')
      return
    }

    setExportingMotoExcel(true)
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()

      const summaryRows: Array<Array<string | number>> = [
        ['Event', eventName],
        ['Export', 'Data Rider Per Moto'],
        ['Total Kategori', exportGroups.length],
        [],
        ['Kategori', 'Jumlah Batch', 'Jumlah Moto', 'Jumlah Rider Unik'],
      ]

      const detailRows: Array<Array<string | number>> = [
        ['Event', eventName],
        ['Export', 'Data Rider Per Moto - Dibagi Per Batch'],
        [],
      ]

      for (const group of exportGroups) {
        const uniqueRiderIds = new Set<string>()
        const motoCount = group.batches.reduce((total, batch) => total + batch.motoColumns.length, 0)

        for (const batch of group.batches) {
          const motoMeta = batch.motoColumns.map((motoColumn) =>
            `${motoColumn.label}: ${formatMotoDisplayName(motoColumn.moto_name)} (${motoColumn.status})`
          )
          detailRows.push([group.categoryLabel])
          detailRows.push([`Batch ${batch.batchNo}`, ...motoMeta])
          detailRows.push([
            ...batch.motoColumns.map((motoColumn) => `Gate ${motoColumn.label}`),
            'No Plate',
            'Nama Rider',
            'Komunitas',
          ])

          for (const row of batch.riderRows) {
            uniqueRiderIds.add(row.rider_id)
            detailRows.push([
              ...batch.motoColumns.map((motoColumn) => row.gates[motoColumn.key] ?? ''),
              row.no_plate_display,
              row.name,
              row.club ?? '',
            ])
          }

          if (batch.riderRows.length === 0) detailRows.push(['Belum ada rider pada batch ini.'])
          detailRows.push([])
        }

        summaryRows.push([
          group.categoryLabel,
          group.batches.length,
          motoCount,
          uniqueRiderIds.size,
        ])
      }

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
      const detailSheet = XLSX.utils.aoa_to_sheet(detailRows)
      summarySheet['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 18 }]
      detailSheet['!cols'] = [
        { wch: 8 },
        { wch: 8 },
        { wch: 8 },
        { wch: 12 },
        { wch: 30 },
        { wch: 28 },
      ]

      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ringkasan')
      XLSX.utils.book_append_sheet(workbook, detailSheet, 'Rider Per Moto')
      XLSX.writeFile(workbook, `rider-per-moto_${safeFilename(eventName)}_${timestampForFilename()}.xlsx`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal export Excel rider per moto.')
    } finally {
      setExportingMotoExcel(false)
    }
  }

  const handleExportMotoRidersWord = async () => {
    const gateMap = await ensureGateOrdersLoaded()
    const exportGroups = buildPrintGroups(gateMap)
    if (exportGroups.length === 0) {
      alert('Belum ada data rider per moto yang bisa diexport.')
      return
    }

    setExportingMotoWord(true)
    try {
      const {
        AlignmentType,
        BorderStyle,
        Document,
        HeadingLevel,
        Packer,
        Paragraph,
        Table,
        TableCell,
        TableRow,
        TextRun,
        WidthType,
      } = await import('docx')

      const cell = (value: unknown, opts: { bold?: boolean; fill?: string; color?: string } = {}) =>
        new TableCell({
          shading: opts.fill ? { fill: opts.fill } : undefined,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'D9E2EF' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'D9E2EF' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'D9E2EF' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'D9E2EF' },
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: String(value ?? ''),
                  bold: opts.bold,
                  color: opts.color ?? '111827',
                  size: 18,
                }),
              ],
            }),
          ],
        })

      const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `Data Rider Per Moto`, bold: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 360 },
          children: [new TextRun({ text: eventName, bold: true, color: '92400E' })],
        }),
      ]

      for (const group of exportGroups) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 280, after: 120 },
            children: [new TextRun({ text: group.categoryLabel, bold: true, color: '111827' })],
          })
        )

        for (const batch of group.batches) {
          const headers = [
            ...batch.motoColumns.map((motoColumn) => `Gate ${motoColumn.label}`),
            'No Plate',
            'Nama Rider',
            'Komunitas',
          ]
          const rows = batch.riderRows.length
            ? batch.riderRows.map((row) => [
                ...batch.motoColumns.map((motoColumn) => row.gates[motoColumn.key] ?? ''),
                row.no_plate_display,
                row.name,
                row.club ?? '',
              ])
            : [['Belum ada rider pada batch ini.', ...Array(Math.max(headers.length - 1, 0)).fill('')]]

          children.push(
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 180, after: 80 },
              children: [new TextRun({ text: `Batch ${batch.batchNo}`, bold: true, color: '1D4ED8' })],
            }),
            new Paragraph({
              spacing: { after: 120 },
              children: [
                new TextRun({
                  text: batch.motoColumns
                    .map((motoColumn) => `${motoColumn.label}: ${formatMotoDisplayName(motoColumn.moto_name)} (${motoColumn.status})`)
                    .join('  |  '),
                  italics: true,
                  color: '475569',
                  size: 18,
                }),
              ],
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  tableHeader: true,
                  children: headers.map((header) => cell(header, { bold: true, fill: 'FEF3C7', color: '111827' })),
                }),
                ...rows.map((row) =>
                  new TableRow({
                    children: row.map((value) => cell(value)),
                  })
                ),
              ],
            })
          )
        }
      }

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 720, right: 540, bottom: 720, left: 540 },
              },
            },
            children,
          },
        ],
      })
      const blob = await Packer.toBlob(doc)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `rider-per-moto_${safeFilename(eventName)}_${timestampForFilename()}.docx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal export Word rider per moto.')
    } finally {
      setExportingMotoWord(false)
    }
  }

  const isAutoRefreshActive = shouldPollMotos(eventStatus, autoRefreshEnabled)

  return (
    <div style={{ maxWidth: 980, width: '100%' }} className="admin-compact-page motos-print-root">
      <div className="no-print motos-topbar" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Motos</h1>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#475569' }}>{eventName}</div>
        </div>
        <div className="motos-global-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setAutoRefreshEnabled((value) => !value)}
            className={isAutoRefreshActive ? 'admin-primary-button' : 'admin-outline-button'}
            style={{
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: isAutoRefreshActive ? '#16a34a' : undefined,
              borderColor: isAutoRefreshActive ? '#14532d' : undefined,
            }}
            title={
              eventStatus === 'LIVE'
                ? 'Aktif/nonaktifkan polling otomatis halaman motos.'
                : 'Auto refresh hanya berjalan saat event LIVE.'
            }
          >
            {isAutoRefreshActive ? 'Auto Refresh ON' : 'Auto Refresh OFF'}
          </button>
          <button
            type="button"
            onClick={() => load('refresh', { includeAdvancedSummary: true })}
            disabled={loading || refreshing}
            className="admin-primary-button"
            style={{
              cursor: loading || refreshing ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: loading || refreshing ? 0.6 : 1,
            }}
          >
            {loading || refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <button
            type="button"
            onClick={() => void handleExportMotoRidersWord()}
            disabled={exportingMotoExcel || exportingMotoWord || loadingGateOrders}
            className="admin-outline-button"
            style={{
              cursor: exportingMotoExcel || exportingMotoWord || loadingGateOrders ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: exportingMotoExcel || exportingMotoWord || loadingGateOrders ? 0.6 : 1,
            }}
            title={!allGateOrdersLoaded ? 'Klik untuk memuat data gate lalu export.' : undefined}
          >
            {exportingMotoWord ? 'Preparing DOCX...' : !allGateOrdersLoaded ? 'Load & Export DOCX' : 'Word DOCX Rider Per Moto'}
          </button>
          <button
            type="button"
            onClick={() => void handleExportMotoRidersExcel()}
            disabled={exportingMotoExcel || exportingMotoWord || loadingGateOrders}
            className="admin-outline-button"
            style={{
              cursor: exportingMotoExcel || exportingMotoWord || loadingGateOrders ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: exportingMotoExcel || exportingMotoWord || loadingGateOrders ? 0.6 : 1,
            }}
            title={!allGateOrdersLoaded ? 'Klik untuk memuat data gate lalu export.' : undefined}
          >
            {exportingMotoExcel ? 'Preparing XLSX...' : !allGateOrdersLoaded ? 'Load & Export XLSX' : 'Excel Rider Per Moto'}
          </button>
        </div>
      </div>
      <div
        className="no-print"
        style={{
          marginTop: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 999,
          border: '2px solid #111',
          background: '#ecfccb',
          fontWeight: 900,
          fontSize: 12,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: '#16a34a',
            display: 'inline-block',
          }}
        />
        Flow prep: checker menekan Moto Ready untuk mengubah moto menjadi READY. Moto READY belum race; status ini menjadi syarat sebelum moto masuk LIVE.
      </div>
      {eventStatus && eventStatus !== 'LIVE' && (
        <div
          className="no-print"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: '2px dashed #111',
            background: '#fff',
            fontWeight: 900,
          }}
        >
          Status event saat ini: {eventStatus}. Update status moto hanya bisa ketika event LIVE.
        </div>
      )}


      <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
        {loading && motos.length === 0 && (
          <div className="no-print">
            <MotoListSkeleton />
          </div>
        )}

        {!loading && motos.length === 0 && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Belum ada moto.
          </div>
        )}

        {displayCategoriesSorted.map((cat) => {
          const list = motosByCategory.get(cat.id) ?? []
          if (list.length === 0) return null
          const isHidden = hiddenCategoryIds.includes(cat.id)
          const isComplete = isCategoryComplete(cat.id)
          const computeAction = getComputeAction(cat.id)
          const summary = advancedSummaryByCategory[cat.id]
          const statusChips = getCategoryStatusChips(cat.id)
          return (
          <div
            key={cat.id}
            className="moto-category-card"
            style={{
              padding: 14,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              display: 'grid',
              gap: 10,
            }}
          >
            <div className="motos-category-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 950, fontSize: 18 }}>
                  {categoryLabel.get(cat.id) ?? `Category ${cat.id}`}
                </div>
                {isComplete && (
                  <div
                    className="no-print"
                    style={{
                      width: 'fit-content',
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: '1px solid #86efac',
                      background: '#f0fdf4',
                      color: '#166534',
                      fontSize: 11,
                      fontWeight: 950,
                    }}
                  >
                    SELESAI / LOCKED
                  </div>
                )}
                {statusChips.length > 0 && (
                  <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {statusChips.map((chip) => {
                      const toneStyles =
                        chip.tone === 'green'
                          ? { border: '#86efac', background: '#f0fdf4', color: '#166534' }
                          : chip.tone === 'blue'
                            ? { border: '#93c5fd', background: '#eff6ff', color: '#1d4ed8' }
                            : chip.tone === 'amber'
                              ? { border: '#fcd34d', background: '#fffbeb', color: '#b45309' }
                              : { border: '#cbd5e1', background: '#f8fafc', color: '#475569' }
                      return (
                        <span
                          key={`${cat.id}-header-${chip.label}`}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: `1px solid ${toneStyles.border}`,
                            background: toneStyles.background,
                            color: toneStyles.color,
                            fontSize: 11,
                            fontWeight: 900,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {chip.label}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="no-print motos-category-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      `/event/${eventId}/live-score/${encodeURIComponent(cat.id)}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: '2px solid #111',
                    background: '#dbeafe',
                    fontWeight: 900,
                    fontSize: 12,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open Public Result
                </button>
                <button
                  type="button"
                  onClick={() => toggleCategoryCard(cat.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: '2px solid #111',
                    background: '#f8fafc',
                    fontWeight: 900,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {isHidden ? 'Tampilkan' : 'Sembunyikan'}
                </button>
              </div>
            </div>
            {isHidden ? null : (
              <div style={{ display: 'grid', gap: 8 }}>
                {list.map((m) => (
                  <div
                    key={m.id}
                    className="moto-row-card"
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: '2px solid #111',
                      background: '#eaf7ee',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontWeight: 900 }}>
                        {m.moto_order}. {formatMotoDisplayName(m.moto_name)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontWeight: 800, fontSize: 12 }}>
                        <span>Status: {m.status}</span>
                        {(() => {
                          const prepBadge = getCheckerPrepBadge(m)
                          if (!prepBadge) return null
                          return (
                            <span
                              title={m.checker_prep_ready_at ? `Checker ready: ${new Date(m.checker_prep_ready_at).toLocaleString()}` : 'Checker belum klik Moto Ready'}
                              style={{
                                padding: '2px 8px',
                                borderRadius: 999,
                                border: `2px solid ${prepBadge.borderColor}`,
                                background: prepBadge.background,
                                color: prepBadge.color,
                                fontWeight: 950,
                              }}
                            >
                              {prepBadge.label}
                            </span>
                          )
                        })()}
                        {m.status === 'LIVE' && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              border: '2px solid #111',
                              background: '#bbf7d0',
                            }}
                          >
                            Auto Live Next
                          </span>
                        )}
                        {m.status === 'PROVISIONAL' && m.provisional_at && (
                          <span>Provisional: {new Date(m.provisional_at).toLocaleString()}</span>
                        )}
                        {m.is_published && m.published_at && (
                          <span>Published: {new Date(m.published_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="no-print motos-row-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        value={m.status}
                        onChange={(e) => handleUpdateMotoStatus(m.id, e.target.value as MotoItem['status'])}
                        disabled={eventStatus !== 'LIVE' || getAllowedMotoStatuses(m.status).length <= 1}
                        className="motos-status-select"
                        style={{ padding: '8px 10px', borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
                      >
                        {getAllowedMotoStatuses(m.status).map((statusOption) => (
                          <option key={`${m.id}-${statusOption}`} value={statusOption}>
                            {statusOption}
                          </option>
                        ))}
                      </select>
                      {m.status === 'PROVISIONAL' && (
                        <button
                          type="button"
                          onClick={() => handleOpenReview(m.id)}
                          disabled={eventStatus !== 'LIVE'}
                          className="motos-action-button"
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: '#fef3c7',
                            fontWeight: 900,
                            cursor: eventStatus === 'LIVE' ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Buka Review
                        </button>
                      )}
                      {(m.status === 'PROVISIONAL' || m.status === 'PROTEST_REVIEW') && (
                        <button
                          type="button"
                          onClick={() => handleLockMoto(m.id)}
                          disabled={eventStatus !== 'LIVE'}
                          className="motos-action-button"
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: '#d1fae5',
                            fontWeight: 900,
                            cursor: eventStatus === 'LIVE' ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Lock Moto
                        </button>
                      )}
                      {m.status === 'LOCKED' && (
                        <button
                          type="button"
                          onClick={() => handleUnlockMoto(m.id)}
                          disabled={eventStatus !== 'LIVE'}
                          className="motos-action-button"
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: '#e0f2fe',
                            fontWeight: 900,
                            cursor: eventStatus === 'LIVE' ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Unlock Moto
                        </button>
                      )}
                      {m.status !== 'LOCKED' && m.status !== 'PROTEST_REVIEW' && (
                        <button
                          type="button"
                          onClick={() => handleResetResults(m.id)}
                          className="motos-action-button"
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: '#fee2e2',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          Reset Result
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => window.open(`/event/${eventId}/live-score/${encodeURIComponent(m.category_id)}`, '_blank', 'noopener,noreferrer')}
                        className="motos-action-button"
                        style={{
                          padding: '8px 12px',
                          borderRadius: 999,
                          border: '2px solid #111',
                          background: '#dbeafe',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        Open Public Result
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {computeAction.visible && (
              <div
                className="no-print"
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: '2px solid #111',
                  background: '#f8fafc',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>Aksi Stage Kategori</div>
                    <div style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>{computeAction.description}</div>
                    {summary && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: '#475569' }}>
                        <span>Q: {summary.stageCounts?.QUALIFICATION ?? 0}</span>
                        <span>QF: {summary.stageCounts?.QUARTER_FINAL ?? 0}</span>
                        <span>REP: {summary.stageCounts?.REPECHAGE ?? 0}</span>
                        <span>SF: {summary.stageCounts?.SEMI_FINAL ?? 0}</span>
                        <span>F: {summary.stageCounts?.FINAL ?? 0}</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => computeAction.endpoint && handleComputeCategory(cat.id, computeAction.endpoint)}
                    disabled={computeAction.disabled || computingCategoryId === cat.id}
                    className="motos-compute-button"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: '2px solid #111',
                      background: computeAction.disabled ? '#e5e7eb' : '#dbeafe',
                      fontWeight: 900,
                      cursor: computeAction.disabled || computingCategoryId === cat.id ? 'not-allowed' : 'pointer',
                      minWidth: 220,
                    }}
                  >
                    {computingCategoryId === cat.id ? 'Memproses...' : computeAction.label}
                  </button>
                </div>
              </div>
            )}
          </div>
          )
        })}
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        <div
          className="no-print motos-rider-toggle"
          style={{
            padding: 12,
            borderRadius: 14,
            border: '2px solid #111',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 900, color: '#0f172a' }}>
            Daftar rider moto dimuat saat dibuka supaya halaman Motos lebih ringan.
          </div>
          <button
            type="button"
            onClick={() => void handleToggleMotoRiderList()}
            disabled={loadingGateOrders}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: '2px solid #111',
              background: '#f8fafc',
              fontWeight: 900,
              cursor: loadingGateOrders ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              opacity: loadingGateOrders ? 0.65 : 1,
            }}
          >
            {loadingGateOrders ? 'Memuat Rider...' : showMotoRiderList ? 'Sembunyikan Daftar Rider' : 'Tampilkan Daftar Rider'}
          </button>
        </div>

        {showMotoRiderList && !loadingGateOrders && printGroups.length === 0 && (
          <div
            className="no-print"
            style={{
              padding: 14,
              borderRadius: 14,
              border: '1px dashed #94a3b8',
              background: '#f8fafc',
              color: '#475569',
              fontWeight: 800,
            }}
          >
            Belum ada data rider/gate yang bisa ditampilkan.
          </div>
        )}

        {showMotoRiderList &&
          !loadingGateOrders &&
          printGroups.map((group) => (
          <section
            key={`print-${group.categoryId}`}
            className="moto-print-section"
            style={{
              padding: 14,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              color: '#0f172a',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 18 }}>Daftar Rider Moto - {group.categoryLabel}</div>
            {group.batches.map((batch) => (
              <div
                key={`${group.categoryId}-batch-${batch.batchNo}`}
                className="moto-print-batch"
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 900 }}>Batch {batch.batchNo}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {batch.motoColumns
                    .map((col) => `${col.label}: ${formatMotoDisplayName(col.moto_name)} (${col.status})`)
                    .join(' | ')}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="moto-print-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr>
                        {batch.motoColumns.map((col) => (
                          <th
                            key={`${group.categoryId}-batch-${batch.batchNo}-${col.key}`}
                            style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #cbd5e1', fontSize: 12 }}
                          >
                            Gate {col.label}
                          </th>
                        ))}
                        <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #cbd5e1', fontSize: 12 }}>
                          No Plate
                        </th>
                        <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #cbd5e1', fontSize: 12 }}>
                          Nama Rider
                        </th>
                        <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #cbd5e1', fontSize: 12 }}>
                          Komunitas
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.riderRows.map((row) => (
                        <tr key={`${group.categoryId}-batch-${batch.batchNo}-${row.rider_id}`}>
                          {batch.motoColumns.map((col) => (
                            <td
                              key={`${group.categoryId}-batch-${batch.batchNo}-${row.rider_id}-${col.key}`}
                              style={{ padding: '6px 4px', borderBottom: '1px dashed #e2e8f0', fontWeight: 800 }}
                            >
                              {row.gates[col.key] ?? '-'}
                            </td>
                          ))}
                          <td style={{ padding: '6px 4px', borderBottom: '1px dashed #e2e8f0', fontWeight: 800 }}>
                            {row.no_plate_display}
                          </td>
                          <td style={{ padding: '6px 4px', borderBottom: '1px dashed #e2e8f0', fontWeight: 800 }}>
                            {row.name}
                          </td>
                          <td style={{ padding: '6px 4px', borderBottom: '1px dashed #e2e8f0', fontWeight: 800 }}>
                            {row.club ?? '-'}
                          </td>
                        </tr>
                      ))}
                      {batch.riderRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={batch.motoColumns.length + 3}
                            style={{ padding: '8px 4px', color: '#64748b', fontWeight: 700 }}
                          >
                            Belum ada rider pada batch ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
          ))}
      </div>
      <style>{`
        @media (max-width: 860px) {
          .motos-print-root {
            max-width: none !important;
          }
          .motos-topbar,
          .motos-category-header,
          .motos-rider-toggle {
            align-items: stretch !important;
            flex-direction: column !important;
          }
          .motos-category-actions,
          .motos-row-actions,
          .motos-global-actions {
            align-items: stretch !important;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            width: 100% !important;
          }
          .moto-row-card {
            grid-template-columns: 1fr !important;
          }
          .motos-action-button,
          .motos-status-select,
          .motos-compute-button {
            min-width: 0 !important;
            width: 100% !important;
          }
          .motos-status-select {
            min-height: 42px !important;
          }
        }
        @media (max-width: 520px) {
          .motos-print-root {
            font-size: 14px;
          }
          .motos-category-card,
          .moto-print-section {
            padding: 10px !important;
            border-radius: 12px !important;
          }
          .moto-row-card {
            padding: 10px !important;
            border-radius: 12px !important;
          }
          .motos-category-actions,
          .motos-row-actions,
          .motos-global-actions {
            grid-template-columns: 1fr !important;
          }
          .motos-topbar button,
          .motos-action-button,
          .motos-status-select,
          .motos-compute-button {
            min-height: 44px !important;
          }
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .motos-print-root {
            max-width: none !important;
          }
          .moto-category-card,
          .moto-row-card,
          .moto-print-section,
          .moto-print-batch,
          .moto-print-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}

