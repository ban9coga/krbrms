import { adminClient } from '../lib/auth'

type MotoLookupRow = {
  id: string
  event_id: string
  category_id: string
  moto_name: string
  status?: string | null
  moto_order?: number | null
}

type MotoAssignmentRow = {
  moto_id: string
  rider_id: string
}

type MotoResultRow = {
  moto_id: string
  rider_id: string
  finish_order: number | null
  result_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | null
}

export const parseMotoBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
}

const dnsPointForMoto = (riderCount: number) => riderCount + 2

const pointForRaceResult = (row: MotoResultRow | null | undefined, riderCount: number) => {
  if (!row) return null
  const status = row.result_status ?? 'FINISH'
  if (status === 'DQ') return null
  if (status === 'DNS') return dnsPointForMoto(riderCount)
  if (status === 'DNF') return riderCount
  return row.finish_order ?? null
}

export async function reseedSingleBatchMoto3FromMoto(motoId: string) {
  const { data: currentMoto, error: currentMotoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name')
    .eq('id', motoId)
    .maybeSingle()

  if (currentMotoError || !currentMoto?.event_id || !currentMoto?.category_id || !currentMoto?.moto_name) {
    return { ok: false as const, warning: currentMotoError?.message ?? 'Moto not found for Moto 3 reseed.' }
  }

  const { data: categoryMotos, error: categoryMotoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name, status, moto_order')
    .eq('event_id', currentMoto.event_id)
    .eq('category_id', currentMoto.category_id)
    .order('moto_order', { ascending: true })

  if (categoryMotoError) {
    return { ok: false as const, warning: categoryMotoError.message }
  }

  const qualificationMotos = ((categoryMotos ?? []) as MotoLookupRow[]).filter((moto) => parseMotoBatchKey(moto.moto_name))
  const parsedQualificationMotos = qualificationMotos
    .map((moto) => ({ moto, parsed: parseMotoBatchKey(moto.moto_name) }))
    .filter((row): row is { moto: MotoLookupRow; parsed: { motoIndex: number; batchIndex: number } } => Boolean(row.parsed))

  const batchIndices = new Set(parsedQualificationMotos.map((row) => row.parsed.batchIndex))
  if (batchIndices.size !== 1) return { ok: true as const }

  const moto1 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 1)?.moto
  const moto2 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 2)?.moto
  const moto3 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 3)?.moto

  if (!moto1 || !moto2 || !moto3) return { ok: true as const }

  const currentParsed = parseMotoBatchKey(currentMoto.moto_name)
  if (!currentParsed) return { ok: true as const }
  if (
    !(
      (currentParsed.batchIndex === 1 && currentParsed.motoIndex === 2) ||
      currentMoto.id === moto2.id ||
      currentMoto.id === moto3.id
    )
  ) {
    return { ok: true as const }
  }

  if (String(moto3.status ?? '').toUpperCase() === 'LOCKED') {
    return { ok: false as const, warning: 'Moto 3 masih LOCKED. Unlock dulu sebelum reseed gate.' }
  }
  if (String(moto3.status ?? '').toUpperCase() === 'PROTEST_REVIEW') {
    return { ok: false as const, warning: 'Moto 3 sedang PROTEST_REVIEW. Selesaikan review dulu sebelum reseed gate.' }
  }

  const { data: assignedRows, error: assignedError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id')
    .in('moto_id', [moto1.id, moto2.id, moto3.id])

  if (assignedError) {
    return { ok: false as const, warning: assignedError.message }
  }

  const moto1Riders = ((assignedRows ?? []) as MotoAssignmentRow[])
    .filter((row) => row.moto_id === moto1.id)
    .map((row) => row.rider_id)
  if (moto1Riders.length === 0) return { ok: true as const }

  const { data: resultRows, error: resultError } = await adminClient
    .from('results')
    .select('moto_id, rider_id, finish_order, result_status')
    .in('moto_id', [moto1.id, moto2.id])

  if (resultError) {
    return { ok: false as const, warning: resultError.message }
  }

  const moto2RiderSet = new Set(
    ((assignedRows ?? []) as MotoAssignmentRow[]).filter((row) => row.moto_id === moto2.id).map((row) => row.rider_id)
  )
  const resultsByKey = new Map(
    ((resultRows ?? []) as MotoResultRow[]).map((row) => [`${row.moto_id}:${row.rider_id}`, row] as const)
  )

  const riderCount = moto1Riders.length
  const moto2Complete = moto1Riders.every(
    (riderId) => moto2RiderSet.has(riderId) && resultsByKey.has(`${moto2.id}:${riderId}`)
  )
  if (!moto2Complete) {
    return { ok: false as const, warning: 'Moto 2 belum lengkap. Submit semua hasil Moto 2 dulu sebelum reseed gate Moto 3.' }
  }

  const orderedRiders = [...moto1Riders]
    .map((riderId) => {
      const moto1Result = resultsByKey.get(`${moto1.id}:${riderId}`)
      const moto2Result = resultsByKey.get(`${moto2.id}:${riderId}`)
      const moto1Points = pointForRaceResult(moto1Result, riderCount) ?? 9999
      const moto2Points = pointForRaceResult(moto2Result, riderCount) ?? 9999
      return {
        riderId,
        totalPoints: moto1Points + moto2Points,
        moto2Points,
        moto1Points,
      }
    })
    .sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
      if (a.moto2Points !== b.moto2Points) return a.moto2Points - b.moto2Points
      if (a.moto1Points !== b.moto1Points) return a.moto1Points - b.moto1Points
      return a.riderId.localeCompare(b.riderId)
    })

  const { error: deleteGateError } = await adminClient
    .from('moto_gate_positions')
    .delete()
    .eq('moto_id', moto3.id)

  if (deleteGateError) {
    return { ok: false as const, warning: deleteGateError.message }
  }

  const { error: insertGateError } = await adminClient
    .from('moto_gate_positions')
    .insert(
      orderedRiders.map((row, index) => ({
        moto_id: moto3.id,
        rider_id: row.riderId,
        gate_position: index + 1,
      }))
    )

  if (insertGateError) {
    return { ok: false as const, warning: insertGateError.message }
  }

  return {
    ok: true as const,
    moto3Id: moto3.id,
    moto3Name: moto3.moto_name,
    orderedRiderIds: orderedRiders.map((row) => row.riderId),
  }
}
