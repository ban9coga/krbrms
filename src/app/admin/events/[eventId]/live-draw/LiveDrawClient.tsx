'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { buildBrandedPrintHtml } from '../../../../../lib/printTheme'
import { supabase } from '@/src/lib/supabaseClient'

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

type RiderBatchLocation = {
  batchIndex: number
  riderIndex: number
}

type ExternalTargetField = {
  batchIndex: number
  moto: 1 | 2
}

type BatchMode = 'AUTO_BY_GATE' | 'MANUAL_BATCH_COUNT' | 'CUSTOM_BATCH_SIZES'

type GateMoto = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
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

const sanitizeFileName = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'draw-output'

const normalizePlateToken = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, '')
const isRiderIdToken = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
const normalizeExternalToken = (value: string) => {
  const trimmed = value.trim()
  return isRiderIdToken(trimmed) ? trimmed.toLowerCase() : normalizePlateToken(trimmed)
}
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
    .map((item) => item.trim())
    .filter(Boolean)

const resolveRiderForToken = (riders: RiderItem[], token: string) => {
  const trimmed = token.trim()
  const lowerKey = trimmed.toLowerCase()
  const exactKey = trimmed.toUpperCase()
  const normalizedKey = normalizePlateToken(trimmed)

  const idMatch = riders.find((rider) => rider.id.toLowerCase() === lowerKey)
  if (idMatch) return idMatch

  const exactMatch = riders.find((rider) => rider.no_plate_display.toUpperCase() === exactKey)
  if (exactMatch) return exactMatch

  const normalizedMatch = riders.find((rider) => normalizePlateToken(rider.no_plate_display) === normalizedKey)
  if (normalizedMatch) return normalizedMatch

  return riders.find((rider) => normalizePlateToken(`${rider.plate_number ?? ''}${rider.plate_suffix ?? ''}`) === normalizedKey)
}

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

const parseCustomBatchSizePattern = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item))

const buildBatchesBySizes = (riders: RiderItem[], sizes: number[]) => {
  const batches: BatchItem[] = []
  let cursor = 0
  sizes.forEach((size, index) => {
    if (size <= 0) return
    batches.push({ index: index + 1, riders: riders.slice(cursor, cursor + size) })
    cursor += size
  })
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

type ExternalBatchUndoState = {
  moto1Texts: string[]
  moto2Texts: string[]
  targetField: ExternalTargetField
}

const formatMoto3Hint = (totalBatches: number) =>
  totalBatches === 1
    ? 'Moto 3 tidak dibuat saat draw. Moto 3 akan dibuat otomatis setelah hasil Moto 2 lengkap.'
    : 'Moto 3 tidak dipakai untuk konfigurasi draw kategori ini.'

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items
  }
  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

const serializeBatchRiders = (batches: RiderItem[][]) =>
  batches.map((batch) => batch.map((rider) => rider.id).join('\n'))

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
  const [customBatchPattern, setCustomBatchPattern] = useState('')
  const [gatePositions, setGatePositions] = useState(8)
  const [eventLogoUrl, setEventLogoUrl] = useState<string | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode>('internal_live_draw')
  const [rollingName, setRollingName] = useState<string>('Ready')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [wheelRiders, setWheelRiders] = useState<RiderItem[]>([])
  const [wheelRotation, setWheelRotation] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const printFrameRef = useRef<HTMLIFrameElement | null>(null)
  const externalBatchSearchInputRef = useRef<HTMLInputElement | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [lockedMotos, setLockedMotos] = useState<GateMoto[]>([])
  const [openMotoId, setOpenMotoId] = useState<string | null>(null)
  const [externalOrderText, setExternalOrderText] = useState('')
  const [externalMoto2OrderText, setExternalMoto2OrderText] = useState('')
  const [externalBatchInputMode, setExternalBatchInputMode] = useState<'GLOBAL' | 'PER_BATCH'>('PER_BATCH')
  const [externalBatchTexts, setExternalBatchTexts] = useState<string[]>([])
  const [externalMoto2BatchTexts, setExternalMoto2BatchTexts] = useState<string[]>([])
  const [externalTargetField, setExternalTargetField] = useState<ExternalTargetField>({ batchIndex: 0, moto: 1 })
  const [externalBatchSearch, setExternalBatchSearch] = useState('')
  const [resultModal, setResultModal] = useState<'draft' | 'saved' | null>(null)
  const [draggingRiderIndex, setDraggingRiderIndex] = useState<number | null>(null)
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null)
  const [selectedRiderIndex, setSelectedRiderIndex] = useState<number | null>(null)
  const [externalDraggingRider, setExternalDraggingRider] = useState<RiderBatchLocation | null>(null)
  const [externalDropTarget, setExternalDropTarget] = useState<RiderBatchLocation | null>(null)
  const [externalSelectedRider, setExternalSelectedRider] = useState<RiderBatchLocation | null>(null)
  const [externalUndoStack, setExternalUndoStack] = useState<ExternalBatchUndoState[]>([])
  const [deleteGuard, setDeleteGuard] = useState<LiveDrawGuard>({ canDelete: true, reason: null })
  const spinTimeoutRef = useRef<number | null>(null)
  const rollingIntervalRef = useRef<number | null>(null)
  const maxBatchRiders = useMemo(() => Math.max(4, Math.min(8, gatePositions || 8)), [gatePositions])
  const minimumManualBatchCount = useMemo(
    () => Math.max(1, Math.ceil(Math.max(0, riders.length) / maxBatchRiders)),
    [maxBatchRiders, riders.length]
  )

  const effectiveBatchCount = useMemo(() => {
    if (batchMode !== 'MANUAL_BATCH_COUNT') return null
    const maxCount = Math.max(1, riders.length)
    return Math.max(minimumManualBatchCount, Math.min(maxCount, manualBatchCount))
  }, [batchMode, manualBatchCount, minimumManualBatchCount, riders.length])

  const customBatchSizes = useMemo(() => parseCustomBatchSizePattern(customBatchPattern), [customBatchPattern])
  const customBatchTotal = useMemo(
    () => customBatchSizes.reduce((sum, size) => sum + size, 0),
    [customBatchSizes]
  )
  const customBatchOverCapacity = useMemo(
    () => customBatchSizes
      .map((size, index) => (size > maxBatchRiders ? index + 1 : null))
      .filter((value): value is number => value !== null),
    [customBatchSizes, maxBatchRiders]
  )
  const customBatchError = useMemo(() => {
    if (batchMode !== 'CUSTOM_BATCH_SIZES') return null
    if (customBatchSizes.length === 0) return 'Isi pola batch dulu, contoh: 7,6,6.'
    if (customBatchTotal !== riders.length) {
      return `Total pola batch harus ${riders.length} rider. Saat ini ${customBatchTotal}.`
    }
    if (customBatchOverCapacity.length > 0) {
      return `Batch ${customBatchOverCapacity.join(', ')} melebihi kapasitas gate maksimal ${maxBatchRiders} rider.`
    }
    return null
  }, [batchMode, customBatchOverCapacity, customBatchSizes.length, customBatchTotal, maxBatchRiders, riders.length])

  const batches = useMemo(() => {
    if (batchMode === 'CUSTOM_BATCH_SIZES' && customBatchSizes.length > 0) {
      return buildBatchesBySizes(drawnOrder, customBatchSizes)
    }
    if (batchMode === 'MANUAL_BATCH_COUNT' && effectiveBatchCount) {
      return buildBatchesByCount(drawnOrder, effectiveBatchCount)
    }
    return buildBatches(drawnOrder, batchSize)
  }, [batchMode, customBatchSizes, drawnOrder, batchSize, effectiveBatchCount])
  const batchLayouts = useMemo(() => {
    let cursor = 0
    return batches.map((batch) => {
      const startIndex = cursor
      cursor += batch.riders.length
      return { ...batch, startIndex }
    })
  }, [batches])
  const visibleWheelRiders = wheelRiders.length > 0 ? wheelRiders : riders
  const selectedCategoryLabel = useMemo(
    () => categories.find((category) => category.id === selectedCategory)?.label ?? 'Kategori',
    [categories, selectedCategory]
  )
  const savedMotoBatches = useMemo(() => {
    const grouped = new Map<number, GateMoto[]>()
    for (const moto of lockedMotos) {
      const parsed = parseMotoBatch(moto.moto_name)
      const batchNo = parsed.batchNo > 0 ? parsed.batchNo : 1
      const list = grouped.get(batchNo) ?? []
      list.push({
        ...moto,
        gates: [...moto.gates].sort((a, b) => a.gate_position - b.gate_position),
      })
      grouped.set(batchNo, list)
    }
    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([batchNo, motos]) => ({
        batchNo,
        motos: motos.sort((a, b) => {
          const pa = parseMotoBatch(a.moto_name)
          const pb = parseMotoBatch(b.moto_name)
          if (pa.motoNo !== pb.motoNo) return pa.motoNo - pb.motoNo
          return a.moto_order - b.moto_order
        }),
      }))
  }, [lockedMotos])

  const externalValidation = useMemo(() => {
    const tokens = parseExternalTokens(externalOrderText)

    const seenToken = new Set<string>()
    const usedRiderIds = new Set<string>()
    const duplicateTokens: string[] = []
    const unknownTokens: string[] = []
    const duplicateRiders: string[] = []
    const orderedRiders: RiderItem[] = []

    for (const token of tokens) {
      const normalizedToken = normalizeExternalToken(token)
      if (seenToken.has(normalizedToken)) {
        duplicateTokens.push(token)
        continue
      }
      seenToken.add(normalizedToken)
      const rider = resolveRiderForToken(riders, token)
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

    const seenToken = new Set<string>()
    const usedRiderIds = new Set<string>()
    const duplicateTokens: string[] = []
    const unknownTokens: string[] = []
    const duplicateRiders: string[] = []
    const orderedRiders: RiderItem[] = []

    for (const token of tokens) {
      const normalizedToken = normalizeExternalToken(token)
      if (seenToken.has(normalizedToken)) {
        duplicateTokens.push(token)
        continue
      }
      seenToken.add(normalizedToken)
      const rider = resolveRiderForToken(riders, token)
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
    const count =
      batchMode === 'CUSTOM_BATCH_SIZES' && customBatchSizes.length > 0
        ? customBatchSizes.length
        : effectiveBatchCount ?? Math.max(1, Math.ceil(riders.length / maxBatchRiders))

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
        const normalizedToken = normalizeExternalToken(token)
        if (batchSeen.has(normalizedToken)) {
          duplicateTokens.push(`B${batchIndex + 1}:${token}`)
          continue
        }
        batchSeen.add(normalizedToken)
        const rider = resolveRiderForToken(riders, token)
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
    const overCapacityBatches = orderedBatches
      .map((batch, index) => (batch.length > maxBatchRiders ? index + 1 : null))
      .filter((value): value is number => value !== null)
    const isValid =
      riders.length > 0 &&
      allFilled &&
      overCapacityBatches.length === 0 &&
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
          const normalizedToken = normalizeExternalToken(token)
          if (batchSeen.has(normalizedToken)) {
            moto2DuplicateTokens.push(`B${batchIndex + 1}:${token}`)
            continue
          }
          batchSeen.add(normalizedToken)
          const rider = resolveRiderForToken(riders, token)
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
      overCapacityBatches,
      isValid,
      moto2Provided,
      moto2UnknownTokens,
      moto2DuplicateTokens,
      moto2BatchMismatch,
      isValidMoto2,
    }
  }, [batchMode, customBatchSizes.length, effectiveBatchCount, riders, externalBatchTexts, externalMoto2BatchTexts, maxBatchRiders])

  const externalBatchLayouts = useMemo(() => {
    let cursor = 0
    return externalPerBatchValidation.orderedBatches.map((batch, index) => {
      const startIndex = cursor
      cursor += batch.length
      return { index: index + 1, riders: batch, startIndex }
    })
  }, [externalPerBatchValidation.orderedBatches])
  const externalMoto1AssignedCount = useMemo(
    () => externalPerBatchValidation.orderedBatches.reduce((total, batch) => total + batch.length, 0),
    [externalPerBatchValidation.orderedBatches]
  )
  const externalMoto2AssignedCount = useMemo(
    () => externalPerBatchValidation.orderedMoto2Batches.reduce((total, batch) => total + batch.length, 0),
    [externalPerBatchValidation.orderedMoto2Batches]
  )
  const activeTargetBatchRiders = useMemo(() => {
    if (externalTargetField.moto === 1) {
      return externalPerBatchValidation.orderedBatches[externalTargetField.batchIndex]?.length ?? 0
    }
    return externalPerBatchValidation.orderedMoto2Batches[externalTargetField.batchIndex]?.length ?? 0
  }, [
    externalPerBatchValidation.orderedBatches,
    externalPerBatchValidation.orderedMoto2Batches,
    externalTargetField.batchIndex,
    externalTargetField.moto,
  ])
  const isActiveTargetBatchFull = activeTargetBatchRiders >= maxBatchRiders
  const isExternalPerBatchMode = drawMode === 'external_draw' && externalBatchInputMode === 'PER_BATCH'
  const displayedBatchCount = isExternalPerBatchMode ? externalPerBatchValidation.batchCount : batches.length
  const applyButtonEnabled =
    !loading &&
    !categoryLocked &&
    (isExternalPerBatchMode ? externalMoto1AssignedCount > 0 : externalValidation.tokens.length > 0)
  const applyButtonReady = isExternalPerBatchMode ? externalPerBatchValidation.isValid : externalValidation.isValid
  const previewRidersForExternalBatch = useMemo(() => {
    return riders.filter((rider) => {
      const assignedInMoto1 = externalPerBatchValidation.orderedBatches.some((batch) =>
        batch.some((item) => item.id === rider.id)
      )
      const assignedInMoto2 = externalPerBatchValidation.orderedMoto2Batches.some((batch) =>
        batch.some((item) => item.id === rider.id)
      )
      if (externalTargetField.moto === 1) return !assignedInMoto1
      return assignedInMoto1 && !assignedInMoto2
    })
  }, [
    riders,
    externalPerBatchValidation.orderedBatches,
    externalPerBatchValidation.orderedMoto2Batches,
    externalTargetField.moto,
  ])
  const filteredPreviewRidersForExternalBatch = useMemo(() => {
    const keyword = externalBatchSearch.trim().toLowerCase()
    if (!keyword) return previewRidersForExternalBatch
    return previewRidersForExternalBatch.filter((rider) => {
      const name = rider.name.toLowerCase()
      const plate = rider.no_plate_display.toLowerCase()
      return name.includes(keyword) || plate.includes(keyword)
    })
  }, [externalBatchSearch, previewRidersForExternalBatch])

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
      ctx.fillStyle = i % 3 === 0 ? '#ff1010' : i % 2 === 0 ? '#303030' : '#141414'
      ctx.fill()
      ctx.strokeStyle = '#0b0b0b'
      ctx.lineWidth = 2
      ctx.stroke()

      if (list.length > 0 && i % labelEvery === 0) {
        const mid = start + step / 2
        ctx.save()
        ctx.rotate(mid)
        ctx.translate(radius * 0.58, 0)
        ctx.rotate(Math.PI / 2)
        ctx.fillStyle = '#ffffff'
        ctx.font = '900 14px Arial, Helvetica, sans-serif'
        const plate = list[i]?.no_plate_display ?? ''
        ctx.fillText(plate.slice(0, 4), -12, 4)
        ctx.restore()
      }
    }

    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2)
    ctx.fillStyle = '#151515'
    ctx.fill()
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.07, 0, Math.PI * 2)
    ctx.fillStyle = '#202020'
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
    const autoCount = Math.max(1, Math.ceil(riders.length / maxBatchRiders))
    setManualBatchCount((prev) =>
      Math.max(autoCount, Math.min(Math.max(1, riders.length), prev || autoCount))
    )
  }, [riders.length, maxBatchRiders])

  useEffect(() => {
    if (externalBatchInputMode !== 'PER_BATCH') return
    const count = effectiveBatchCount ?? Math.max(1, Math.ceil(riders.length / maxBatchRiders))
    setExternalBatchTexts((prev) => Array.from({ length: count }, (_, index) => prev[index] ?? ''))
    setExternalMoto2BatchTexts((prev) => Array.from({ length: count }, (_, index) => prev[index] ?? ''))
    setExternalTargetField((prev) => ({
      batchIndex: Math.max(0, Math.min(count - 1, prev.batchIndex)),
      moto: prev.moto,
    }))
  }, [externalBatchInputMode, effectiveBatchCount, riders.length, maxBatchRiders])

  useEffect(() => {
    if (drawMode === 'external_draw' && externalBatchInputMode !== 'PER_BATCH') {
      setExternalBatchInputMode('PER_BATCH')
    }
  }, [drawMode, externalBatchInputMode])

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
      setEventLogoUrl(typeof json?.data?.event_logo_url === 'string' ? json.data.event_logo_url : null)
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
      setExternalUndoStack([])
      setCustomBatchPattern('')
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
    if (batchMode === 'CUSTOM_BATCH_SIZES' && customBatchError) {
      alert(customBatchError)
      return
    }
    setDrawing(true)
    setSaveState('idle')
    setRollingName('Spinning...')
    setDrawnOrder([])
    const shuffled = shuffle(riders)
    setWheelRiders(shuffled)
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

    // Play Drum Roll/Victory Sound at the START of the spin
    try {
      const audio = new Audio('/sounds/victory.mp3')
      audio.volume = 0.5
      audio.play().catch(() => { })
    } catch (e) {
      // Ignore
    }

    setWheelRotation(targetAngle)

    // DURASI SPIN ROULETTE (7200 ms = 7.2 detik)
    // Jika drum roll di MP3 Anda lebih cepat atau lebih lambat dari 7.2 detik, 
    // ubah angka 7200 di bawah ini agar pas meledak saat berhenti!
    spinTimeoutRef.current = window.setTimeout(() => {
      if (rollingIntervalRef.current) window.clearInterval(rollingIntervalRef.current)
      spinTimeoutRef.current = null
      rollingIntervalRef.current = null
      setRollingName(shuffled[index].name)
      setDrawnOrder(shuffled)
      setDrawing(false)
      triggerVictoryEffects()
      setResultModal('draft')
    }, 4500)
  }

  const triggerVictoryEffects = () => {
    // Confetti Effect (Audio is now played at the start of the spin)
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults, particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
      });
      confetti({
        ...defaults, particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
      });
    }, 250);
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

  const moveRiderInPreview = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction
    if (fromIndex < 0 || toIndex < 0 || toIndex >= drawnOrder.length) return
    setDrawnOrder((prev) => moveItem(prev, fromIndex, toIndex))
    setSaveState('idle')
  }

  const moveRiderByDrag = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex || toIndex >= drawnOrder.length) return
    setDrawnOrder((prev) => moveItem(prev, fromIndex, toIndex))
    setSaveState('idle')
  }

  const clearReorderState = () => {
    setDraggingRiderIndex(null)
    setDragTargetIndex(null)
    setSelectedRiderIndex(null)
  }

  const clearExternalReorderState = () => {
    setExternalDraggingRider(null)
    setExternalDropTarget(null)
    setExternalSelectedRider(null)
  }

  const pushExternalUndoState = () => {
    setExternalUndoStack((prev) => [
      ...prev.slice(-29),
      {
        moto1Texts: [...externalBatchTexts],
        moto2Texts: [...externalMoto2BatchTexts],
        targetField: { ...externalTargetField },
      },
    ])
  }

  const findNextAvailableBatchIndex = (
    moto: 1 | 2,
    startIndex: number,
    nextMoto1Texts?: string[],
    nextMoto2Texts?: string[]
  ) => {
    const sourceTexts = moto === 1 ? nextMoto1Texts ?? externalBatchTexts : nextMoto2Texts ?? externalMoto2BatchTexts
    const counts = sourceTexts.map((text) => parseExternalTokens(text).length)
    if (counts.length === 0) return startIndex
    for (let offset = 1; offset <= counts.length; offset += 1) {
      const candidate = (startIndex + offset) % counts.length
      if ((counts[candidate] ?? 0) < maxBatchRiders) return candidate
    }
    return startIndex
  }

  const undoExternalBatchEdit = () => {
    setExternalUndoStack((prev) => {
      const last = prev[prev.length - 1]
      if (!last) return prev
      setExternalBatchTexts(last.moto1Texts)
      setExternalMoto2BatchTexts(last.moto2Texts)
      setExternalTargetField(last.targetField)
      setDrawnOrder([])
      setHasDrawn(false)
      setSaveState('idle')
      clearExternalReorderState()
      return prev.slice(0, -1)
    })
  }

  const assignPreviewRiderToExternalTarget = (rider: RiderItem) => {
    const assignedInMoto1 = externalPerBatchValidation.orderedBatches.some((batch) =>
      batch.some((item) => item.id === rider.id)
    )
    const assignedInMoto2 = externalPerBatchValidation.orderedMoto2Batches.some((batch) =>
      batch.some((item) => item.id === rider.id)
    )
    const targetBatchCount =
      externalTargetField.moto === 1
        ? externalPerBatchValidation.orderedBatches[externalTargetField.batchIndex]?.length ?? 0
        : externalPerBatchValidation.orderedMoto2Batches[externalTargetField.batchIndex]?.length ?? 0
    if (externalTargetField.moto === 1 && assignedInMoto1) return
    if (externalTargetField.moto === 2 && (!assignedInMoto1 || assignedInMoto2)) return
    if (targetBatchCount >= maxBatchRiders) {
      alert(
        `Batch ${externalTargetField.batchIndex + 1} - Moto ${externalTargetField.moto} sudah penuh. Maksimal ${maxBatchRiders} rider per batch.`
      )
      return
    }

    pushExternalUndoState()

    const setter = externalTargetField.moto === 1 ? setExternalBatchTexts : setExternalMoto2BatchTexts
    setter((prev) => {
      const next = [...prev]
      const current = parseExternalTokens(next[externalTargetField.batchIndex] ?? '')
      current.push(rider.id)
      next[externalTargetField.batchIndex] = current.join('\n')
      if (current.length >= maxBatchRiders) {
        const nextTargetBatchIndex = findNextAvailableBatchIndex(
          externalTargetField.moto,
          externalTargetField.batchIndex,
          externalTargetField.moto === 1 ? next : undefined,
          externalTargetField.moto === 2 ? next : undefined
        )
        if (nextTargetBatchIndex !== externalTargetField.batchIndex) {
          setExternalTargetField((prevTarget) => ({ ...prevTarget, batchIndex: nextTargetBatchIndex }))
        }
      }
      return next
    })
    setExternalBatchSearch('')
    window.requestAnimationFrame(() => {
      externalBatchSearchInputRef.current?.focus()
    })
    setSaveState('idle')
  }

  const moveExternalBatchRider = (from: RiderBatchLocation, to: RiderBatchLocation) => {
    const sourceBatch = externalPerBatchValidation.orderedBatches[from.batchIndex]
    const targetBatch = externalPerBatchValidation.orderedBatches[to.batchIndex]
    if (!sourceBatch || !targetBatch) return
    const movingRider = sourceBatch[from.riderIndex]
    if (!movingRider) return

    pushExternalUndoState()

    const nextMoto1 = externalPerBatchValidation.orderedBatches.map((batch) => [...batch])
    nextMoto1[from.batchIndex].splice(from.riderIndex, 1)
    const insertIndex =
      from.batchIndex === to.batchIndex && from.riderIndex < to.riderIndex ? to.riderIndex - 1 : to.riderIndex
    nextMoto1[to.batchIndex].splice(insertIndex, 0, movingRider)
    setExternalBatchTexts(serializeBatchRiders(nextMoto1))

    setDrawnOrder(nextMoto1.flat())
    setHasDrawn(true)
    setSaveState('idle')
    clearExternalReorderState()
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
    setExternalUndoStack([])
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
      setExternalUndoStack([])
      setResultModal(null)
      setDeleteGuard({ canDelete: true, reason: null })
      await loadRiders(selectedCategory)
      alert('Draw berhasil direset.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal reset draw')
      setSaveState('idle')
    }
  }

  const shareTextOutput = async (title: string, text: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text })
        return
      }
      await navigator.clipboard.writeText(text)
      alert('Output share berhasil disalin.')
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(text)
        alert('Output share berhasil disalin.')
      } catch {
        alert('Gagal share/copy output. Coba copy manual dari browser.')
      }
    }
  }

  const buildDraftBatchShareText = (batch: (typeof batchLayouts)[number]) => {
    const moto2Manual =
      drawMode === 'external_draw' &&
        externalBatchInputMode === 'PER_BATCH' &&
        externalPerBatchValidation.moto2Provided
        ? externalPerBatchValidation.orderedMoto2Batches[batch.index - 1] ?? []
        : []
    const moto2Riders = moto2Manual.length > 0 ? moto2Manual : [...batch.riders].reverse()
    const lines = [
      `🏁 DRAW RESULT`,
      eventName,
      `Kategori: ${selectedCategoryLabel}`,
      `Batch ${batch.index}`,
      '',
      `MOTO 1 - BATCH ${batch.index}`,
      ...batch.riders.map((rider, index) => `G${index + 1} - ${rider.no_plate_display} - ${rider.name}`),
      '',
      `MOTO 2 - BATCH ${batch.index}`,
      ...moto2Riders.map((rider, index) => `G${index + 1} - ${rider.no_plate_display} - ${rider.name}`),
      '',
      'Mohon wali rider cek nomor plate dan gate masing-masing.',
    ]
    return lines.join('\n')
  }

  const buildSavedBatchShareText = (batch: (typeof savedMotoBatches)[number]) => {
    const lines = [
      `🏁 DRAW RESULT`,
      eventName,
      `Kategori: ${selectedCategoryLabel}`,
      `Batch ${batch.batchNo}`,
    ]

    batch.motos.forEach((moto) => {
      lines.push('', moto.moto_name.toUpperCase())
      moto.gates.forEach((gate) => {
        lines.push(`G${gate.gate_position} - ${gate.no_plate_display} - ${gate.name}`)
      })
    })

    lines.push('', 'Mohon wali rider cek nomor plate dan gate masing-masing.')
    return lines.join('\n')
  }

  const buildDraftCategoryShareText = () => {
    const lines = [
      `🏁 DRAW RESULT`,
      eventName,
      `Kategori: ${selectedCategoryLabel}`,
      '',
    ]

    batchLayouts.forEach((batch) => {
      const moto2Manual =
        drawMode === 'external_draw' &&
          externalBatchInputMode === 'PER_BATCH' &&
          externalPerBatchValidation.moto2Provided
          ? externalPerBatchValidation.orderedMoto2Batches[batch.index - 1] ?? []
          : []
      const moto2Riders = moto2Manual.length > 0 ? moto2Manual : [...batch.riders].reverse()
      lines.push(`BATCH ${batch.index}`, `MOTO 1 - BATCH ${batch.index}`)
      batch.riders.forEach((rider, index) => {
        lines.push(`G${index + 1} - ${rider.no_plate_display} - ${rider.name}`)
      })
      lines.push('', `MOTO 2 - BATCH ${batch.index}`)
      moto2Riders.forEach((rider, index) => {
        lines.push(`G${index + 1} - ${rider.no_plate_display} - ${rider.name}`)
      })
      lines.push('')
    })

    lines.push('Mohon wali rider cek nomor plate dan gate masing-masing.')
    return lines.join('\n')
  }

  const buildSavedCategoryShareText = () => {
    const lines = [
      `🏁 DRAW RESULT`,
      eventName,
      `Kategori: ${selectedCategoryLabel}`,
      '',
    ]

    savedMotoBatches.forEach((batch) => {
      lines.push(`BATCH ${batch.batchNo}`)
      batch.motos.forEach((moto) => {
        lines.push('', moto.moto_name.toUpperCase())
        moto.gates.forEach((gate) => {
          lines.push(`G${gate.gate_position} - ${gate.no_plate_display} - ${gate.name}`)
        })
      })
      lines.push('')
    })

    lines.push('Mohon wali rider cek nomor plate dan gate masing-masing.')
    return lines.join('\n')
  }

  const loadCanvasImage = async (src: string) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Gagal memuat logo event.'))
      image.src = src
    })
    return image
  }

  const wrapCanvasText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines = 2
  ) => {
    const words = text.split(/\s+/).filter(Boolean)
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line)
        line = word
        if (lines.length >= maxLines) break
      } else {
        line = testLine
      }
    }
    if (line && lines.length < maxLines) lines.push(line)
    lines.forEach((lineText, index) => ctx.fillText(lineText, x, y + index * lineHeight))
    return y + Math.max(1, lines.length) * lineHeight
  }

  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + width, y, x + width, y + height, radius)
    ctx.arcTo(x + width, y + height, x, y + height, radius)
    ctx.arcTo(x, y + height, x, y, radius)
    ctx.arcTo(x, y, x + width, y, radius)
    ctx.closePath()
  }

  const drawLogo = async (ctx: CanvasRenderingContext2D, logoUrl: string | null) => {
    ctx.save()
    drawRoundRect(ctx, 64, 48, 116, 116, 28)
    ctx.fillStyle = '#111'
    ctx.fill()
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.stroke()
    if (logoUrl) {
      try {
        const logo = await loadCanvasImage(logoUrl)
        const size = 92
        ctx.save()
        drawRoundRect(ctx, 76, 60, size, size, 20)
        ctx.clip()
        ctx.drawImage(logo, 76, 60, size, size)
        ctx.restore()
      } catch {
        ctx.fillStyle = '#f8ce3d'
        ctx.beginPath()
        ctx.arc(122, 106, 34, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.fillStyle = '#f8ce3d'
      ctx.beginPath()
      ctx.arc(122, 106, 34, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  const buildDrawBatchPngBlob = async ({
    batchLabel,
    motos,
  }: {
    batchLabel: string
    motos: Array<{
      title: string
      rows: Array<{ gate: number; plate: string; name: string }>
    }>
  }) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1920
    canvas.height = 1080
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas tidak tersedia.')

    // Dark gradient background
    const gradient = ctx.createLinearGradient(0, 0, 1920, 1080)
    gradient.addColorStop(0, '#1a1a1a')
    gradient.addColorStop(0.5, '#0e0e0e')
    gradient.addColorStop(1, '#050505')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 1920, 1080)

    // Checkered pattern subtle overlay
    ctx.fillStyle = 'rgba(255,255,255,0.02)'
    for (let i = -220; i < 2200; i += 120) {
      ctx.save()
      ctx.translate(i, 0)
      ctx.rotate(-0.35)
      ctx.fillRect(0, 0, 54, 2100)
      ctx.restore()
    }

    await drawLogo(ctx, eventLogoUrl)

    // Header Left Text
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f8ce3d'
    ctx.font = 'italic 900 24px Arial, Helvetica, sans-serif'
    ctx.fillText('DRAW RESULT', 204, 86)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'italic 900 38px Arial, Helvetica, sans-serif'
    wrapCanvasText(ctx, eventName, 204, 132, 800, 42, 1)

    // Header Right Text
    ctx.textAlign = 'right'
    ctx.fillStyle = '#e9c400'
    ctx.font = 'italic 900 28px Arial, Helvetica, sans-serif'
    ctx.fillText(selectedCategoryLabel.toUpperCase(), 1856, 86)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'italic 900 64px Arial, Helvetica, sans-serif'
    ctx.fillText(batchLabel.toUpperCase(), 1856, 150)
    ctx.textAlign = 'left'

    // Calculate dynamic columns based on number of motos
    const numMotos = Math.max(1, motos.length)
    const gap = 32
    const totalWidth = 1792
    const colWidth = (totalWidth - (gap * (numMotos - 1))) / numMotos

    motos.forEach((moto, motoIndex) => {
      const x = 64 + (colWidth + gap) * motoIndex
      let y = 210

      // Moto Title BG
      drawRoundRect(ctx, x, y, colWidth, 54, 12)
      ctx.fillStyle = '#f8ce3d'
      ctx.fill()
      ctx.fillStyle = '#1c1b1b'
      ctx.font = 'italic 900 24px Arial, Helvetica, sans-serif'
      ctx.fillText(moto.title.toUpperCase(), x + 24, y + 36)
      y += 74

      moto.rows.slice(0, 14).forEach((row) => {
        const rowHeight = 64
        drawRoundRect(ctx, x, y, colWidth, rowHeight, 10)
        ctx.fillStyle = '#151515'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#2a2a2a'
        ctx.stroke()

        // Red accent line on left edge
        ctx.fillStyle = '#f8ce3d'
        ctx.beginPath()
        ctx.moveTo(x + 10, y)
        ctx.lineTo(x, y + 10)
        ctx.lineTo(x, y + rowHeight - 10)
        ctx.lineTo(x + 10, y + rowHeight)
        ctx.lineTo(x + 6, y + rowHeight)
        ctx.lineTo(x + 6, y)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.font = '900 22px Arial, Helvetica, sans-serif'
        ctx.fillText(`G${row.gate}`, x + 34, y + 40)
        ctx.fillStyle = '#e9c400'
        ctx.fillText(row.plate, x + 84, y + 40)
        ctx.fillStyle = '#e5e2e1'
        ctx.font = '800 21px Arial, Helvetica, sans-serif'
        wrapCanvasText(ctx, row.name, x + 160, y + 27, colWidth - 170, 24, 1)
        y += rowHeight + 10
      })

      if (moto.rows.length > 14) {
        ctx.fillStyle = '#888'
        ctx.font = '900 20px Arial, Helvetica, sans-serif'
        ctx.fillText(`+ ${moto.rows.length - 14} rider lainnya`, x + 24, y + 18)
        y += 40
      }
    })

    // Footer
    ctx.fillStyle = '#151515'
    drawRoundRect(ctx, 64, 960, 1792, 70, 14)
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#2a2a2a'
    ctx.stroke()
    ctx.fillStyle = '#f8ce3d'
    ctx.font = '900 22px Arial, Helvetica, sans-serif'
    ctx.fillText('Cek nomor plate dan gate masing-masing sebelum race.', 96, 1004)

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 1))
    if (!pngBlob) throw new Error('Gagal membuat PNG.')
    return pngBlob
  }

  const shareOrDownloadPng = async (blob: Blob, filename: string, title: string) => {
    const file = new File([blob], filename, { type: 'image/png' })
    const canShareFile =
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    if (navigator.share && canShareFile) {
      try {
        await navigator.share({ title, files: [file] })
        return
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const shareOrDownloadPngs = async (blobs: Blob[], filenames: string[], title: string) => {
    const files = blobs.map((blob, i) => new File([blob], filenames[i], { type: 'image/png' }))
    const canShareFiles =
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files })
    if (navigator.share && canShareFiles) {
      try {
        await navigator.share({ title, files })
        return
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }

    // Fallback: download them sequentially
    blobs.forEach((blob, i) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filenames[i]
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  const downloadDraftBatchPng = async (batch: (typeof batchLayouts)[number]) => {
    const moto2Manual =
      drawMode === 'external_draw' &&
        externalBatchInputMode === 'PER_BATCH' &&
        externalPerBatchValidation.moto2Provided
        ? externalPerBatchValidation.orderedMoto2Batches[batch.index - 1] ?? []
        : []
    const moto2Riders = moto2Manual.length > 0 ? moto2Manual : [...batch.riders].reverse()
    const blob = await buildDrawBatchPngBlob({
      batchLabel: `Batch ${batch.index}`,
      motos: [
        {
          title: `Moto 1 - Batch ${batch.index}`,
          rows: batch.riders.map((rider, index) => ({
            gate: index + 1,
            plate: rider.no_plate_display,
            name: rider.name,
          })),
        },
        {
          title: `Moto 2 - Batch ${batch.index}`,
          rows: moto2Riders.map((rider, index) => ({
            gate: index + 1,
            plate: rider.no_plate_display,
            name: rider.name,
          })),
        },
      ],
    })
    const filename = `${sanitizeFileName(eventName)}-${sanitizeFileName(selectedCategoryLabel)}-batch-${batch.index}.png`
    await shareOrDownloadPng(blob, filename, `Draw ${selectedCategoryLabel} Batch ${batch.index}`)
  }

  const downloadSavedBatchPng = async (batch: (typeof savedMotoBatches)[number]) => {
    const blob = await buildDrawBatchPngBlob({
      batchLabel: `Batch ${batch.batchNo}`,
      motos: batch.motos.map((moto) => ({
        title: moto.moto_name,
        rows: moto.gates.map((gate) => ({
          gate: gate.gate_position,
          plate: gate.no_plate_display,
          name: gate.name,
        })),
      })),
    })
    const filename = `${sanitizeFileName(eventName)}-${sanitizeFileName(selectedCategoryLabel)}-batch-${batch.batchNo}.png`
    await shareOrDownloadPng(blob, filename, `Draw ${selectedCategoryLabel} Batch ${batch.batchNo}`)
  }

  const saveAsMoto = async () => {
    if (!selectedCategory) {
      alert('Pilih kategori dulu.')
      return
    }
    if (drawMode === 'external_draw' && externalBatchInputMode === 'PER_BATCH') {
      if (!externalPerBatchValidation.isValid) {
        alert('Susunan batch Moto 1 belum lengkap/valid. Pastikan semua rider sudah ditempatkan.')
        return
      }
      if (externalPerBatchValidation.moto2Provided && !externalPerBatchValidation.isValidMoto2) {
        alert('Urutan Moto 2 manual per batch belum valid. Cek kembali input Moto 2.')
        return
      }
    } else {
      if (drawnOrder.length === 0) {
        alert(drawMode === 'external_draw' ? 'Klik "Gunakan Urutan External" dulu.' : 'Lakukan draw terlebih dulu.')
        return
      }
      if (
        drawMode === 'external_draw' &&
        externalBatchInputMode !== 'PER_BATCH' &&
        externalMoto2Validation.isProvided &&
        !externalMoto2Validation.isValidForMoto1
      ) {
        alert('Urutan Moto 2 manual belum valid per batch. Cek kembali input Moto 2.')
        return
      }
    }
    if (batchMode === 'CUSTOM_BATCH_SIZES' && customBatchError) {
      alert(customBatchError)
      return
    }
    setSaveState('saving')
    try {
      const riderBatches =
        drawMode === 'external_draw' && externalBatchInputMode === 'PER_BATCH'
          ? externalPerBatchValidation.orderedBatches.map((batch) => batch.map((rider) => rider.id))
          : batches.map((batch) => batch.riders.map((rider) => rider.id))
      const riderIdsForMoto1 =
        drawMode === 'external_draw' && externalBatchInputMode === 'PER_BATCH'
          ? riderBatches.flat()
          : drawnOrder.map((r) => r.id)
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
        rider_ids: riderIdsForMoto1,
        batch_size: batchMode === 'CUSTOM_BATCH_SIZES' ? maxBatchRiders : batchSize,
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
    <div className="ld-client" style={{ maxWidth: 1280 }}>
      <iframe
        ref={printFrameRef}
        title="live-draw-print-frame"
        style={{ position: 'absolute', width: 0, height: 0, border: 0, visibility: 'hidden' }}
      />
      <div className="ld-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>
            {drawMode === 'external_draw' ? `External Draw (${eventName})` : `Live Draw (${eventName})`}
          </h1>
        </div>
      </div>

      <div
        className="ld-control-grid"
        style={{
          marginTop: 16,
          background: '#1c1b1b',
          border: '1px solid #353534',
          borderRadius: 0,
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <div className="ld-mode-field" style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Mode
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { value: 'internal_live_draw' as const, label: 'Internal Live Draw' },
              { value: 'external_draw' as const, label: 'External Draw / Restore' },
            ].map((option) => {
              const active = drawMode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDrawMode(option.value)}
                  disabled={categoryLocked}
                  style={{
                    border: active ? '1px solid #f8ce3d' : '1px solid #353534',
                    background: active ? '#f8ce3d' : '#111',
                    color: active ? '#111' : '#e5e2e1',
                    cursor: categoryLocked ? 'not-allowed' : 'pointer',
                    fontWeight: 950,
                    opacity: categoryLocked ? 0.55 : 1,
                    padding: '10px 12px',
                    textTransform: 'uppercase',
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          {categoryLocked && (
            <div style={{ color: '#f87171', fontSize: 12, fontWeight: 900 }}>
              Mode tidak bisa diubah karena kategori ini sudah memiliki moto tersimpan.
            </div>
          )}
        </div>

        <div className="ld-category-field" style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Pilih Kategori
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ padding: 12, borderRadius: 0, border: '1px solid #353534' }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ld-format-field" style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Format Batch
          </div>
          <div className="ld-format-options" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
              <input
                type="radio"
                checked={batchMode === 'CUSTOM_BATCH_SIZES'}
                onChange={() => setBatchMode('CUSTOM_BATCH_SIZES')}
              />
              Custom rider per batch
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
                style={{ padding: 12, borderRadius: 0, border: '1px solid #353534', maxWidth: 160 }}
              />
            </>
          ) : batchMode === 'CUSTOM_BATCH_SIZES' ? (
            <>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Pola Jumlah Rider per Batch
              </div>
              <input
                type="text"
                value={customBatchPattern}
                onChange={(e) => setCustomBatchPattern(e.target.value)}
                placeholder="Contoh: 7,6,6"
                style={{ padding: 12, borderRadius: 0, border: '1px solid #353534', maxWidth: 260 }}
              />
              <div style={{ color: customBatchError ? '#b91c1c' : '#047857', fontWeight: 800 }}>
                {customBatchError ??
                  `Valid: ${customBatchSizes.length} batch, total ${customBatchTotal} rider. Maksimal ${maxBatchRiders} rider per batch.`}
              </div>
              <div style={{ color: '#475569', fontWeight: 800 }}>
                Pisahkan angka dengan koma atau spasi. Contoh 19 rider: 7,6,6.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Jumlah Batch
              </div>
              <input
                type="number"
                min={minimumManualBatchCount}
                max={Math.max(1, riders.length)}
                value={effectiveBatchCount ?? manualBatchCount}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  setManualBatchCount(
                    Math.max(minimumManualBatchCount, Math.min(Math.max(1, riders.length), next))
                  )
                }}
                style={{ padding: 12, borderRadius: 0, border: '1px solid #353534', maxWidth: 160 }}
              />
              <div style={{ color: '#475569', fontWeight: 800 }}>
                Sistem akan membagi rider seimbang per batch. Maksimal {maxBatchRiders} rider per batch, jadi minimal perlu {minimumManualBatchCount} batch untuk {riders.length} rider.
              </div>
            </>
          )}
        </div>

        <div
          className="ld-draw-stage"
          style={{
            border: '1px solid #353534',
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
            <div className="ld-stage-title" style={{ fontWeight: 900, fontSize: 18 }}>
              {drawMode === 'external_draw' ? 'External Order' : 'Wheel Spin'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 950, color: '#e5e2e1' }}>{rollingName}</div>
            {drawing && (
              <div style={{ color: '#f8ce3d', fontWeight: 900 }}>
                Sedang mengundi rider, tunggu sampai hasil preview muncul otomatis.
              </div>
            )}
            <div style={{ color: '#9a9693', fontWeight: 700 }}>
              Total rider: {riders.length} | Batch: {displayedBatchCount}
            </div>
            <div style={{ color: '#9a9693', fontWeight: 700 }}>
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
            {drawMode === 'external_draw' && externalBatchInputMode === 'PER_BATCH' && (
              <div style={{ display: 'grid', gap: 8 }}>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 0,
                    border: categoryLocked ? '1px solid #cbd5e1' : '1px solid #bfdbfe',
                    background: categoryLocked ? '#f8fafc' : '#eff6ff',
                    color: categoryLocked ? '#475569' : '#f8ce3d',
                    fontWeight: 800,
                  }}
                >
                  {categoryLocked ? (
                    <>
                      Preview Rider nonaktif karena kategori ini sudah didraw dan terkunci.
                    </>
                  ) : (
                    <>
                      Klik rider untuk masuk ke target aktif:{' '}
                      <strong>Batch {externalTargetField.batchIndex + 1} - Moto {externalTargetField.moto}</strong>{' '}
                      ({activeTargetBatchRiders}/{maxBatchRiders} rider)
                      {isActiveTargetBatchFull ? ' - PENUH' : ''}
                    </>
                  )}
                </div>
                <input
                  ref={externalBatchSearchInputRef}
                  type="text"
                  value={externalBatchSearch}
                  onChange={(e) => setExternalBatchSearch(e.target.value)}
                  aria-label="Cari rider manual batch"
                  placeholder="Cari rider manual batch atau no plate"
                  disabled={categoryLocked}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 0,
                    border: '1px solid #353534',
                    background: categoryLocked ? '#f1f5f9' : '#fff',
                    color: categoryLocked ? '#94a3b8' : '#0f172a',
                    fontWeight: 700,
                    cursor: categoryLocked ? 'not-allowed' : 'text',
                  }}
                />
              </div>
            )}
            {(isExternalPerBatchMode ? filteredPreviewRidersForExternalBatch.length === 0 : riders.length === 0) ? (
              <div style={{ fontWeight: 800, color: '#9a9693' }}>
                {isExternalPerBatchMode
                  ? externalBatchSearch.trim()
                    ? 'Tidak ada rider yang cocok dengan pencarian ini.'
                    : externalTargetField.moto === 1
                      ? 'Semua rider sudah ditempatkan ke Moto 1.'
                      : 'Semua rider yang tersedia untuk Moto 2 sudah ditempatkan.'
                  : 'Belum ada rider.'}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gap: 12,
                maxHeight: 280,
                overflowY: 'auto',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                paddingRight: 8
              }}>
                {(isExternalPerBatchMode ? filteredPreviewRidersForExternalBatch : riders).map((rider) => {
                  const assignedInMoto1 = externalPerBatchValidation.orderedBatches.some((batch) =>
                    batch.some((item) => item.id === rider.id)
                  )
                  const assignedInMoto2 = externalPerBatchValidation.orderedMoto2Batches.some((batch) =>
                    batch.some((item) => item.id === rider.id)
                  )
                  const interactive =
                    drawMode === 'external_draw' && externalBatchInputMode === 'PER_BATCH' && !categoryLocked
                  const disabledForAssignment =
                    externalTargetField.moto === 1
                      ? assignedInMoto1
                      : !assignedInMoto1 || assignedInMoto2
                  const disabledForTarget = disabledForAssignment || (interactive && isActiveTargetBatchFull)
                  const statusLabel = isActiveTargetBatchFull
                    ? `Penuh`
                    : assignedInMoto2
                      ? 'Di Moto 2'
                      : assignedInMoto1
                        ? 'Di Moto 1'
                        : 'Siap'
                  return (
                    <button
                      type="button"
                      key={rider.id}
                      onClick={() => {
                        if (interactive && !disabledForTarget) assignPreviewRiderToExternalTarget(rider)
                      }}
                      title={interactive ? statusLabel : undefined}
                      aria-disabled={interactive ? disabledForTarget : false}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 6,
                        padding: '12px 6px',
                        borderRadius: 12,
                        border: disabledForTarget || categoryLocked ? '1px solid #2a2a2a' : '1px solid #f8ce3d',
                        background: categoryLocked || disabledForTarget ? '#1a1a1a' : '#111',
                        cursor: categoryLocked ? 'not-allowed' : interactive ? (disabledForTarget ? 'default' : 'pointer') : 'default',
                        textAlign: 'center',
                        opacity: categoryLocked || disabledForTarget ? 0.5 : 1,
                        boxShadow: disabledForTarget || categoryLocked ? 'none' : '0 4px 16px rgba(248, 206, 61, 0.15)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span style={{ fontSize: 24, fontWeight: 950, color: disabledForTarget || categoryLocked ? '#64748b' : '#f8ce3d', lineHeight: 1 }}>
                        {rider.no_plate_display}
                      </span>
                      <span style={{ display: 'grid', gap: 2, width: '100%' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#e5e2e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', padding: '0 4px' }}>
                          {rider.name}
                        </span>
                        <span style={{ color: '#64748b', fontSize: 10, fontWeight: 700 }}>
                          {categoryLocked
                            ? 'Selesai'
                            : interactive
                              ? isActiveTargetBatchFull
                                ? 'Penuh'
                                : externalTargetField.moto === 1
                                  ? 'Klik: Moto 1'
                                  : 'Klik: Moto 2'
                              : statusLabel}
                        </span>
                      </span>
                    </button>
                  )
                })}
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

                <canvas
                  ref={canvasRef}
                  width={360}
                  height={360}
                  style={{
                    width: 360,
                    height: 360,
                    borderRadius: '50%',
                    border: '6px solid #0f172a',
                    background: '#1c1b1b',
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
                  disabled={loading || drawing || riders.length === 0 || hasDrawn || (batchMode === 'CUSTOM_BATCH_SIZES' && Boolean(customBatchError))}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 0,
                    border: '1px solid #353534',
                    background: drawing || hasDrawn || (batchMode === 'CUSTOM_BATCH_SIZES' && Boolean(customBatchError)) ? '#ddd' : '#f8ce3d',
                    fontWeight: 900,
                    cursor: drawing || hasDrawn || (batchMode === 'CUSTOM_BATCH_SIZES' && Boolean(customBatchError)) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {hasDrawn ? 'Draw Terkunci' : 'SPIN DRAW'}
                </button>
                {drawnOrder.length > 0 && !categoryLocked && (
                  <button
                    type="button"
                    onClick={resetDraw}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 0,
                      border: '1px solid #353534',
                      background: '#1c1b1b',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Ulangi Draw
                  </button>
                )}
                {categoryLocked && (
                  <>
                    {!deleteGuard.canDelete && deleteGuard.reason && (
                      <div
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 0,
                          border: '1px solid #f59e0b',
                          background: '#1a1500',
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
                        borderRadius: 0,
                        border: '1px solid #353534',
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
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ color: '#334155', fontWeight: 700 }}>
                Isi rider langsung ke editor batch. Klik rider di preview untuk kirim ke target aktif, lalu rapikan urutan dari editor.
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: '1px solid #bfdbfe',
                  background: '#141414',
                }}
              >
                <div style={{ fontWeight: 900, color: '#f8ce3d' }}>Target aktif</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {Array.from({ length: externalPerBatchValidation.batchCount }, (_, index) => (
                    <button
                      key={`target-batch-${index}`}
                      type="button"
                      onClick={() => setExternalTargetField((prev) => ({ ...prev, batchIndex: index }))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 0,
                        border: '1px solid #93c5fd',
                        background: externalTargetField.batchIndex === index ? '#dbeafe' : '#fff',
                        color: externalTargetField.batchIndex === index ? '#f8ce3d' : '#334155',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Batch {index + 1}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1, 2].map((moto) => (
                    <button
                      key={`target-moto-${moto}`}
                      type="button"
                      onClick={() => setExternalTargetField((prev) => ({ ...prev, moto: moto as 1 | 2 }))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 0,
                        border: '1px solid #93c5fd',
                        background: externalTargetField.moto === moto ? '#dbeafe' : '#fff',
                        color: externalTargetField.moto === moto ? '#f8ce3d' : '#334155',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Moto {moto}
                    </button>
                  ))}
                </div>
                <div style={{ fontWeight: 800, color: '#334155' }}>
                  Batch {externalTargetField.batchIndex + 1} - Moto {externalTargetField.moto}
                </div>
                <button
                  type="button"
                  onClick={undoExternalBatchEdit}
                  disabled={externalUndoStack.length === 0}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid #94a3b8',
                    background: externalUndoStack.length === 0 ? '#e5e7eb' : '#fff',
                    color: '#e5e2e1',
                    fontWeight: 900,
                    cursor: externalUndoStack.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Undo
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {externalPerBatchValidation.orderedBatches.map((batch, index) => (
                  <div
                    key={`batch-status-${index}`}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 0,
                      border: '1px solid #353534',
                      background:
                        batch.length > 0
                          ? externalTargetField.batchIndex === index
                            ? '#dbeafe'
                            : '#f8fafc'
                          : '#fff7ed',
                      color:
                        batch.length > 0
                          ? externalTargetField.batchIndex === index
                            ? '#f8ce3d'
                            : '#334155'
                          : '#b45309',
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    Batch {index + 1}: {batch.length}/{maxBatchRiders} rider
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 4,
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: `1px solid ${externalPerBatchValidation.isValid ? '#86efac' : '#fecaca'}`,
                  background: externalPerBatchValidation.isValid ? '#f0fdf4' : '#fef2f2',
                  color: externalPerBatchValidation.isValid ? '#166534' : '#b91c1c',
                  fontWeight: 800,
                }}
              >
                <div>
                  {externalPerBatchValidation.isValid
                    ? `Moto 1 siap diproses - ${externalMoto1AssignedCount}/${riders.length} rider sudah ditempatkan`
                    : `Moto 1 belum lengkap - ${externalMoto1AssignedCount}/${riders.length} rider sudah ditempatkan`}
                </div>
                {externalPerBatchValidation.emptyBatches.length > 0 && (
                  <div>Batch kosong: {externalPerBatchValidation.emptyBatches.join(', ')}</div>
                )}
                {externalPerBatchValidation.overCapacityBatches.length > 0 && (
                  <div>
                    Batch melebihi kapasitas {maxBatchRiders} rider: {externalPerBatchValidation.overCapacityBatches.join(', ')}
                  </div>
                )}
                {externalPerBatchValidation.missingRiders.length > 0 && (
                  <div>
                    Belum terisi: {externalPerBatchValidation.missingRiders.slice(0, 8).map((rider) => rider.no_plate_display).join(', ')}
                  </div>
                )}
                <div style={{ color: externalPerBatchValidation.isValidMoto2 ? '#166534' : '#92400e' }}>
                  Moto 2:{' '}
                  {externalPerBatchValidation.moto2Provided
                    ? externalPerBatchValidation.isValidMoto2
                      ? `manual siap - ${externalMoto2AssignedCount}/${externalMoto1AssignedCount} rider`
                      : `manual belum sinkron${externalPerBatchValidation.moto2BatchMismatch.length > 0 ? ` (batch mismatch ${externalPerBatchValidation.moto2BatchMismatch.join(', ')})` : ''}`
                    : 'otomatis reverse saat generate moto'}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
                <div
                  style={{
                    padding: '14px 16px',
                    borderRadius: 0,
                    border: '1px solid #bfdbfe',
                    background: '#141414',
                    color: '#f8ce3d',
                    fontWeight: 800,
                  }}
                >
                  {externalTargetField.moto === 1
                    ? 'Editor Batch Moto 1: drag handle :: ke row tujuan, atau klik Pilih lalu tap rider tujuan.'
                    : 'Target Moto 2 aktif: klik rider di Preview Rider untuk menyusun urutan manual Moto 2. Editor batch di bawah tetap menunjukkan struktur Batch Moto 1.'}
                </div>

                {externalSelectedRider && externalBatchLayouts[externalSelectedRider.batchIndex]?.riders[externalSelectedRider.riderIndex] && (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 0,
                      border: '1px solid #facc15',
                      background: '#1a1500',
                      color: '#92400e',
                      fontWeight: 800,
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      Mode pindah aktif:{' '}
                      <strong>
                        {externalBatchLayouts[externalSelectedRider.batchIndex]?.riders[externalSelectedRider.riderIndex]?.no_plate_display}
                      </strong>
                      . Tap row tujuan untuk memindahkan rider ini.
                    </span>
                    <button
                      type="button"
                      onClick={() => setExternalSelectedRider(null)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid #d97706',
                        background: '#1c1b1b',
                        color: '#92400e',
                        fontWeight: 900,
                        cursor: 'pointer',
                      }}
                    >
                      Batal
                    </button>
                  </div>
                )}

                {externalBatchLayouts.map((batch, batchIndex) => (
                  <div
                    key={`external-editor-${batch.index}`}
                    style={{
                      border: '1px solid #353534',
                      borderRadius: 18,
                      padding: 14,
                      background: '#1c1b1b',
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div style={{ fontWeight: 950, fontSize: 18, color: '#e5e2e1' }}>Batch {batch.index}</div>
                      <div
                        style={{
                          padding: '6px 10px',
                          borderRadius: 0,
                          background: '#0a1628',
                          color: '#f8ce3d',
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                      >
                        {batch.riders.length} rider
                      </div>
                    </div>

                    {batch.riders.map((rider, riderIndex) => {
                      const location = { batchIndex, riderIndex }
                      const isDragging =
                        externalDraggingRider?.batchIndex === batchIndex &&
                        externalDraggingRider?.riderIndex === riderIndex
                      const isDropTarget =
                        externalDropTarget?.batchIndex === batchIndex &&
                        externalDropTarget?.riderIndex === riderIndex &&
                        !isDragging
                      const isSelected =
                        externalSelectedRider?.batchIndex === batchIndex &&
                        externalSelectedRider?.riderIndex === riderIndex
                      return (
                        <div
                          key={`external-editor-rider-${rider.id}`}
                          onClick={() => {
                            if (
                              externalSelectedRider &&
                              (externalSelectedRider.batchIndex !== batchIndex ||
                                externalSelectedRider.riderIndex !== riderIndex)
                            ) {
                              moveExternalBatchRider(externalSelectedRider, location)
                            }
                          }}
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            setExternalDropTarget(location)
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            const raw = e.dataTransfer.getData('text/plain')
                            if (!raw) return
                            const [fromBatchIndex, fromRiderIndex] = raw.split(':').map(Number)
                            if (Number.isNaN(fromBatchIndex) || Number.isNaN(fromRiderIndex)) return
                            moveExternalBatchRider(
                              { batchIndex: fromBatchIndex, riderIndex: fromRiderIndex },
                              location
                            )
                          }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'auto auto minmax(0, 1fr) auto',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 12px',
                            borderRadius: 14,
                            border: isDropTarget ? '2px dashed #2563eb' : isSelected ? '2px solid #f59e0b' : '1px solid #dbeafe',
                            background: isDropTarget ? '#dbeafe' : isSelected ? '#fffbeb' : riderIndex % 2 === 0 ? '#eff6ff' : '#f8fafc',
                            fontWeight: 800,
                            opacity: isDragging ? 0.45 : 1,
                            cursor:
                              externalSelectedRider &&
                                (externalSelectedRider.batchIndex !== batchIndex || externalSelectedRider.riderIndex !== riderIndex)
                                ? 'copy'
                                : 'default',
                          }}
                        >
                          <span
                            draggable
                            onDragStart={(e) => {
                              e.stopPropagation()
                              e.dataTransfer.setData('text/plain', `${batchIndex}:${riderIndex}`)
                              e.dataTransfer.effectAllowed = 'move'
                              setExternalDraggingRider(location)
                              setExternalDropTarget(location)
                              setExternalSelectedRider(null)
                            }}
                            onDragEnd={() => clearExternalReorderState()}
                            title="Drag rider"
                            style={{
                              width: 28,
                              height: 28,
                              display: 'grid',
                              placeItems: 'center',
                              borderRadius: 8,
                              border: '1px solid #94a3b8',
                              background: '#1c1b1b',
                              color: '#e5e2e1',
                              fontWeight: 900,
                              cursor: 'grab',
                              userSelect: 'none',
                            }}
                          >
                            ::
                          </span>
                          <span
                            style={{
                              minWidth: 66,
                              textAlign: 'center',
                              padding: '6px 8px',
                              borderRadius: 0,
                              background: '#201f1f',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 900,
                            }}
                          >
                            Gate {riderIndex + 1}
                          </span>
                          <span style={{ color: '#e5e2e1' }}>
                            {rider.name} <span style={{ color: '#475569' }}>({rider.no_plate_display})</span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExternalSelectedRider((prev) =>
                                prev?.batchIndex === batchIndex && prev?.riderIndex === riderIndex ? null : location
                              )
                            }}
                            style={{
                              minWidth: 54,
                              height: 34,
                              padding: '0 10px',
                              borderRadius: 10,
                              border: '1px solid #94a3b8',
                              background: isSelected ? '#fef3c7' : '#fff',
                              color: '#e5e2e1',
                              fontWeight: 900,
                              cursor: 'pointer',
                            }}
                          >
                            {isSelected ? 'Batal' : 'Pilih'}
                          </button>
                        </div>
                      )
                    })}

                    {batch.riders.length === 0 && (
                      <div
                        style={{
                          padding: '14px 16px',
                          borderRadius: 14,
                          border: '1px dashed #cbd5e1',
                          background: '#141414',
                          color: '#64748b',
                          fontWeight: 800,
                        }}
                      >
                        Batch ini masih kosong. Klik rider dari Preview Rider untuk mengisi ke target aktif.
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={applyExternalOrder}
                  disabled={!applyButtonEnabled}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 0,
                    border: '1px solid #353534',
                    background: applyButtonReady ? '#f8ce3d' : '#fef3c7',
                    fontWeight: 900,
                    cursor: applyButtonEnabled ? 'pointer' : 'not-allowed',
                  }}
                >
                  Gunakan Editor Batch
                </button>
                {drawnOrder.length > 0 && !categoryLocked && (
                  <button
                    type="button"
                    onClick={resetDraw}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 0,
                      border: '1px solid #353534',
                      background: '#1c1b1b',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Ulangi Draw
                  </button>
                )}
                {categoryLocked && (
                  <>

                    <button
                      type="button"
                      onClick={resetLockedDraw}
                      disabled={saveState === 'saving'}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 0,
                        border: '1px solid #353534',
                        background: '#1a0000',
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

        <aside className="ld-results-panel">
          <div className="ld-results-panel__head">
            <div>
              <div className="ld-kicker">Draw Result</div>
              <div className="ld-results-panel__meta">
                {categoryLocked
                  ? `${savedMotoBatches.length} batch tersimpan`
                  : drawnOrder.length > 0
                    ? `${batchLayouts.length} batch draft`
                    : 'Belum ada hasil draw.'}
              </div>
            </div>
            <span className="ld-recording-dot">
              <span />
              Recording
            </span>
          </div>

          <div className="ld-results-panel__body">
            {!categoryLocked && drawnOrder.length === 0 && (
              <div className="ld-empty-telemetry">
                <div className="ld-spinner-mark">↻</div>
                <div>Awaiting telemetry...</div>
              </div>
            )}

            {!categoryLocked && batchLayouts.map((batch) => {
              const moto2Manual =
                drawMode === 'external_draw' &&
                  externalBatchInputMode === 'PER_BATCH' &&
                  externalPerBatchValidation.moto2Provided
                  ? externalPerBatchValidation.orderedMoto2Batches[batch.index - 1] ?? []
                  : []
              const moto2Riders = moto2Manual.length > 0 ? moto2Manual : [...batch.riders].reverse()
              return (
                <div key={`inline-draft-${batch.index}`} className="ld-result-card">
                  <div className="ld-result-card__title">Batch {batch.index}</div>
                  <div className="ld-result-moto">
                    <div className="ld-result-moto__label">Moto 1</div>
                    {batch.riders.map((rider, index) => (
                      <div key={`inline-draft-m1-${batch.index}-${rider.id}`} className="ld-result-row">
                        <span>G{index + 1}</span>
                        <strong>{rider.no_plate_display}</strong>
                        <em>{rider.name}</em>
                      </div>
                    ))}
                  </div>
                  <div className="ld-result-moto">
                    <div className="ld-result-moto__label">Moto 2</div>
                    {moto2Riders.map((rider, index) => (
                      <div key={`inline-draft-m2-${batch.index}-${rider.id}`} className="ld-result-row">
                        <span>G{index + 1}</span>
                        <strong>{rider.no_plate_display}</strong>
                        <em>{rider.name}</em>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {categoryLocked && savedMotoBatches.map((batch) => (
              <div key={`inline-saved-${batch.batchNo}`} className="ld-result-card">
                <div className="ld-result-card__title">Batch {batch.batchNo}</div>
                {batch.motos.map((moto) => (
                  <div key={`inline-saved-moto-${moto.id}`} className="ld-result-moto">
                    <div className="ld-result-moto__label">{moto.moto_name}</div>
                    {moto.gates.map((gate) => (
                      <div key={`inline-saved-gate-${moto.id}-${gate.rider_id}`} className="ld-result-row">
                        <span>G{gate.gate_position}</span>
                        <strong>{gate.no_plate_display}</strong>
                        <em>{gate.name}</em>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="ld-results-panel__footer">
            <button
              type="button"
              onClick={async () => {
                try {
                  const blobs: Blob[] = [];
                  const filenames: string[] = [];

                  if (categoryLocked) {
                    for (const batch of savedMotoBatches) {
                      const blob = await buildDrawBatchPngBlob({
                        batchLabel: `Batch ${batch.batchNo}`,
                        motos: batch.motos.map((moto) => ({
                          title: moto.moto_name,
                          rows: moto.gates.map((gate) => ({
                            gate: gate.gate_position,
                            plate: gate.no_plate_display,
                            name: gate.name,
                          })),
                        })),
                      })
                      blobs.push(blob)
                      filenames.push(`${sanitizeFileName(eventName)}-${sanitizeFileName(selectedCategoryLabel)}-batch-${batch.batchNo}.png`)
                    }
                  } else {
                    for (const batch of batchLayouts) {
                      const moto2Manual =
                        drawMode === 'external_draw' &&
                          externalBatchInputMode === 'PER_BATCH' &&
                          externalPerBatchValidation.moto2Provided
                          ? externalPerBatchValidation.orderedMoto2Batches[batch.index - 1] ?? []
                          : []
                      const moto2Riders = moto2Manual.length > 0 ? moto2Manual : [...batch.riders].reverse()
                      const blob = await buildDrawBatchPngBlob({
                        batchLabel: `Batch ${batch.index}`,
                        motos: [
                          {
                            title: 'Moto 1',
                            rows: batch.riders.map((rider, i) => ({
                              gate: i + 1,
                              plate: rider.no_plate_display,
                              name: rider.name,
                            })),
                          },
                          {
                            title: 'Moto 2',
                            rows: moto2Riders.map((rider, i) => ({
                              gate: i + 1,
                              plate: rider.no_plate_display,
                              name: rider.name,
                            })),
                          },
                        ],
                      })
                      blobs.push(blob)
                      filenames.push(`${sanitizeFileName(eventName)}-${sanitizeFileName(selectedCategoryLabel)}-batch-${batch.index}.png`)
                    }
                  }

                  await shareOrDownloadPngs(blobs, filenames, `Hasil Draw - ${selectedCategoryLabel}`)
                } catch (e) {
                  console.error(e)
                  alert('Gagal membagikan draw')
                }
              }}
              disabled={!categoryLocked && drawnOrder.length === 0}
              style={{
                background: '#f8ce3d',
                color: '#111',
                fontWeight: 900,
                border: 'none',
                padding: '12px 16px',
                cursor: 'pointer'
              }}
            >
              Bagikan Draw
            </button>
            {categoryLocked && (
              <button type="button" onClick={handleDownloadLiveDrawPdf}>
                Download PDF
              </button>
            )}
            {!categoryLocked && drawnOrder.length > 0 && (
              <button type="button" onClick={saveAsMoto} disabled={saveState === 'saving'}>
                {saveState === 'saving' ? 'Saving...' : 'Save as Moto'}
              </button>
            )}
          </div>
        </aside>
      </div>

      <div style={{ marginTop: 18 }}>
        {loading && <div style={{ fontWeight: 800 }}>Memuat data...</div>}
        {!loading && drawnOrder.length === 0 && !categoryLocked && (
          <div style={{ color: '#9a9693', fontWeight: 700 }}>
            {drawMode === 'external_draw'
              ? 'Belum ada hasil editor batch yang dipakai.'
              : 'Belum ada hasil draw.'}
          </div>
        )}
        {categoryLocked && lockedMotos.length > 0 && (
          <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 900 }}>Gate Order (Saved Moto)</div>
            {savedMotoBatches.map((batch) => (
              <div
                key={`saved-batch-${batch.batchNo}`}
                style={{
                  border: '1px solid #353534',
                  borderRadius: 0,
                  padding: 12,
                  background: '#1c1b1b',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 950, fontSize: 18 }}>Batch {batch.batchNo}</div>
                {batch.motos.map((moto) => (
                  <div
                    key={moto.id}
                    style={{
                      border: '1px solid #353534',
                      borderRadius: 14,
                      padding: 10,
                      background: '#141414',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenMotoId((prev) => (prev === moto.id ? null : moto.id))}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: 0,
                        border: '1px solid #353534',
                        background: '#001a00',
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
                              border: '1px solid #2a2a2a',
                              background: '#1c1b1b',
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
            ))}
          </div>
        )}
      </div>

      {false && resultModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(0, 0, 0, 0.88)',
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
              background: 'linear-gradient(180deg, #1c1b1b 0%, #141414 100%)',
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
                <div style={{ fontSize: 28, fontWeight: 950, color: '#e5e2e1' }}>{selectedCategoryLabel}</div>
                <div style={{ color: '#334155', fontWeight: 700 }}>
                  {resultModal === 'saved'
                    ? 'Daftar moto yang sudah tersimpan untuk kategori ini.'
                    : `Total rider ${drawnOrder.length} | ${batches.length} batch | gate max ${batchMode === 'CUSTOM_BATCH_SIZES' ? maxBatchRiders : batchSize
                    }`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const blobs: Blob[] = [];
                      const filenames: string[] = [];

                      for (const batch of batches) {
                        const moto2Manual =
                          drawMode === 'external_draw' &&
                            externalBatchInputMode === 'PER_BATCH' &&
                            externalPerBatchValidation.moto2Provided
                            ? externalPerBatchValidation.orderedMoto2Batches[batch.index - 1] ?? []
                            : []
                        const moto2Riders = moto2Manual.length > 0 ? moto2Manual : [...batch.riders].reverse()
                        const blob = await buildDrawBatchPngBlob({
                          batchLabel: `Batch ${batch.index}`,
                          motos: [
                            {
                              title: 'Moto 1',
                              rows: batch.riders.map((rider, i) => ({
                                gate: i + 1,
                                plate: rider.no_plate_display,
                                name: rider.name,
                              })),
                            },
                            {
                              title: 'Moto 2',
                              rows: moto2Riders.map((rider, i) => ({
                                gate: i + 1,
                                plate: rider.no_plate_display,
                                name: rider.name,
                              })),
                            },
                          ],
                        })
                        blobs.push(blob)
                        filenames.push(`${sanitizeFileName(eventName)}-${sanitizeFileName(selectedCategoryLabel)}-batch-${batch.index}.png`)
                      }

                      await shareOrDownloadPngs(blobs, filenames, `Hasil Draw - ${selectedCategoryLabel}`)
                    } catch (e) {
                      console.error(e)
                      alert('Gagal membagikan draw')
                    }
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 0,
                    border: '1px solid #353534',
                    background: '#1a0000',
                    color: '#f8ce3d',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Bagikan Draw
                </button>
                <button
                  type="button"
                  onClick={() => setResultModal(null)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 0,
                    border: '1px solid #353534',
                    background: '#1c1b1b',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Tutup
                </button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', padding: 22, display: 'grid', gap: 16 }}>
              {resultModal === 'draft' && (
                <div style={{ display: 'grid', gap: 14 }}>
                  {drawing && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 0,
                        border: '1px solid #93c5fd',
                        background: '#141414',
                        color: '#f8ce3d',
                        fontWeight: 900,
                      }}
                    >
                      Sedang mengundi rider. Preview batch akan muncul otomatis setelah roulette selesai.
                    </div>
                  )}
                  {!drawing && batches.length > 0 && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 0,
                        border: '1px solid #bfdbfe',
                        background: '#141414',
                        color: '#f8ce3d',
                        fontWeight: 800,
                      }}
                    >
                      Seret rider untuk pindah gate atau batch. Tombol panah tetap bisa dipakai untuk koreksi cepat satu langkah.
                    </div>
                  )}
                  {selectedRiderIndex !== null && drawnOrder[selectedRiderIndex!] && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 0,
                        border: '1px solid #facc15',
                        background: '#1a1500',
                        color: '#92400e',
                        fontWeight: 800,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <span>
                        Mode pindah aktif: <strong>{drawnOrder[selectedRiderIndex!]?.no_plate_display}</strong>. Tap row tujuan untuk memindahkan rider ini.
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedRiderIndex(null)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: '1px solid #d97706',
                          background: '#1c1b1b',
                          color: '#92400e',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        Batal
                      </button>
                    </div>
                  )}
                  {!drawing && batches.length === 0 && (
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 0,
                        border: '1px solid #353534',
                        background: '#141414',
                        color: '#475569',
                        fontWeight: 800,
                      }}
                    >
                      Hasil draw belum tersedia.
                    </div>
                  )}
                  {batchLayouts.map((batch) => (
                    <div
                      key={batch.index}
                      style={{
                        border: '1px solid #353534',
                        borderRadius: 22,
                        padding: 16,
                        background: 'linear-gradient(135deg, #1c1b1b 0%, #141414 100%)',
                        boxShadow: '0 14px 30px rgba(15, 23, 42, 0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 950, fontSize: 18, color: '#e5e2e1' }}>Batch {batch.index}</div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <div
                            style={{
                              padding: '6px 10px',
                              borderRadius: 0,
                              background: '#0a1628',
                              color: '#f8ce3d',
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            {batch.riders.length} rider
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              shareTextOutput(
                                `Draw ${selectedCategoryLabel} Batch ${batch.index}`,
                                buildDraftBatchShareText(batch)
                              )
                            }
                            style={{
                              padding: '8px 12px',
                              borderRadius: 0,
                              border: '1px solid #16a34a',
                              background: '#001a00',
                              color: '#166534',
                              fontWeight: 950,
                              cursor: 'pointer',
                            }}
                          >
                            Salin Teks
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              downloadDraftBatchPng(batch).catch((err: unknown) => {
                                alert(err instanceof Error ? err.message : 'Gagal membuat PNG.')
                              })
                            }}
                            style={{
                              padding: '8px 12px',
                              borderRadius: 0,
                              border: '1px solid #d97706',
                              background: '#1a1500',
                              color: '#92400e',
                              fontWeight: 950,
                              cursor: 'pointer',
                            }}
                          >
                            Bagikan Draw
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {batch.riders.map((rider, idx) => {
                          const globalIndex = batch.startIndex + idx
                          const canMoveUp = globalIndex > 0
                          const canMoveDown = globalIndex < drawnOrder.length - 1
                          const isBatchStart = idx === 0
                          const isBatchEnd = idx === batch.riders.length - 1
                          const isDragging = draggingRiderIndex === globalIndex
                          const isDropTarget = dragTargetIndex === globalIndex && draggingRiderIndex !== globalIndex
                          const isSelected = selectedRiderIndex === globalIndex
                          return (
                            <div
                              key={rider.id}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', String(globalIndex))
                                e.dataTransfer.effectAllowed = 'move'
                                setDraggingRiderIndex(globalIndex)
                                setDragTargetIndex(globalIndex)
                                setSelectedRiderIndex(null)
                              }}
                              onDragOver={(e) => {
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                                if (dragTargetIndex !== globalIndex) setDragTargetIndex(globalIndex)
                              }}
                              onDrop={(e) => {
                                e.preventDefault()
                                const rawIndex = e.dataTransfer.getData('text/plain')
                                const fromIndex =
                                  rawIndex !== '' && !Number.isNaN(Number(rawIndex))
                                    ? Number(rawIndex)
                                    : draggingRiderIndex
                                if (fromIndex !== null) {
                                  moveRiderByDrag(fromIndex, globalIndex)
                                }
                                clearReorderState()
                              }}
                              onDragEnd={() => {
                                clearReorderState()
                              }}
                              onClick={() => {
                                if (selectedRiderIndex !== null && selectedRiderIndex !== globalIndex) {
                                  moveRiderByDrag(selectedRiderIndex, globalIndex)
                                  setSelectedRiderIndex(null)
                                }
                              }}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'auto auto minmax(0, 1fr) auto auto',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 12px',
                                borderRadius: 14,
                                border: isDropTarget ? '2px dashed #2563eb' : isSelected ? '2px solid #f59e0b' : '1px solid #dbeafe',
                                background: isDropTarget ? '#dbeafe' : isSelected ? '#fffbeb' : idx % 2 === 0 ? '#eff6ff' : '#f8fafc',
                                fontWeight: 800,
                                opacity: isDragging ? 0.45 : 1,
                                cursor: selectedRiderIndex !== null && selectedRiderIndex !== globalIndex ? 'copy' : 'grab',
                                transform: isDropTarget ? 'scale(1.01)' : 'none',
                              }}
                            >
                              <span
                                draggable
                                onDragStart={(e) => {
                                  e.stopPropagation()
                                  e.dataTransfer.setData('text/plain', String(globalIndex))
                                  e.dataTransfer.effectAllowed = 'move'
                                  setDraggingRiderIndex(globalIndex)
                                  setDragTargetIndex(globalIndex)
                                  setSelectedRiderIndex(null)
                                }}
                                title="Drag rider"
                                style={{
                                  width: 28,
                                  height: 28,
                                  display: 'grid',
                                  placeItems: 'center',
                                  borderRadius: 8,
                                  border: '1px solid #94a3b8',
                                  background: '#1c1b1b',
                                  color: '#e5e2e1',
                                  fontWeight: 900,
                                  cursor: 'grab',
                                  userSelect: 'none',
                                }}
                              >
                                ::
                              </span>
                              <span
                                style={{
                                  minWidth: 66,
                                  textAlign: 'center',
                                  padding: '6px 8px',
                                  borderRadius: 0,
                                  background: '#201f1f',
                                  color: '#fff',
                                  fontSize: 12,
                                  fontWeight: 900,
                                }}
                              >
                                Gate {idx + 1}
                              </span>
                              <span style={{ color: '#e5e2e1' }}>{rider.name}</span>
                              <span style={{ color: '#475569' }}>{rider.no_plate_display}</span>
                              <div style={{ display: 'flex', gap: 6, justifySelf: 'end' }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedRiderIndex((prev) => (prev === globalIndex ? null : globalIndex))
                                  }}
                                  title={isSelected ? 'Batalkan mode pindah' : 'Pilih rider untuk dipindahkan'}
                                  style={{
                                    minWidth: 54,
                                    height: 34,
                                    padding: '0 10px',
                                    borderRadius: 10,
                                    border: '1px solid #94a3b8',
                                    background: isSelected ? '#fef3c7' : '#fff',
                                    color: '#e5e2e1',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isSelected ? 'Batal' : 'Pilih'}
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    moveRiderInPreview(globalIndex, -1)
                                  }}
                                  disabled={!canMoveUp}
                                  title={isBatchStart ? 'Geser ke batch/gate sebelumnya' : 'Naik satu gate'}
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 10,
                                    border: '1px solid #94a3b8',
                                    background: canMoveUp ? '#fff' : '#e2e8f0',
                                    color: '#e5e2e1',
                                    fontWeight: 900,
                                    cursor: canMoveUp ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  ^
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    moveRiderInPreview(globalIndex, 1)
                                  }}
                                  disabled={!canMoveDown}
                                  title={isBatchEnd ? 'Geser ke batch/gate berikutnya' : 'Turun satu gate'}
                                  style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 10,
                                    border: '1px solid #94a3b8',
                                    background: canMoveDown ? '#fff' : '#e2e8f0',
                                    color: '#e5e2e1',
                                    fontWeight: 900,
                                    cursor: canMoveDown ? 'pointer' : 'not-allowed',
                                  }}
                                >
                                  v
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ marginTop: 12, display: 'grid', gap: 6, color: '#475569', fontWeight: 700 }}>
                        <div>
                          {drawMode === 'external_draw' && externalPerBatchValidation.moto2Provided
                            ? 'Moto 2: urutan gate manual sesuai editor batch.'
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
                  {savedMotoBatches.map((batch) => (
                    <div
                      key={`saved-modal-batch-${batch.batchNo}`}
                      style={{
                        border: '1px solid #353534',
                        borderRadius: 20,
                        padding: 14,
                        background: '#1c1b1b',
                        display: 'grid',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 950, fontSize: 18, color: '#e5e2e1' }}>Batch {batch.batchNo}</div>
                        <button
                          type="button"
                          onClick={() =>
                            shareTextOutput(
                              `Draw ${selectedCategoryLabel} Batch ${batch.batchNo}`,
                              buildSavedBatchShareText(batch)
                            )
                          }
                          style={{
                            padding: '8px 12px',
                            borderRadius: 0,
                            border: '1px solid #16a34a',
                            background: '#001a00',
                            color: '#166534',
                            fontWeight: 950,
                            cursor: 'pointer',
                          }}
                        >
                          Salin Teks
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            downloadSavedBatchPng(batch).catch((err: unknown) => {
                              alert(err instanceof Error ? err.message : 'Gagal membuat PNG.')
                            })
                          }}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 0,
                            border: '1px solid #d97706',
                            background: '#1a1500',
                            color: '#92400e',
                            fontWeight: 950,
                            cursor: 'pointer',
                          }}
                        >
                          Bagikan Draw
                        </button>
                      </div>
                      {batch.motos.map((moto) => (
                        <div
                          key={moto.id}
                          style={{
                            border: '1px solid #2a2a2a',
                            borderRadius: 0,
                            padding: 12,
                            background: '#141414',
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
                                    border: '1px solid #2a2a2a',
                                    background: '#1c1b1b',
                                    fontWeight: 800,
                                  }}
                                >
                                  <span
                                    style={{
                                      minWidth: 66,
                                      textAlign: 'center',
                                      padding: '6px 8px',
                                      borderRadius: 0,
                                      background: '#201f1f',
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
                background: '#1c1b1b',
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
                        borderRadius: 0,
                        border: '1px solid #353534',
                        background: '#1c1b1b',
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
                        borderRadius: 0,
                        border: '1px solid #353534',
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
                        borderRadius: 0,
                        border: '1px solid #353534',
                        background: '#0a1628',
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
                          borderRadius: 0,
                          border: '1px solid #f59e0b',
                          background: '#1a1500',
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
                        borderRadius: 0,
                        border: '1px solid #353534',
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
