import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import { normalizeAppRole } from '../../../../../lib/roles'

const ASSIGNABLE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'RACE_CONTROL', 'MC']

type AssignmentPayload = {
  id?: string
  user_id: string
  role: string
  is_active?: boolean
  notes?: string | null
}

const normalizeAssignmentRole = (value: unknown) => normalizeAppRole(typeof value === 'string' ? value : '')

const listAllUsers = async () => {
  const users: Array<{ id: string; email: string | null; global_role: string }> = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    for (const user of data.users) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>
      const globalRole = normalizeAppRole(
        (typeof meta.role === 'string' ? meta.role : null) ||
          (typeof appMeta.role === 'string' ? appMeta.role : null) ||
          ''
      )
      if (!ASSIGNABLE_ROLES.includes(globalRole)) continue
      users.push({ id: user.id, email: user.email ?? null, global_role: globalRole })
    }
    if ((data.users?.length ?? 0) < perPage) break
    page += 1
  }

  return users
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: assignments, error: assignmentError }, users] = await Promise.all([
    adminClient
      .from('user_event_roles')
      .select('id, user_id, role, is_active, notes, assigned_by, created_at, updated_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true }),
    listAllUsers(),
  ])

  if (assignmentError) return NextResponse.json({ error: assignmentError.message }, { status: 400 })

  const userMap = new Map(users.map((user) => [user.id, user]))
  const assignmentRows = (assignments ?? []).map((row) => ({
    ...row,
    role: normalizeAssignmentRole(row.role),
    email: userMap.get(row.user_id)?.email ?? null,
    global_role: userMap.get(row.user_id)?.global_role ?? '',
  }))

  return NextResponse.json({ data: { assignments: assignmentRows, users } })
}

export async function PUT(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const assignedBy = auth.user?.id ?? null

  const body = (await req.json().catch(() => ({}))) as { assignments?: AssignmentPayload[] }
  const incoming = Array.isArray(body.assignments) ? body.assignments : []

  const normalized = incoming
    .map((item) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : undefined,
      user_id: typeof item.user_id === 'string' ? item.user_id : '',
      role: normalizeAssignmentRole(item.role),
      is_active: item.is_active !== false,
      notes: typeof item.notes === 'string' && item.notes.trim() ? item.notes.trim() : null,
    }))
    .filter((item) => item.user_id && ASSIGNABLE_ROLES.includes(item.role))

  const seen = new Set<string>()
  for (const item of normalized) {
    const key = `${item.user_id}:${item.role}`
    if (seen.has(key)) {
      return NextResponse.json({ error: 'Duplicate user-role assignment in payload.' }, { status: 400 })
    }
    seen.add(key)
  }

  const { data: existing, error: existingError } = await adminClient
    .from('user_event_roles')
    .select('id, user_id, role')
    .eq('event_id', eventId)

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })

  const keepIds = normalized.map((item) => item.id).filter(Boolean) as string[]
  const deleteIds = (existing ?? [])
    .map((row) => row.id)
    .filter((id) => !keepIds.includes(id))

  if (deleteIds.length > 0) {
    const { error: deleteError } = await adminClient
      .from('user_event_roles')
      .delete()
      .eq('event_id', eventId)
      .in('id', deleteIds)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  const existingIds = new Set((existing ?? []).map((row) => row.id))
  const updates = normalized.filter((item) => item.id && existingIds.has(item.id))
  const inserts = normalized.filter((item) => !item.id)

  if (updates.length > 0) {
    for (const item of updates) {
      const { error: updateError } = await adminClient
        .from('user_event_roles')
        .update({
          user_id: item.user_id,
          role: item.role,
          is_active: item.is_active,
          notes: item.notes,
          assigned_by: assignedBy,
        })
        .eq('id', item.id as string)
        .eq('event_id', eventId)

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
    }
  }

  if (inserts.length > 0) {
    const payload = inserts.map((item) => ({
      user_id: item.user_id,
      event_id: eventId,
      role: item.role,
      is_active: item.is_active,
      notes: item.notes,
      assigned_by: assignedBy,
    }))

    const { error: insertError } = await adminClient.from('user_event_roles').insert(payload)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })
  }

  return GET(req, { params: Promise.resolve({ eventId }) })
}
