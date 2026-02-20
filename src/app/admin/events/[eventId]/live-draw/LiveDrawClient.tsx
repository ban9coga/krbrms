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
  plate_number?: number
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
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
  gates: Array<{
    gate_position: number
    rider_id: string
    name: string
    no_plate_display: string
  }>
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

export default function LiveDrawClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [loading, setLoading] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [drawnOrder, setDrawnOrder] = useState<RiderItem[]>([])
  const [batchSize, setBatchSize] = useState(8)
  const [gatePositions, setGatePositions] = useState(8)
  const [rollingName, setRollingName] = useState<string>('Ready')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [wheelRiders, setWheelRiders] = useState<RiderItem[]>([])
  const [wheelRotation, setWheelRotation] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [lockedMotos, setLockedMotos] = useState<GateMoto[]>([])
  const [openMotoId, setOpenMotoId] = useState<string | null>(null)

  const batches = useMemo(() => buildBatches(drawnOrder, batchSize), [drawnOrder, batchSize])
  const visibleWheelRiders = wheelRiders.length > 0 ? wheelRiders : riders

  useEffect(() => {
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
  }, [visibleWheelRiders])

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
      setCategories(list.filter((c) => c.enabled))
      if (!selectedCategory && list.length > 0) {
        setSelectedCategory(list[0].id)
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
      const nextGate = typeof format.gate_positions === 'number' ? format.gate_positions : 8
      setGatePositions(nextGate)
      setBatchSize((prev) => {
        const capped = Math.max(4, Math.min(nextGate, prev))
        return prev === 8 ? nextGate : capped
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

  const resetDraw = () => {
    if (categoryLocked) return
    setDrawnOrder([])
    setWheelRiders([])
    setWheelRotation(0)
    setRollingName('Ready')
    setHasDrawn(false)
    setSaveState('idle')
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
      await loadRiders(selectedCategory)
      alert('Draw berhasil direset.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal reset draw')
      setSaveState('idle')
    }
  }

  const saveAsMoto = async () => {
    if (!selectedCategory || drawnOrder.length === 0) {
      alert('Lakukan draw terlebih dulu.')
      return
    }
    setSaveState('saving')
    try {
      const payload = {
        category_id: selectedCategory,
        rider_ids: drawnOrder.map((r) => r.id),
        batch_size: batchSize,
      }
      const { res, json } = await apiFetch(`/api/events/${eventId}/live-draw`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(json?.error || 'Gagal menyimpan Moto dari hasil draw')
      setSaveState('saved')
      alert('Moto berhasil dibuat dari hasil Live Draw.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan hasil draw')
      setSaveState('idle')
    }
  }

  return (
    <div style={{ maxWidth: 1020 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Live Draw (Manual)</h1>
          <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
            Draw manual dengan roulette, lalu simpan hasilnya sebagai Moto 1 & Moto 2 (gate Moto 2 otomatis
            dibalik).
          </div>
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
            max={8}
            value={batchSize}
            onChange={(e) => setBatchSize(Math.max(4, Math.min(8, Number(e.target.value))))}
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
            <div style={{ fontWeight: 900, fontSize: 18 }}>Wheel Spin</div>
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
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {loading && <div style={{ fontWeight: 800 }}>Memuat data...</div>}
        {!loading && drawnOrder.length === 0 && (
          <div style={{ color: '#555', fontWeight: 700 }}>
            {categoryLocked ? 'Hasil draw tersimpan. Lihat gate order di bawah.' : 'Belum ada hasil draw.'}
          </div>
        )}
        {drawnOrder.length > 0 && (
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
                  Moto 2: urutan gate otomatis dibalik (Gate {batch.riders.length} {'>'} 1).
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
                  {moto.moto_order}. {moto.moto_name} {openMotoId === moto.id ? '▲' : '▼'}
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

