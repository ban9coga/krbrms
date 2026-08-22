import { NextResponse } from 'next/server'
import { getAccessibleEventIds, requireBackoffice, requireScopedWorkspace } from '../../../../lib/auth'

const getHomePath = async (role: string, userId: string) => {
  if (role === 'CHECKER') return '/jc'
  if (role === 'FINISHER') return '/jury/finish'
  if (role === 'RACE_DIRECTOR') return '/race-director/approval'
  if (role === 'RACE_CONTROL') return '/race-control'
  if (role === 'MC') return '/mc'
  if (role === 'DRAW_MANAGER') {
    const eventIds = await getAccessibleEventIds(userId, ['DRAW_MANAGER'])
    return eventIds.length === 1 ? `/draw/${eventIds[0]}` : '/draw'
  }
  if (role === 'REGISTRATION_APPROVER') {
    const eventIds = await getAccessibleEventIds(userId, ['REGISTRATION_APPROVER'])
    return eventIds.length === 1 ? `/admin/events/${eventIds[0]}/registrations` : '/admin/events'
  }
  return '/admin'
}

export async function GET(req: Request) {
  const auth = await requireBackoffice(req.headers.get('authorization'))
  if (!auth.ok) {
    const drawAuth = await requireScopedWorkspace(req.headers.get('authorization'), ['DRAW_MANAGER'])
    if (!drawAuth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    return NextResponse.json({
      data: {
        ok: true,
        role: drawAuth.role,
        home: await getHomePath(drawAuth.role, drawAuth.user.id),
      },
    })
  }

  return NextResponse.json({
    data: {
      ok: true,
      role: auth.role,
      home: await getHomePath(auth.role, auth.user.id),
    },
  })
}
