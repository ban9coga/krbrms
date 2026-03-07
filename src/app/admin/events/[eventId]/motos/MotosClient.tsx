'use client'

import { useEffect, useMemo, useState } from 'react'
import { compareMotoSequence } from '../../../../../lib/motoSequence'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published?: boolean | null
  published_at?: string | null
  provisional_at?: string | null
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
  }>
}

const parseMotoBatch = (motoName: string) => {
  const match = motoName.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return { motoNo: 0, batchNo: 0 }
  return {
    motoNo: Number(match[1] ?? 0),
    batchNo: Number(match[2] ?? 0),
  }
}


export default function MotosClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [gateOrdersByCategory, setGateOrdersByCategory] = useState<Record<string, GateMotoItem[]>>({})
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [eventStatus, setEventStatus] = useState<'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED' | null>(null)

  const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Request failed')

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

  const loadGateOrders = async (categoryIds: string[]) => {
    if (categoryIds.length === 0) {
      setGateOrdersByCategory({})
      return
    }
    const entries = await Promise.all(
      categoryIds.map(async (categoryId) => {
        const res = await fetch(`/api/events/${eventId}/gate-order?categoryId=${categoryId}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return [categoryId, []] as const
        return [categoryId, (json?.data ?? []) as GateMotoItem[]] as const
      })
    )
    const map: Record<string, GateMotoItem[]> = {}
    for (const [categoryId, rows] of entries) {
      map[categoryId] = [...rows].sort(compareMotoSequence)
    }
    setGateOrdersByCategory(map)
  }

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const catRes = await fetch(`/api/events/${eventId}/categories`)
      const catJson = await catRes.json()
      setCategories((catJson.data ?? []).filter((c: CategoryItem) => c.enabled))

      const eventJson = await apiFetch(`/api/events/${eventId}`)
      setEventStatus(eventJson?.data?.status ?? null)

      const motoRes = await fetch(`/api/motos?event_id=${eventId}`)
      const motoJson = await motoRes.json()
      const motoRows = (motoJson.data ?? []) as MotoItem[]
      setMotos(motoRows)
      const categoryIds = Array.from(new Set(motoRows.map((m) => m.category_id))).filter(Boolean)
      await loadGateOrders(categoryIds)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.label)
    }
    return map
  }, [categories])

  const categoriesSorted = useMemo(() => {
    return [...categories].sort((a, b) => {
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

  const printGroups = useMemo(() => {
    return categoriesSorted
      .map((category) => {
        const rows = gateOrdersByCategory[category.id] ?? []
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
              return compareMotoSequence(a, b)
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
        riderRows: Array<{ rider_id: string; name: string; no_plate_display: string; gates: Record<number, number> }>
      }>
    }>
  }, [categoriesSorted, gateOrdersByCategory])

  const handleUpdateMotoStatus = async (motoId: string, status: MotoItem['status']) => {
    try {
      await apiFetch(`/api/motos/${motoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handlePublishMoto = async (motoId: string) => {
    try {
      await apiFetch(`/api/motos/${motoId}/publish`, { method: 'POST' })
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

  return (
    <div style={{ maxWidth: 980 }} className="motos-print-root">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div style={{ marginTop: 2, color: '#475569', fontWeight: 700 }}>
          Cetak daftar moto: klik tombol, lalu pilih <strong>Save as PDF</strong> di dialog browser.
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#fde68a',
            fontWeight: 900,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Cetak / Save PDF
        </button>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Motos</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Moto dibuat melalui Live Draw. Di halaman ini hanya untuk melihat dan mengatur status moto.
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
        {loading && (
          <div className="no-print" style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && motos.length === 0 && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Belum ada moto.
          </div>
        )}

        {categoriesSorted.map((cat) => {
          const list = motosByCategory.get(cat.id) ?? []
          if (list.length === 0) return null
          const isHidden = hiddenCategoryIds.includes(cat.id)
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>
                {categoryLabel.get(cat.id) ?? `Category ${cat.id}`}
              </div>
              <button
                type="button"
                onClick={() => toggleCategoryCard(cat.id)}
                className="no-print"
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
            {isHidden ? (
              <div style={{ color: '#64748b', fontWeight: 800, fontSize: 13 }}>
                Card kategori disembunyikan.
              </div>
            ) : (
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
                        {m.moto_order}. {m.moto_name}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontWeight: 800, fontSize: 12 }}>
                        <span>Status: {m.status}</span>
                        {m.status === 'PROVISIONAL' && m.provisional_at && (
                          <span>Provisional: {new Date(m.provisional_at).toLocaleString()}</span>
                        )}
                        {m.is_published && m.published_at && (
                          <span>Published: {new Date(m.published_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        value={m.status}
                        onChange={(e) => handleUpdateMotoStatus(m.id, e.target.value as MotoItem['status'])}
                        disabled={eventStatus !== 'LIVE'}
                        style={{ padding: '8px 10px', borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
                      >
                        <option value="UPCOMING">UPCOMING</option>
                        <option value="LIVE">LIVE</option>
                        <option value="FINISHED">FINISHED</option>
                        <option value="PROVISIONAL">PROVISIONAL</option>
                        <option value="PROTEST_REVIEW">PROTEST_REVIEW</option>
                        <option value="LOCKED">LOCKED</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handlePublishMoto(m.id)}
                        disabled={m.status !== 'LOCKED' || !!m.is_published}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 999,
                          border: '2px solid #111',
                          background: m.status === 'LOCKED' && !m.is_published ? '#2ecc71' : '#fff',
                          fontWeight: 900,
                          cursor: m.status === 'LOCKED' && !m.is_published ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {m.is_published ? 'Published' : 'Publish'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )
        })}
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
        {printGroups.map((group) => (
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
                    .map((col) => `${col.label}: ${col.moto_name} (${col.status})`)
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
                        </tr>
                      ))}
                      {batch.riderRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={batch.motoColumns.length + 2}
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

