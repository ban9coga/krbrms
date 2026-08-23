import { NextResponse } from 'next/server'
import { loadCertificateContext } from '@/src/lib/eventCertificate'
import { createCertificateAccessToken } from '@/src/lib/certificateAccessToken'
import { rateLimit } from '@/src/lib/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limit = await rateLimit(req, { key: 'event-certificate-verify', limit: 8, windowMs: 10 * 60 * 1000 })
  if (!limit.ok) return limit.response

  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const result = await loadCertificateContext(eventId, body.registration_code, body.contact_phone)
  if (!result.data) return NextResponse.json({ error: result.error }, { status: result.status ?? 400, headers: limit.headers })
  const access = createCertificateAccessToken(result.data)

  return NextResponse.json(
    {
      data: {
        event_name: result.data.event.name,
        event_date: result.data.event.event_date,
        registration_code: result.data.registrationCode,
        participation_enabled: result.data.participationEnabled,
        achievement_enabled: result.data.achievementEnabled,
        riders: result.data.riders,
        access_token: access.token,
        access_expires_at: access.expiresAt,
      },
    },
    { headers: limit.headers }
  )
}
