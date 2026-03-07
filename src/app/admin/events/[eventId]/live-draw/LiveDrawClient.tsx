'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

export default function LiveDrawClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [drawnOrder, setDrawnOrder] = useState<RiderItem[]>([])
  const [batchSize, setBatchSize] = useState(8)
  const [gatePositions, setGatePositions] = useState(8)
  const [drawMode, setDrawMode] = useState<DrawMode>('internal_live_draw')
  const [rollingName, setRollingName] = useState<string>('Ready')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [wheelRiders, setWheelRiders] = useState<RiderItem[]>([])
  const [wheelRotation, setWheelRotation] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [lockedMotos, setLockedMotos] = useState<GateMoto[]>([])
  const [openMotoId, setOpenMotoId] = useState<string | null>(null)
  const [externalOrderText, setExternalOrderText] = useState('')
  const [externalMoto2OrderText, setExternalMoto2OrderText] = useState('')
  const [shareCopied, setShareCopied] = useState(false)

  const batches = useMemo(() => buildBatches(drawnOrder, batchSize), [drawnOrder, batchSize])
  const visibleWheelRiders = wheelRiders.length > 0 ? wheelRiders : riders

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
      ctx.fillStyle = i % 2 === 0 ? '#2ecc71' : '#eaf7ee'
      ctx.fill()
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 1
      ctx.stroke()

      if (list.length > 0 && i % labelEvery === 0) {
        const mid = start + step / 2
        ctx.save()
        ctx.rotate(mid)
        ctx.translate(radius * 0.62, 0)
        ctx.rotate(Math.PI / 2)
        ctx.fillStyle = '#111'
        ctx.font = 'bold 10px sans-serif'
        const name = list[i]?.name ?? ''
        ctx.fillText(name.slice(0, 14), -20, 4)
        ctx.restore()
      }
    }

    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.18, 0, Math.PI * 2)
    ctx.fillStyle = '#111'
    ctx.fill()
    ctx.restore()
  }, [drawMode, visibleWheelRiders])

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
      setWheelRiders([])
      setWheelRotation(0)

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
    const shuffled = shuffle(riders)
    setWheelRiders(shuffled)

    const count = shuffled.length
    const index = Math.floor(Math.random() * count)
    const anglePer = 360 / count
    const spins = 1
    const targetAngle = 360 * spins + (360 - (index * anglePer + anglePer / 2))
    setWheelRotation(targetAngle)

    window.setTimeout(() => {
      setRollingName(shuffled[index].name)
      setDrawnOrder(shuffled)
      setDrawing(false)
      setHasDrawn(true)
    }, 2200)
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
    if (!externalValidation.isValid) {
      alert('Urutan external belum valid. Pastikan semua rider terisi tepat satu kali.')
      return
    }
    setDrawnOrder(externalValidation.orderedRiders)
    setRollingName('External order ready')
    setHasDrawn(true)
    setSaveState('idle')
  }

  const resetDraw = () => {
    if (categoryLocked) return
    setDrawnOrder([])
    setWheelRiders([])
    setWheelRotation(0)
    setRollingName('Ready')
    setHasDrawn(false)
    setSaveState('idle')
    setExternalOrderText('')
    setExternalMoto2OrderText('')
  }

  const resetLockedDraw = async () => {
    if (!selectedCategory) return
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
    if (drawMode === 'external_draw' && externalMoto2Validation.isProvided && !externalMoto2Validation.isValidForMoto1) {
      alert('Urutan Moto 2 manual belum valid per batch. Cek kembali input Moto 2.')
      return
    }
    setSaveState('saving')
    try {
      const manualMoto2Ids =
        drawMode === 'external_draw' && externalMoto2Validation.isProvided
          ? externalMoto2Validation.orderedRiders.map((rider) => rider.id)
          : []
      const payload = {
        category_id: selectedCategory,
        rider_ids: drawnOrder.map((r) => r.id),
        batch_size: batchSize,
        ...(manualMoto2Ids.length > 0 ? { rider_ids_moto2: manualMoto2Ids } : {}),
      }
      const { res, json } = await apiFetch(`/api/events/${eventId}/live-draw`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(json?.error || 'Gagal menyimpan Moto')
      setSaveState('saved')
      await loadRiders(selectedCategory)
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

  return (
    <div style={{ maxWidth: 1020 }}>
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
        </div>

        <div
          style={{
            border: '2px dashed #111',
            borderRadius: 16,
            padding: 16,
            display: 'grid',
            gap: 16,
          }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {drawMode === 'external_draw' ? 'External Order' : 'Wheel Spin'}
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{rollingName}</div>
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
                    top: -6,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: '12px solid transparent',
                    borderRight: '12px solid transparent',
                    borderBottom: '18px solid #b40000',
                    zIndex: 3,
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
                    border: '2px solid #111',
                    background: '#fff',
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: drawing ? 'transform 4.2s cubic-bezier(0.12, 0.6, 0.08, 1)' : 'none',
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
                <button
                  type="button"
                  onClick={saveAsMoto}
                  disabled={saveState === 'saving' || drawnOrder.length === 0}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: saveState === 'saved' ? '#bfead2' : '#fff',
                    fontWeight: 900,
                    cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saveState === 'saving' ? 'Saving...' : 'Save as Moto'}
                </button>
                <button
                  type="button"
                  onClick={resetDraw}
                  disabled={categoryLocked || drawnOrder.length === 0}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: categoryLocked ? '#eee' : '#fff',
                    fontWeight: 900,
                    cursor: categoryLocked ? 'not-allowed' : 'pointer',
                  }}
                >
                  Reset Draw
                </button>
                {categoryLocked && (
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
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Paste urutan no plate (Moto 1)</div>
              <div style={{ color: '#334155', fontWeight: 700 }}>
                Format: satu plate per baris, atau dipisah koma. Contoh: <code>15B</code>, <code>19</code>,{' '}
                <code>777</code>
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
                {externalValidation.unknownTokens.length > 0 && (
                  <div style={{ color: '#b91c1c' }}>
                    Plate tidak dikenal: {externalValidation.unknownTokens.slice(0, 10).join(', ')}
                  </div>
                )}
                {externalValidation.duplicateTokens.length > 0 && (
                  <div style={{ color: '#b91c1c' }}>
                    Plate duplikat: {externalValidation.duplicateTokens.slice(0, 10).join(', ')}
                  </div>
                )}
                {externalValidation.duplicateRiders.length > 0 && (
                  <div style={{ color: '#b91c1c' }}>
                    Rider duplikat: {externalValidation.duplicateRiders.slice(0, 10).join(', ')}
                  </div>
                )}
                {externalValidation.missingRiders.length > 0 && (
                  <div style={{ color: '#b91c1c' }}>
                    Belum terisi:{' '}
                    {externalValidation.missingRiders
                      .slice(0, 8)
                      .map((rider) => rider.no_plate_display)
                      .join(', ')}
                  </div>
                )}
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
                  {externalMoto2Validation.unknownTokens.length > 0 && (
                    <div style={{ color: '#b91c1c' }}>
                      Plate tidak dikenal: {externalMoto2Validation.unknownTokens.slice(0, 10).join(', ')}
                    </div>
                  )}
                  {externalMoto2Validation.duplicateTokens.length > 0 && (
                    <div style={{ color: '#b91c1c' }}>
                      Plate duplikat: {externalMoto2Validation.duplicateTokens.slice(0, 10).join(', ')}
                    </div>
                  )}
                  {externalMoto2Validation.batchMismatch.length > 0 && (
                    <div style={{ color: '#b91c1c' }}>
                      Batch mismatch: {externalMoto2Validation.batchMismatch.join(', ')}
                    </div>
                  )}
                </div>
              </div>
              {externalValidation.orderedRiders.length > 0 && (
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
                <button
                  type="button"
                  onClick={saveAsMoto}
                  disabled={saveState === 'saving' || drawnOrder.length === 0}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: saveState === 'saved' ? '#bfead2' : '#fff',
                    fontWeight: 900,
                    cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saveState === 'saving' ? 'Saving...' : 'Save as Moto'}
                </button>
                <button
                  type="button"
                  onClick={resetDraw}
                  disabled={categoryLocked}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: categoryLocked ? '#eee' : '#fff',
                    fontWeight: 900,
                    cursor: categoryLocked ? 'not-allowed' : 'pointer',
                  }}
                >
                  Reset Draft
                </button>
                {categoryLocked && (
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
        {drawnOrder.length > 0 && !categoryLocked && (
          <div style={{ display: 'grid', gap: 14 }}>
            {batches.map((batch) => (
              <div
                key={batch.index}
                style={{
                  border: '2px solid #111',
                  borderRadius: 16,
                  padding: 12,
                  background: '#fff',
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Batch {batch.index}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {batch.riders.map((rider, idx) => (
                    <div
                      key={rider.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '1px solid #ddd',
                        background: '#eaf7ee',
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
                <div style={{ marginTop: 8, color: '#444', fontWeight: 700 }}>
                  {drawMode === 'external_draw' && externalMoto2Validation.isProvided
                    ? 'Moto 2: urutan gate manual sesuai input external.'
                    : `Moto 2: urutan gate otomatis dibalik (Gate ${batch.riders.length} > 1).`}
                </div>
                {batch.riders.length <= 8 && (
                  <div style={{ marginTop: 6, color: '#444', fontWeight: 700 }}>
                    Moto 3: urutan gate random.
                  </div>
                )}
              </div>
            ))}
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
    </div>
  )
}

