'use client'

import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../../../../../../components/EmptyState'
import LoadingState from '../../../../../../components/LoadingState'
import PublicTopbar from '../../../../../../components/PublicTopbar'
import StatusBadge from '../../../../../../components/StatusBadge'
import {
  getCategoriesByYear,
  getMotosByCategory,
  getMotoResults,
  type LeaderboardRow,
  type MotoItem,
  type RiderCategory,
} from '../../../../../../lib/eventService'

export default function ResultDetailClient({
  eventId,
  year,
  raceCategory,
}: {
  eventId: string
  year: string
  raceCategory: string
}) {
  const categoryId = useMemo(() => decodeURIComponent(raceCategory), [raceCategory])
  const [category, setCategory] = useState<RiderCategory | null>(null)
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [selectedMotoId, setSelectedMotoId] = useState<string>('')
  const [raceStatus, setRaceStatus] = useState<'LIVE' | 'FINISHED'>('FINISHED')
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [stageRows, setStageRows] = useState<
    Array<{
      id: string
      stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
      final_class: string | null
      position: number | null
      riders: { name: string; no_plate_display: string } | null
    }>
  >([])
  const [stageLoading, setStageLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      const categories = await getCategoriesByYear(eventId, year)
      const match = categories.find((item) => item.id === categoryId) ?? null
      setCategory(match)
      const motoData = await getMotosByCategory(categoryId)
      setMotos(motoData)
      if (motoData.length > 0) setSelectedMotoId(motoData[0].id)
      const hasLive = motoData.some((m) => m.status === 'LIVE')
      const hasFinished = motoData.some((m) => m.status === 'FINISHED')
      const hasUpcoming = motoData.some((m) => m.status === 'UPCOMING')
      const status = hasLive ? 'LIVE' : hasFinished && hasUpcoming ? 'LIVE' : hasFinished ? 'FINISHED' : 'UPCOMING'
      setRaceStatus(status)
    }
    if (eventId) load()
  }, [eventId, year, categoryId])

  useEffect(() => {
    const loadStages = async () => {
      if (!eventId || !categoryId) return
      setStageLoading(true)
      const res = await fetch(`/api/public/events/${eventId}/advanced-race/results?category_id=${categoryId}`)
      const json = await res.json()
      setStageRows((json.data ?? []) as typeof stageRows)
      setStageLoading(false)
    }
    loadStages()
  }, [eventId, categoryId])

  useEffect(() => {
    if (!selectedMotoId) return
    const loadResults = async () => {
      setLoading(true)
      const data = await getMotoResults(selectedMotoId)
      setRows(data)
      setLoading(false)
    }
    loadResults()
    if (raceStatus === 'LIVE') {
      const interval = setInterval(loadResults, 8000)
      return () => clearInterval(interval)
    }
  }, [selectedMotoId, raceStatus])

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111' }}>
      <PublicTopbar />
      <div style={{ maxWidth: '840px', margin: '0 auto', padding: '24px 20px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 800 }}>{category?.label ?? 'Race Category'}</div>
          <StatusBadge label={raceStatus} />
        </div>

        {motos.length > 0 && (
          <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
            <div style={{ fontWeight: 700 }}>Moto List</div>
            {motos.map((moto) => (
              <button
                key={moto.id}
                type="button"
                onClick={() => setSelectedMotoId(moto.id)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '2px solid #111',
                  background: selectedMotoId === moto.id ? '#2ecc71' : '#fff',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {moto.moto_name} - {moto.status}
              </button>
            ))}
          </div>
        )}

        {loading && <LoadingState />}
        {!loading && rows.length === 0 && <EmptyState label="Belum ada hasil." />}

        <div style={{ display: 'grid', gap: '10px', marginTop: '16px' }}>
          {rows.map((row) => (
            <div
              key={row.position}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                border: '2px solid #111',
                background:
                  row.position === 1
                    ? '#2ecc71'
                    : row.position === 2
                    ? '#c8f1d8'
                    : row.position === 3
                    ? '#eaf7ee'
                    : '#fff',
                display: 'grid',
                gap: '6px',
                fontWeight: row.position <= 3 ? 800 : 600,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  #{row.position} {row.rider_name}
                </div>
                <div>{row.bike_number}</div>
              </div>
              <div style={{ fontSize: '13px', color: '#333' }}>Team: {row.team || '-'}</div>
              <div style={{ fontSize: '13px', color: '#333' }}>
                {row.status ? `Status: ${row.status}` : 'Result'}
              </div>
              <div style={{ fontSize: '13px', color: '#333' }}>
                Total Point: {row.total_point ?? '-'}{' '}
                {row.penalty_total ? `(+${row.penalty_total} penalty)` : ''}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Stage Results</div>
          {stageLoading ? (
            <LoadingState />
          ) : stageRows.length === 0 ? (
            <EmptyState label="Belum ada hasil stage." />
          ) : (
            (['QUALIFICATION', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'] as const).map((stage) => {
              const rowsByStage = stageRows.filter((r) => r.stage === stage)
              if (rowsByStage.length === 0) return null
              return (
                <div
                  key={stage}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '2px solid #111',
                    background: '#fff',
                    display: 'grid',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{stage}</div>
                  {rowsByStage.slice(0, 16).map((r) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                      <div>
                        {r.riders?.no_plate_display ?? '-'} {r.riders?.name ?? '-'}
                      </div>
                      <div>{r.final_class ? r.final_class : r.position ? `Rank ${r.position}` : '-'}</div>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

