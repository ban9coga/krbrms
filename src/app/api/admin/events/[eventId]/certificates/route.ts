import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '@/src/lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await adminClient
    .from('event_certificates')
    .select('id, certificate_type, certificate_code, snapshot, issued_at, revoked_at, revoked_reason')
    .eq('event_id', eventId)
    .order('issued_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}
