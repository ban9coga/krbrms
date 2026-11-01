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
  statusTiebreakEnabled?: boolean
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
  dnfProgressEnabled = false,
  statusTiebreakEnabled = true
) => {
  const pointDiff = (a?.points ?? Number.MAX_SAFE_INTEGER) - (b?.points ?? Number.MAX_SAFE_INTEGER)
  if (pointDiff !== 0) return pointDiff

  if (statusTiebreakEnabled) {
    const statusDiff = qualificationStatusQuality(a?.resultStatus) - qualificationStatusQuality(b?.resultStatus)
    if (statusDiff !== 0) return statusDiff
  }

  if (
    statusTiebreakEnabled &&
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

  // Compare every moto's points before considering status or DNF progress.
  // Qualification order is Total, Moto 3, Moto 2, Moto 1; a status in a later
  // moto must not outrank a better points result in an earlier moto.
  for (const motoIndex of motoIndexes) {
    const pointDiff = (aResults.get(motoIndex)?.points ?? Number.MAX_SAFE_INTEGER) -
      (bResults.get(motoIndex)?.points ?? Number.MAX_SAFE_INTEGER)
    if (pointDiff !== 0) return pointDiff
  }

  if (options.statusTiebreakEnabled !== false) {
    for (const motoIndex of motoIndexes) {
      const statusDiff = compareQualificationMotoTieBreak(
        aResults.get(motoIndex),
        bResults.get(motoIndex),
        options.dnfProgressEnabled,
        true
      )
      if (statusDiff !== 0) return statusDiff
    }
  }

  // If points remain identical and status is otherwise disabled for a
  // qualification tie-break Repechage, keep riders who actually started ahead
  // of riders who were DNS/absent throughout qualification. DNS-only ties use
  // the normal seed fallback and must not be sent to a race they did not start.
  if (options.statusTiebreakEnabled === false) {
    const aStarted = a?.motoResults.some((result) =>
      ['FINISH', 'DNF'].includes(String(result.resultStatus ?? 'FINISH').toUpperCase())
    )
    const bStarted = b?.motoResults.some((result) =>
      ['FINISH', 'DNF'].includes(String(result.resultStatus ?? 'FINISH').toUpperCase())
    )
    const participationDiff = Number(!aStarted) - Number(!bStarted)
    if (participationDiff !== 0) return participationDiff
  }

  return 0
}
