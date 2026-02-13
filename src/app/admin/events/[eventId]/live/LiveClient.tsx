'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../../../lib/supabaseClient'

type MotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
}

export default function LiveClient({ eventId }: { eventId: string }) {
  const searchParams = useSearchParams()
  const stageLabel = searchParams.get('stage')
  const batchLabel = searchParams.get('batch')
  const finalClassLabel = searchParams.get('final_class')
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [selectedMotoId, setSelectedMotoId] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const motoRes = await fetch(`/api/motos?event_id=${eventId}`)
      const motoJson = await motoRes.json()
      const motoData = (motoJson.data ?? []) as MotoItem[]
      setMotos(motoData)
      if (!selectedMotoId && motoData.length > 0) setSelectedMotoId(motoData[0].id)

      // Fetch all riders for mapping plate -> rider_id
      const all: RiderItem[] = []
      let page = 1
      const pageSize = 200
      let total = 0
      do {
        const qs = new URLSearchParams({
          event_id: eventId,
          page: String(page),
          page_size: String(pageSize),
        })
        const res = await fetch(`/api/riders?${qs.toString()}`)
        const json = await res.json()
        const rows = (json.data ?? []) as Array<{ id: string; name: string; no_plate_display: string }>
        total = Number(json.total ?? 0)
        all.push(
          ...rows.map((r) => ({
            id: r.id,
            name: r.name,
            no_plate_display: r.no_plate_display,
          }))
        )
        page++
      } while (all.length < total)
      setRiders(all)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const selectedMoto = useMemo(() => motos.find((m) => m.id === selectedMotoId) ?? null, [motos, selectedMotoId])

  const handleSubmit = async () => {
    if (!selectedMotoId) {
      alert('Pilih moto terlebih dahulu.')
      return
    }

    const orderedPlates = input
      .split(/[,\\n]/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)

    if (orderedPlates.length === 0) {
      alert('Masukkan urutan no plate.')
      return
    }

    const riderMap = new Map(riders.map((r) => [r.no_plate_display.toUpperCase(), r.id]))
    const results = orderedPlates.map((plate, index) => ({
      rider_id: riderMap.get(plate),
      finish_order: index + 1,
      result_status: 'FINISH',
    }))

    if (results.some((row) => !row.rider_id)) {
      alert('Ada no plate yang tidak ditemukan.')
      return
    }

    setSaving(true)
    try {
      await apiFetch(`/api/motos/${selectedMotoId}/results`, {
        method: 'POST',
        body: JSON.stringify({ results }),
      })
      alert('Result tersimpan.')
      setInput('')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan result.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Live Result Input</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Input urutan finish memakai <b>no plate</b>. Pastikan rider sudah di-assign ke moto.
      </div>
      {(stageLabel || batchLabel || finalClassLabel) && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px dashed #111',
            background: '#fff',
            fontWeight: 900,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {stageLabel && <div>Stage: {stageLabel}</div>}
          {batchLabel && <div>Batch: {batchLabel}</div>}
          {finalClassLabel && <div>Final Class: {finalClassLabel}</div>}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 16,
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 18 }}>Select Moto</div>
        <select
          value={selectedMotoId}
          onChange={(e) => setSelectedMotoId(e.target.value)}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
        >
          {motos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.moto_order}. {m.moto_name} ({m.status})
            </option>
          ))}
        </select>

        <textarea
          placeholder="Input no plate urut (contoh: 12, 12A, 7B)&#10;Satu baris = 1 rider"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111', minHeight: 160, fontWeight: 900 }}
        />

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          style={{
            padding: 14,
            borderRadius: 14,
            border: '2px solid #111',
            background: '#1fd463',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Submit Result'}
        </button>

        {loading && (
          <div style={{ color: '#333', fontWeight: 800, fontSize: 13 }}>
            Loading motos & riders...
          </div>
        )}

        {selectedMoto && (
          <div style={{ color: '#333', fontWeight: 800, fontSize: 13 }}>
            Selected: {selectedMoto.moto_name} • Status: {selectedMoto.status}
          </div>
        )}
      </div>
    </div>
  )
}
