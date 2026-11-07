import { NextResponse } from 'next/server'
import { authClient } from '@/src/lib/auth'
import { recordJuryPing } from '@/src/lib/juryPresenceStore'
import { normalizeAppRole } from '@/src/lib/roles'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  if (userError || !userData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    eventId?: string
    motoId?: string | null
    motoName?: string | null
    pageUrl?: string | null
  }

  const eventId = String(body.eventId ?? '').trim()
  if (!eventId) {
    return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  }

  const user = userData.user
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
  const rawRole =
    (typeof meta.role === 'string' ? meta.role : '') ||
    (typeof appMeta.role === 'string' ? appMeta.role : '')

  const role = normalizeAppRole(rawRole)
  const name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    user.email?.split('@')[0] ||
    'Jury User'

  const crewCode = typeof meta.crew_code === 'string' ? meta.crew_code : null
  const userAgent = req.headers.get('user-agent') ?? null

  recordJuryPing(eventId, {
    userId: user.id,
    email: user.email ?? '',
    name,
    role,
    crewCode,
    motoId: body.motoId ?? null,
    motoName: body.motoName ?? null,
    pageUrl: body.pageUrl ?? null,
    userAgent,
    lastPingAt: Date.now(),
  })

  return NextResponse.json({ ok: true })
}
