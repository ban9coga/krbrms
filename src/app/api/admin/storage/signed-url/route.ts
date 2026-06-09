import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../lib/auth'

const BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'

export const runtime = 'nodejs'

const normalizePath = (value: unknown) => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^\/+/, '')
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const path = normalizePath(body?.path)
  if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })
  if (!path.startsWith(`events/${eventId}/`)) {
    return NextResponse.json({ error: 'File path is outside this event.' }, { status: 403 })
  }
  const expiresIn = typeof body.expiresIn === 'number' ? body.expiresIn : 600

  const { data, error } = await adminClient.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
