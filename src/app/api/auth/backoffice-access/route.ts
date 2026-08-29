import { NextResponse } from 'next/server'
import { adminClient, authClient } from '../../../../lib/auth'
import { normalizeAppRole } from '../../../../lib/roles'

const roleWeight = (role: string) => {
  if (role === 'SUPER_ADMIN') return 0
  if (role === 'ADMIN') return 1
  if (role === 'REGISTRATION_APPROVER') return 2
  if (role === 'DRAW_MANAGER') return 3
  if (role === 'RACE_DIRECTOR') return 4
  if (role === 'RACE_CONTROL') return 5
  if (role === 'CHECKER') return 6
  if (role === 'FINISHER') return 7
  if (role === 'MC') return 8
  return 99
}

const getHomePath = (role: string, eventIds: string[]) => {
  if (role === 'CHECKER') return '/jc'
  if (role === 'FINISHER') return '/jury/finish'
  if (role === 'RACE_DIRECTOR') return '/race-director/approval'
  if (role === 'RACE_CONTROL') return '/race-control'
  if (role === 'MC') return '/mc'
  if (role === 'DRAW_MANAGER') return eventIds.length === 1 ? `/draw/${eventIds[0]}` : '/draw'
  if (role === 'REGISTRATION_APPROVER') {
    return eventIds.length === 1 ? `/admin/events/${eventIds[0]}/registrations` : '/admin/events'
  }
  return '/admin'
}

const getGlobalRole = (user: { user_metadata?: unknown; app_metadata?: unknown }) => {
  const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>
  return normalizeAppRole(
    typeof userMetadata.role === 'string'
      ? userMetadata.role
      : typeof appMetadata.role === 'string'
        ? appMetadata.role
        : ''
  )
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error: userError } = await authClient.auth.getUser(token)
  const user = userData.user
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const globalRole = getGlobalRole(user)
  if (globalRole === 'SUPER_ADMIN' || globalRole === 'ADMIN') {
    return NextResponse.json({ data: { ok: true, role: globalRole, home: '/admin' } })
  }

  const { data: assignments, error: assignmentsError } = await adminClient
    .from('user_event_roles')
    .select('event_id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (assignmentsError) {
    return NextResponse.json({ error: 'Gagal memeriksa akses workspace.' }, { status: 500 })
  }

  const scopedRoles = (assignments ?? [])
    .map((assignment) => normalizeAppRole(typeof assignment.role === 'string' ? assignment.role : ''))
    .filter(Boolean)
  const role = [globalRole, ...scopedRoles].filter(Boolean).sort((a, b) => roleWeight(a) - roleWeight(b))[0]
  if (!role || roleWeight(role) === 99) {
    return NextResponse.json({ error: 'Akses panel tidak tersedia.' }, { status: 403 })
  }

  const eventIds = Array.from(
    new Set(
      (assignments ?? [])
        .filter((assignment) => normalizeAppRole(typeof assignment.role === 'string' ? assignment.role : '') === role)
        .map((assignment) => assignment.event_id)
        .filter((eventId): eventId is string => typeof eventId === 'string' && eventId.length > 0)
    )
  )

  return NextResponse.json({
    data: {
      ok: true,
      role,
      home: getHomePath(role, eventIds),
    },
  })
}
