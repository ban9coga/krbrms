import { NextResponse } from 'next/server'
import { adminClient, requireEventRole } from '../../../../../../lib/auth'
import { GET as getLiveScore } from '../../../../public/events/[eventId]/live-score/route'

type StageRow = {
  rider_id: string
  rank: number | null
  point: number | null
  penalty_total: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'
  name: string
  no_plate: string
}

type StageGroup = { moto_id: string; title: string; rows: StageRow[] }
type QualificationRow = {
  rider_id: string
  name: string
  no_plate: string
  rank_point: number | null
  point_moto1: number | null
  point_moto2: number | null
  point_moto3: number | null
  penalty_total: number | null
  total_point: number | null
}
type StageSeed = {
  rider_id: string
  stage: string
  batch_id: string | null
  position: number | null
  points: number | null
  final_class: string | null
}

type JourneyEntry = {
  label: string
  rank: number | null
  point: number | null
  status: string | null
  current: boolean
}

type PenaltyItem = { label: string; points: number }
type ScoreBreakdown = {
  point: number
  penalty: number
  total: number
  penalty_items: PenaltyItem[]
}

const stagePriority: Record<string, number> = {
  QUALIFICATION: 1,
  REPECHAGE: 2,
  QUARTER_FINAL: 3,
  SEMI_FINAL: 4,
}

const statusQuality = (status: string) => {
  if (status === 'FINISH') return 0
  if (status === 'DNF') return 1
  if (status === 'DNS') return 2
  if (status === 'DQ') return 3
  return 4
}

const formatValue = (value: string | number | null | undefined) => (value == null ? '-' : String(value))
const formatPenaltyCode = (code: string | null | undefined) =>
  String(code ?? 'PENALTY')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const formatRankConclusion = ({
  riderRank,
  comparisonRank,
  riderName,
  comparisonName,
  decidingRule,
  riderValue,
  comparisonValue,
}: {
  riderRank: number
  comparisonRank: number
  riderName: string
  comparisonName: string
  decidingRule: string | null
  riderValue?: string | number | null
  comparisonValue?: string | number | null
}) => {
  if (!decidingRule) {
    return `Nilai ${riderName} dan ${comparisonName} sama pada seluruh aturan pembanding. Rank #${riderRank} dipertahankan sebagai urutan teknis agar slot stage tidak berubah.`
  }

  const valueText = riderValue != null && comparisonValue != null ? ` (${formatValue(riderValue)} dibanding ${formatValue(comparisonValue)})` : ''
  const ruleText: Record<string, string> = {
    'Status hasil': 'urutan status FINISH > DNF > DNS > DQ',
    'Progress DNF': 'keduanya DNF dan progres DNF yang lebih jauh diprioritaskan',
    'Total poin termasuk penalty': 'total poin termasuk penalty yang lebih kecil diprioritaskan',
    'Riwayat sebelum Final': 'riwayat sebelum final dibandingkan: DNS lebih sedikit, lalu DNF lebih sedikit, lalu FINISH lebih banyak',
    'Prioritas stage sumber': 'stage sumber yang lebih lanjut diprioritaskan',
    'Rank stage sumber': 'rank pada stage sumber yang lebih kecil diprioritaskan',
    'Point stage sumber': 'point stage sumber yang lebih kecil diprioritaskan',
    'Rank seed kualifikasi': 'rank seed kualifikasi yang lebih kecil diprioritaskan',
    'Point seed kualifikasi': 'point seed kualifikasi yang lebih kecil diprioritaskan',
    'Batch seed kualifikasi': 'batch seed kualifikasi yang lebih awal diprioritaskan',
    'Gate seed kualifikasi': 'gate seed kualifikasi yang lebih awal diprioritaskan',
    'Poin Moto 3': 'poin Moto 3 dipakai sebagai pembanding berikutnya',
    'Poin Moto 2': 'poin Moto 2 dipakai sebagai pembanding berikutnya',
    'Poin Moto 1': 'poin Moto 1 dipakai sebagai pembanding terakhir',
  }
  return `${riderName} berada di Rank #${riderRank}, setelah ${comparisonName} di Rank #${comparisonRank}, karena ${ruleText[decidingRule] ?? decidingRule.toLowerCase()}${valueText}.`
}

const parseQualificationBatch = (name: string | null | undefined) => {
  const match = String(name ?? '').match(/^moto\s*1\s*-\s*batch\s*(\d+)/i)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

const countHistory = (rows: Array<{ rider_id: string; result_status: string | null }>, riderId: string) => {
  const riderRows = rows.filter((row) => row.rider_id === riderId)
  return {
    dns: riderRows.filter((row) => row.result_status === 'DNS').length,
    dnf: riderRows.filter((row) => row.result_status === 'DNF').length,
    dq: riderRows.filter((row) => row.result_status === 'DQ').length,
    finish: riderRows.filter((row) => row.result_status === 'FINISH').length,
  }
}

const compareHistory = (a: ReturnType<typeof countHistory>, b: ReturnType<typeof countHistory>) =>
  a.dns - b.dns || a.dnf - b.dnf || a.dq - b.dq || b.finish - a.finish

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireEventRole(req.headers.get('authorization'), eventId, ['SUPER_ADMIN', 'ADMIN', 'RACE_DIRECTOR'])
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category_id')
  const motoId = searchParams.get('moto_id')
  const riderId = searchParams.get('rider_id')
  const batchIndex = searchParams.get('batch_index')
  if (!categoryId || !riderId || (!motoId && !batchIndex)) {
    return NextResponse.json({ error: 'category_id, rider_id, and moto_id or batch_index are required' }, { status: 400 })
  }

  const scoreUrl = new URL(req.url)
  scoreUrl.pathname = `/api/public/events/${eventId}/live-score`
  scoreUrl.searchParams.set('category_id', categoryId)
  scoreUrl.searchParams.set('include_upcoming', '1')
  scoreUrl.searchParams.set('include_photos', '0')
  const scoreResponse = await getLiveScore(new Request(scoreUrl), { params: Promise.resolve({ eventId }) })
  if (!scoreResponse.ok) return NextResponse.json({ error: 'Hasil stage tidak dapat dimuat.' }, { status: 400 })
  const scorePayload = (await scoreResponse.json()) as {
    data?: { stages?: StageGroup[]; batches?: Array<{ batch_index: number; rows: QualificationRow[] }> }
  }

  if (batchIndex) {
    const batch = (scorePayload.data?.batches ?? []).find((item) => item.batch_index === Number(batchIndex))
    const rider = batch?.rows.find((row) => row.rider_id === riderId)
    if (!batch || !rider || rider.rank_point == null) {
      return NextResponse.json({ error: 'Rider belum memiliki ranking kualifikasi.' }, { status: 404 })
    }
    const riderRank = rider.rank_point
    const comparisonRider = batch.rows.find((row) => row.rank_point === riderRank - 1) ?? null
    const criteria: Array<{ label: string; rider: string; comparator: string; resolved: boolean }> = []
    let decidingRule: string | null = null
    const addCriterion = (label: string, own: number | null, other: number | null) => {
      const diff = Number(own ?? Number.MAX_SAFE_INTEGER) - Number(other ?? Number.MAX_SAFE_INTEGER)
      criteria.push({ label, rider: formatValue(own), comparator: comparisonRider ? formatValue(other) : '-', resolved: diff !== 0 })
      if (!decidingRule && diff !== 0) decidingRule = label
    }

    if (comparisonRider) {
      addCriterion('Total poin termasuk penalty', rider.total_point, comparisonRider.total_point)
      if (!decidingRule) addCriterion('Poin Moto 3', rider.point_moto3, comparisonRider.point_moto3)
      if (!decidingRule) addCriterion('Poin Moto 2', rider.point_moto2, comparisonRider.point_moto2)
      if (!decidingRule) addCriterion('Poin Moto 1', rider.point_moto1, comparisonRider.point_moto1)
    }

    const decidingCriterion = criteria.find((criterion) => criterion.label === decidingRule)
    return NextResponse.json({
      data: {
        stage: `Kualifikasi - Batch ${batch.batch_index}`,
        rider: { id: rider.rider_id, name: rider.name, plate: rider.no_plate, rank: rider.rank_point },
        comparison_rider: comparisonRider
          ? { id: comparisonRider.rider_id, name: comparisonRider.name, plate: comparisonRider.no_plate, rank: comparisonRider.rank_point }
          : null,
        deciding_rule: decidingRule,
        is_full_tie: Boolean(comparisonRider && !decidingRule),
        journey: [
          {
            label: `Kualifikasi - Batch ${batch.batch_index}`,
            rank: rider.rank_point,
            point: rider.total_point,
            status: null,
            current: true,
          },
        ] satisfies JourneyEntry[],
        history_note: 'Pada kualifikasi, rank ditentukan dari total poin dan urutan poin tiap moto dalam batch yang sama.',
        tiebreak_order: [
          'Total poin termasuk penalty: angka lebih kecil lebih baik',
          'Poin Moto 3',
          'Poin Moto 2',
          'Poin Moto 1',
          'Jika tetap sama: urutan teknis untuk menjaga slot stage stabil',
        ],
        criteria,
        summary: comparisonRider
          ? formatRankConclusion({
              riderRank,
              comparisonRank: comparisonRider.rank_point ?? riderRank - 1,
              riderName: rider.name,
              comparisonName: comparisonRider.name,
              decidingRule,
              riderValue: decidingCriterion?.rider,
              comparisonValue: decidingCriterion?.comparator,
            })
          : `${rider.name} berada di Rank #1 karena memiliki hasil terbaik pada batch ini.`,
      },
    })
  }

  const stage = (scorePayload.data?.stages ?? []).find((item) => item.moto_id === motoId)
  const rider = stage?.rows.find((row) => row.rider_id === riderId)
  if (!stage || !rider || rider.rank == null) {
    return NextResponse.json({ error: 'Rider belum memiliki ranking pada stage ini.' }, { status: 404 })
  }

  const riderRank = rider.rank
  const comparisonRider = stage.rows.find((row) => row.rank === riderRank - 1) ?? null
  const [{ data: moto }, { data: stageSeeds }, { data: categoryMotos }, { data: featureFlags }] = await Promise.all([
    adminClient.from('motos').select('id, moto_name').eq('id', motoId).maybeSingle(),
    adminClient
      .from('race_stage_result')
      .select('rider_id, stage, batch_id, position, points, final_class')
      .eq('category_id', categoryId)
      .neq('stage', 'FINAL'),
    adminClient.from('motos').select('id, moto_name').eq('category_id', categoryId),
    adminClient.from('event_feature_flags').select('dnf_progress_enabled').eq('event_id', eventId).maybeSingle(),
  ])
  const dnfProgressEnabled = featureFlags?.dnf_progress_enabled === true
  const categoryMotoIds = (categoryMotos ?? []).map((item) => item.id)
  const comparedRiderIds = comparisonRider ? [riderId, comparisonRider.rider_id] : [riderId]
  const qualificationMotoIds = (categoryMotos ?? [])
    .filter((item) => /^moto\s*1\s*-\s*batch\s*\d+/i.test(item.moto_name))
    .map((item) => item.id)
  const [{ data: allResults }, { data: qualificationGateRows }, { data: approvedPenalties }] = await Promise.all([
    categoryMotoIds.length
      ? adminClient
          .from('results')
          .select('moto_id, rider_id, result_status, dnf_progress_percent')
          .in('moto_id', categoryMotoIds)
          .in('rider_id', comparedRiderIds)
      : Promise.resolve({ data: [] }),
    qualificationMotoIds.length
      ? adminClient
          .from('moto_gate_positions')
          .select('moto_id, rider_id, gate_position')
          .in('moto_id', qualificationMotoIds)
          .in('rider_id', comparedRiderIds)
      : Promise.resolve({ data: [] }),
    adminClient
      .from('rider_penalties')
      .select('rider_id, moto_id, stage, rule_code, penalty_point, rider_penalty_approvals!inner(approval_status)')
      .eq('event_id', eventId)
      .eq('rider_penalty_approvals.approval_status', 'APPROVED')
      .in('rider_id', comparedRiderIds),
  ])

  const allSeedRows = (stageSeeds ?? []) as StageSeed[]
  const byRider = (id: string) => allSeedRows.filter((row) => row.rider_id === id)
  const bestSource = (id: string) =>
    [...byRider(id)]
      .sort((a, b) => {
        const stageDiff = (stagePriority[b.stage] ?? 0) - (stagePriority[a.stage] ?? 0)
        if (stageDiff !== 0) return stageDiff
        return Number(a.position ?? Number.MAX_SAFE_INTEGER) - Number(b.position ?? Number.MAX_SAFE_INTEGER) || Number(a.points ?? Number.MAX_SAFE_INTEGER) - Number(b.points ?? Number.MAX_SAFE_INTEGER)
      })[0] ?? null
  const qualificationSeed = (id: string) =>
    [...byRider(id)]
      .filter((row) => row.stage === 'QUALIFICATION')
      .sort((a, b) => Number(a.position ?? Number.MAX_SAFE_INTEGER) - Number(b.position ?? Number.MAX_SAFE_INTEGER) || Number(a.points ?? Number.MAX_SAFE_INTEGER) - Number(b.points ?? Number.MAX_SAFE_INTEGER))[0] ?? null
  const qualificationBatch = (seed: StageSeed | null) => {
    const moto = (categoryMotos ?? []).find((item) => item.id === seed?.batch_id)
    return parseQualificationBatch(moto?.moto_name)
  }
  const qualificationGate = (id: string) => {
    const seed = qualificationSeed(id)
    return (qualificationGateRows ?? []).find(
      (row) => row.moto_id === seed?.batch_id && row.rider_id === id
    )?.gate_position ?? null
  }
  const resultByRider = new Map((allResults ?? []).filter((row) => row.moto_id === motoId).map((row) => [row.rider_id, row]))
  const isFinal = /^final\b/i.test(moto?.moto_name ?? stage.title)
  const penaltyStage = /^quarter final/i.test(moto?.moto_name ?? '')
    ? 'QUARTER'
    : /^repechage/i.test(moto?.moto_name ?? '')
    ? 'REPECHAGE'
    : /^semi final/i.test(moto?.moto_name ?? '')
    ? 'SEMI'
    : isFinal
    ? 'FINAL'
    : 'MOTO'
  const scoreBreakdown = (row: StageRow): ScoreBreakdown => {
    const point = Number(row.point ?? 0)
    const penalty = Number(row.penalty_total ?? 0)
    const manualItems = (approvedPenalties ?? [])
      .filter((item) => item.rider_id === row.rider_id)
      .filter((item) => item.moto_id === motoId || (!item.moto_id && (item.stage === 'ALL' || item.stage === penaltyStage)))
      .map((item) => ({ label: formatPenaltyCode(item.rule_code), points: Number(item.penalty_point ?? 0) }))
    const manualTotal = manualItems.reduce((sum, item) => sum + item.points, 0)
    const automaticPenalty = penalty - manualTotal
    if (automaticPenalty > 0) {
      manualItems.unshift({
        label: row.status === 'DNS' || row.status === 'DNF' ? `Penalty status ${row.status}` : 'Penalty lainnya',
        points: automaticPenalty,
      })
    }
    return { point, penalty, total: point + penalty, penalty_items: manualItems }
  }
  const statusForStage = (seed: StageSeed) =>
    (allResults ?? []).find((result) => result.rider_id === riderId && result.moto_id === seed.batch_id)?.result_status ?? null
  const stageLabel = (seed: StageSeed) => {
    if (seed.stage === 'QUALIFICATION') {
      const batch = qualificationBatch(seed)
      return `Kualifikasi${Number.isFinite(batch) ? ` - Batch ${batch}` : ''}`
    }
    const batchName = (categoryMotos ?? []).find((item) => item.id === seed.batch_id)?.moto_name
    return batchName || `${seed.stage.replace(/_/g, ' ')}${seed.final_class ? ` - ${seed.final_class}` : ''}`
  }
  const journey: JourneyEntry[] = [...byRider(riderId)]
    .sort((a, b) => {
      const stageDiff = (stagePriority[a.stage] ?? 0) - (stagePriority[b.stage] ?? 0)
      if (stageDiff !== 0) return stageDiff
      return qualificationBatch(a) - qualificationBatch(b)
    })
    .map((seed) => ({
      label: stageLabel(seed),
      rank: seed.position,
      point: seed.points,
      status: statusForStage(seed),
      current: false,
    }))
  journey.push({
    label: stage.title,
    rank: rider.rank,
    point: Number(rider.point ?? 0) + Number(rider.penalty_total ?? 0),
    status: rider.status,
    current: true,
  })

  const criteria: Array<{ label: string; rider: string; comparator: string; resolved: boolean }> = []
  const addCriterion = (label: string, own: string | number | null, other: string | number | null, diff: number) => {
    criteria.push({
      label,
      rider: formatValue(own),
      comparator: comparisonRider ? formatValue(other) : '-',
      resolved: diff !== 0,
    })
    return diff
  }

  let decidingRule: string | null = null
  if (comparisonRider) {
    const selectedResult = resultByRider.get(riderId)
    const compareResult = resultByRider.get(comparisonRider.rider_id)
    const ownTotal = Number(rider.point ?? 0) + Number(rider.penalty_total ?? 0)
    const otherTotal = Number(comparisonRider.point ?? 0) + Number(comparisonRider.penalty_total ?? 0)
    if (!decidingRule) {
      const pointDiff = addCriterion('Total poin termasuk penalty', ownTotal, otherTotal, ownTotal - otherTotal)
      if (pointDiff !== 0) decidingRule = 'Total poin termasuk penalty'
    }

    if (!decidingRule) {
      const statusDiff = addCriterion('Status hasil', rider.status, comparisonRider.status, statusQuality(rider.status) - statusQuality(comparisonRider.status))
      if (statusDiff !== 0) decidingRule = 'Status hasil'
    }

    if (!decidingRule && dnfProgressEnabled && rider.status === 'DNF' && comparisonRider.status === 'DNF') {
      const ownProgress = Number(selectedResult?.dnf_progress_percent ?? -1)
      const otherProgress = Number(compareResult?.dnf_progress_percent ?? -1)
      const progressDiff = addCriterion('Progress DNF', `${ownProgress}%`, `${otherProgress}%`, otherProgress - ownProgress)
      if (progressDiff !== 0) decidingRule = 'Progress DNF'
    }

    const historyRows = (allResults ?? []).filter((row) => row.moto_id !== motoId) as Array<{
      rider_id: string
      result_status: string | null
    }>
    const ownHistory = countHistory(historyRows, riderId)
    const otherHistory = countHistory(historyRows, comparisonRider.rider_id)
    if (isFinal && !decidingRule) {
      const historyDiff = addCriterion('Riwayat sebelum Final', `DNS ${ownHistory.dns}, DNF ${ownHistory.dnf}, FINISH ${ownHistory.finish}`, `DNS ${otherHistory.dns}, DNF ${otherHistory.dnf}, FINISH ${otherHistory.finish}`, compareHistory(ownHistory, otherHistory))
      if (historyDiff !== 0) decidingRule = 'Riwayat sebelum Final'
    }

    const ownSource = bestSource(riderId)
    const otherSource = bestSource(comparisonRider.rider_id)
    if (isFinal && !decidingRule) {
      const sourceStageDiff = (stagePriority[otherSource?.stage ?? ''] ?? 0) - (stagePriority[ownSource?.stage ?? ''] ?? 0)
      addCriterion('Prioritas stage sumber', ownSource?.stage ?? null, otherSource?.stage ?? null, sourceStageDiff)
      if (sourceStageDiff !== 0) decidingRule = 'Prioritas stage sumber'
    }
    if (!decidingRule) {
      const sourceDiff = Number(ownSource?.position ?? Number.MAX_SAFE_INTEGER) - Number(otherSource?.position ?? Number.MAX_SAFE_INTEGER)
      addCriterion('Rank stage sumber', ownSource ? `${ownSource.stage} #${ownSource.position}` : null, otherSource ? `${otherSource.stage} #${otherSource.position}` : null, sourceDiff)
      if (sourceDiff !== 0) decidingRule = 'Rank stage sumber'
    }
    if (!decidingRule) {
      const sourcePointDiff = Number(ownSource?.points ?? Number.MAX_SAFE_INTEGER) - Number(otherSource?.points ?? Number.MAX_SAFE_INTEGER)
      addCriterion('Point stage sumber', ownSource?.points ?? null, otherSource?.points ?? null, sourcePointDiff)
      if (sourcePointDiff !== 0) decidingRule = 'Point stage sumber'
    }

    const ownQualification = qualificationSeed(riderId)
    const otherQualification = qualificationSeed(comparisonRider.rider_id)
    if (!decidingRule) {
      const qualificationRankDiff = Number(ownQualification?.position ?? Number.MAX_SAFE_INTEGER) - Number(otherQualification?.position ?? Number.MAX_SAFE_INTEGER)
      addCriterion('Rank seed kualifikasi', ownQualification?.position ?? null, otherQualification?.position ?? null, qualificationRankDiff)
      if (qualificationRankDiff !== 0) decidingRule = 'Rank seed kualifikasi'
    }
    if (!decidingRule) {
      const qualificationPointDiff = Number(ownQualification?.points ?? Number.MAX_SAFE_INTEGER) - Number(otherQualification?.points ?? Number.MAX_SAFE_INTEGER)
      addCriterion('Point seed kualifikasi', ownQualification?.points ?? null, otherQualification?.points ?? null, qualificationPointDiff)
      if (qualificationPointDiff !== 0) decidingRule = 'Point seed kualifikasi'
    }
    if (!decidingRule) {
      const batchDiff = qualificationBatch(ownQualification) - qualificationBatch(otherQualification)
      addCriterion('Batch seed kualifikasi', Number.isFinite(qualificationBatch(ownQualification)) ? qualificationBatch(ownQualification) : null, Number.isFinite(qualificationBatch(otherQualification)) ? qualificationBatch(otherQualification) : null, batchDiff)
      if (batchDiff !== 0) decidingRule = 'Batch seed kualifikasi'
    }
    if (!decidingRule) {
      const gateDiff = Number(qualificationGate(riderId) ?? Number.MAX_SAFE_INTEGER) - Number(qualificationGate(comparisonRider.rider_id) ?? Number.MAX_SAFE_INTEGER)
      addCriterion('Gate seed kualifikasi', qualificationGate(riderId), qualificationGate(comparisonRider.rider_id), gateDiff)
      if (gateDiff !== 0) decidingRule = 'Gate seed kualifikasi'
    }
  }

  const decidingCriterion = criteria.find((criterion) => criterion.label === decidingRule)
  return NextResponse.json({
    data: {
      stage: stage.title,
      rider: { id: rider.rider_id, name: rider.name, plate: rider.no_plate, rank: rider.rank },
      comparison_rider: comparisonRider
        ? { id: comparisonRider.rider_id, name: comparisonRider.name, plate: comparisonRider.no_plate, rank: comparisonRider.rank }
        : null,
      deciding_rule: decidingRule,
      is_full_tie: Boolean(comparisonRider && !decidingRule),
      score_breakdown: {
        rider: scoreBreakdown(rider),
        comparator: comparisonRider ? scoreBreakdown(comparisonRider) : null,
      },
      journey,
      history_note: isFinal
        ? decidingRule === 'Riwayat sebelum Final'
          ? 'Riwayat sebelum final menjadi pembeda rank karena status dan total poin final sama.'
          : `Riwayat sebelum final ditampilkan sebagai konteks, tetapi rank ini sudah ditentukan lebih dahulu oleh ${decidingRule ?? 'urutan teknis'}.`
        : 'Riwayat stage ditampilkan untuk menjelaskan jalur rider menuju babak ini. Rank pada stage ini tetap ditentukan oleh hasil stage yang sedang dibuka.',
      tiebreak_order: [
        'Status hasil: FINISH > DNF > DNS > DQ',
        ...(dnfProgressEnabled ? ['Jika sama-sama DNF: progress yang lebih jauh lebih baik'] : []),
        'Total poin termasuk penalty: angka lebih kecil lebih baik',
        ...(isFinal ? ['Untuk Final: riwayat DNS lebih sedikit, lalu DNF lebih sedikit, lalu FINISH lebih banyak'] : []),
        ...(isFinal ? ['Untuk Final: stage sumber yang lebih lanjut diprioritaskan (Semi Final, QF, Repechage, Kualifikasi)'] : []),
        'Rank stage sumber yang lebih kecil lebih baik',
        'Point stage sumber yang lebih kecil lebih baik',
        'Rank seed kualifikasi yang lebih kecil lebih baik',
        'Point seed kualifikasi yang lebih kecil lebih baik',
        'Batch seed kualifikasi yang lebih awal lebih baik',
        'Gate seed kualifikasi yang lebih awal lebih baik',
        'Jika seluruhnya sama: urutan teknis untuk menjaga slot stage stabil',
      ],
      criteria,
      summary: comparisonRider
        ? formatRankConclusion({
            riderRank,
            comparisonRank: comparisonRider.rank ?? riderRank - 1,
            riderName: rider.name,
            comparisonName: comparisonRider.name,
            decidingRule,
            riderValue: decidingCriterion?.rider,
            comparisonValue: decidingCriterion?.comparator,
          })
        : `${rider.name} berada di Rank #1 karena memiliki hasil terbaik pada stage ini.`,
    },
  })
}
