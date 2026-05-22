'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildBrandedPrintHtml } from '../../../../../lib/printTheme'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
  plate_number?: string
  plate_suffix?: string | null
}

type BatchItem = {
  index: number
  riders: RiderItem[]
}

type BatchMode = 'AUTO_BY_GATE' | 'MANUAL_BATCH_COUNT'

type GateMoto = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  gates: Array<{
    gate_position: number
    rider_id: string
    name: string
    no_plate_display: string
  }>
}

type DrawMode = 'internal_live_draw' | 'external_draw'

const normalizeDrawMode = (value: unknown): DrawMode =>
  value === 'external_draw' ? 'external_draw' : 'internal_live_draw'

const normalizePlateToken = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, '')
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const parseExternalTokens = (value: string) =>
  value
    .split(/[\n,;]+/)
    .map((item) => normalizePlateToken(item.trim()))
    .filter(Boolean)

const shuffle = <T,>(input: T[]) => {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const buildBatches = (riders: RiderItem[], batchSize: number) => {
  const batches: BatchItem[] = []
  let cursor = 0
  let index = 1
  while (cursor < riders.length) {
    batches.push({ index, riders: riders.slice(cursor, cursor + batchSize) })
    cursor += batchSize
    index += 1
  }
  return batches
}

const chunk = <T,>(items: T[], size: number) => {
  const batches: T[][] = []
  let cursor = 0
  while (cursor < items.length) {
    batches.push(items.slice(cursor, cursor + size))
    cursor += size
  }
  return batches
}

const buildBatchesByCount = (riders: RiderItem[], batchCount: number) => {
  const safeCount = Math.max(1, batchCount)
  const total = riders.length
  if (total === 0) return []
  const baseSize = Math.floor(total / safeCount)
  const remainder = total % safeCount
  const batches: BatchItem[] = []
  let cursor = 0
  for (let index = 1; index <= safeCount; index += 1) {
    const size = baseSize + (index <= remainder ? 1 : 0)
    if (size <= 0) continue
    batches.push({ index, riders: riders.slice(cursor, cursor + size) })
    cursor += size
  }
  return batches
}

const parseMotoBatch = (motoName: string) => {
  const match = motoName.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return { motoNo: 0, batchNo: 0 }
  return {
    motoNo: Number(match[1] ?? 0),
    batchNo: Number(match[2] ?? 0),
  }
}

const sameSet = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size !== setB.size) return false
  for (const item of setA) {
    if (!setB.has(item)) return false
  }
  return true
}

type LiveDrawGuard = {
  canDelete: boolean
  reason: string | null
}

const formatMoto3Hint = (totalBatches: number) =>
  totalBatches === 1
    ? 'Moto 3 aktif: urutan gate random (diupayakan beda dari Moto 1 & Moto 2).'
    : 'Moto 3 tidak dipakai untuk konfigurasi draw kategori ini.'

export default function LiveDrawClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [eventName, setEventName] = useState('Event')
  const [drawing, setDrawing] = useState(false)
  const [drawnOrder, setDrawnOrder] = useState<RiderItem[]>([])
  const [batchSize, setBatchSize] = useState(8)
  const [batchMode, setBatchMode] = useState<BatchMode>('AUTO_BY_GATE')
  const [manualBatchCount, setManualBatchCount] = useState(1)
  const [gatePositions, setGatePositions] = useState(8)
  const [drawMode, setDrawMode] = useState<DrawMode>('internal_live_draw')
  const [rollingName, setRollingName] = useState<string>('Ready')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [wheelRiders, setWheelRiders] = useState<RiderItem[]>([])
  const [wheelRotation, setWheelRotation] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const printFrameRef = useRef<HTMLIFrameElement | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [lockedMotos, setLockedMotos] = useState<GateMoto[]>([])
  const [openMotoId, setOpenMotoId] = useState<string | null>(null)
  const [externalOrderText, setExternalOrderText] = useState('')
  const [externalMoto2OrderText, setExternalMoto2OrderText] = useState('')
  const [externalBatchInputMode, setExternalBatchInputMode] = useState<'GLOBAL' | 'PER_BATCH'>('GLOBAL')
  const [externalBatchTexts, setExternalBatchTexts] = useState<string[]>([])
  const [externalMoto2BatchTexts, setExternalMoto2BatchTexts] = useState<string[]>([])
  const [shareCopied, setShareCopied] = useState(false)
  const [resultModal, setResultModal] = useState<'draft' | 'saved' | null>(null)
  const [deleteGuard, setDeleteGuard] = useState<LiveDrawGuard>({ canDelete: true, reason: null })
  const spinTimeoutRef = useRef<number | null>(null)
  const rollingIntervalRef = useRef<number | null>(null)

  const effectiveBatchCount = useMemo(() => {
    if (batchMode !== 'MANUAL_BATCH_COUNT') return null
    const maxCount = Math.max(1, riders.length)
    return Math.max(1, Math.min(maxCount, manualBatchCount))
  }, [batchMode, manualBatchCount, riders.length])

  const batches = useMemo(() => {
    if (batchMode === 'MANUAL_BATCH_COUNT' && effectiveBatchCount) {
      return buildBatchesByCount(drawnOrder, effectiveBatchCount)
    }
    return buildBatches(drawnOrder, batchSize)
  }, [batchMode, drawnOrder, batchSize, effectiveBatchCount])
  const visibleWheelRiders = wheelRiders.length > 0 ? wheelRiders : riders
  const selectedCategoryLabel = useMemo(
    () => categories.find((category) => category.id === selectedCategory)?.label ?? 'Kategori',
    [categories, selectedCategory]
  )

  const externalValidation = useMemo(() => {
    const tokens = parseExternalTokens(externalOrderText)
    const riderByPlate = new Map<string, RiderItem>()
    for (const rider of riders) riderByPlate.set(normalizePlateToken(rider.no_plate_display), rider)

    const seenToken = new Set<string>()
    const usedRiderIds = new Set<string>()
    const duplicateTokens: string[] = []
    const unknownTokens: string[] = []
    const duplicateRiders: string[] = []
    const orderedRiders: RiderItem[] = []

    for (const token of tokens) {
      if (seenToken.has(token)) {
        duplicateTokens.push(token)
        continue
      }
      seenToken.add(token)
      const rider = riderByPlate.get(token)
      if (!rider) {
        unknownTokens.push(token)
        continue
      }
      if (usedRiderIds.has(rider.id)) {
        duplicateRiders.push(token)
        continue
      }
      usedRiderIds.add(rider.id)
      orderedRiders.push(rider)
    }

    const missingRiders = riders.filter((rider) => !usedRiderIds.has(rider.id))
    const isValid =
      riders.length > 0 &&
      orderedRiders.length === riders.length &&
      unknownTokens.length === 0 &&
      duplicateTokens.length === 0 &&
      duplicateRiders.length === 0 &&
      missingRiders.length === 0

    return {
      tokens,
      orderedRiders,
      duplicateTokens,
      unknownTokens,
      duplicateRiders,
      missingRiders,
      isValid,
    }
  }, [externalOrderText, riders])

  const externalMoto2Validation = useMemo(() => {
    const tokens = parseExternalTokens(externalMoto2OrderText)
    const isProvided = tokens.length > 0
    if (!isProvided) {
      return {
        isProvided: false,
        tokens: [] as string[],
        orderedRiders: [] as RiderItem[],
        duplicateTokens: [] as string[],
        unknownTokens: [] as string[],
        duplicateRiders: [] as string[],
        missingRiders: [] as RiderItem[],
        batchMismatch: [] as number[],
        isValidGlobal: true,
        isValidForMoto1: true,
      }
    }

    const riderByPlate = new Map<string, RiderItem>()
    for (const rider of riders) riderByPlate.set(normalizePlateToken(rider.no_plate_display), rider)

    const seenToken = new Set<string>()
    const usedRiderIds = new Set<string>()
    const duplicateTokens: string[] = []
    const unknownTokens: string[] = []
    const duplicateRiders: string[] = []
    const orderedRiders: RiderItem[] = []

    for (const token of tokens) {
      if (seenToken.has(token)) {
        duplicateTokens.push(token)
        continue
      }
      seenToken.add(token)
      const rider = riderByPlate.get(token)
      if (!rider) {
        unknownTokens.push(token)
        continue
      }
      if (usedRiderIds.has(rider.id)) {
        duplicateRiders.push(token)
        continue
      }
      usedRiderIds.add(rider.id)
      orderedRiders.push(rider)
    }

    const missingRiders = riders.filter((rider) => !usedRiderIds.has(rider.id))
    const isValidGlobal =
      riders.length > 0 &&
      orderedRiders.length === riders.length &&
      unknownTokens.length === 0 &&
      duplicateTokens.length === 0 &&
      duplicateRiders.length === 0 &&
      missingRiders.length === 0

    const moto1Reference = drawnOrder.length > 0 ? drawnOrder : externalValidation.orderedRiders
    const moto1ReferenceIds = moto1Reference.map((rider) => rider.id)
    const batchMismatch: number[] = []
    let isValidForMoto1 = false
    if (isValidGlobal && moto1ReferenceIds.length === riders.length) {
      const moto1Batches = chunk(moto1ReferenceIds, batchSize)
      const moto2Batches = chunk(
        orderedRiders.map((rider) => rider.id),
        batchSize
      )
      isValidForMoto1 = moto1Batches.length === moto2Batches.length
      if (isValidForMoto1) {
        for (let i = 0; i < moto1Batches.length; i += 1) {
          if (!sameSet(moto1Batches[i], moto2Batches[i] ?? [])) {
            batchMismatch.push(i + 1)
            isValidForMoto1 = false
          }
        }
      }
    }

    return {
      isProvided: true,
      tokens,
      orderedRiders,
      duplicateTokens,
      unknownTokens,
      duplicateRiders,
      missingRiders,
      batchMismatch,
      isValidGlobal,
      isValidForMoto1,
    }
  }, [externalMoto2OrderText, riders, drawnOrder, externalValidation.orderedRiders, batchSize])

  const externalPerBatchValidation = useMemo(() => {
    const count = effectiveBatchCount ?? Math.max(1, Math.ceil(riders.length / Math.max(4, batchSize)))
    const riderByPlate = new Map<string, RiderItem>()
    for (const rider of riders) riderByPlate.set(normalizePlateToken(rider.no_plate_display), rider)

    const seenRiderIds = new Set<string>()
    const duplicateTokens: string[] = []
    const unknownTokens: string[] = []
    const duplicateRiders: string[] = []
    const emptyBatches: number[] = []
    const orderedBatches: RiderItem[][] = []

    for (let batchIndex = 0; batchIndex < count; batchIndex += 1) {
      const tokens = parseExternalTokens(externalBatchTexts[batchIndex] ?? '')
      if (tokens.length === 0) {
        emptyBatches.push(batchIndex + 1)
        orderedBatches.push([])
        continue
      }
      const batchSeen = new Set<string>()
      const ordered: RiderItem[] = []
      for (const token of tokens) {
        if (batchSeen.has(token)) {
          duplicateTokens.push(`B${batchIndex + 1}:${token}`)
          continue
        }
        batchSeen.add(token)
        const rider = riderByPlate.get(token)
        if (!rider) {
          unknownTokens.push(`B${batchIndex + 1}:${token}`)
          continue
        }
        if (seenRiderIds.has(rider.id)) {
          duplicateRiders.push(`B${batchIndex + 1}:${token}`)
          continue
        }
        seenRiderIds.add(rider.id)
        ordered.push(rider)
      }
      orderedBatches.push(ordered)
    }

    const missingRiders = riders.filter((rider) => !seenRiderIds.has(rider.id))
    const allFilled = orderedBatches.every((batch) => batch.length > 0)
    const isValid =
      riders.length > 0 &&
      allFilled &&
      missingRiders.length === 0 &&
      unknownTokens.length === 0 &&
      duplicateTokens.length === 0 &&
      duplicateRiders.length === 0

    const moto2Provided = externalMoto2BatchTexts.some((text) => parseExternalTokens(text).length > 0)
    const moto2UnknownTokens: string[] = []
    const moto2DuplicateTokens: string[] = []
    const moto2BatchMismatch: number[] = []
    const orderedMoto2Batches: RiderItem[][] = []
    let isValidMoto2 = true

    if (moto2Provided) {
      for (let batchIndex = 0; batchIndex < count; batchIndex += 1) {
        const tokens = parseExternalTokens(externalMoto2BatchTexts[batchIndex] ?? '')
        const batchSeen = new Set<string>()
        const ordered: RiderItem[] = []
        for (const token of tokens) {
          if (batchSeen.has(token)) {
            moto2DuplicateTokens.push(`B${batchIndex + 1}:${token}`)
            continue
          }
          batchSeen.add(token)
          const rider = riderByPlate.get(token)
          if (!rider) {
            moto2UnknownTokens.push(`B${batchIndex + 1}:${token}`)
            continue
          }
          ordered.push(rider)
        }
        orderedMoto2Batches.push(ordered)
        if (!sameSet(ordered.map((rider) => rider.id), (orderedBatches[batchIndex] ?? []).map((rider) => rider.id))) {
          moto2BatchMismatch.push(batchIndex + 1)
        }
      }
      isValidMoto2 = moto2UnknownTokens.length === 0 && moto2DuplicateTokens.length === 0 && moto2BatchMismatch.length === 0
    }

    return {
      batchCount: count,
      orderedBatches,
      orderedMoto2Batches,
      duplicateTokens,
      unknownTokens,
      duplicateRiders,
      missingRiders,
      emptyBatches,
      isValid,
      moto2Provided,
      moto2UnknownTokens,
      moto2DuplicateTokens,
      moto2BatchMismatch,
      isValidMoto2,
    }
  }, [effectiveBatchCount, riders, batchSize, externalBatchTexts, externalMoto2BatchTexts])

  useEffect(() => {
    if (drawMode !== 'internal_live_draw') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const list = visibleWheelRiders
    const count = Math.max(1, list.length)
    const size = canvas.width
    const radius = size / 2
    const step = (Math.PI * 2) / count
    const labelEvery = count <= 40 ? 1 : Math.ceil(count / 40)

    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.translate(radius, radius)

    for (let i = 0; i < count; i += 1) {
      const start = i * step
      const end = start + step
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, radius - 2, start, end)
      ctx.closePath()
      ctx.fillStyle = i % 3 === 0 ? '#111827' : i % 2 === 0 ? '#f8fafc' : '#fde68a'
      ctx.fill()
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 1.4
      ctx.stroke()

      if (list.length > 0 && i % labelEvery === 0) {
        const mid = start + step / 2
        ctx.save()
        ctx.rotate(mid)
        ctx.translate(radius * 0.62, 0)
        ctx.rotate(Math.PI / 2)
        ctx.fillStyle = i % 3 === 0 ? '#f8fafc' : '#0f172a'
        ctx.font = 'bold 10px sans-serif'
        const name = list[i]?.name ?? ''
        ctx.fillText(name.slice(0, 14), -20, 4)
        ctx.restore()
      }
    }

    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2)
    ctx.fillStyle = '#0f172a'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.08, 0, Math.PI * 2)
    ctx.fillStyle = '#fde68a'
    ctx.fill()
    ctx.restore()
  }, [drawMode, visibleWheelRiders])

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current)
      if (rollingIntervalRef.current) window.clearInterval(rollingIntervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (riders.length === 0) {
      setManualBatchCount(1)
      return
    }
    const autoCount = Math.max(1, Math.ceil(riders.length / Math.max(4, batchSize)))
    setManualBatchCount((prev) => Math.max(1, Math.min(Math.max(1, riders.length), prev || autoCount)))
  }, [riders.length, batchSize])

  useEffect(() => {
    if (externalBatchInputMode !== 'PER_BATCH') return
    const count = effectiveBatchCount ?? Math.max(1, Math.ceil(riders.length / Math.max(4, batchSize)))
    setExternalBatchTexts((prev) => Array.from({ length: count }, (_, index) => prev[index] ?? ''))
    setExternalMoto2BatchTexts((prev) => Array.from({ length: count }, (_, index) => prev[index] ?? ''))
  }, [externalBatchInputMode, effectiveBatchCount, riders.length, batchSize])

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  const loadCategories = async () => {
    setLoading(true)
    try {
      await loadSettings()
      const eventRes = await apiFetch(`/api/events/${eventId}`)
      if (eventRes.res.ok) {
        setEventName(String(eventRes.json?.data?.name ?? 'Event'))
      }
      const res = await fetch(`/api/events/${eventId}/categories`)
      const json = await res.json()
      const list = (json?.data ?? []) as CategoryItem[]
      const enabledCategories = list.filter((c) => c.enabled)
      setCategories(enabledCategories)
      if (!selectedCategory && enabledCategories.length > 0) {
        setSelectedCategory(enabledCategories[0].id)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadSettings = async () => {
    if (!eventId) return
    try {
      const { res, json } = await apiFetch(`/api/events/${eventId}/settings`)
      if (!res.ok) return
      const format = (json?.data?.race_format_settings ?? {}) as Record<string, unknown>
      setDrawMode(normalizeDrawMode(format.draw_mode))
      const nextGate = typeof format.gate_positions === 'number' ? format.gate_positions : 8
      setGatePositions(nextGate)
      setBatchSize((prev) => {
        const maxGate = Math.max(4, nextGate)
        const capped = Math.max(4, Math.min(maxGate, prev))
        return prev === 8 ? maxGate : capped
      })
    } catch {
      // ignore settings errors
    }
  }

  const loadRiders = async (categoryId: string) => {
    if (!categoryId) return
    setLoading(true)
    try {
      const { res, json } = await apiFetch(`/api/events/${eventId}/live-draw?categoryId=${categoryId}`)
      if (!res.ok) throw new Error(json?.error || 'Gagal mengambil rider')
      const list = (json?.data ?? []) as RiderItem[]
      const locked = Boolean(json?.has_motos)
      setRiders(list)
      setDrawnOrder([])
      setSaveState('idle')
      setRollingName('Ready')
      setHasDrawn(locked)
      setCategoryLocked(locked)
      setLockedMotos([])
      setExternalOrderText('')
      setExternalMoto2OrderText('')
      setExternalBatchTexts([])
      setExternalMoto2BatchTexts([])
      setWheelRiders([])
      setWheelRotation(0)
      setResultModal(null)
      setDeleteGuard({
        canDelete: json?.can_delete !== false,
        reason: typeof json?.delete_block_reason === 'string' ? json.delete_block_reason : null,
      })
      if (locked) {
        const gateRes = await apiFetch(`/api/events/${eventId}/gate-order?categoryId=${categoryId}`)
        if (gateRes.res.ok) {
          setLockedMotos((gateRes.json?.data ?? []) as GateMoto[])
        }
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memuat rider')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    if (selectedCategory) {
      loadRiders(selectedCategory)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory])

  const startDraw = () => {
    if (riders.length === 0) {
      alert('Tidak ada rider di kategori ini.')
      return
    }
    if (hasDrawn) {
      alert('Kategori ini sudah pernah didraw. Silakan pilih kategori lain.')
      return
    }
    setDrawing(true)
    setSaveState('idle')
    setRollingName('Spinning...')
    setDrawnOrder([])
    const shuffled = shuffle(riders)
    setWheelRiders(shuffled)
    setDrawnOrder(shuffled)
    setHasDrawn(true)
    setResultModal(null)

    const count = shuffled.length
    const index = Math.floor(Math.random() * count)
    const anglePer = 360 / count
    const spins = 6 + Math.floor(Math.random() * 3)
    const targetAngle = wheelRotation + 360 * spins + (360 - (index * anglePer + anglePer / 2))
    if (rollingIntervalRef.current) window.clearInterval(rollingIntervalRef.current)
    if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current)

    rollingIntervalRef.current = window.setInterval(() => {
      const rider = shuffled[Math.floor(Math.random() * shuffled.length)]
      setRollingName(rider?.name ?? 'Spinning...')
    }, 120)

    setWheelRotation(targetAngle)

    spinTimeoutRef.current = window.setTimeout(() => {
      if (rollingIntervalRef.current) window.clearInterval(rollingIntervalRef.current)
      spinTimeoutRef.current = null
      rollingIntervalRef.current = null
      setRollingName(shuffled[index].name)
      setDrawing(false)
      setResultModal('draft')
    }, 7200)
  }

  const applyExternalOrder = () => {
    if (riders.length === 0) {
      alert('Tidak ada rider di kategori ini.')
      return
    }
    if (categoryLocked) {
      alert('Kategori ini sudah terkunci. Reset moto dulu jika ingin ubah urutan.')
      return
    }
    if (externalBatchInputMode === 'PER_BATCH') {
      if (!externalPerBatchValidation.isValid) {
        alert('Input external per batch belum valid. Pastikan semua rider terisi tepat satu kali di batch yang benar.')
        return
      }
      if (externalPerBatchValidation.moto2Provided && !externalPerBatchValidation.isValidMoto2) {
        alert('Input Moto 2 per batch belum valid. Pastikan rider per batch sama dengan Moto 1.')
        return
      }
      setDrawnOrder(externalPerBatchValidation.orderedBatches.flat())
    } else {
      if (!externalValidation.isValid) {
        alert('Urutan external belum valid. Pastikan semua rider terisi tepat satu kali.')
        return
      }
      setDrawnOrder(externalValidation.orderedRiders)
    }
    setRollingName('External order ready')
    setHasDrawn(true)
    setSaveState('idle')
    setResultModal('draft')
  }

  const resetDraw = () => {
    if (categoryLocked) return
    if (spinTimeoutRef.current) window.clearTimeout(spinTimeoutRef.current)
    if (rollingIntervalRef.current) window.clearInterval(rollingIntervalRef.current)
    setDrawnOrder([])
    setWheelRiders([])
    setWheelRotation(0)
    setRollingName('Ready')
    setHasDrawn(false)
    setSaveState('idle')
    setExternalOrderText('')
    setExternalMoto2OrderText('')
    setExternalBatchTexts([])
    setExternalMoto2BatchTexts([])
    setResultModal(null)
  }

  const resetLockedDraw = async () => {
    if (!selectedCategory) return
    if (!deleteGuard.canDelete) {
      alert(deleteGuard.reason || 'Reset draw diblokir untuk kategori ini.')
      return
    }
    const ok = window.confirm('Reset draw? Ini akan menghapus semua moto untuk kategori ini.')
    if (!ok) return
    setSaveState('saving')
    try {
      const { res, json } = await apiFetch(`/api/events/${eventId}/live-draw`, {
        method: 'DELETE',
        body: JSON.stringify({ category_id: selectedCategory }),
      })
      if (!res.ok) throw new Error(json?.error || 'Gagal reset draw')
      setDrawnOrder([])
      setWheelRiders([])
      setWheelRotation(0)
      setRollingName('Ready')
      setHasDrawn(false)
      setCategoryLocked(false)
      setLockedMotos([])
      setSaveState('idle')
      setExternalOrderText('')
      setExternalMoto2OrderText('')
      setExternalBatchTexts([])
      setExternalMoto2BatchTexts([])
      setResultModal(null)
      setDeleteGuard({ canDelete: true, reason: null })
      await loadRiders(selectedCategory)
      alert('Draw berhasil direset.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal reset draw')
      setSaveState('idle')
    }
  }

  const saveAsMoto = async () => {
    if (!selectedCategory || drawnOrder.length === 0) {
      alert(drawMode === 'external_draw' ? 'Klik "Gunakan Urutan External" dulu.' : 'Lakukan draw terlebih dulu.')
      return
    }
    if (drawMode === 'external_draw') {
      if (externalBatchInputMode === 'PER_BATCH') {
        if (externalPerBatchValidation.moto2Provided && !externalPerBatchValidation.isValidMoto2) {
          alert('Urutan Moto 2 manual per batch belum valid. Cek kembali input Moto 2.')
          return
        }
      } else if (externalMoto2Validation.isProvided && !externalMoto2Validation.isValidForMoto1) {
        alert('Urutan Moto 2 manual belum valid per batch. Cek kembali input Moto 2.')
        return
      }
    }
    setSaveState('saving')
    try {
      const riderBatches = batches.map((batch) => batch.riders.map((rider) => rider.id))
      const manualMoto2Ids =
        drawMode === 'external_draw' && externalBatchInputMode === 'GLOBAL' && externalMoto2Validation.isProvided
          ? externalMoto2Validation.orderedRiders.map((rider) => rider.id)
          : []
      const riderBatchesMoto2 =
        drawMode === 'external_draw' && externalBatchInputMode === 'PER_BATCH' && externalPerBatchValidation.moto2Provided
          ? externalPerBatchValidation.orderedMoto2Batches.map((batch) => batch.map((rider) => rider.id))
          : []
      const payload = {
        category_id: selectedCategory,
        rider_ids: drawnOrder.map((r) => r.id),
        batch_size: batchSize,
        ...(batchMode === 'MANUAL_BATCH_COUNT' ? { batch_count: effectiveBatchCount } : {}),
        ...(riderBatches.length > 0 ? { rider_batches: riderBatches } : {}),
        ...(manualMoto2Ids.length > 0 ? { rider_ids_moto2: manualMoto2Ids } : {}),
        ...(riderBatchesMoto2.length > 0 ? { rider_batches_moto2: riderBatchesMoto2 } : {}),
      }
      const { res, json } = await apiFetch(`/api/events/${eventId}/live-draw`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(json?.error || 'Gagal menyimpan Moto')
      setSaveState('saved')
      await loadRiders(selectedCategory)
      setResultModal('saved')
      alert('Moto berhasil dibuat.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan hasil draw')
      setSaveState('idle')
    }
  }

  const publicShareUrl =
    selectedCategory && typeof window !== 'undefined'
      ? `${window.location.origin}/event/${eventId}/live-score/${selectedCategory}`
      : ''

  const handleCopyShareLink = async () => {
    if (!selectedCategory) {
      alert('Pilih kategori dulu.')
      return
    }
    if (!publicShareUrl) return
    try {
      await navigator.clipboard.writeText(publicShareUrl)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1500)
    } catch {
      window.prompt('Copy link hasil draw:', publicShareUrl)
    }
  }

  const handleOpenShareLink = () => {
    if (!selectedCategory || !publicShareUrl) return
    window.open(publicShareUrl, '_blank', 'noopener,noreferrer')
  }

  const handleDownloadLiveDrawPdf = () => {
    if (lockedMotos.length === 0) {
      alert('Belum ada moto tersimpan untuk diunduh.')
      return
    }

    const grouped = new Map<number, GateMoto[]>()
    lockedMotos.forEach((moto) => {
      const parsed = parseMotoBatch(moto.moto_name)
      const key = parsed.batchNo > 0 ? parsed.batchNo : 1
      const list = grouped.get(key) ?? []
      list.push(moto)
      grouped.set(key, list)
    })

    const sections = Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([batchNo, motos]) => {
        const orderedMotos = [...motos].sort((a, b) => {
          const pa = parseMotoBatch(a.moto_name)
          const pb = parseMotoBatch(b.moto_name)
          if (pa.motoNo !== pb.motoNo) return pa.motoNo - pb.motoNo
          return a.moto_order - b.moto_order
        })
        const riderMap = new Map<
          string,
          { name: string; noPlate: string; gates: Record<number, number> }
        >()

        orderedMotos.forEach((moto, motoIndex) => {
          moto.gates.forEach((gate) => {
            const existing = riderMap.get(gate.rider_id) ?? {
              name: gate.name,
              noPlate: gate.no_plate_display,
              gates: {},
            }
            existing.gates[motoIndex + 1] = gate.gate_position
            riderMap.set(gate.rider_id, existing)
          })
        })

        const rows = Array.from(riderMap.values()).sort((a, b) => {
          const gateA = a.gates[1] ?? 999
          const gateB = b.gates[1] ?? 999
          if (gateA !== gateB) return gateA - gateB
          return a.name.localeCompare(b.name)
        })

        const headerCells = orderedMotos
          .map((moto, index) => `<th>Gate M${index + 1}</th>`)
          .join('')
        const bodyRows = rows
          .map((row) => {
            const gateCells = orderedMotos
              .map((_, index) => `<td>${row.gates[index + 1] ?? '-'}</td>`)
              .join('')
            return `<tr>${gateCells}<td>${escapeHtml(row.noPlate)}</td><td>${escapeHtml(row.name)}</td></tr>`
          })
          .join('')
        const motoMeta = orderedMotos
          .map((moto, index) => `<span>M${index + 1}: ${escapeHtml(moto.moto_name)}</span>`)
          .join('')

        return `
          <section class="section-card">
            <h2 class="section-title">Batch ${batchNo}</h2>
            <div class="meta-row">${motoMeta
              .replace(/<span>/g, '<span class="meta-pill">')}</div>
            <table>
              <thead>
                <tr>${headerCells}<th>No Plate</th><th>Nama Rider</th></tr>
              </thead>
              <tbody>${bodyRows}</tbody>
            </table>
          </section>
        `
      })
      .join('')

    const html = buildBrandedPrintHtml({
      title: `Live Draw ${escapeHtml(selectedCategoryLabel)}`,
      eyebrow: 'Live Draw Result',
      heading: escapeHtml(eventName),
      subtitle: escapeHtml(selectedCategoryLabel),
      body: sections,
    })

    const frame = printFrameRef.current
    if (!frame) {
      alert('Frame print tidak tersedia. Refresh halaman lalu coba lagi.')
      return
    }

    frame.onload = () => {
      const win = frame.contentWindow
      if (!win) return
      win.focus()
      win.print()
    }
    frame.srcdoc = html
  }

  return (
    <div style={{ maxWidth: 1020 }}>
      <iframe
        ref={printFrameRef}
        title="live-draw-print-frame"
        style={{ position: 'absolute', width: 0, height: 0, border: 0, visibility: 'hidden' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>
            {drawMode === 'external_draw' ? 'External Draw Setup' : 'Live Draw (Internal)'}
          </h1>
          <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
            {drawMode === 'external_draw'
              ? 'Hasil draw dari luar sistem. Paste urutan plate Moto 1, opsional Moto 2 manual, lalu generate moto.'
              : 'Draw manual dengan roulette, lalu simpan hasilnya sebagai Moto 1 & Moto 2 (gate Moto 2 otomatis dibalik).'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCopyShareLink}
            disabled={!selectedCategory}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '2px solid #111',
              background: shareCopied ? '#dcfce7' : '#fff',
              fontWeight: 900,
              cursor: selectedCategory ? 'pointer' : 'not-allowed',
            }}
          >
            {shareCopied ? 'Copied' : 'Copy Share Link'}
          </button>
          <button
            type="button"
            onClick={handleOpenShareLink}
            disabled={!selectedCategory}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '2px solid #111',
              background: '#fef3c7',
              fontWeight: 900,
              cursor: selectedCategory ? 'pointer' : 'not-allowed',
            }}
          >
            Open Public Result
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 16,
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Mode
          </div>
          <div
            style={{
              width: 'fit-content',
              borderRadius: 999,
              border: '1px solid #cbd5e1',
              padding: '6px 10px',
              fontWeight: 900,
              background: drawMode === 'external_draw' ? '#fef3c7' : '#dcfce7',
              color: '#111827',
            }}
          >
            {drawMode === 'external_draw' ? 'External Draw' : 'Internal Live Draw'}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Pilih Kategori
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Format Batch
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
              <input
                type="radio"
                checked={batchMode === 'AUTO_BY_GATE'}
                onChange={() => setBatchMode('AUTO_BY_GATE')}
              />
              Auto by gate size
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
              <input
                type="radio"
                checked={batchMode === 'MANUAL_BATCH_COUNT'}
                onChange={() => setBatchMode('MANUAL_BATCH_COUNT')}
              />
              Manual batch count
            </label>
          </div>
          {batchMode === 'AUTO_BY_GATE' ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Maks Rider per Batch
              </div>
              <input
                type="number"
                min={4}
                max={Math.max(4, gatePositions)}
                value={batchSize}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  const maxGate = Math.max(4, gatePositions)
                  setBatchSize(Math.max(4, Math.min(maxGate, next)))
                }}
                style={{ padding: 12, borderRadius: 12, border: '2px solid #111', maxWidth: 160 }}
              />
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Jumlah Batch
              </div>
              <input
                type="number"
                min={1}
                max={Math.max(1, riders.length)}
                value={effectiveBatchCount ?? manualBatchCount}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setManualBatchCount(Math.max(1, Math.min(Math.max(1, riders.length), next)))
                }}
                style={{ padding: 12, borderRadius: 12, border: '2px solid #111', maxWidth: 160 }}
              />
              <div style={{ color: '#475569', fontWeight: 800 }}>
                Sistem akan membagi rider seimbang per batch. Contoh 40 rider / 6 batch menjadi 7,7,7,7,6,6.
              </div>
            </>
          )}
        </div>

        <div
          style={{
            border: '2px solid #111',
            borderRadius: 24,
            padding: 20,
            display: 'grid',
            gap: 18,
            background:
              drawMode === 'external_draw'
                ? 'linear-gradient(135deg, #fff7ed 0%, #ffffff 58%, #fef3c7 100%)'
                : 'linear-gradient(135deg, #eff6ff 0%, #ffffff 58%, #dcfce7 100%)',
            boxShadow: '0 24px 48px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {drawMode === 'external_draw' ? 'External Order' : 'Wheel Spin'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 950, color: '#0f172a' }}>{rollingName}</div>
            {drawing && (
              <div style={{ color: '#1d4ed8', fontWeight: 900 }}>
                Sedang mengundi rider, tunggu sampai hasil preview muncul otomatis.
              </div>
            )}
            <div style={{ color: '#444', fontWeight: 700 }}>
              Total rider: {riders.length} | Batch: {batches.length}
            </div>
            <div style={{ color: '#444', fontWeight: 700 }}>
              Gate positions: {gatePositions}
            </div>
            {categoryLocked && (
              <div style={{ color: '#b40000', fontWeight: 900 }}>
                Kategori ini sudah pernah didraw. Draw terkunci.
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 900 }}>Preview Rider</div>
            {riders.length === 0 ? (
              <div style={{ fontWeight: 800, color: '#555' }}>Belum ada rider.</div>
            ) : (
              <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {riders.map((rider) => (
                  <div
                    key={rider.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '6px 8px',
                      borderRadius: 8,
                      border: '1px solid #ddd',
                      background: '#fff',
                      fontWeight: 800,
                    }}
                  >
                    <span>{rider.name}</span>
                    <span>{rider.no_plate_display}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {drawMode === 'internal_live_draw' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                alignItems: 'center',
                justifyItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ position: 'relative', width: 360, height: 360 }}>
                <div
                  style={{
                    position: 'absolute',
                    top: -10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '16px solid transparent',
                    borderRight: '16px solid transparent',
                    borderBottom: '24px solid #ef4444',
                    filter: 'drop-shadow(0 8px 14px rgba(239, 68, 68, 0.3))',
                    zIndex: 3,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 8,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.85), rgba(255,255,255,0))',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
                <canvas
                  ref={canvasRef}
                  width={360}
                  height={360}
                  style={{
                    width: 360,
                    height: 360,
                    borderRadius: '50%',
                    border: '6px solid #0f172a',
                    background: '#fff',
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: drawing ? 'transform 7.2s cubic-bezier(0.08, 0.72, 0.12, 1)' : 'none',
                    boxShadow: '0 28px 48px rgba(15, 23, 42, 0.18)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={startDraw}
                  disabled={loading || drawing || riders.length === 0 || hasDrawn}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: drawing || hasDrawn ? '#ddd' : '#2ecc71',
                    fontWeight: 900,
                    cursor: drawing || hasDrawn ? 'not-allowed' : 'pointer',
                  }}
                >
                  {hasDrawn ? 'Draw Terkunci' : 'Start Draw'}
                </button>
                {drawnOrder.length > 0 && !categoryLocked && (
                  <button
                    type="button"
                    onClick={() => setResultModal('draft')}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '2px solid #111',
                      background: '#fff',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Lihat Hasil Draw
                  </button>
                )}
                {categoryLocked && (
                  <>
                    {!deleteGuard.canDelete && deleteGuard.reason && (
                      <div
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: '1px solid #f59e0b',
                          background: '#fffbeb',
                          color: '#92400e',
                          fontWeight: 800,
                        }}
                      >
                        {deleteGuard.reason}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setResultModal('saved')}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#fff',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Lihat Moto Tersimpan
                    </button>
                    <button
                      type="button"
                      onClick={resetLockedDraw}
                      disabled={saveState === 'saving' || !deleteGuard.canDelete}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: deleteGuard.canDelete ? '#ffd6d6' : '#e5e7eb',
                        fontWeight: 900,
                        cursor: saveState === 'saving' || !deleteGuard.canDelete ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Reset Draw (Hapus Moto)
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
                  <input
                    type="radio"
                    checked={externalBatchInputMode === 'GLOBAL'}
                    onChange={() => setExternalBatchInputMode('GLOBAL')}
                  />
                  Input global
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
                  <input
                    type="radio"
                    checked={externalBatchInputMode === 'PER_BATCH'}
                    onChange={() => setExternalBatchInputMode('PER_BATCH')}
                  />
                  Input per batch
                </label>
              </div>
              {externalBatchInputMode === 'GLOBAL' ? (
                <>
                  <div style={{ fontWeight: 900 }}>Paste urutan no plate (Moto 1)</div>
                  <div style={{ color: '#334155', fontWeight: 700 }}>
                    Format: satu plate per baris, atau dipisah koma. Sistem akan membagi ke batch sesuai format batch di atas.
                  </div>
                  <textarea
                    value={externalOrderText}
                    onChange={(e) => setExternalOrderText(e.target.value)}
                    rows={8}
                    placeholder={'15B\n19\n777'}
                    style={{
                      width: '100%',
                      borderRadius: 12,
                      border: '2px solid #111',
                      padding: 12,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 14,
                    }}
                  />
                  <div style={{ display: 'grid', gap: 4, fontWeight: 800 }}>
                    <div>Token terbaca: {externalValidation.tokens.length}</div>
                    <div>Rider cocok: {externalValidation.orderedRiders.length}</div>
                    <div style={{ color: externalValidation.isValid ? '#166534' : '#b91c1c' }}>
                      {externalValidation.isValid ? 'VALID - siap jadi moto' : 'BELUM VALID'}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    <div style={{ fontWeight: 900 }}>Urutan no plate Moto 2 (opsional, manual)</div>
                    <div style={{ color: '#334155', fontWeight: 700 }}>
                      Kosongkan jika ingin otomatis dibalik. Jika diisi, wajib sama rider per batch dengan Moto 1.
                    </div>
                    <textarea
                      value={externalMoto2OrderText}
                      onChange={(e) => setExternalMoto2OrderText(e.target.value)}
                      rows={8}
                      placeholder={'19\n15B\n777'}
                      style={{
                        width: '100%',
                        borderRadius: 12,
                        border: '2px solid #111',
                        padding: 12,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                        fontSize: 14,
                      }}
                    />
                    <div style={{ display: 'grid', gap: 4, fontWeight: 800 }}>
                      <div>Token Moto 2: {externalMoto2Validation.tokens.length}</div>
                      <div>
                        Status Moto 2:{' '}
                        <span style={{ color: externalMoto2Validation.isValidForMoto1 ? '#166534' : '#b91c1c' }}>
                          {externalMoto2Validation.isProvided
                            ? externalMoto2Validation.isValidForMoto1
                              ? 'VALID MANUAL'
                              : 'BELUM VALID'
                            : 'AUTO REVERSE'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ color: '#334155', fontWeight: 700 }}>
                    Isi rider langsung per batch. Cocok untuk pembagian manual seperti 7,7,7,7,6,6.
                  </div>
                  {Array.from({ length: externalPerBatchValidation.batchCount }, (_, index) => (
                    <div key={`batch-input-${index}`} style={{ display: 'grid', gap: 8, padding: 12, border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff' }}>
                      <div style={{ fontWeight: 900 }}>Batch {index + 1} - Moto 1</div>
                      <textarea
                        value={externalBatchTexts[index] ?? ''}
                        onChange={(e) => setExternalBatchTexts((prev) => {
                          const next = [...prev]
                          next[index] = e.target.value
                          return next
                        })}
                        rows={4}
                        placeholder={'15B\n19\n777'}
                        style={{ width: '100%', borderRadius: 12, border: '2px solid #111', padding: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 14 }}
                      />
                      <div style={{ fontWeight: 900 }}>Batch {index + 1} - Moto 2 (opsional)</div>
                      <textarea
                        value={externalMoto2BatchTexts[index] ?? ''}
                        onChange={(e) => setExternalMoto2BatchTexts((prev) => {
                          const next = [...prev]
                          next[index] = e.target.value
                          return next
                        })}
                        rows={4}
                        placeholder={'19\n15B\n777'}
                        style={{ width: '100%', borderRadius: 12, border: '2px solid #111', padding: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 14 }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'grid', gap: 4, fontWeight: 800 }}>
                    <div style={{ color: externalPerBatchValidation.isValid ? '#166534' : '#b91c1c' }}>
                      {externalPerBatchValidation.isValid ? 'VALID - semua batch Moto 1 siap' : 'BELUM VALID'}
                    </div>
                    {externalPerBatchValidation.emptyBatches.length > 0 && <div style={{ color: '#b91c1c' }}>Batch kosong: {externalPerBatchValidation.emptyBatches.join(', ')}</div>}
                    {externalPerBatchValidation.missingRiders.length > 0 && <div style={{ color: '#b91c1c' }}>Belum terisi: {externalPerBatchValidation.missingRiders.slice(0, 8).map((rider) => rider.no_plate_display).join(', ')}</div>}
                    {externalPerBatchValidation.moto2Provided && (
                      <div style={{ color: externalPerBatchValidation.isValidMoto2 ? '#166534' : '#b91c1c' }}>
                        Moto 2 per batch: {externalPerBatchValidation.isValidMoto2 ? 'VALID MANUAL' : `BELUM VALID${externalPerBatchValidation.moto2BatchMismatch.length > 0 ? ` (batch mismatch ${externalPerBatchValidation.moto2BatchMismatch.join(', ')})` : ''}`}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {externalBatchInputMode === 'GLOBAL' && externalValidation.orderedRiders.length > 0 && (
                <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {externalValidation.orderedRiders.map((rider, idx) => (
                    <div
                      key={`ext-${rider.id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid #ddd',
                        background: '#fff',
                        fontWeight: 800,
                      }}
                    >
                      <span>
                        Gate {idx + 1} - {rider.name}
                      </span>
                      <span>{rider.no_plate_display}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={applyExternalOrder}
                  disabled={loading || categoryLocked || externalValidation.tokens.length === 0}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: externalValidation.isValid ? '#2ecc71' : '#fef3c7',
                    fontWeight: 900,
                    cursor: categoryLocked ? 'not-allowed' : 'pointer',
                  }}
                >
                  Gunakan Urutan External
                </button>
                {drawnOrder.length > 0 && !categoryLocked && (
                  <button
                    type="button"
                    onClick={() => setResultModal('draft')}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '2px solid #111',
                      background: '#fff',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Lihat Hasil Draw
                  </button>
                )}
                {categoryLocked && (
                  <>
                    <button
                      type="button"
                      onClick={() => setResultModal('saved')}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#fff',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Lihat Moto Tersimpan
                    </button>
                    <button
                      type="button"
                      onClick={resetLockedDraw}
                      disabled={saveState === 'saving'}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#ffd6d6',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Reset Draw (Hapus Moto)
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {loading && <div style={{ fontWeight: 800 }}>Memuat data...</div>}
        {!loading && drawnOrder.length === 0 && !categoryLocked && (
          <div style={{ color: '#555', fontWeight: 700 }}>
            {drawMode === 'external_draw'
              ? 'Belum ada urutan external yang dipakai.'
              : 'Belum ada hasil draw.'}
          </div>
        )}
        {categoryLocked && lockedMotos.length > 0 && (
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 900 }}>Gate Order (Saved Moto)</div>
            {lockedMotos.map((moto) => (
              <div
                key={moto.id}
                style={{
                  border: '2px solid #111',
                  borderRadius: 16,
                  padding: 12,
                  background: '#fff',
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenMotoId((prev) => (prev === moto.id ? null : moto.id))}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: '#eaf7ee',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {moto.moto_order}. {moto.moto_name} {openMotoId === moto.id ? '[Hide]' : '[Show]'}
                </button>
                {openMotoId === moto.id && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                    {moto.gates.map((g) => (
                      <div
                        key={`${moto.id}-${g.rider_id}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: '1px solid #ddd',
                          background: '#fff',
                          fontWeight: 800,
                        }}
                      >
                        <span>
                          Gate {g.gate_position} - {g.name}
                        </span>
                        <span>{g.no_plate_display}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {resultModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(15, 23, 42, 0.52)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            style={{
              width: 'min(1120px, 100%)',
              maxHeight: '88vh',
              overflow: 'hidden',
              borderRadius: 28,
              border: '2px solid #0f172a',
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
              boxShadow: '0 32px 80px rgba(15, 23, 42, 0.22)',
              display: 'grid',
              gridTemplateRows: 'auto 1fr auto',
            }}
          >
            <div
              style={{
                padding: '20px 22px 18px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                gap: 16,
              }}
            >
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b' }}>
                  {resultModal === 'saved' ? 'Moto Tersimpan' : 'Preview Hasil Draw'}
                </div>
                <div style={{ fontSize: 28, fontWeight: 950, color: '#0f172a' }}>{selectedCategoryLabel}</div>
                <div style={{ color: '#334155', fontWeight: 700 }}>
                  {resultModal === 'saved'
                    ? 'Daftar moto yang sudah tersimpan untuk kategori ini.'
                    : `Total rider ${drawnOrder.length} | ${batches.length} batch | gate max ${batchSize}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResultModal(null)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Tutup
              </button>
            </div>

            <div style={{ overflowY: 'auto', padding: 22, display: 'grid', gap: 16 }}>
              {resultModal === 'draft' && (
                <div style={{ display: 'grid', gap: 14 }}>
                  {drawing && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 16,
                        border: '1px solid #93c5fd',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontWeight: 900,
                      }}
                    >
                      Sedang mengundi rider. Preview batch akan muncul otomatis setelah roulette selesai.
                    </div>
                  )}
                  {!drawing && batches.length === 0 && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 16,
                        border: '1px solid #cbd5e1',
                        background: '#f8fafc',
                        color: '#475569',
                        fontWeight: 800,
                      }}
                    >
                      Hasil draw belum tersedia.
                    </div>
                  )}
                  {batches.map((batch) => (
                    <div
                      key={batch.index}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: 22,
                        padding: 16,
                        background: 'linear-gradient(135deg, #ffffff 0%, #ecfeff 100%)',
                        boxShadow: '0 14px 30px rgba(15, 23, 42, 0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontWeight: 950, fontSize: 18, color: '#0f172a' }}>Batch {batch.index}</div>
                        <div
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontWeight: 900,
                            fontSize: 12,
                          }}
                        >
                          {batch.riders.length} rider
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {batch.riders.map((rider, idx) => (
                          <div
                            key={rider.id}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                              alignItems: 'center',
                              gap: 12,
                              padding: '10px 12px',
                              borderRadius: 14,
                              border: '1px solid #dbeafe',
                              background: idx % 2 === 0 ? '#eff6ff' : '#f8fafc',
                              fontWeight: 800,
                            }}
                          >
                            <span
                              style={{
                                minWidth: 66,
                                textAlign: 'center',
                                padding: '6px 8px',
                                borderRadius: 999,
                                background: '#0f172a',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 900,
                              }}
                            >
                              Gate {idx + 1}
                            </span>
                            <span style={{ color: '#0f172a' }}>{rider.name}</span>
                            <span style={{ color: '#475569' }}>{rider.no_plate_display}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 12, display: 'grid', gap: 6, color: '#475569', fontWeight: 700 }}>
                        <div>
                          {drawMode === 'external_draw' && externalMoto2Validation.isProvided
                            ? 'Moto 2: urutan gate manual sesuai input external.'
                            : `Moto 2: urutan gate otomatis dibalik (Gate ${batch.riders.length} > 1).`}
                        </div>
                        <div>{formatMoto3Hint(batches.length)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {resultModal === 'saved' && (
                <div style={{ display: 'grid', gap: 12 }}>
                  {lockedMotos.map((moto) => (
                    <div
                      key={moto.id}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: 20,
                        padding: 14,
                        background: '#fff',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenMotoId((prev) => (prev === moto.id ? null : moto.id))}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '12px 14px',
                          borderRadius: 14,
                          border: '1px solid #bfdbfe',
                          background: openMotoId === moto.id ? '#dbeafe' : '#f8fafc',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        {moto.moto_order}. {moto.moto_name} {openMotoId === moto.id ? '[Hide]' : '[Show]'}
                      </button>
                      {openMotoId === moto.id && (
                        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                          {moto.gates.map((g) => (
                            <div
                              key={`${moto.id}-${g.rider_id}`}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                                gap: 12,
                                alignItems: 'center',
                                padding: '10px 12px',
                                borderRadius: 14,
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                fontWeight: 800,
                              }}
                            >
                              <span
                                style={{
                                  minWidth: 66,
                                  textAlign: 'center',
                                  padding: '6px 8px',
                                  borderRadius: 999,
                                  background: '#0f172a',
                                  color: '#fff',
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              >
                                Gate {g.gate_position}
                              </span>
                              <span>{g.name}</span>
                              <span style={{ color: '#475569' }}>{g.no_plate_display}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                padding: 18,
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                background: '#fff',
              }}
            >
              <div style={{ color: '#475569', fontWeight: 700 }}>
                {resultModal === 'saved'
                  ? 'Gunakan reset jika ingin menghapus moto yang sudah terkunci untuk kategori ini.'
                  : 'Review dulu hasil batch di modal ini, lalu simpan jadi moto kalau sudah pas.'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {resultModal === 'draft' && (
                  <>
                    <button
                      type="button"
                      onClick={resetDraw}
                      disabled={categoryLocked || saveState === 'saving'}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#fff',
                        fontWeight: 900,
                        cursor: categoryLocked || saveState === 'saving' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Reset Draw
                    </button>
                    <button
                      type="button"
                      onClick={saveAsMoto}
                      disabled={saveState === 'saving' || drawnOrder.length === 0}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: saveState === 'saved' ? '#bfead2' : '#111827',
                        color: saveState === 'saved' ? '#0f172a' : '#fff',
                        fontWeight: 900,
                        cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {saveState === 'saving' ? 'Saving...' : 'Save as Moto'}
                    </button>
                  </>
                )}
                {resultModal === 'saved' && (
                  <>
                    <button
                      type="button"
                      onClick={handleDownloadLiveDrawPdf}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#dbeafe',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Download PDF
                    </button>
                    {!deleteGuard.canDelete && deleteGuard.reason && (
                      <div
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 12,
                          border: '1px solid #f59e0b',
                          background: '#fffbeb',
                          color: '#92400e',
                          fontWeight: 800,
                        }}
                      >
                        {deleteGuard.reason}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={resetLockedDraw}
                      disabled={saveState === 'saving' || !deleteGuard.canDelete}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: deleteGuard.canDelete ? '#ffd6d6' : '#e5e7eb',
                        fontWeight: 900,
                        cursor: saveState === 'saving' || !deleteGuard.canDelete ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Reset Draw (Hapus Moto)
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

