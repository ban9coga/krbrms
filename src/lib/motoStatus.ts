export type MotoStatus =
  | 'UPCOMING'
  | 'LIVE'
  | 'FINISHED'
  | 'PROVISIONAL'
  | 'PROTEST_REVIEW'
  | 'LOCKED'
  | (string & {})

export const normalizeMotoStatus = (status?: string | null): MotoStatus => {
  return ((status ?? '').toUpperCase() as MotoStatus) || ''
}

export const isMotoUpcoming = (status?: string | null) => normalizeMotoStatus(status) === 'UPCOMING'
export const isMotoLive = (status?: string | null) => normalizeMotoStatus(status) === 'LIVE'
export const isMotoFinished = (status?: string | null) => normalizeMotoStatus(status) === 'FINISHED'
export const isMotoProvisional = (status?: string | null) => normalizeMotoStatus(status) === 'PROVISIONAL'
export const isMotoUnderProtest = (status?: string | null) => normalizeMotoStatus(status) === 'PROTEST_REVIEW'
export const isMotoLocked = (status?: string | null) => normalizeMotoStatus(status) === 'LOCKED'

export const isMotoPublicVisible = (status?: string | null, isPublished?: boolean | null) =>
  isMotoLive(status) || (isMotoLocked(status) && isPublished === true)
