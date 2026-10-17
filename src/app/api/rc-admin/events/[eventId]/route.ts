import { NextResponse } from 'next/server'
import { adminClient, authClient } from '@/src/lib/auth'
import { normalizeAppRole } from '@/src/lib/roles'
import { getEventSetupChecklist } from '@/src/app/admin/events/[eventId]/checklist/actions'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  const user = authData.user
  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>
  if (authError || !user || normalizeAppRole(typeof appMetadata.role === 'string' ? appMetadata.role : '') !== 'RC_ADMIN') {
    return NextResponse.json({ error: 'Akses RC Admin diperlukan.' }, { status: 403 })
  }

  const { eventId } = await params
  const { data: assignment, error: assignmentError } = await adminClient
    .from('user_event_roles')
    .select('event_id')
    .eq('user_id', user.id)
    .eq('event_id', eventId)
    .eq('role', 'RC_ADMIN')
    .eq('is_active', true)
    .maybeSingle()
  if (assignmentError) return NextResponse.json({ error: assignmentError.message }, { status: 500 })
  if (!assignment) return NextResponse.json({ error: 'Event tidak ditemukan.' }, { status: 404 })

  const { data: event, error: eventError } = await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })
  if (!event) return NextResponse.json({ error: 'Event tidak ditemukan.' }, { status: 404 })

  const checklist = await getEventSetupChecklist(eventId)
  return NextResponse.json({ data: { event, checklist } })
}
