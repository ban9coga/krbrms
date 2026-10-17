import { NextResponse } from 'next/server'
import { adminClient, authClient } from '@/src/lib/auth'
import { normalizeAppRole } from '@/src/lib/roles'

export async function GET(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  const user = authData.user
  const appMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>
  if (authError || !user || normalizeAppRole(typeof appMetadata.role === 'string' ? appMetadata.role : '') !== 'RC_ADMIN') {
    return NextResponse.json({ error: 'Akses RC Admin diperlukan.' }, { status: 403 })
  }

  const { data: assignments, error: assignmentError } = await adminClient
    .from('user_event_roles')
    .select('event_id')
    .eq('user_id', user.id)
    .eq('role', 'RC_ADMIN')
    .eq('is_active', true)
  if (assignmentError) return NextResponse.json({ error: assignmentError.message }, { status: 500 })

  const eventIds = [...new Set((assignments ?? []).map((row) => row.event_id).filter(Boolean))]
  if (!eventIds.length) return NextResponse.json({ data: [] })

  const { data: events, error: eventError } = await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at')
    .in('id', eventIds)
    .order('event_date', { ascending: false })
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 500 })

  return NextResponse.json({ data: events ?? [] })
}
