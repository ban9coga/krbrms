export type QualificationMotoTieBreak = {
  motoIndex: number
  points: number | null
  resultStatus?: string | null
  dnfProgressPercent?: number | null
}

export type QualificationTieBreakData = {
  motoResults: QualificationMotoTieBreak[]
}

export type QualificationTieBreakOptions = {
  dnfProgressEnabled?: boolean
  motoIndexes?: number[]
}

const qualificationStatusQuality = (status?: string | null) => {
  const normalized = String(status ?? '').toUpperCase()
  if (normalized === 'FINISH' || normalized === '') return 0
  if (normalized === 'DNF') return 1
  if (normalized === 'DNS' || normalized === 'ABSENT') return 2
  if (normalized === 'DQ') return 3
  return 4
}

export const createQualificationTieBreakData = (
  motoResults: QualificationMotoTieBreak[]
): QualificationTieBreakData => ({
  motoResults: [...motoResults].sort((a, b) => b.motoIndex - a.motoIndex),
})

export const compareQualificationMotoTieBreak = (
  a: QualificationMotoTieBreak | undefined,
  b: QualificationMotoTieBreak | undefined,
  dnfProgressEnabled = false
) => {
  const pointDiff = (a?.points ?? Number.MAX_SAFE_INTEGER) - (b?.points ?? Number.MAX_SAFE_INTEGER)
  if (pointDiff !== 0) return pointDiff

  const statusDiff = qualificationStatusQuality(a?.resultStatus) - qualificationStatusQuality(b?.resultStatus)
  if (statusDiff !== 0) return statusDiff

  if (
    dnfProgressEnabled &&
    String(a?.resultStatus ?? '').toUpperCase() === 'DNF' &&
    String(b?.resultStatus ?? '').toUpperCase() === 'DNF'
  ) {
    const progressDiff = Number(b?.dnfProgressPercent ?? -1) - Number(a?.dnfProgressPercent ?? -1)
    if (progressDiff !== 0) return progressDiff
  }

  return 0
}

export const compareQualificationTieBreakData = (
  a: QualificationTieBreakData | undefined,
  b: QualificationTieBreakData | undefined,
  options: QualificationTieBreakOptions = {}
) => {
  const aResults = new Map((a?.motoResults ?? []).map((result) => [result.motoIndex, result]))
  const bResults = new Map((b?.motoResults ?? []).map((result) => [result.motoIndex, result]))
  const motoIndexes = options.motoIndexes ?? Array.from(new Set([...aResults.keys(), ...bResults.keys()])).sort((x, y) => y - x)
  for (const motoIndex of motoIndexes) {
    const tieBreakDiff = compareQualificationMotoTieBreak(
      aResults.get(motoIndex),
      bResults.get(motoIndex),
      options.dnfProgressEnabled
    )
    if (tieBreakDiff !== 0) return tieBreakDiff
  }

  return 0
}
