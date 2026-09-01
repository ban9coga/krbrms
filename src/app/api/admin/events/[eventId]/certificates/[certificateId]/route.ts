import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '@/src/lib/auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string; certificateId: string }> }) {
  const { eventId, certificateId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const action = body?.action === 'restore' ? 'restore' : body?.action === 'revoke' ? 'revoke' : null
  if (!action) return NextResponse.json({ error: 'Aksi sertifikat tidak valid.' }, { status: 400 })

  const changes =
    action === 'revoke'
      ? { revoked_at: new Date().toISOString(), revoked_reason: String(body?.reason ?? '').trim().slice(0, 500) || 'Dicabut oleh admin.' }
      : { revoked_at: null, revoked_reason: null }
  const { data, error } = await adminClient
    .from('event_certificates')
    .update(changes)
    .eq('id', certificateId)
    .eq('event_id', eventId)
    .select('id, certificate_type, certificate_code, snapshot, issued_at, revoked_at, revoked_reason')
    .maybeSingle()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Sertifikat tidak ditemukan.' }, { status: 404 })
  return NextResponse.json({ data })
}
