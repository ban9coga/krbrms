export type RiderStatusSource = {
  role: string
  label: string
}

const SOURCE_PREFIX = '[RACEPUSHBIKE_STATUS_SOURCE]'

export const buildRiderStatusSourceNote = (source: RiderStatusSource) =>
  `${SOURCE_PREFIX}${JSON.stringify(source)}`

export const parseRiderStatusSourceNote = (note?: string | null): RiderStatusSource | null => {
  if (!note?.startsWith(SOURCE_PREFIX)) return null
  try {
    const parsed = JSON.parse(note.slice(SOURCE_PREFIX.length)) as Partial<RiderStatusSource>
    if (typeof parsed.role !== 'string' || typeof parsed.label !== 'string') return null
    return { role: parsed.role, label: parsed.label }
  } catch {
    return null
  }
}

export const getRiderStatusActorLabel = (user: {
  email?: string | null
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
}) => {
  const metadata = user.user_metadata ?? {}
  const appMetadata = user.app_metadata ?? {}
  const name =
    (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
    (typeof metadata.name === 'string' && metadata.name.trim()) ||
    (typeof appMetadata.name === 'string' && appMetadata.name.trim())
  if (name) return name
  return user.email?.trim() || 'Jury'
}
