// In-memory presence store for live jury heartbeats
export type JuryPresenceRecord = {
  userId: string
  email: string
  name: string
  role: string
  crewCode?: string | null
  motoId?: string | null
  motoName?: string | null
  pageUrl?: string | null
  userAgent?: string | null
  lastPingAt: number
}

// Map key: `${eventId}:${userId}`
const presenceMap = new Map<string, JuryPresenceRecord>()

const PING_EXPIRY_MS = 60 * 1000 // 60 seconds = offline
const PRUNE_INTERVAL_MS = 5 * 60 * 1000 // prune records older than 5 mins

let lastPrune = Date.now()

function pruneOldRecords() {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  for (const [key, record] of presenceMap.entries()) {
    if (now - record.lastPingAt > PRUNE_INTERVAL_MS) {
      presenceMap.delete(key)
    }
  }
}

export function recordJuryPing(eventId: string, record: JuryPresenceRecord) {
  pruneOldRecords()
  const key = `${eventId}:${record.userId}`
  presenceMap.set(key, record)
}

export function getJuryPresencesForEvent(eventId: string): JuryPresenceRecord[] {
  pruneOldRecords()
  const now = Date.now()
  const list: JuryPresenceRecord[] = []
  const prefix = `${eventId}:`

  for (const [key, record] of presenceMap.entries()) {
    if (key.startsWith(prefix)) {
      list.push(record)
    }
  }

  return list
}

export function isPresenceOnline(lastPingAt?: number | null): boolean {
  if (!lastPingAt) return false
  return Date.now() - lastPingAt < PING_EXPIRY_MS
}

